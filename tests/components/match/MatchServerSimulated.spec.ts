import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import MatchTabs from "~/components/match/MatchTabs.vue";
import MatchSelectServer from "~/components/match/MatchSelectServer.vue";

vi.mock("~/composables/useMatchBackupRounds", () => ({
  trackMatchBackupRounds: () => ({ rounds: { value: [] }, stop() {} }),
  useMatchBackupRounds: () => ({ backupRounds: { value: [] } }),
}));

const liveMatch = (server_plugin_runtime: string | null) => ({
  id: "m-1",
  status: "Live",
  is_organizer: false,
  is_in_lineup: false,
  is_server_online: true,
  server_id: "server-1",
  server_type: "On Demand",
  server_region: "eu",
  server_plugin_runtime,
  min_players_per_lineup: 5,
  max_players_per_lineup: 5,
  options: { type: "Competitive" },
  match_maps: [{ id: "map-1", status: "Live", map: { name: "de_dust2" } }],
  streams: [],
  lineup_1_id: "l-1",
  lineup_2_id: "l-2",
  lineup_1: { id: "l-1", lineup_players: [] },
  lineup_2: { id: "l-2", lineup_players: [] },
});

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | undefined;

beforeEach(() => {
  const client = (useNuxtApp() as any).$apollo.defaultClient;
  vi.spyOn(client, "subscribe").mockImplementation(() => ({
    subscribe: () => ({ unsubscribe() {}, closed: false }),
  }));
  vi.spyOn(client, "query").mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

describe("a match's server information", () => {
  async function serverInformation(runtime: string | null) {
    wrapper = await mountSuspended(MatchTabs, {
      route: "/matches/m-1?tab=settings",
      props: { match: liveMatch(runtime) },
      global: {
        mixins: (useNuxtApp().vueApp as any)._context.mixins,
        stubs: { MatchUtilityUtility: true, MatchOptionsDisplay: true },
      },
    });
    await flushPromises();
    return wrapper.find(".server-info-panel");
  }

  it("says when the match is on a simulated server", async () => {
    const panel = await serverInformation("simulator");

    expect(panel.find("[data-simulated-server]").text()).toBe("Simulated");
  });

  it("says nothing more for a CS2 server", async () => {
    const panel = await serverInformation("swiftlys2");

    expect(panel.exists()).toBe(true);
    expect(panel.find("[data-simulated-server]").exists()).toBe(false);
  });
});

describe("choosing a match's server", () => {
  it("names a simulated server as one", async () => {
    wrapper = await mountSuspended(MatchSelectServer, {
      props: { match: { id: "m-1", server_id: null } },
    });
    (wrapper.vm as any).servers = [
      {
        id: "s-1",
        label: "Bench",
        host: "10.0.0.5",
        port: 27015,
        plugin_runtime: "simulator",
      },
      {
        id: "s-2",
        label: "Main",
        host: "10.0.0.6",
        port: 27015,
        plugin_runtime: "swiftlys2",
      },
    ];

    expect(
      (wrapper.vm as any).availableServers.map(
        (server: { display: string }) => server.display,
      ),
    ).toEqual(["Bench (10.0.0.5:27015) · Simulated", "Main (10.0.0.6:27015)"]);
  });
});
