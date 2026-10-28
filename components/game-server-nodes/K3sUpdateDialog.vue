<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { useI18n } from "vue-i18n";
import { useNow } from "@vueuse/core";
import { settings_constraint, settings_update_column } from "~/generated/zeus";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  K3S_MAINTENANCE_AT,
} from "~/components/game-server-nodes/k3sMaintenance";

const props = defineProps<{
  open: boolean;
  from: string | null;
  target: string | null;
  stable: string | null;
  steps: number;
  behind: number;
  changes: number;
}>();

const emit = defineEmits<{ "update:open": [open: boolean] }>();

const { t } = useI18n();
const { client } = useApolloClient();
const K3S = "pages.game_server_nodes.k3s";

const when = ref<"now" | "later">("later");
const at = ref("");
const saving = ref(false);
const now = useNow({ interval: 30_000 });
const catchUp = computed(() => !!props.target && props.from === props.target);

function localInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const minAt = computed(() => localInputValue(now.value));

watch(
  () => props.open,
  (open) => {
    if (open) {
      when.value = "later";
      at.value = localInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
    }
  },
  { immediate: true },
);

function pickedTime(current: number) {
  if (when.value === "now") {
    return new Date(current);
  }
  const date = new Date(at.value);
  return Number.isNaN(date.getTime()) || date.getTime() < current
    ? null
    : date;
}

const startAt = computed(() => pickedTime(now.value.getTime()));

async function save() {
  const date = pickedTime(Date.now());
  if (!date || saving.value) {
    return;
  }
  saving.value = true;
  try {
    await client.mutate({
      mutation: generateMutation({
        insert_settings_one: [
          {
            object: { name: K3S_MAINTENANCE_AT, value: date.toISOString() },
            on_conflict: {
              constraint: settings_constraint.settings_pkey,
              update_columns: [settings_update_column.value],
            },
          },
          { __typename: true },
        ],
      }),
    });
    toast({
      title: t(
        when.value === "now"
          ? `${K3S}.toast.started`
          : `${K3S}.toast.scheduled`,
      ),
    });
    emit("update:open", false);
  } catch {
    toast({ variant: "destructive", title: t(`${K3S}.toast.failed`) });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AlertDialog
    :open="open"
    @update:open="(value) => !saving && emit('update:open', value)"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t(`${K3S}.dialog.title`) }}</AlertDialogTitle>
        <AlertDialogDescription class="space-y-3">
          <span class="block font-medium text-foreground">
            {{
              !target
                ? t(`${K3S}.dialog.changes`, { count: changes }, changes)
                : catchUp
                  ? t(
                      `${K3S}.dialog.catch_up`,
                      { count: behind, to: target },
                      behind,
                    )
                  : t(`${K3S}.dialog.from_to`, { from, to: target })
            }}
          </span>
          <span v-if="target && changes" class="block">
            {{ t(`${K3S}.dialog.changes`, { count: changes }, changes) }}
          </span>
          <span v-if="target && steps > 1" class="block">
            {{ t(`${K3S}.dialog.steps`, { count: steps, stable }) }}
          </span>
          <span class="block">{{ t(`${K3S}.dialog.what_happens`) }}</span>
          <span class="block" data-testid="k3s-steps">
            <span
              v-for="(step, index) in [
                ...(!target
                  ? ['restart']
                  : catchUp
                    ? ['nodes']
                    : ['server', 'nodes']),
                'offline',
                'banner',
              ]"
              :key="step"
              class="block"
              >{{ index + 1 }}. {{ t(`${K3S}.dialog.${step}`) }}</span
            >
          </span>
          <span class="block">{{ t(`${K3S}.dialog.risk`) }}</span>
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-2">
        <div
          class="flex gap-2"
          role="radiogroup"
          :aria-label="t(`${K3S}.dialog.title`)"
        >
          <Button
            size="sm"
            :variant="when === 'later' ? 'default' : 'outline'"
            role="radio"
            :aria-checked="when === 'later'"
            :disabled="saving"
            data-testid="k3s-when-later"
            @click="when = 'later'"
          >
            {{ t(`${K3S}.dialog.schedule`) }}
          </Button>
          <Button
            size="sm"
            :variant="when === 'now' ? 'default' : 'outline'"
            role="radio"
            :aria-checked="when === 'now'"
            :disabled="saving"
            data-testid="k3s-when-now"
            @click="when = 'now'"
          >
            {{ t(`${K3S}.dialog.now`) }}
          </Button>
        </div>
        <label v-if="when === 'later'" class="block space-y-1 text-sm">
          <span class="text-muted-foreground">{{
            t(`${K3S}.dialog.when`)
          }}</span>
          <Input
            v-model="at"
            type="datetime-local"
            :min="minAt"
            :disabled="saving"
            data-testid="k3s-at"
          />
        </label>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel :disabled="saving">
          {{ t("common.cancel") }}
        </AlertDialogCancel>
        <Button
          :disabled="!startAt"
          :loading="saving"
          data-testid="k3s-confirm"
          @click="save"
        >
          {{
            t(
              when === "now"
                ? `${K3S}.dialog.start_now`
                : `${K3S}.dialog.start_scheduled`,
            )
          }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
