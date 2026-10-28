import { computed } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { settings_constraint, settings_update_column } from "~/generated/zeus";
import { generateMutation } from "~/graphql/graphqlGen";
import {
  K3S_MAINTENANCE_AT,
  k3sCardState,
  readJsonSetting,
  type K3sMaintenance,
  type K3sVersions,
} from "~/components/game-server-nodes/k3sMaintenance";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";

export function useK3sMaintenance() {
  const store = useApplicationSettingsStore();

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

  return { versions, maintenance, scheduledAt, state };
}

export function useMaintenanceAt() {
  const { client } = useApolloClient();

  return (value: string) =>
    client.mutate({
      mutation: generateMutation({
        insert_settings_one: [
          {
            object: { name: K3S_MAINTENANCE_AT, value },
            on_conflict: {
              constraint: settings_constraint.settings_pkey,
              update_columns: [settings_update_column.value],
            },
          },
          { __typename: true },
        ],
      }),
    });
}
