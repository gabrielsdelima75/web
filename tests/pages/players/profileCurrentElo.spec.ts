import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { print } from "graphql";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import PlayerPage from "~/pages/players/[id].vue";
import PlayerEloChart from "~/components/charts/PlayerEloChart.vue";
import { e_player_roles_enum } from "~/generated/zeus";

const TARGET = "76561198000000002";

const history = [
  { type: "Competitive", updated_elo: 4900, current_elo: 5000 },
  { type: "Competitive", updated_elo: 7773, current_elo: 7589 },
  { type: "Competitive", updated_elo: 5258, current_elo: 5000 },
  { type: "Duel", updated_elo: 9999, current_elo: 5479 },
].map((row, i) => ({
  ...row,
  elo_change: row.updated_elo - row.current_elo,
  match_created_at: `2026-10-2${i}T12:00:00Z`,
  match_id: `m${i}`,
  match_result: "win",
  season_id: null,
  kills: 0,
  deaths: 0,
  assists: 0,
}));

const client = vi.hoisted(() => ({
  query: (_: { query: unknown }) => Promise.resolve({ data: {} as unknown }),
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

let unmount: (() => void) | undefined;

afterEach(async () => {
  unmount?.();
  unmount = undefined;
  await flushPromises();
});

describe("player profile current ELO", () => {
  it("shows the player's Competitive ratings, not those of any mode", async () => {
    client.query = ({ query }) =>
      Promise.resolve({
        data: print(query as any).includes("PlayerWindowedEloHistory")
          ? { v_player_elo: history }
          : {},
      });
    const wrapper = await mountSuspended(PlayerPage, {
      shallow: true,
      route: `/players/${TARGET}`,
      global: { renderStubDefaultSlot: true },
    } as any);
    unmount = () => wrapper.unmount();
    (wrapper.vm as any).player = {
      steam_id: TARGET,
      name: "Alex",
      role: e_player_roles_enum.user,
      elo: { competitive: 5258, duel: 5726, wingman: null, rush: null },
    };
    await flushPromises();

    const current = wrapper
      .findAll("animated-stat-stub")
      .map((stat) => stat.attributes("value"));
    expect(current).toEqual(
      expect.arrayContaining(["5,258", "7,773", "4,900"]),
    );
    expect(current).not.toContain("9,999");

    const series = (wrapper.findComponent(PlayerEloChart).props() as any)
      .series as Array<{ key: string; history: Array<{ updated_elo: number }> }>;
    expect(series.map((s) => s.key)).toEqual(["Competitive"]);
    expect(series[0].history.map((e) => e.updated_elo)).toEqual([
      4900, 7773, 5258,
    ]);
  });
});
