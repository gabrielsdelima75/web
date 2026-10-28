import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import MatchScoreboardOverlay from "~/components/match/MatchScoreboardOverlay.vue";

const { pushes } = vi.hoisted(() => ({
  pushes: [] as Array<(result: any) => void>,
}));

vi.mock("@vue/apollo-composable", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vue/apollo-composable")>()),
  useApolloClient: () => ({
    client: {
      subscribe: () => ({
        subscribe: ({ next }: { next: (result: any) => void }) => {
          pushes.push(next);
          return { unsubscribe() {} };
        },
      }),
    },
  }),
}));

const match = {
  id: "m1",
  status: "Live",
  lineup_1_id: "l1",
  lineup_2_id: "l2",
  options: { best_of: 1 },
  lineup_1: { id: "l1", name: "Buttah Boyz", lineup_players: [] },
  lineup_2: { id: "l2", name: "Saint's Team", lineup_players: [] },
  match_maps: [],
};

const player = (
  name: string,
  stats: { kills: number; deaths: number; damage: number },
  captain = false,
) => ({
  steam_id: name,
  captain,
  player: {
    steam_id: name,
    name,
    match_map_stats: [
      { match_map_id: "mm1", assists: 0, hs_kills: 0, ...stats },
    ],
  },
});

const liveMatch = {
  ...match,
  lineup_1: {
    id: "l1",
    name: "Clan",
    lineup_players: [
      player("AlexV", { kills: 11, deaths: 9, damage: 1500 }, true),
      player("Mongol", { kills: 15, deaths: 12, damage: 1800 }),
      player("gruzi", { kills: 13, deaths: 14, damage: 1900 }),
      player("nevermore", { kills: 16, deaths: 10, damage: 2100 }),
      player("cool guy", { kills: 16, deaths: 15, damage: 2300 }),
    ],
  },
  match_maps: [
    {
      id: "mm1",
      order: 1,
      status: "Live",
      lineup_1_score: 10,
      lineup_2_score: 10,
      winning_lineup_id: null,
      map: { name: "de_nuke", label: "Nuke" },
    },
  ],
};

async function mountOverlay(data: any = match) {
  const wrapper = await mountSuspended(MatchScoreboardOverlay, {
    props: { matchId: "m1", open: true, compact: true },
    global: {
      stubs: {
        Drawer: { template: '<div class="drawer"><slot /></div>' },
        DrawerContent: { template: "<div><slot /></div>" },
        DrawerTitle: { template: "<span><slot /></span>" },
      },
    },
  });
  for (const next of pushes) next({ data: { matches_by_pk: data } });
  await flushPromises();
  return wrapper;
}

describe("MatchScoreboardOverlay", () => {
  beforeEach(() => {
    pushes.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens over the player on desktop", async () => {
    const wrapper = await mountOverlay();

    expect(wrapper.find(".drawer").exists()).toBe(false);
    expect(wrapper.text()).toContain("Maps not picked");
  });

  it("opens in a drawer on a phone, where the player is too small to read", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
    }));
    const wrapper = await mountOverlay();

    expect(wrapper.get(".drawer").text()).toContain("Maps not picked");
  });

  const lineup1Order = (wrapper: any) =>
    wrapper
      .findAll("table")[0]
      .findAll("tbody tr")
      .map((row: any) => row.find("td").text().replace("★", ""));

  it("lists each team by kills, damage breaking a tie", async () => {
    const wrapper = await mountOverlay(liveMatch);

    expect(lineup1Order(wrapper)).toEqual([
      "cool guy",
      "nevermore",
      "Mongol",
      "gruzi",
      "AlexV",
    ]);
  });

  it("sorts by a column when its header is clicked, and reverses on a second click", async () => {
    const wrapper = await mountOverlay(liveMatch);
    const deaths = wrapper.findAll("table")[0].findAll("th")[2];

    await deaths.trigger("click");
    expect(lineup1Order(wrapper)[0]).toBe("cool guy");
    expect(lineup1Order(wrapper)[4]).toBe("AlexV");

    await deaths.trigger("click");
    expect(lineup1Order(wrapper)[0]).toBe("AlexV");
  });

  it("keeps the phone table narrow: the order holds, the headers don't sort", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
    }));
    const wrapper = await mountOverlay(liveMatch);
    const deaths = wrapper.findAll("table")[0].findAll("th")[2];

    expect(deaths.find("[data-sort-icons]").exists()).toBe(false);
    await deaths.trigger("click");
    expect(lineup1Order(wrapper)[0]).toBe("cool guy");
  });
});
