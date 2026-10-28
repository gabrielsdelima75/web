import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import K3sCard from "~/components/game-server-nodes/K3sCard.vue";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@vue/apollo-composable", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vue/apollo-composable")>()),
  useApolloClient: () => ({ client: { mutate } }),
}));

vi.mock("~/graphql/graphqlGen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/graphql/graphqlGen")>()),
  generateMutation: (mutation: unknown) => mutation,
}));

vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));

const VERSIONS = {
  installed: true,
  server: "v1.34.4+k3s1",
  stable: "v1.36.5+k3s1",
  target: "v1.35.9+k3s1",
  steps: 2,
  nodes: [
    { name: "panel", version: "v1.34.4+k3s1", server: true, ready: true },
    { name: "node-a", version: "v1.34.4+k3s1", server: false, ready: true },
  ],
};

const written = () =>
  mutate.mock.calls.map(
    ([{ mutation }]) => mutation.insert_settings_one[0].object,
  );

function settings(rows: Record<string, unknown>) {
  useApplicationSettingsStore().settings = Object.entries(rows).map(
    ([name, value]) => ({
      name,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }),
  );
}

const click = (testId: string) =>
  document.body
    .querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!
    .click();

let unmount: (() => void) | undefined;

async function mountCard() {
  const wrapper = await mountSuspended(K3sCard, { attachTo: document.body });
  unmount = () => wrapper.unmount();
  await flushPromises();
  return wrapper;
}

