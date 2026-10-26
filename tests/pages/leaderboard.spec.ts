import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { provideApolloClient } from "@vue/apollo-composable";
import type { OperationDefinitionNode } from "graphql";
import Leaderboard from "~/pages/leaderboard.vue";
import { useAuthStore } from "~/stores/AuthStore";

const ME = "76561198000000009";

const row = (steamId: string, name: string, value: number) => ({
  player_steam_id: steamId,
  player_name: name,
  player_avatar_url: null,
  player_custom_avatar_url: null,
  player_country: null,
  value,
  secondary_value: 0,
  tertiary_value: 2,
  matches_played: 30,
});

let asked: Array<{ root: string; variables: Record<string, any> }> = [];
let mounted: { unmount: () => void } | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  asked = [];
  vi.restoreAllMocks();
});

async function mountBoard() {
  useAuthStore().me = { steam_id: ME, role: "user" } as any;
  const client = (useNuxtApp() as any).$apollo.defaultClient;
  provideApolloClient(client);
  vi.spyOn(client, "query").mockImplementation(async (options: any) => {
    const operation = options.query.definitions[0] as OperationDefinitionNode;
    const root = (operation.selectionSet.selections[0] as any).name.value;
    asked.push({ root, variables: options.variables });
    if (root === "leaderboardPage") {
      return {
        data: {
          leaderboardPage: {
            total: 240,
            max_value: 9100,
            entries: [
              row("76561198000000001", "apex", 9100),
              row("76561198000000002", "runner", 8800),
            ],
          },
        },
      } as any;
    }
    if (root === "leaderboardRanks") {
      return { data: { leaderboardRanks: [{ rank: 57, total: 240 }] } } as any;
    }
    return { data: {} } as any;
  });

  const wrapper = await mountSuspended(Leaderboard, {
    global: { mixins: (useNuxtApp().vueApp as any)._context.mixins },
  });
  mounted = wrapper;
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await flushPromises();
  return wrapper;
}

describe("leaderboard page", () => {
  it("reads a page of the board, its size and the viewer's rank from the api's boards", async () => {
    const wrapper = await mountBoard();

    const page = asked.find((q) => q.root === "leaderboardPage");
    expect(page?.variables).toMatchObject({ category: "elo", offset: 0 });
    expect(page?.variables).not.toHaveProperty("order_by");

    const rank = asked.find((q) => q.root === "leaderboardRanks");
    expect(rank?.variables).toMatchObject({
      category: "elo",
      player_steam_id: ME,
    });

    const text = wrapper.text();
    expect(text).toContain("apex");
    expect(text).toContain("runner");
    expect(text).toContain("240");
    expect(text).toMatch(/#57/);
  });
});
