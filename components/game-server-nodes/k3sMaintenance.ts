// The api writes k3s_versions and k3s_maintenance as JSON; an admin writes
// k3s_maintenance_at (an ISO time, or empty to cancel).
export const K3S_MAINTENANCE_AT = "k3s_maintenance_at";

export type K3sNode = {
  name: string;
  version: string;
  server: boolean;
  ready: boolean;
  files?: "current" | "pending" | "syncing" | "failed";
  maintenance?: Array<string>;
};

export type K3sVersions = {
  installed: boolean;
  server: string | null;
  stable: string | null;
  target: string | null;
  steps: number;
  nodes: Array<K3sNode>;
  // Nodes with changes that apply when k3s-agent restarts, in a maintenance.
  maintenance?: number;
};

export type K3sMaintenance = {
  at: string;
  state: "scheduled" | "running" | "done" | "failed" | "cancelled";
  target: string | null;
  node: string | null;
  upgraded: Array<string>;
  skipped: Array<string>;
  error: string | null;
};

export type K3sCardState =
  | { kind: "not_installed" }
  | {
      kind: "running";
      target: string | null;
      node: string | null;
      stopping: boolean;
    }
  | { kind: "scheduled"; target: string | null; at: string }
  | { kind: "failed"; error: string | null }
  | {
      kind: "available";
      target: string;
      steps: number;
      stable: string | null;
      changes: number;
    }
  | { kind: "catch_up"; target: string; behind: number; changes: number }
  | { kind: "changes"; count: number }
  | { kind: "up_to_date" };

export function filesFailed(versions: K3sVersions) {
  return versions.nodes.filter((node) => node.files === "failed").length;
}

function versionParts(version: string) {
  const match = /^v(\d+)\.(\d+)\.(\d+)\+k3s(\d+)$/.exec(version ?? "");
  return match ? match.slice(1).map(Number) : null;
}

export function isBehind(version: string, target: string) {
  const current = versionParts(version);
  const wanted = versionParts(target);
  if (!current || !wanted) {
    return false;
  }
  const index = current.findIndex((part, i) => part !== wanted[i]);
  return index !== -1 && current[index] < wanted[index];
}

// Nodes that the next step moves: on a catch-up (the server already runs the
// target) that is every other node still behind it, as the api counts them.
export function nodesBehind(versions: K3sVersions) {
  return versions.nodes.filter(
    (node) => !node.server && isBehind(node.version, versions.target),
  ).length;
}

export type K3sNodeStatus =
  | "current"
  | "update"
  | "update_changes"
  | "changes"
  | "offline"
  | "waiting"
  | "updating"
  | "done"
  | "skipped";

export function k3sNodeStatus(
  node: K3sNode,
  versions: K3sVersions,
  maintenance: K3sMaintenance | null,
): K3sNodeStatus {
  const run = maintenance?.state === "running" ? maintenance : null;
  if (run?.node === node.name) {
    return "updating";
  }
  if (run?.upgraded.includes(node.name)) {
    return "done";
  }
  if (run?.skipped.includes(node.name)) {
    return "skipped";
  }

  const planned =
    run ?? (maintenance?.state === "scheduled" ? maintenance : null);
  const target = planned
    ? planned.target
    : versions.installed
      ? versions.target
      : null;
  const upgrade = !!target && isBehind(node.version, target);
  const changes = !node.server && (node.maintenance?.length ?? 0) > 0;
  if (!upgrade && !changes) {
    return "current";
  }
  if (!node.server && !node.ready) {
    return "offline";
  }
  if (run) {
    return "waiting";
  }
  return upgrade ? (changes ? "update_changes" : "update") : "changes";
}

export function readJsonSetting<T>(
  settings: Array<{ name: string; value: string }>,
  name: string,
): T | null {
  const value = settings.find((setting) => setting.name === name)?.value;
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function k3sCardState(
  versions: K3sVersions | null,
  maintenance: K3sMaintenance | null,
  scheduledAt: string | null,
): K3sCardState | null {
  if (!versions) {
    return null;
  }

  if (maintenance?.state === "running") {
    return {
      kind: "running",
      target: maintenance.target,
      node: maintenance.node,
      stopping: !scheduledAt,
    };
  }

  if (maintenance?.state === "scheduled" && scheduledAt) {
    return {
      kind: "scheduled",
      target: maintenance.target,
      at: maintenance.at,
    };
  }

  const changes = versions.maintenance ?? 0;
  const target = versions.installed ? versions.target : null;

  if (!target && !changes) {
    return versions.installed
      ? { kind: "up_to_date" }
      : { kind: "not_installed" };
  }

  if (maintenance?.state === "failed") {
    return { kind: "failed", error: maintenance.error };
  }

  if (!target) {
    return { kind: "changes", count: changes };
  }

  if (target === versions.server) {
    return {
      kind: "catch_up",
      target,
      behind: nodesBehind(versions),
      changes,
    };
  }

  return {
    kind: "available",
    target,
    steps: versions.steps,
    stable: versions.stable,
    changes,
  };
}

