<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import K3sScheduleForm from "~/components/game-server-nodes/K3sScheduleForm.vue";

const props = defineProps<{
  open: boolean;
  from: string | null;
  target: string | null;
  stable: string | null;
  steps: number;
  behind: number;
  changes: number;
  initial?: string | null;
}>();

const emit = defineEmits<{ "update:open": [open: boolean] }>();

const { t } = useI18n();
const K3S = "pages.game_server_nodes.k3s";

const catchUp = computed(() => !!props.target && props.from === props.target);
const saving = ref(false);
</script>

<template>
  <AlertDialog
    :open="open"
    @update:open="(value) => !saving && emit('update:open', value)"
  >
    <AlertDialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto">
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

      <K3sScheduleForm
        :initial="initial"
        @saving="(value) => (saving = value)"
        @saved="emit('update:open', false)"
        @cancel="emit('update:open', false)"
      />
    </AlertDialogContent>
  </AlertDialog>
</template>
