import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import SystemUpdate from "~/layouts/components/SystemUpdate.vue";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";

const { mutate, copyText } = vi.hoisted(() => ({
  mutate: vi.fn(),
  copyText: vi.fn(),
}));

vi.mock("@vue/apollo-composable", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vue/apollo-composable")>()),
  useApolloClient: () => ({ client: { mutate } }),
}));

vi.mock("~/graphql/graphqlGen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/graphql/graphqlGen")>()),
  generateMutation: (mutation: unknown) => mutation,
}));

vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));

vi.mock("~/utilities/copyText", () => ({ copyText }));

const VERSIONS = {
  installed: true,
  server: "v1.34.4+k3s1",
  stable: "v1.35.9+k3s1",
  target: "v1.35.9+k3s1",
  steps: 1,
  nodes: [
    { name: "panel", version: "v1.34.4+k3s1", server: true, ready: true },
    { name: "node-a", version: "v1.34.4+k3s1", server: false, ready: true },
    { name: "node-b", version: "v1.35.9+k3s1", server: false, ready: true },
  ],
};

const MAINTENANCE = {
  at: "2099-01-02T03:04:00.000Z",
  state: "scheduled",
  target: "v1.35.9+k3s1",
  node: null,
  upgraded: [],
  skipped: [],
  error: null,
};

function settings(rows: Record<string, unknown>) {
  useApplicationSettingsStore().settings = Object.entries(rows).map(
    ([name, value]) => ({
      name,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }),
  );
}

const find = (testId: string) =>
  document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

async function click(testId: string) {
  find(testId)!.click();
  await flushPromises();
}

const written = () =>
  mutate.mock.calls
    .map(([{ mutation }]) => mutation.insert_settings_one?.[0].object)
    .filter(Boolean);

let unmount: (() => void) | undefined;

async function openUpdates() {
  const wrapper = await mountSuspended(SystemUpdate, {
    attachTo: document.body,
  });
  unmount = () => wrapper.unmount();
  await flushPromises();
  if (find("system-update")) {
    await click("system-update");
  }
  return wrapper;
}