describe("K3sCard", () => {
  beforeEach(() => {
    mutate.mockReset().mockResolvedValue({ data: {} });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    vi.restoreAllMocks();
  });

  it("renders nothing before the api reports versions", async () => {
    settings({});

    const wrapper = await mountCard();

    expect(wrapper.find('[data-testid="k3s-card"]').exists()).toBe(false);
  });

  it("shows the next step and explains what an update does before writing anything", async () => {
    settings({ k3s_versions: VERSIONS });

    const wrapper = await mountCard();
    expect(wrapper.text()).toContain("v1.35.9+k3s1 available");
    expect(wrapper.text()).toContain("2 minor versions to stable");

    click("k3s-update");
    await flushPromises();

    const dialog = document.body.textContent;
    expect(dialog).toContain("From v1.34.4+k3s1 to v1.35.9+k3s1");
    expect(dialog).toContain("The panel server updates first");
    expect(dialog).toContain("one at a time");
    expect(dialog).toContain("matches already on it keep going");
    expect(dialog).toContain("24 hours before");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("starts now by setting the maintenance time to the current time", async () => {
    settings({ k3s_versions: VERSIONS });
    await mountCard();

    click("k3s-update");
    await flushPromises();
    click("k3s-when-now");
    await flushPromises();
    const before = Date.now();
    click("k3s-confirm");
    await flushPromises();

    const [row] = written();
    expect(row.name).toBe("k3s_maintenance_at");
    expect(new Date(row.value).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(row.value).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("schedules the time the admin picked, in their own time zone", async () => {
    const zone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      settings({ k3s_versions: VERSIONS });
      await mountCard();

      click("k3s-update");
      await flushPromises();
      const input = document.body.querySelector<HTMLInputElement>(
        '[data-testid="k3s-at"]',
      )!;
      input.value = "2099-01-02T03:04";
      input.dispatchEvent(new Event("input"));
      await flushPromises();
      click("k3s-confirm");
      await flushPromises();
    } finally {
      if (zone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = zone;
      }
    }
    expect(written()).toEqual([
      { name: "k3s_maintenance_at", value: "2099-01-02T08:04:00.000Z" },
    ]);
  });

  it("keeps the dialog open when saving fails", async () => {
    settings({ k3s_versions: VERSIONS });
    mutate.mockRejectedValueOnce(new Error("offline"));
    const wrapper = await mountCard();

    click("k3s-update");
    await flushPromises();
    click("k3s-when-now");
    await flushPromises();
    click("k3s-confirm");
    await flushPromises();

    expect(
      wrapper.findComponent({ name: "K3sUpdateDialog" }).emitted("update:open"),
    ).toBeUndefined();
    expect(document.body.querySelector('[data-testid="k3s-confirm"]')).not.toBeNull();
  });

  it("words a catch-up as nodes behind the server, without a server step", async () => {
    settings({
      k3s_versions: {
        ...VERSIONS,
        server: "v1.36.5+k3s1",
        target: "v1.36.5+k3s1",
        steps: 1,
        nodes: [
          { name: "panel", version: "v1.36.5+k3s1", server: true, ready: true },
          { name: "node-a", version: "v1.35.9+k3s1", server: false, ready: true },
        ],
      },
    });

    const wrapper = await mountCard();
    expect(wrapper.text()).toContain("1 node behind v1.36.5+k3s1");

    click("k3s-update");
    await flushPromises();
    const dialog = document.body.textContent;
    expect(dialog).toContain(
      "1 node is behind the panel server, which already runs v1.36.5+k3s1",
    );
    expect(dialog).not.toContain("From v1.36.5+k3s1 to v1.36.5+k3s1");
    expect(dialog).not.toContain("The panel server updates first");
  });

  it("drops a failed run once there is nothing left to update", async () => {
    settings({
      k3s_versions: { ...VERSIONS, target: null, steps: 0 },
      k3s_maintenance: {
        at: "2026-11-01T00:00:00.000Z",
        state: "failed",
        target: "v1.35.9+k3s1",
        node: "node-a",
        upgraded: [],
        skipped: [],
        error: "timed out",
      },
    });

    const wrapper = await mountCard();

    expect(wrapper.text()).toContain("Up to date");
    expect(wrapper.text()).not.toContain("Last update failed");
  });

  it("refuses a time in the past", async () => {
    settings({ k3s_versions: VERSIONS });
    await mountCard();

    click("k3s-update");
    await flushPromises();
    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="k3s-at"]',
    )!;
    input.value = "2001-01-02T03:04";
    input.dispatchEvent(new Event("input"));
    await flushPromises();

    expect(
      document.body.querySelector<HTMLButtonElement>(
        '[data-testid="k3s-confirm"]',
      )!.disabled,
    ).toBe(true);
  });

  it("re-checks the time when saving, after the dialog has sat open", async () => {
    settings({ k3s_versions: VERSIONS });
    await mountCard();

    click("k3s-update");
    await flushPromises();
    const soon = new Date(Date.now() + 2 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="k3s-at"]',
    )!;
    input.value = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    const later = Date.now() + 10 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    click("k3s-confirm");
    await flushPromises();

    expect(mutate).not.toHaveBeenCalled();
  });

  it("says it is updating between nodes, with nothing to stop yet", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: {
        at: "2026-11-01T00:00:00.000Z",
        state: "running",
        target: "v1.35.9+k3s1",
        node: null,
        upgraded: ["panel"],
        skipped: [],
        error: null,
      },
      k3s_maintenance_at: "2026-11-01T00:00:00.000Z",
    });

    const wrapper = await mountCard();

    expect(wrapper.text()).toContain("Updating to v1.35.9+k3s1");
    expect(wrapper.text()).not.toContain("·");
    expect(wrapper.find('[data-testid="k3s-stop"]').exists()).toBe(false);
  });

  it("cancels a scheduled update by clearing its time", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: {
        at: "2099-01-02T03:04:00.000Z",
        state: "scheduled",
        target: "v1.35.9+k3s1",
        node: null,
        upgraded: [],
        skipped: [],
        error: null,
      },
      k3s_maintenance_at: "2099-01-02T03:04:00.000Z",
    });

    const wrapper = await mountCard();
    expect(wrapper.text()).toContain("Update to v1.35.9+k3s1 scheduled for");

    click("k3s-cancel");
    await flushPromises();

    expect(written()).toEqual([{ name: "k3s_maintenance_at", value: "" }]);
  });

  it("shows the node being updated and offers to stop after it", async () => {
    settings({
      k3s_versions: VERSIONS,
      k3s_maintenance: {
        at: "2026-11-01T00:00:00.000Z",
        state: "running",
        target: "v1.35.9+k3s1",
        node: "node-a",
        upgraded: ["panel"],
        skipped: [],
        error: null,
      },
      k3s_maintenance_at: "2026-11-01T00:00:00.000Z",
    });

    const wrapper = await mountCard();

    expect(wrapper.text()).toContain("Updating to v1.35.9+k3s1 · node-a");
    expect(wrapper.find('[data-testid="k3s-update"]').exists()).toBe(false);

    click("k3s-stop");
    await flushPromises();

    expect(written()).toEqual([{ name: "k3s_maintenance_at", value: "" }]);
  });

  it("offers a maintenance for node changes and explains the restart", async () => {
    settings({
      k3s_versions: {
        ...VERSIONS,
        server: "v1.36.5+k3s1",
        target: null,
        steps: 0,
        maintenance: 2,
        nodes: [
          { name: "panel", version: "v1.36.5+k3s1", server: true, ready: true },
          {
            name: "node-a",
            version: "v1.36.5+k3s1",
            server: false,
            ready: true,
            files: "failed",
          },
        ],
      },
    });

    const wrapper = await mountCard();
    expect(wrapper.text()).toContain("2 nodes have changes waiting");
    expect(wrapper.text()).toContain("Setup files failed on 1 node");

    click("k3s-update");
    await flushPromises();
    const dialog = document.body.textContent;
    expect(dialog).toContain(
      "2 nodes have changes that apply when k3s-agent restarts.",
    );
    expect(dialog).toContain("k3s-agent restarts. Matches already on it");
    expect(dialog).not.toContain("The panel server updates first");

    click("k3s-when-now");
    await flushPromises();
    click("k3s-confirm");
    await flushPromises();
    expect(written()).toHaveLength(1);
  });

  it("names a scheduled run of node changes without a version", async () => {
    settings({
      k3s_versions: { ...VERSIONS, target: null, steps: 0, maintenance: 1 },
      k3s_maintenance: {
        at: "2099-01-02T03:04:00.000Z",
        state: "scheduled",
        target: null,
        node: null,
        upgraded: [],
        skipped: [],
        error: null,
      },
      k3s_maintenance_at: "2099-01-02T03:04:00.000Z",
    });

    const wrapper = await mountCard();

    expect(wrapper.text()).toContain("Node changes scheduled for");
    expect(wrapper.text()).not.toContain("Update to  scheduled");
  });
});
