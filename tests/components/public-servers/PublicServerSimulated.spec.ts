import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import PublicServerTile from "~/components/public-servers/PublicServerTile.vue";
import PublicServerRow from "~/components/public-servers/PublicServerRow.vue";
import PublicServerFeatured from "~/components/public-servers/PublicServerFeatured.vue";

const server = (plugin_runtime: string | null) => ({
  id: "server-1",
  label: "Bench",
  type: "Casual",
  game: "cs2",
  region: "eu",
  map: "de_dust2",
  players: 3,
  max_players: 10,
  isFull: false,
  tier: "good",
  ping: 20,
  featured: true,
  connection_link: "steam://connect/10.0.0.5:27015",
  connection_string: "connect 10.0.0.5:27015",
  plugin_runtime,
});

describe.each([
  ["tile", PublicServerTile],
  ["row", PublicServerRow],
  ["featured card", PublicServerFeatured],
])("a public server's %s", (_, view) => {
  it("marks a simulated server", async () => {
    const wrapper = await mountSuspended(view as any, {
      props: { server: server("simulator") },
    });

    expect(wrapper.find("[data-simulated-server]").text()).toBe("Simulated");
  });

  it("leaves a CS2 server unmarked", async () => {
    const wrapper = await mountSuspended(view as any, {
      props: { server: server("counterstrikesharp") },
    });

    expect(wrapper.find("[data-simulated-server]").exists()).toBe(false);
  });
});
