import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import PlayerPage from "~/pages/players/[id].vue";
import { e_player_roles_enum } from "~/generated/zeus";

const client = vi.hoisted(() => ({
  query: (_options: any): Promise<any> => Promise.resolve({ data: {} }),
  subscribe: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
}));

vi.mock("@vue/apollo-composable", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vue/apollo-composable")>()),
  useApolloClient: () => ({ client }),
}));

vi.mock("~/components/ui/sidebar/utils", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useSidebar: () => ({ isMobile: ref(false) }),
}));

const TARGET = "76561198000000002";

const SEASONS = [
  {
    id: "s2",
    number: 2,
    description: null,
    starts_at: "2026-06-01T00:00:00Z",
    ends_at: null,
  },
  {
    id: "s1",
    number: 1,
    description: null,
    starts_at: "2026-01-01T00:00:00Z",
    ends_at: "2026-06-01T00:00:00Z",
  },
];

const match = (
  season_id: string,
  at: string,
  before: number,
  after: number,
) => ({
  season_id,
  type: "Competitive",
  current_elo: before,
  updated_elo: after,
  elo_change: after - before,
  match_created_at: at,
  match_id: `${season_id}-${at}`,
  match_result: after > before ? "Win" : "Loss",
  kills: 20,
  deaths: 15,
  assists: 4,
});

const HISTORY = [
  match("s1", "2026-02-01T00:00:00Z", 5000, 5100),
  match("s1", "2026-03-01T00:00:00Z", 5100, 5300),
  match("s1", "2026-04-01T00:00:00Z", 5300, 5200),
  match("s2", "2026-07-01T00:00:00Z", 5200, 5150),
];

function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { promise, resolve };
}

let unmount: (() => void) | undefined;

afterEach(async () => {
  unmount?.();
  unmount = undefined;
  useApplicationSettingsStore().settings = [];
  await flushPromises();
});

describe("player ELO strip", () => {
  it("lands once, after the seasons and where the last one finished", async () => {
    const seasons = deferred();
    const finish = deferred();
    client.query = ({ query }: any) => {
      switch (query.definitions[0].name?.value) {
        case "PlayerSeasonsFilter":
          return seasons.promise;
        case "PlayerWindowedEloHistory":
          return Promise.resolve({ data: { v_player_elo: HISTORY } });
        case "PlayerSeasonFinish":
          return finish.promise;
        default:
          return Promise.resolve({ data: {} });
      }
    };
    useApplicationSettingsStore().settings = [
      { name: "public.seasons_enabled", value: "true" },
    ];

    const wrapper = await mountSuspended(PlayerPage, {
      shallow: true,
      route: `/players/${TARGET}`,
      global: { renderStubDefaultSlot: true },
    } as any);
    unmount = () => wrapper.unmount();
    (wrapper.vm as any).player = {
      steam_id: TARGET,
      name: "Dana",
      role: e_player_roles_enum.user,
    };
    await flushPromises();

    const strip = () => wrapper.find("div.grid.divide-border\\/40");
    expect(strip().classes()).toContain("invisible");
    expect(wrapper.text()).not.toContain("Peak / Lowest");

    seasons.resolve({ data: { seasons: SEASONS } });
    await flushPromises();
    expect(strip().classes()).toContain("invisible");
    expect(wrapper.text()).not.toContain("Peak / Lowest");
    expect(wrapper.text()).toContain("S1 peak");

    finish.resolve({
      data: { get_player_leaderboard_rank: [{ rank: 4, total: 19 }] },
    });
    await flushPromises();
    expect(strip().classes()).not.toContain("invisible");
    expect(wrapper.text()).toContain("S1 peak");
  });

  it("shows Peak / Lowest at once where seasons are off", async () => {
    client.query = ({ query }: any) =>
      Promise.resolve(
        query.definitions[0].name?.value === "PlayerWindowedEloHistory"
          ? { data: { v_player_elo: HISTORY } }
          : { data: {} },
      );

    const wrapper = await mountSuspended(PlayerPage, {
      shallow: true,
      route: `/players/${TARGET}`,
      global: { renderStubDefaultSlot: true },
    } as any);
    unmount = () => wrapper.unmount();
    (wrapper.vm as any).player = {
      steam_id: TARGET,
      name: "Dana",
      role: e_player_roles_enum.user,
    };
    await flushPromises();

    expect(wrapper.find("div.grid.divide-border\\/40").classes()).not.toContain(
      "invisible",
    );
    expect(wrapper.text()).toContain("Peak / Lowest");
  });
});