describe("the header update area", () => {
  beforeEach(() => {
    mutate.mockReset().mockResolvedValue({ data: {} });
    copyText.mockReset().mockResolvedValue(undefined);
    document.body.innerHTML = "";
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it("stays out of the header when nothing needs updating", async () => {
    settings({
      updates: "[]",
      k3s_versions: { ...VERSIONS, target: null, steps: 0 },
    });

    await openUpdates();

    expect(find("system-update")).toBeNull();
  });

  it("gives services and the panel each their own action", async () => {
    settings({
      updates: [
        { service: "api", pod: "api-1" },
        { service: "api", pod: "api-2" },
        { service: "web", pod: "web-1" },
        { service: "panel" },
      ],
    });

    await openUpdates();

    expect(find("system-update-services")!.textContent).toContain("api, web");
    expect(find("system-update-panel")!.textContent).toContain(
      "git pull && ./update.sh",
    );
    expect(find("k3s-notice")).toBeNull();

    find("system-update-panel")!.querySelector("button")!.click();
    await flushPromises();
    expect(copyText).toHaveBeenCalledWith("git pull && ./update.sh");

    await click("system-update-now");
    expect(mutate).toHaveBeenCalledWith({
      mutation: { updateServices: { success: true } },
    });
  });

  it("shows a Kubernetes update next to them and schedules it in place", async () => {
    settings({ updates: [{ service: "api" }], k3s_versions: VERSIONS });

    await openUpdates();

    expect(find("system-update-services")!.textContent).toContain("api");
    expect(find("k3s-jump")!.textContent).toMatch(
      /v1\.34\.4\+k3s1\s*→\s*v1\.35\.9\+k3s1/,
    );
    expect(find("k3s-notice")!.textContent).toContain("2 of 3 nodes need it");

    expect(find("k3s-notice")!.textContent).not.toContain("node-a");

    await click("k3s-schedule");

    await click("k3s-when-now");
    const before = Date.now();
    await click("k3s-confirm");

    const [row] = written();
    expect(row.name).toBe("k3s_maintenance_at");
    expect(new Date(row.value).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(row.value).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("starts a scheduled update early", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: MAINTENANCE,
      k3s_maintenance_at: MAINTENANCE.at,
    });
    await openUpdates();

    const before = Date.now();
    await click("k3s-start-now");

    const [row] = written();
    expect(new Date(row.value).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(row.value).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("cancels a scheduled update", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: MAINTENANCE,
      k3s_maintenance_at: MAINTENANCE.at,
    });
    await openUpdates();

    await click("k3s-cancel");

    expect(written()).toEqual([{ name: "k3s_maintenance_at", value: "" }]);
  });

  it("does not open by itself when a later update shows up", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: MAINTENANCE,
      k3s_maintenance_at: MAINTENANCE.at,
    });
    await openUpdates();
    expect(find("k3s-notice")).not.toBeNull();

    settings({ k3s_versions: { ...VERSIONS, target: null, steps: 0 } });
    await flushPromises();
    expect(find("system-update")).toBeNull();

    settings({ updates: [{ service: "api" }] });
    await flushPromises();
    expect(find("system-update")).not.toBeNull();
    expect(find("system-update-services")).toBeNull();
  });

  it("drops a half-made schedule change once the run starts", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: MAINTENANCE,
      k3s_maintenance_at: MAINTENANCE.at,
    });
    await openUpdates();
    await click("k3s-change");
    expect(find("k3s-confirm")).not.toBeNull();

    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: { ...MAINTENANCE, state: "running", node: "panel" },
      k3s_maintenance_at: MAINTENANCE.at,
    });
    await flushPromises();

    expect(find("k3s-confirm")).toBeNull();
    expect(find("k3s-stop")).not.toBeNull();
  });

  it("shows no version jump for a scheduled catch-up", async () => {
    const caughtUp = {
      ...VERSIONS,
      server: "v1.35.9+k3s1",
      nodes: [
        { ...VERSIONS.nodes[0], version: "v1.35.9+k3s1" },
        ...VERSIONS.nodes.slice(1),
      ],
    };
    settings({
      k3s_versions: caughtUp,
      k3s_maintenance: MAINTENANCE,
      k3s_maintenance_at: MAINTENANCE.at,
    });

    await openUpdates();

    expect(find("k3s-jump")).toBeNull();
    expect(find("k3s-notice")!.textContent).toContain("1 of 3 nodes needs it");
  });

  it("keeps a scheduled run of node changes to node changes", async () => {
    settings({
      k3s_versions: {
        ...VERSIONS,
        maintenance: 1,
        nodes: [
          VERSIONS.nodes[0],
          {
            ...VERSIONS.nodes[1],
            maintenance: ["/etc/rancher/k3s/config.yaml"],
          },
          VERSIONS.nodes[2],
        ],
      },
      k3s_maintenance: { ...MAINTENANCE, target: null },
      k3s_maintenance_at: MAINTENANCE.at,
    });

    await openUpdates();

    expect(find("k3s-jump")).toBeNull();
    expect(find("k3s-notice")!.textContent).not.toContain("need it");
    expect(find("k3s-notice")!.textContent).toContain(
      "1 node has changes waiting",
    );
  });

  it("follows a running update node by node", async () => {
    settings({
      k3s_versions: {
        ...VERSIONS,
        server: "v1.35.9+k3s1",
        nodes: [
          { ...VERSIONS.nodes[0], version: "v1.35.9+k3s1" },
          ...VERSIONS.nodes.slice(1),
        ],
      },
      k3s_maintenance: {
        ...MAINTENANCE,
        state: "running",
        node: "node-a",
        upgraded: ["panel"],
      },
      k3s_maintenance_at: MAINTENANCE.at,
    });

    await openUpdates();

    expect(find("k3s-progress")!.textContent).toContain("1 of 2 done");
    expect(find("k3s-notice")!.textContent).not.toContain("node-b");
    expect(find("k3s-stop")).not.toBeNull();
  });
});
