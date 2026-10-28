<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { CircleArrowUp, LoaderCircle } from "lucide-vue-next";
import FiveStackToolTip from "~/components/FiveStackToolTip.vue";
import {
  useK3sMaintenance,
} from "~/components/game-server-nodes/useK3sMaintenance";
import {
  k3sNodeStatus,
  type K3sNodeStatus,
} from "~/components/game-server-nodes/k3sMaintenance";

const props = defineProps<{ nodeId: string }>();

const { t } = useI18n();
const { versions, maintenance, state } = useK3sMaintenance();
const K3S = "pages.game_server_nodes.k3s";

const node = computed(
  () =>
    versions.value?.nodes.find(({ name }) => name === props.nodeId) ?? null,
);
const status = computed(() =>
  node.value && versions.value
    ? k3sNodeStatus(node.value, versions.value, maintenance.value)
    : null,
);
const target = computed(() => {
  const current = state.value;
  if (current?.kind === "scheduled" || current?.kind === "running") {
    return current.target;
  }
  return versions.value?.installed ? versions.value.target : null;
});

const MOVING: Array<K3sNodeStatus> = [
  "update",
  "update_changes",
  "waiting",
  "updating",
  "offline",
];

const tip = computed(() => {
  if (!node.value || !status.value) {
    return "";
  }
  const version =
    target.value && MOVING.includes(status.value)
      ? `${node.value.version} → ${target.value}`
      : node.value.version;
  return node.value.maintenance?.length && status.value !== "changes"
    ? `${version} · ${t(`${K3S}.node.changes`)}`
    : version;
});

const TONES: Record<K3sNodeStatus, string> = {
  current: "border-border bg-muted/40 text-muted-foreground",
  update: "border-warning/30 bg-warning/10 text-warning",
  update_changes: "border-warning/30 bg-warning/10 text-warning",
  changes: "border-warning/30 bg-warning/10 text-warning",
  offline: "border-border bg-muted/40 text-muted-foreground",
  waiting: "border-border bg-muted/40 text-muted-foreground",
  updating: "border-info/30 bg-info/10 text-info",
  done: "border-success/30 bg-success/10 text-success",
  skipped: "border-border bg-muted/40 text-muted-foreground",
};

const pill =
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[5px] border px-[7px] text-[11px] font-semibold";
</script>

<template>
  <span v-if="!status" class="text-muted-foreground/60">—</span>
  <FiveStackToolTip v-else as-child :delay-duration="120">
    <template #trigger>
      <span
        tabindex="-1"
        :class="[pill, TONES[status]]"
        :data-testid="`k3s-chip-${nodeId}`"
      >
        <LoaderCircle
          v-if="status === 'updating'"
          class="h-3 w-3 animate-spin motion-reduce:animate-none"
        />
        <CircleArrowUp
          v-else-if="['update', 'update_changes', 'changes'].includes(status)"
          class="h-3 w-3"
        />
        <span v-if="status === 'current'" class="font-mono font-medium">{{
          node!.version
        }}</span>
        <template v-else>{{ t(`${K3S}.node.${status}`) }}</template>
      </span>
    </template>
    <span class="font-mono tabular-nums">{{ tip }}</span>
  </FiveStackToolTip>
</template>
