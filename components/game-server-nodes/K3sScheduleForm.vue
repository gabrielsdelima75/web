<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNow } from "@vueuse/core";
import { toast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  useMaintenanceAt,
} from "~/components/game-server-nodes/useK3sMaintenance";

const props = defineProps<{ initial?: string | null }>();

const emit = defineEmits<{
  saved: [];
  cancel: [];
  saving: [saving: boolean];
}>();

const { t } = useI18n();
const writeAt = useMaintenanceAt();
const K3S = "pages.game_server_nodes.k3s";

function localInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const when = ref<"now" | "later">("later");
const at = ref(
  localInputValue(
    props.initial
      ? new Date(props.initial)
      : new Date(Date.now() + 24 * 60 * 60 * 1000),
  ),
);
const saving = ref(false);
watch(saving, (value) => emit("saving", value));
const now = useNow({ interval: 30_000 });
const minAt = computed(() => localInputValue(now.value));

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
    await writeAt(date.toISOString());
    toast({
      title: t(
        when.value === "now"
          ? `${K3S}.toast.started`
          : `${K3S}.toast.scheduled`,
      ),
    });
    emit("saved");
  } catch {
    toast({ variant: "destructive", title: t(`${K3S}.toast.failed`) });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
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
        <span class="text-muted-foreground">{{ t(`${K3S}.dialog.when`) }}</span>
        <Input
          v-model="at"
          type="datetime-local"
          :min="minAt"
          :disabled="saving"
          data-testid="k3s-at"
        />
      </label>
    </div>

    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        variant="outline"
        :disabled="saving"
        data-testid="k3s-form-cancel"
        @click="emit('cancel')"
      >
        {{ t("common.cancel") }}
      </Button>
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
    </div>
  </div>
</template>
