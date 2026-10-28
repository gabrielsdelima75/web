import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, cursor_ordering } from "~/generated/zeus";

const lineupCheckInFields = {
  id: true,
  lineup_players: [{}, { steam_id: true, checked_in: true }],
};

// A match's check-in, sent again only when its check-in version moves (a
// player checking in, joining or leaving, the status, the deadline or who may
// check in changing). Everything here is one read; streams have their own
// refetch interval, apart from the live queries'.
export const checkInStreamSubscription = typedGql("subscription")({
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
        lineup_1: lineupCheckInFields,
        lineup_2: lineupCheckInFields,
      },
    },
  ],
});

// The latest streamed check-in of a stream's answer, if it carried one.
export function streamedCheckIn(data: any) {
  return data?.match_check_in_versions_stream?.at(-1)?.match ?? undefined;
}

function withCheckedIn(lineup: any, streamed: any) {
  if (!lineup || !streamed) {
    return lineup;
  }
  const checkedIn = new Map<string, boolean>(
    (streamed.lineup_players ?? []).map((player: any) => [
      String(player.steam_id),
      player.checked_in,
    ]),
  );
  return {
    ...lineup,
    lineup_players: (lineup.lineup_players ?? []).map((player: any) =>
      checkedIn.has(String(player.steam_id))
        ? { ...player, checked_in: checkedIn.get(String(player.steam_id)) }
        : player,
    ),
  };
}

// The match with the streamed check-in laid over it: its status, deadline,
// whether the viewer may check in, and who has. The players themselves, and
// the rest of the match, are still the caller's.
export function withStreamedCheckIn(match: any, checkIn: any) {
  if (!match || !checkIn || checkIn.id !== match.id) {
    return match;
  }
  return {
    ...match,
    status: checkIn.status,
    cancels_at: checkIn.cancels_at,
    can_check_in: checkIn.can_check_in,
    lineup_1: withCheckedIn(match.lineup_1, checkIn.lineup_1),
    lineup_2: withCheckedIn(match.lineup_2, checkIn.lineup_2),
  };
}
