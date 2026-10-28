<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { useI18n } from "vue-i18n";
import { settings_constraint, settings_update_column } from "~/generated/zeus";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import StatusDot from "~/components/admin/StatusDot.vue";
import type { Tone } from "~/components/admin/tone";
import K3sUpdateDialog from "~/components/game-server-nodes/K3sUpdateDialog.vue";
import {
  K3S_MAINTENANCE_AT,
  filesFailed,
  k3sCardState,
  nodesBehind,
  readJsonSetting,
  type K3sMaintenance,
  type K3sVersions,
} from "~/components/game-server-nodes/k3sMaintenance";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";
import { tacticalSectionTickClasses } from "~/utilities/tacticalClasses";
import { dateLocale } from "~/utilities/dateLocale";

const { t } = useI18n();
const { client } = useApolloClient();
const store = useApplicationSettingsStore();
const K3S = "pages.game_server_nodes.k3s";

const versions = computed(() =>
  readJsonSetting<K3sVersions>(store.settings, "k3s_versions"),
);
const maintenance = computed(() =>
  readJsonSetting<K3sMaintenance>(store.settings, "k3s_maintenance"),
);
const scheduledAt = computed(
  () =>
    store.settings.find(({ name }) => name === K3S_MAINTENANCE_AT)?.value ||
    null,
);
const state = computed(() =>
  k3sCardState(versions.value, maintenance.value, scheduledAt.value),
);

const TONES: Record<string, Tone> = {
  not_installed: "off",
  running: "info",
  scheduled: "info",
  failed: "bad",
  available: "warn",
  catch_up: "warn",
  changes: "warn",
  up_to_date: "ok",
};

const dialogOpen = ref(false);

const target = computed(() =>
  versions.value?.installed ? versions.value.target : null,
);
const changes = computed(() => versions.value?.maintenance ?? 0);
const updatable = computed(() => Boolean(target.value || changes.value));
const failedFiles = computed(() =>
  versions.value ? filesFailed(versions.value) : 0,
);

watch(updatable, (can) => {
  if (!can) {
    dialogOpen.value = false;
  }
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(dateLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function clearSchedule() {
  try {
    await client.mutate({
      mutation: generateMutation({
        insert_settings_one: [
          {
            object: { name: K3S_MAINTENANCE_AT, value: "" },
            on_conflict: {
              constraint: settings_constraint.settings_pkey,
              update_columns: [settings_update_column.value],
            },
          },
          { __typename: true },
        ],
      }),
    });
    toast({ title: t(`${K3S}.toast.cancelled`) });
  } catch {
    toast({ variant: "destructive", title: t(`${K3S}.toast.failed`) });
  }
}
</script>

<template>
  <section
    v-if="state"
    class="mt-2 rounded-md border bg-card/40 [backdrop-filter:blur(6px)]"
    :class="
      state.kind === 'failed' ? 'border-destructive/40' : 'border-border'
    "
    :aria-label="t(`${K3S}.title`)"
    data-testid="k3s-card"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
      <span
        class="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.16em] text-muted-foreground"
      >
        <span :class="tacticalSectionTickClasses"></span>
        {{ t(`${K3S}.title`) }}
      </span>
      <StatusDot
        :tone="TONES[state.kind]"
        :live="state.kind === 'running'"
        size="sm"
      />
      <span v-if="versions?.server" class="font-mono">
        {{ versions.server }}
      </span>

      <span
        v-if="state.kind === 'not_installed'"
        class="text-muted-foreground"
      >
        {{ t(`${K3S}.not_installed`) }}
      </span>
      <span v-else-if="state.kind === 'up_to_date'" class="text-success">
        {{ t(`${K3S}.up_to_date`) }}
      </span>
      <template v-else-if="state.kind === 'available'">
        <span class="font-semibold text-warning">
          {{ t(`${K3S}.available`, { version: state.target }) }}
        </span>
        <span v-if="state.steps > 1" class="text-muted-foreground">
          {{ t(`${K3S}.steps`, { count: state.steps }) }}
        </span>
      </template>
      <span
        v-else-if="state.kind === 'changes'"
        class="font-semibold text-warning"
      >
        {{ t(`${K3S}.changes`, { count: state.count }, state.count) }}
      </span>
      <span
        v-else-if="state.kind === 'catch_up'"
        class="font-semibold text-warning"
      >
        {{
          t(
            `${K3S}.catch_up`,
            { count: state.behind, version: state.target },
            state.behind,
          )
        }}
      </span>
      <span v-else-if="state.kind === 'scheduled'" class="text-info">
        {{
          state.target
            ? t(`${K3S}.scheduled`, {
                version: state.target,
                time: formatTime(state.at),
              })
            : t(`${K3S}.scheduled_changes`, { time: formatTime(state.at) })
        }}
      </span>
      <span
        v-else-if="state.kind === 'running'"
        class="font-semibold text-info"
      >
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
      </span>
      <span
        v-else-if="state.kind === 'failed'"
        class="text-destructive"
        tabindex="0"
        :title="state.error ?? undefined"
        :aria-label="
          state.error ? `${t(`${K3S}.failed`)}: ${state.error}` : undefined
        "
      >
        {{ t(`${K3S}.failed`) }}
      </span>
      <span
        v-if="
          (state.kind === 'available' || state.kind === 'catch_up') &&
          state.changes
        "
        class="text-muted-foreground"
      >
        {{ t(`${K3S}.changes`, { count: state.changes }, state.changes) }}
      </span>
      <span
        v-if="failedFiles"
        class="text-destructive"
        data-testid="k3s-files-failed"
      >
        {{ t(`${K3S}.files_failed`, { count: failedFiles }, failedFiles) }}
      </span>

      <span class="ml-auto inline-flex gap-2">
        <Button
          v-if="
            ['available', 'catch_up', 'failed', 'changes'].includes(state.kind)
          "
          size="xs"
          variant="outline"
          data-testid="k3s-update"
          @click="dialogOpen = true"
        >
          {{ t(`${K3S}.update`) }}
        </Button>
        <Button
          v-if="state.kind === 'scheduled'"
          size="xs"
          variant="outline"
          data-testid="k3s-cancel"
          @click="clearSchedule"
        >
          {{ t(`${K3S}.cancel`) }}
        </Button>
        <Button
          v-if="state.kind === 'running' && state.node && !state.stopping"
          size="xs"
          variant="outline"
          data-testid="k3s-stop"
          @click="clearSchedule"
        >
          {{ t(`${K3S}.stop`) }}
        </Button>
      </span>
    </div>

    <K3sUpdateDialog
      v-if="versions && updatable"
      v-model:open="dialogOpen"
      :from="versions.server"
      :target="target"
      :stable="versions.stable"
      :steps="versions.steps"
      :behind="target ? nodesBehind(versions) : 0"
      :changes="changes"
    />
  </section>
</template>
