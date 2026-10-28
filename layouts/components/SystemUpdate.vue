<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useApolloClient } from "@vue/apollo-composable";
import { AlertCircle, CalendarClock } from "lucide-vue-next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import ClipBoard from "~/components/ClipBoard.vue";
import K3sUpdateNotice from "~/components/game-server-nodes/K3sUpdateNotice.vue";
import {
  useK3sMaintenance,
} from "~/components/game-server-nodes/useK3sMaintenance";
import {
  readJsonSetting,
} from "~/components/game-server-nodes/k3sMaintenance";
import { generateMutation } from "~/graphql/graphqlGen";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";

type Update = { service: string; pod?: string; plugin?: string };

const PANEL_COMMAND = "git pull && ./update.sh";
const K3S_KINDS = [
  "available",
  "catch_up",
  "changes",
  "failed",
  "scheduled",
  "running",
];

const { t } = useI18n();
const { client } = useApolloClient();
const store = useApplicationSettingsStore();
const { state } = useK3sMaintenance();
const open = ref(false);

const updates = computed(
  () => readJsonSetting<Array<Update>>(store.settings, "updates") ?? [],
);
const services = computed(() => [
  ...new Set(
    updates.value
      .filter((update) => update.service !== "panel")
      .map((update) =>
        update.plugin
          ? `${update.plugin} (${update.service})`
          : update.service,
      ),
  ),
]);
const panel = computed(() =>
  updates.value.some((update) => update.service === "panel"),
);
const k3s = computed(
  () => !!state.value && K3S_KINDS.includes(state.value.kind),
);
const shown = computed(
  () => services.value.length > 0 || panel.value || k3s.value,
);

watch(shown, (value) => {
  if (!value) {
    open.value = false;
  }
});

async function updateServices() {
  await client.mutate({
    mutation: generateMutation({
      updateServices: {
        success: true,
      },
    }),
  });

  toast({
    title: t("layouts.system_update.updating"),
  });
}
</script>

<template>
  <Popover v-if="shown" v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[hsl(var(--tac-amber))] transition-colors duration-150 hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:outline-none data-[state=open]:bg-[hsl(var(--tac-amber)/0.1)]"
        :aria-label="t('layouts.system_update.title')"
        data-testid="system-update"
      >
        <Spinner v-if="state?.kind === 'running'" />
        <CalendarClock
          v-else-if="
            state?.kind === 'scheduled' && !services.length && !panel
          "
          class="h-4 w-4"
        />
        <AlertCircle v-else class="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      class="max-h-[calc(100dvh-5rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto p-0"
    >
      <p class="border-b border-border/60 px-4 py-3 text-sm font-semibold">
        {{ t("layouts.system_update.heading") }}
      </p>

      <div
        v-if="services.length"
        class="flex items-center gap-3 border-b border-border/60 px-4 py-3"
        data-testid="system-update-services"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">
            {{ t("layouts.system_update.services") }}
          </p>
          <p class="truncate text-xs text-muted-foreground">
            {{ services.join(", ") }}
          </p>
        </div>
        <Button
          size="sm"
          data-testid="system-update-now"
          @click="updateServices"
        >
          {{ t("layouts.system_update.update_now") }}
        </Button>
      </div>

      <div
        v-if="panel"
        class="space-y-2 border-b border-border/60 px-4 py-3"
        data-testid="system-update-panel"
      >
        <div>
          <p class="text-sm font-medium">
            {{ t("layouts.system_update.panel") }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ t("layouts.system_update.panel_update") }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <code
            class="flex h-9 min-w-0 flex-1 items-center rounded-md border border-border bg-background px-2.5 font-mono text-xs"
          >
            {{ PANEL_COMMAND }}
          </code>
          <ClipBoard :data="PANEL_COMMAND" />
        </div>
      </div>

      <div v-if="k3s" class="px-4 py-3">
        <K3sUpdateNotice @navigate="open = false" />
      </div>

      <p
        v-if="services.length || panel"
        class="px-4 py-2.5 text-xs text-muted-foreground"
        :class="{ 'border-t border-border/60': k3s }"
      >
        {{ t("layouts.system_update.note") }}
        <a
          href="https://docs.5stack.gg/common-issues/system-not-updating"
          target="_blank"
          rel="noopener"
          class="text-[hsl(var(--tac-amber))] hover:underline"
        >
          {{ t("layouts.system_update.fix_link") }}
        </a>
      </p>
    </PopoverContent>
  </Popover>
</template>
