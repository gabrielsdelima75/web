import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { provideApolloClient } from "@vue/apollo-composable";
import type { OperationDefinitionNode } from "graphql";
import LeaderboardPlayerPanel from "~/components/leaderboard/LeaderboardPlayerPanel.vue";
import type { LeaderboardEntry } from "~/utilities/leaderboard";

const entry = (
  rank: number,
  name: string,
  value: number,
): LeaderboardEntry => ({
  rank,
  player_steam_id: name,
  player_name: name,
  player_avatar_url: null,
  player_custom_avatar_url: null,
  player_country: null,
  value,
  secondary_value: 12,
  tertiary_value: 3,
  matches_played: 9,
});

const filters = {
  window_days: 0,
  season_id: null,
  match_type: "Competitive",
  exclude_tournaments: false,
  role: null,
  source: "overall",
};

let queries: Array<{
  name: string;
  root: string;
  variables: Record<string, unknown>;
}> = [];

beforeEach(() => {
  queries = [];
  const client = (useNuxtApp() as any).$apollo.defaultClient;
  provideApolloClient(client);
  vi.spyOn(client, "query").mockImplementation(async (options: any) => {
    const operation = options.query.definitions[0] as OperationDefinitionNode;
    const root = (operation.selectionSet.selections[0] as any).name.value;
    queries.push({
      name: operation.name?.value ?? "",
      root,
      variables: options.variables,
    });
    if (root === "leaderboardPage") {
      return {
        data: {
          leaderboardPage: {
            entries: [
              { player_steam_id: "rawr", player_name: "rawr", value: 5527 },
            ],
          },
        },
      } as any;
    }
    return {
      data: {
        leaderboardRanks: [
          { category: "elo", rank: 5, total: 15, value: 5492 },
          { category: "best_kdr", rank: 3, total: 15, value: 1.2 },
        ],
      },
    } as any;
  });
});

function mountPanel(props: Record<string, unknown> = {}) {
  const me = entry(5, "hazmat", 5492);
  return mountSuspended(LeaderboardPlayerPanel, {
    props: {
      player: {
        steam_id: "hazmat",
        name: "hazmat",
        avatar_url: null,
        custom_avatar_url: null,
        country: null,
      },
      category: "elo",
      categories: ["elo", "best_kdr", "awards"],
      entry: me,
      entries: [entry(4, "rawr", 5527), me],
      total: 15,
      filters,
      ...props,
    },
  });
}

describe("LeaderboardPlayerPanel", () => {
  it("asks for the player's rank on every board in one request", async () => {
    const wrapper = await mountPanel();
    await flushPromises();

    expect(queries.map((q) => [q.name, q.root])).toEqual([
      ["LeaderboardPlayerBoards", "leaderboardRanks"],
    ]);
    expect(queries[0].variables).toMatchObject({
      categories: ["elo", "best_kdr", "awards"],
      player_steam_id: "hazmat",
      match_type: "Competitive",
    });
    const boards = wrapper
      .findAll("button")
      .filter((b) => /^(ELO|KDR|Awards)/.test(b.text()))
      .map((b) => b.findAll("span").map((s) => s.text())[1]);
    expect(boards).toEqual(["#5", "#3", "—"]);
  });

  it("says how far the player is behind the next rank up", async () => {
    const wrapper = await mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("35 ELO behind #4 rawr");
    expect(wrapper.text()).toContain("of 15 on ELO");
  });

  it("asks for the player one place up when that row is on another page", async () => {
    const wrapper = await mountPanel({
      entries: [entry(5, "hazmat", 5492)],
    });
    await flushPromises();

    const neighbor = queries.find((q) => q.name === "LeaderboardNeighbor");
    expect(neighbor?.root).toBe("leaderboardPage");
    expect(neighbor?.variables).toMatchObject({
      category: "elo",
      offset: 3,
      match_type: "Competitive",
    });
    expect(wrapper.text()).toContain("35 ELO behind #4 rawr");
  });

  it("hands a board pick back with the player's rank there", async () => {
    const wrapper = await mountPanel();
    await flushPromises();

    const kdr = wrapper
      .findAll("button")
      .find((b) => b.text().startsWith("KDR"));
    await kdr!.trigger("click");

    expect(wrapper.emitted("board")).toEqual([["best_kdr", 3]]);
  });
});
