<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight, CalendarClock, ChevronDown } from "lucide-vue-next";
import { toast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { Fold } from "~/components/ui/transitions";
import StatusDot from "~/components/admin/StatusDot.vue";
import type { Tone } from "~/components/admin/tone";
import TimeAgo from "~/components/TimeAgo.vue";
import K3sNodeList from "~/components/game-server-nodes/K3sNodeList.vue";
import K3sScheduleForm from "~/components/game-server-nodes/K3sScheduleForm.vue";
import {
  useK3sMaintenance,
  useMaintenanceAt,
} from "~/components/game-server-nodes/useK3sMaintenance";
import {
  isBehind,
  k3sNodeStatus,
} from "~/components/game-server-nodes/k3sMaintenance";
import { dateLocale } from "~/utilities/dateLocale";

const emit = defineEmits<{ navigate: [] }>();

const { t } = useI18n();
const writeAt = useMaintenanceAt();
const { versions, maintenance, state } = useK3sMaintenance();
const K3S = "pages.game_server_nodes.k3s";

const TONES: Record<string, Tone> = {
  running: "info",
  scheduled: "info",
  failed: "bad",
  available: "warn",
  catch_up: "warn",
  changes: "warn",
};

const nodesOpen = ref(false);
const scheduling = ref(false);

const target = computed(() => {
  const current = state.value;
  if (current?.kind === "scheduled" || current?.kind === "running") {
    return current.target;
  }
  return versions.value?.installed ? versions.value.target : null;
});
const jump = computed(() =>
  state.value?.kind !== "running" && target.value !== versions.value?.server
    ? target.value
    : null,
);

watch(
  () => state.value?.kind,
  () => {
    scheduling.value = false;
  },
);

const facts = computed(() => {
  const current = versions.value;
  if (!current || !state.value) {
    return [];
  }
  const lines: Array<string> = [];
  if (state.value.kind === "catch_up") {
    lines.push(
      t(
        `${K3S}.catch_up`,
        { count: state.value.behind, version: state.value.target },
        state.value.behind,
      ),
    );
  } else if (target.value) {
    const wanted = target.value;
    const count = current.nodes.filter((node) =>
      isBehind(node.version, wanted),
    ).length;
    lines.push(
      t(`${K3S}.nodes_need`, { count, total: current.nodes.length }, count),
    );
  }
  if (state.value.kind === "available" && state.value.steps > 1) {
    lines.push(t(`${K3S}.steps`, { count: state.value.steps }));
  }
  const changes = current.maintenance ?? 0;
  if (changes) {
    lines.push(t(`${K3S}.changes`, { count: changes }, changes));
  }
  return lines;
});

const progress = computed(() => {
  const current = versions.value;
  const statuses = (current?.nodes ?? []).map((node) =>
    k3sNodeStatus(node, current!, maintenance.value),
  );
  return {
    done: statuses.filter((status) => status === "done").length,
    total: statuses.filter((status) =>
      ["done", "updating", "waiting"].includes(status),
    ).length,
  };
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(dateLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function write(value: string, title: string) {
  try {
    await writeAt(value);
    toast({ title: t(title) });
  } catch {
    toast({ variant: "destructive", title: t(`${K3S}.toast.failed`) });
  }
}
</script>

<template>
  <section
    v-if="state && versions && TONES[state.kind]"
    class="space-y-2.5 rounded-md border p-3 text-xs"
    :class="
      state.kind === 'failed'
        ? 'border-destructive/40 bg-destructive/[0.06]'
        : 'border-[hsl(var(--tac-amber)/0.45)] bg-[hsl(var(--tac-amber)/0.06)]'
    "
    data-testid="k3s-notice"
  >
    <div class="flex items-center gap-2">
      <span
        class="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))]"
      >
        {{ t(`${K3S}.title`) }}
      </span>
      <StatusDot
        :tone="TONES[state.kind]"
        :live="state.kind === 'running'"
        size="sm"
      />
    </div>

    <p v-if="jump" class="text-sm" data-testid="k3s-jump">
      <span class="font-mono">{{ versions.server }}</span>
      →
      <span class="font-mono text-[hsl(var(--tac-amber))]">{{ jump }}</span>
    </p>

    <template v-if="state.kind === 'running'">
      <p class="text-sm font-medium">
        {{
          state.stopping && state.node
            ? t(`${K3S}.stopping`, { node: state.node })
            : !state.target
              ? state.node
                ? t(`${K3S}.applying`, { node: state.node })
                : t(`${K3S}.applying_any`)
              : state.node
                ? t(`${K3S}.running`, {
                    version: state.target,
                    node: state.node,
                  })
                : t(`${K3S}.updating`, { version: state.target })
        }}
      </p>
      <div
        class="h-1 overflow-hidden rounded-full bg-border"
        role="progressbar"
        :aria-valuenow="progress.done"
        :aria-valuemax="progress.total"
      >
        <div
          class="h-full bg-[hsl(var(--tac-amber))] transition-[width] duration-300 motion-reduce:transition-none"
          :style="{
            width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
          }"
        ></div>
      </div>
      <p class="text-muted-foreground" data-testid="k3s-progress">
        {{ t(`${K3S}.progress`, progress) }}
      </p>
    </template>

    <p v-else-if="state.kind === 'failed'" class="text-destructive">
      {{
        state.error
          ? `${t(`${K3S}.failed`)}: ${state.error}`
          : t(`${K3S}.failed`)
      }}
    </p>

    <div
      v-else-if="state.kind === 'scheduled'"
      class="flex items-center gap-2.5 rounded-md border border-border bg-background/40 px-2.5 py-2"
    >
      <CalendarClock
        class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
      />
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm">{{ formatTime(state.at) }}</span>
        <TimeAgo :date="state.at" hide-icon class="text-muted-foreground" />
      </span>
      <Button
        v-if="!scheduling"
        size="xs"
        variant="outline"
        data-testid="k3s-change"
        @click="scheduling = true"
      >
        {{ t(`${K3S}.change`) }}
      </Button>
    </div>

    <template v-if="state.kind !== 'running'">
      <p v-if="facts.length" class="text-muted-foreground">
        {{ facts.join(" · ") }}
      </p>
      <p class="text-muted-foreground">{{ t(`${K3S}.how`) }}</p>
      <button
        v-if="!scheduling"
        type="button"
        class="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        :aria-expanded="nodesOpen"
        data-testid="k3s-notice-nodes"
        @click="nodesOpen = !nodesOpen"
      >
        {{ t(nodesOpen ? `${K3S}.hide_nodes` : `${K3S}.show_nodes`) }}
        <ChevronDown
          class="h-3 w-3 transition-transform duration-200 motion-reduce:transition-none"
          :class="{ 'rotate-180': nodesOpen }"
        />
      </button>
    </template>

    <Fold :open="nodesOpen || scheduling || state.kind === 'running'">
      <K3sNodeList :versions="versions" :maintenance="maintenance" />
    </Fold>

    <Fold :open="scheduling">
      <div class="border-t border-[hsl(var(--tac-amber)/0.25)] pt-3">
        <K3sScheduleForm
          :initial="state.kind === 'scheduled' ? state.at : null"
          @saved="scheduling = false"
          @cancel="scheduling = false"
        />
      </div>
    </Fold>

    <div v-if="!scheduling" class="flex flex-wrap items-center gap-2 pt-0.5">
      <Button
        v-if="
          ['available', 'catch_up', 'changes', 'failed'].includes(state.kind)
        "
        size="sm"
        data-testid="k3s-schedule"
        @click="scheduling = true"
      >
        {{ t(`${K3S}.update`) }}
      </Button>
      <template v-if="state.kind === 'scheduled'">
        <Button
          size="sm"
          variant="outline"
          data-testid="k3s-start-now"
          @click="write(new Date().toISOString(), `${K3S}.toast.started`)"
        >
          {{ t(`${K3S}.dialog.start_now`) }}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="text-destructive hover:text-destructive"
          data-testid="k3s-cancel"
          @click="write('', `${K3S}.toast.cancelled`)"
        >
          {{ t(`${K3S}.cancel`) }}
        </Button>
      </template>
      <Button
        v-if="state.kind === 'running' && state.node && !state.stopping"
        size="sm"
        variant="outline"
        data-testid="k3s-stop"
        @click="write('', `${K3S}.toast.cancelled`)"
      >
        {{ t(`${K3S}.stop`) }}
      </Button>
      <NuxtLink
        to="/game-server-nodes"
        class="ml-auto inline-flex items-center gap-1 font-medium text-[hsl(var(--tac-amber))] hover:underline"
        @click="emit('navigate')"
      >
        {{ t("pages.game_server_nodes.title") }}
        <ArrowRight class="h-3 w-3" />
      </NuxtLink>
    </div>
  </section>
</template>
