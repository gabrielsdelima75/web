<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import StatusDot from "~/components/admin/StatusDot.vue";
import { TONE_TEXT, type Tone } from "~/components/admin/tone";
import {
  k3sNodeStatus,
  type K3sMaintenance,
  type K3sNodeStatus,
  type K3sVersions,
} from "~/components/game-server-nodes/k3sMaintenance";

const props = defineProps<{
  versions: K3sVersions;
  maintenance: K3sMaintenance | null;
}>();

const { t } = useI18n();
const K3S = "pages.game_server_nodes.k3s";

const TONES: Record<K3sNodeStatus, Tone> = {
  current: "ok",
  done: "ok",
  update: "warn",
  update_changes: "warn",
  changes: "warn",
  updating: "info",
  waiting: "off",
  offline: "off",
  skipped: "off",
};

const rows = computed(() =>
  [...props.versions.nodes]
    .sort((a, b) => Number(b.server) - Number(a.server))
    .map((node) => ({
      ...node,
      status: k3sNodeStatus(node, props.versions, props.maintenance),
    })),
);
</script>

<template>
  <ul
    class="divide-y divide-border/60 rounded-md border border-border bg-background/40 text-xs"
    data-testid="k3s-nodes"
  >
    <li
      v-for="node in rows"
      :key="node.name"
      class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 px-2.5 py-1.5"
      :data-testid="`k3s-node-${node.name}`"
    >
      <StatusDot
        :tone="TONES[node.status]"
        :live="node.status === 'updating'"
        size="sm"
      />
      <span class="truncate">
        {{ node.name }}
        <span v-if="node.server" class="text-muted-foreground">
          · {{ t(`${K3S}.node.server`) }}
        </span>
      </span>
      <span class="font-mono text-muted-foreground">
        {{ node.version }}
      </span>
      <span class="text-right" :class="TONE_TEXT[TONES[node.status]]">
        {{ t(`${K3S}.node.${node.status}`) }}
      </span>
    </li>
  </ul>
</template>
