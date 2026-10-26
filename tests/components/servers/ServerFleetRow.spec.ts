import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import ServerFleetRow from "~/components/servers/ServerFleetRow.vue";

const server = (plugin_runtime: string | null) => ({
  id: "server-1",
  label: "Bench",
  host: "10.0.0.5",
  port: 27015,
  type: "Ranked",
  enabled: true,
  connected: true,
  rcon_status: true,
  plugin_runtime,
});

describe("ServerFleetRow", () => {
  it("marks a simulated server in the list", async () => {
    const wrapper = await mountSuspended(ServerFleetRow, {
      props: { server: server("simulator"), ctx: {} },
    });

    expect(wrapper.find("[data-simulated-server]").text()).toBe("Simulated");
  });

  it("leaves a CS2 server unmarked", async () => {
    const wrapper = await mountSuspended(ServerFleetRow, {
      props: { server: server("swiftlys2"), ctx: {} },
    });

    expect(wrapper.find("[data-simulated-server]").exists()).toBe(false);
  });
});
