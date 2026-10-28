import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import MatchMapVeto from "~/components/match/MatchMapVeto.vue";
import VetoBoard from "~/components/match/VetoBoard.vue";
import { useVetoHandoff } from "~/composables/useVetoHandoff";

const POOL = [
  "ancient",
  "anubis",
  "dust2",
  "inferno",
  "mirage",
  "nuke",
  "train",
];

const lineup = (id: string, steamId: string) => ({
  id,
  name: id,
  can_pick_map_veto: false,
  is_picking_map_veto: false,
  lineup_players: [{ steam_id: steamId, captain: true, player: {} }],
});

const matchMap = (order: number, id: string, l1: string, l2: string) => ({
  id: `mm-${order}`,
  order,
  status: "Scheduled",
  map: { id, name: id, label: id },
  lineup_1_side: l1,
  lineup_2_side: l2,
});

// A best of three straight out of its veto, its server booting.
function match(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    status: "Live",
    is_server_online: false,
    server_type: "OnDemand",
    lineup_1_id: "l1",
    lineup_2_id: "l2",
    lineup_1: lineup("l1", "1"),
    lineup_2: lineup("l2", "2"),
    map_veto_type: null,
    options: {
      type: "Custom",
      map_veto: true,
      region_veto: false,
      best_of: 3,
      knife_round: false,
      veto_pick_timeout: 0,
      map_pool: { maps: POOL.map((id) => ({ id, name: id, label: id })) },
    },
    match_maps: [
      matchMap(1, "mirage", "TERRORIST", "CT"),
      matchMap(2, "nuke", "CT", "TERRORIST"),
      matchMap(3, "ancient", "CT", "TERRORIST"),
    ],
    ...overrides,
  };
}

// What the veto stream sends for a match: its veto, as one read.
function streamed(m: any, picks: any[] = []) {
  return {
    id: m.id,
    status: m.status,
    region: m.region ?? null,
    veto_pick_expires_at: m.veto_pick_expires_at ?? null,
    map_veto_type: m.map_veto_type,
    map_veto_picking_lineup_id: m.map_veto_picking_lineup_id ?? null,
    region_veto_picking_lineup_id: null,
    lineup_1: m.lineup_1,
    lineup_2: m.lineup_2,
    match_maps: m.match_maps,
    map_veto_picks: picks,
    region_veto_picks: [],
  };
}

const board = (wrapper: any) => wrapper.findComponent(VetoBoard);

afterEach(() => {
  useVetoHandoff().value = null;
});

describe("MatchMapVeto start stage", () => {
  it("stays up as the start stage while the server boots", async () => {
    const wrapper = await mountSuspended(MatchMapVeto, {
      props: { match: match(), matchId: "match-1" },
    });

    expect(board(wrapper).exists()).toBe(true);
    expect(board(wrapper).props("start").phase).toBe("booting");
    expect(
      board(wrapper)
        .props("start")
        .maps.map((map: any) => map.itemId),
    ).toEqual(["mirage", "nuke", "ancient"]);
    expect(useVetoHandoff().value).toEqual({
      matchId: "match-1",
      phase: "stage",
    });
  });

  it("says ready, then hands the maps over and folds", async () => {
    const wrapper = await mountSuspended(MatchMapVeto, {
      props: { match: match(), matchId: "match-1" },
    });

    await wrapper.setProps({
      match: match({ is_server_online: true }),
    } as Record<string, unknown>);
    expect(board(wrapper).props("start").phase).toBe("ready");

    board(wrapper).vm.$emit("handoff");
    await wrapper.vm.$nextTick();
    expect(useVetoHandoff().value?.phase).toBe("arriving");
    expect(board(wrapper).exists()).toBe(false);

    await new Promise((done) => setTimeout(done, 600));
    expect(useVetoHandoff().value).toBeNull();
  });

  it("keeps the finished veto up in the draft room, which leaves before the server boots", async () => {
    const wrapper = await mountSuspended(MatchMapVeto, {
      props: {
        match: match(),
        matchId: "match-1",
        stage: false,
      },
    });

    // Not until its moves have arrived.
    expect(board(wrapper).exists()).toBe(false);

    (wrapper.vm as any).streamed = streamed(match());
    await wrapper.vm.$nextTick();
    expect(board(wrapper).exists()).toBe(true);
    expect(board(wrapper).props("start")).toBeNull();
    expect(useVetoHandoff().value).toBeNull();
  });

  it("is not shown once the server is up on the match page", async () => {
    const wrapper = await mountSuspended(MatchMapVeto, {
      props: { match: match({ is_server_online: true }), matchId: "match-1" },
    });

    expect(board(wrapper).exists()).toBe(false);
  });
});

describe("MatchMapVeto veto stream", () => {
  // The page's poll still has the veto before lineup 1's ban.
  const polled = () =>
    match({
      status: "Veto",
      map_veto_type: "Ban",
      map_veto_picking_lineup_id: "l1",
      lineup_1: { ...lineup("l1", "1"), is_picking_map_veto: true },
      match_maps: [],
    });
  const afterBan = () =>
    streamed(
      match({
        status: "Veto",
        map_veto_type: "Ban",
        map_veto_picking_lineup_id: "l2",
        lineup_2: {
          ...lineup("l2", "2"),
          is_picking_map_veto: true,
          can_pick_map_veto: true,
        },
        match_maps: [],
      }),
      [
        {
          id: "pick-1",
          map: { id: "ancient", name: "ancient", label: "ancient" },
          side: null,
          type: "Ban",
          auto_picked: false,
          match_lineup_id: "l1",
        },
      ],
    );

  it("shows whose turn it is from the stream, ahead of the page's poll", async () => {
    const wrapper = await mountSuspended(MatchMapVeto, {
      props: { match: polled(), matchId: "match-1" },
    });
    (wrapper.vm as any).streamed = afterBan();
    await wrapper.vm.$nextTick();

    expect(board(wrapper).props("pickingLineup")).toBe(2);
    expect(board(wrapper).props("isPicking")).toBe(true);
    expect(board(wrapper).props("steps")[0].record).toMatchObject({
      itemId: "ancient",
      lineup: 1,
    });
  });

  it("picks for the lineup the stream says is up", async () => {
    const client = (useNuxtApp() as any).$apollo.defaultClient;
    vi.spyOn(client, "subscribe").mockImplementation(
      () =>
        ({
          subscribe: () => ({ unsubscribe() {}, closed: false }),
        }) as any,
    );
    const mutate = vi.spyOn(client, "mutate").mockResolvedValue({ data: {} });
    const wrapper = await mountSuspended(MatchMapVeto, {
      props: { match: polled(), matchId: "match-1" },
      global: { mixins: (useNuxtApp().vueApp as any)._context.mixins },
    });
    (wrapper.vm as any).streamed = afterBan();

    await (wrapper.vm as any).vetoPick("dust2");

    expect(mutate.mock.calls[0][0].variables.match_lineup_id).toBe("l2");
    vi.restoreAllMocks();
  });
});
