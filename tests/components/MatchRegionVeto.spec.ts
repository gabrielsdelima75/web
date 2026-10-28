import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import MatchRegionVeto from "~/components/match/MatchRegionVeto.vue";
import VetoBoard from "~/components/match/VetoBoard.vue";

const lineup = (id: string, steamId: string, turn = false) => ({
  id,
  name: id,
  is_picking_region_veto: turn,
  can_pick_region_veto: false,
  lineup_players: [{ steam_id: steamId, captain: true, player: {} }],
});

// The region veto as the page's poll last had it: lineup 1 up.
const polled = () => ({
  id: "match-1",
  status: "Veto",
  region: null,
  is_organizer: false,
  lineup_1_id: "l1",
  lineup_2_id: "l2",
  lineup_1: lineup("l1", "1", true),
  lineup_2: lineup("l2", "2"),
  region_veto_picking_lineup_id: "l1",
  veto_pick_expires_at: null,
  match_maps: [],
  options: {
    type: "Competitive",
    region_veto: true,
    regions: ["EU", "NA", "SA"],
    veto_pick_timeout: 0,
  },
});

// What the veto stream sends once lineup 1 has banned EU: lineup 2 is up.
const afterBan = () => ({
  id: "match-1",
  status: "Veto",
  region: null,
  veto_pick_expires_at: null,
  map_veto_type: null,
  map_veto_picking_lineup_id: null,
  region_veto_picking_lineup_id: "l2",
  lineup_1: {
    id: "l1",
    is_picking_region_veto: false,
    can_pick_region_veto: false,
  },
  lineup_2: {
    id: "l2",
    is_picking_region_veto: true,
    can_pick_region_veto: true,
  },
  match_maps: [],
  map_veto_picks: [],
  region_veto_picks: [
    { region: "EU", type: "Ban", auto_picked: false, match_lineup_id: "l1" },
  ],
});

const board = (wrapper: any) => wrapper.findComponent(VetoBoard);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MatchRegionVeto veto stream", () => {
  it("shows whose turn it is from the stream, ahead of the page's poll", async () => {
    const wrapper = await mountSuspended(MatchRegionVeto, {
      props: { match: polled(), matchId: "match-1" },
    });
    (wrapper.vm as any).streamed = afterBan();
    await wrapper.vm.$nextTick();

    expect(board(wrapper).props("pickingLineup")).toBe(2);
    expect(board(wrapper).props("isPicking")).toBe(true);
    expect(board(wrapper).props("steps")[0].record).toMatchObject({
      itemId: "EU",
      lineup: 1,
    });
  });

  it("bans for the lineup the stream says is up", async () => {
    const client = (useNuxtApp() as any).$apollo.defaultClient;
    vi.spyOn(client, "subscribe").mockImplementation(
      () =>
        ({
          subscribe: () => ({ unsubscribe() {}, closed: false }),
        }) as any,
    );
    const mutate = vi.spyOn(client, "mutate").mockResolvedValue({ data: {} });
    const wrapper = await mountSuspended(MatchRegionVeto, {
      props: { match: polled(), matchId: "match-1" },
      global: { mixins: (useNuxtApp().vueApp as any)._context.mixins },
    });
    (wrapper.vm as any).streamed = afterBan();

    await (wrapper.vm as any).vetoPick("NA");

    expect(mutate.mock.calls[0][0].variables.match_lineup_id).toBe("l2");
  });
});

describe("MatchRegionVeto organizer's region", () => {
  // No region veto: the organizer picks the region from a form.
  const organizerChooses = () => ({
    ...polled(),
    is_organizer: true,
    options: { ...polled().options, region_veto: false },
  });

  it("closes the form as soon as the stream has a region", async () => {
    const wrapper = await mountSuspended(MatchRegionVeto, {
      props: { match: organizerChooses(), matchId: "match-1" },
    });
    expect(wrapper.find("form").exists()).toBe(true);

    (wrapper.vm as any).streamed = { ...afterBan(), region: "NA" };
    await wrapper.vm.$nextTick();

    expect(wrapper.find("form").exists()).toBe(false);
  });
});
