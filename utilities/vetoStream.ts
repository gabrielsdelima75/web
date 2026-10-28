import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, cursor_ordering, order_by } from "~/generated/zeus";

const mapFields = {
  id: true,
  name: true,
  label: true,
  patch: true,
  poster: true,
};

const lineupVetoFields = {
  id: true,
  is_picking_map_veto: true,
  can_pick_map_veto: true,
  is_picking_region_veto: true,
  can_pick_region_veto: true,
};

// A match's veto, sent again only when its veto version moves (any pick,
// rewind, clock change, captain change, map or status change). Everything here
// is one read, so the picks, whose turn it is and the clock always agree.
// Streams have their own refetch interval, apart from the live queries'.
export const vetoStreamSubscription = typedGql("subscription")({
  match_veto_versions_stream: [
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
        region: true,
        veto_pick_expires_at: true,
        map_veto_type: true,
        map_veto_picking_lineup_id: true,
        region_veto_picking_lineup_id: true,
        lineup_1: lineupVetoFields,
        lineup_2: lineupVetoFields,
        match_maps: [
          {},
          {
            id: true,
            order: true,
            status: true,
            lineup_1_side: true,
            lineup_2_side: true,
            map: mapFields,
          },
        ],
        map_veto_picks: [
          { order_by: [{ created_at: order_by.asc }] },
          {
            id: true,
            map: mapFields,
            side: true,
            type: true,
            auto_picked: true,
            match_lineup_id: true,
          },
        ],
        region_veto_picks: [
          { order_by: [{ created_at: order_by.asc }] },
          {
            region: true,
            type: true,
            auto_picked: true,
            match_lineup_id: true,
          },
        ],
      },
    },
  ],
});

// The latest streamed veto of a stream's answer, if it carried one.
export function streamedVeto(data: any) {
  return data?.match_veto_versions_stream?.at(-1)?.match ?? undefined;
}

// The page's match with the streamed veto laid over it. The rest of the match
// (names, options, the server) is still the page's.
export function withStreamedVeto(match: any, veto: any) {
  if (!veto) {
    return match;
  }
  return {
    ...match,
    status: veto.status,
    region: veto.region,
    veto_pick_expires_at: veto.veto_pick_expires_at,
    map_veto_type: veto.map_veto_type,
    map_veto_picking_lineup_id: veto.map_veto_picking_lineup_id,
    region_veto_picking_lineup_id: veto.region_veto_picking_lineup_id,
    match_maps: veto.match_maps,
    lineup_1: { ...match?.lineup_1, ...veto.lineup_1 },
    lineup_2: { ...match?.lineup_2, ...veto.lineup_2 },
  };
}
