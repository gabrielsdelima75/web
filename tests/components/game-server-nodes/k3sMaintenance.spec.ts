import { describe, expect, it } from "vitest";
import {
  filesFailed,
  k3sCardState,
  readJsonSetting,
  type K3sMaintenance,
  type K3sVersions,
} from "~/components/game-server-nodes/k3sMaintenance";

const versions = (overrides: Partial<K3sVersions> = {}): K3sVersions => ({
  installed: true,
  server: "v1.35.2+k3s1",
  stable: "v1.36.5+k3s1",
  target: "v1.36.5+k3s1",
  steps: 1,
  nodes: [
    { name: "panel", version: "v1.35.2+k3s1", server: true, ready: true },
    { name: "node-a", version: "v1.35.2+k3s1", server: false, ready: true },
    { name: "node-b", version: "v1.35.2+k3s1", server: false, ready: false },
  ],
  ...overrides,
});

const maintenance = (
  overrides: Partial<K3sMaintenance> = {},
): K3sMaintenance => ({
  at: "2026-11-03T04:00:00.000Z",
  state: "scheduled",
  target: "v1.36.5+k3s1",
  node: null,
  upgraded: [],
  skipped: [],
  error: null,
  ...overrides,
});

describe("k3sCardState", () => {
  it("shows nothing until the api has reported versions", () => {
    expect(k3sCardState(null, null, null)).toBeNull();
    expect(
      readJsonSetting(
        [{ name: "k3s_versions", value: "{oops" }],
        "k3s_versions",
      ),
    ).toBeNull();
  });

  it("asks for ./update.sh while the upgrade controller is missing", () => {
    expect(
      k3sCardState(versions({ installed: false }), null, null),
    ).toEqual({ kind: "not_installed" });
  });

  it("offers the next step, or says it is up to date", () => {
    expect(k3sCardState(versions({ steps: 2 }), null, null)).toMatchObject({
      kind: "available",
      target: "v1.36.5+k3s1",
      steps: 2,
    });
    expect(
      k3sCardState(versions({ target: null, steps: 0 }), null, null),
    ).toEqual({ kind: "up_to_date" });
  });

  it("shows a scheduled update only while its time is still set", () => {
    const at = "2026-11-03T04:00:00.000Z";

    expect(k3sCardState(versions(), maintenance(), at)).toMatchObject({
      kind: "scheduled",
      at,
    });
    expect(k3sCardState(versions(), maintenance(), "")).toMatchObject({
      kind: "available",
    });
  });

  it("names the node being updated, and says when it is stopping", () => {
    const running = maintenance({
      state: "running",
      node: "node-a",
      upgraded: ["panel"],
      skipped: ["node-b"],
    });

    expect(
      k3sCardState(versions(), running, "2026-11-03T04:00:00.000Z"),
    ).toEqual({
      kind: "running",
      target: "v1.36.5+k3s1",
      node: "node-a",
      stopping: false,
    });
    expect(k3sCardState(versions(), running, "")).toMatchObject({
      stopping: true,
    });
  });

  it("keeps a failed run in view while there is still something to update", () => {
    const failed = maintenance({ state: "failed", error: "timed out" });

    expect(k3sCardState(versions(), failed, null)).toEqual({
      kind: "failed",
      error: "timed out",
    });
    expect(
      k3sCardState(versions({ target: null, steps: 0 }), failed, null),
    ).toEqual({ kind: "up_to_date" });
  });

  it("calls it a catch-up when the server already runs the target", () => {
    expect(
      k3sCardState(
        versions({ server: "v1.36.5+k3s1", target: "v1.36.5+k3s1" }),
        null,
        null,
      ),
    ).toEqual({
      kind: "catch_up",
      target: "v1.36.5+k3s1",
      behind: 2,
      changes: 0,
    });
  });

  it("offers a maintenance for node changes with no k3s update", () => {
    const changes = versions({ target: null, steps: 0, maintenance: 2 });

    expect(k3sCardState(changes, null, null)).toEqual({
      kind: "changes",
      count: 2,
    });
    expect(
      k3sCardState({ ...changes, installed: false }, null, null),
    ).toEqual({ kind: "changes", count: 2 });
    expect(
      k3sCardState(versions({ maintenance: 3 }), null, null),
    ).toMatchObject({ kind: "available", changes: 3 });
  });

  it("keeps a failed run in view while node changes still wait", () => {
    expect(
      k3sCardState(
        versions({ target: null, steps: 0, maintenance: 1 }),
        maintenance({ state: "failed", error: "timed out" }),
        null,
      ),
    ).toEqual({ kind: "failed", error: "timed out" });
  });

  it("counts nodes whose setup files failed to sync", () => {
    expect(
      filesFailed(
        versions({
          nodes: [
            {
              name: "a",
              version: "",
              server: false,
              ready: true,
              files: "failed",
            },
            {
              name: "b",
              version: "",
              server: false,
              ready: true,
              files: "current",
            },
          ],
        }),
      ),
    ).toBe(1);
  });
});
