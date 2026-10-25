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

async function mountOverlay() {
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
  for (const next of pushes) next({ data: { matches_by_pk: match } });
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
});
