import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { provideApolloClient } from "@vue/apollo-composable";
import type { OperationDefinitionNode } from "graphql";
import PlayerLeaderboardRank from "~/components/PlayerLeaderboardRank.vue";

let asked: Array<{ root: string; variables: Record<string, unknown> }> = [];

beforeEach(() => {
  asked = [];
  const client = (useNuxtApp() as any).$apollo.defaultClient;
  provideApolloClient(client);
  vi.spyOn(client, "query").mockImplementation(async (options: any) => {
    const operation = options.query.definitions[0] as OperationDefinitionNode;
    asked.push({
      root: (operation.selectionSet.selections[0] as any).name.value,
      variables: options.variables,
    });
    return {
      data: { leaderboardRanks: [{ rank: 12, total: 340 }] },
    } as any;
  });
});

describe("PlayerLeaderboardRank", () => {
  it("reads the player's all-time Competitive rank from the api's boards", async () => {
    const wrapper = await mountSuspended(PlayerLeaderboardRank, {
      props: { playerSteamId: "76561198000000001" },
    });
    await flushPromises();

    expect(asked).toEqual([
      {
        root: "leaderboardRanks",
        variables: {
          category: "elo",
          window_days: 0,
          match_type: "Competitive",
          exclude_tournaments: false,
          player_steam_id: "76561198000000001",
        },
      },
    ]);
    expect(wrapper.text()).toContain("12");
  });
});
