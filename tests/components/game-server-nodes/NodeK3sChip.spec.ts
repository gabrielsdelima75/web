import { afterEach, describe, expect, it } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import NodeK3sChip from "~/components/game-server-nodes/NodeK3sChip.vue";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";

const OLD = "v1.35.4+k3s1";
const NEW = "v1.36.5+k3s1";
const CHANGES = ["/etc/rancher/k3s/config.yaml"];

const VERSIONS = {
  installed: true,
  server: OLD,
  stable: NEW,
  target: NEW,
  steps: 1,
  maintenance: 1,
  nodes: [
    { name: "panel", version: OLD, server: true, ready: true },
    { name: "node-a", version: OLD, server: false, ready: true },
    {
      name: "node-b",
      version: NEW,
      server: false,
      ready: true,
      maintenance: CHANGES,
    },
    { name: "node-c", version: OLD, server: false, ready: false },
    { name: "node-d", version: NEW, server: false, ready: true },
  ],
};

function settings(rows: Record<string, unknown>) {
  useApplicationSettingsStore().settings = Object.entries(rows).map(
    ([name, value]) => ({ name, value: JSON.stringify(value) }),
  );
}

const unmounts: Array<() => void> = [];

async function chip(nodeId: string) {
  const wrapper = await mountSuspended(NodeK3sChip, { props: { nodeId } });
  unmounts.push(() => wrapper.unmount());
  await flushPromises();
  return wrapper.text();
}

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

describe("NodeK3sChip", () => {
  it("says on each node's row what the next maintenance does to it", async () => {
    settings({ k3s_versions: VERSIONS });

    expect(await chip("node-a")).toBe("Needs update");
    expect(await chip("node-b")).toBe("Changes waiting");
    expect(await chip("node-c")).toBe("Offline, skipped");
    expect(await chip("node-d")).toBe(NEW);
  });

  it("shows a dash for a node k3s does not know yet", async () => {
    settings({ k3s_versions: VERSIONS });

    expect(await chip("still-in-setup")).toBe("—");
  });

  it("follows a running maintenance on the rows", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: {
        at: "2026-11-01T00:00:00.000Z",
        state: "running",
        target: NEW,
        node: "node-a",
        upgraded: ["panel"],
        skipped: ["node-c"],
        error: null,
      },
      k3s_maintenance_at: "2026-11-01T00:00:00.000Z",
    });

    expect(await chip("panel")).toBe("Updated");
    expect(await chip("node-a")).toBe("Updating");
    expect(await chip("node-b")).toBe("Waiting");
    expect(await chip("node-c")).toBe("Skipped");
  });
});
