import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, cursor_ordering, order_by } from "~/generated/zeus";
import { playerFields } from "~/graphql/playerFields";

// Before a match starts, its lineups are what people act on: filling open
// seats, swapping captains, checking in. In these statuses the match page and
// the draft room follow the lineups' stream instead of waiting on the poll.
export const LINEUP_STREAM_STATUSES = [
  "PickingPlayers",
  "Scheduled",
  "WaitingForCheckIn",
];

const lineupFields = {
  id: true,
  name: true,
  team_id: true,
  is_ready: true,
  is_on_lineup: true,
  can_update_lineup: true,
  coach: playerFields,
  captain: {
    placeholder_name: true,
    player: { name: true, steam_id: true },
  },
  lineup_players: [
    {
      order_by: [
        { captain: order_by.desc_nulls_last },
        { player: { name: order_by.asc } },
      ],
    },
    {
      captain: true,
      steam_id: true,
      checked_in: true,
      placeholder_name: true,
      party_id: true,
      party_source: true,
      player: playerFields,
    },
  ],
};

// A match's lineups, sent again only when its check-in version moves (a seat
// filled or left, a captain, coach or party changing, a check-in, the status,
// deadline, organizer or options changing). Everything here is one read;
// streams have their own refetch interval, apart from the live queries'.
export const lineupStreamSubscription = typedGql("subscription")({
  match_check_in_versions_stream: [
    {
      batch_size: 1,
      cursor: [
        {
          initial_value: { changed_at: "1970-01-01T00:00:00Z" },
          ordering: cursor_ordering.ASC,
        },
      ],
      where: { match_id: { _eq: $("matchId", "uuid!") } },
    },
    {
      changed_at: true,
      match: {
        id: true,
        status: true,
        cancels_at: true,
        can_check_in: true,
        can_start: true,
        is_in_lineup: true,
        is_captain: true,
        lineup_1: lineupFields,
        lineup_2: lineupFields,
      },
    },
  ],
});

// The latest streamed lineups of a stream's answer, if it carried them.
export function streamedLineups(data: any) {
  return data?.match_check_in_versions_stream?.at(-1)?.match ?? undefined;
}

const playerKey = (player: any) =>
  player.steam_id != null
    ? `steam:${player.steam_id}`
    : `placeholder:${player.placeholder_name}`;

// The streamed lineup: who sits where, in its order. A player the page already
// had keeps what only the page reads (match-time faceit, say).
function withStreamedLineup(lineup: any, streamed: any) {
  if (!lineup || !streamed) {
    return lineup;
  }
  const polled = new Map(
    (lineup.lineup_players ?? []).map((player: any) => [
      playerKey(player),
      player,
    ]),
  );
  return {
    ...lineup,
    ...streamed,
    lineup_players: (streamed.lineup_players ?? []).map((player: any) => {
      const before: any = polled.get(playerKey(player));
      if (!before) {
        return player;
      }
      return {
        ...before,
        ...player,
        player: player.player && { ...before.player, ...player.player },
      };
    }),
  };
}

// The match with its streamed lineups laid over it: the seats, captains,
// coaches and check-ins, and what the viewer may do about them. The rest of
// the match is still the caller's.
export function withStreamedLineups(match: any, streamed: any) {
  if (!match || !streamed || streamed.id !== match.id) {
    return match;
  }
  return {
    ...match,
    status: streamed.status,
    cancels_at: streamed.cancels_at,
    can_check_in: streamed.can_check_in,
    can_start: streamed.can_start,
    is_in_lineup: streamed.is_in_lineup,
    is_captain: streamed.is_captain,
    lineup_1: withStreamedLineup(match.lineup_1, streamed.lineup_1),
    lineup_2: withStreamedLineup(match.lineup_2, streamed.lineup_2),
  };
}
