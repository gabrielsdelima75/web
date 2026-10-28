<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";
import { useI18n } from "vue-i18n";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import LandingSection from "~/components/landing/LandingSection.vue";
import LandingDefer from "~/components/landing/LandingDefer.vue";
import { useNetworkStats } from "~/composables/useNetworkStats";

const LandingGlobe = defineAsyncComponent(
  () => import("~/components/landing/LandingGlobe.vue"),
);

const { t, locale } = useI18n();
const { data } = await useNetworkStats();

const regionNames = computed(() => {
  try {
    return new Intl.DisplayNames([locale.value], { type: "region" });
  } catch {
    return null;
  }
});

const countries = computed(() =>
  (data.value?.countries ?? []).map((row) => ({
    ...row,
    name: regionNames.value?.of(row.country) ?? row.country,
  })),
);
const panels = computed(() =>
  countries.value.reduce((sum, row) => sum + row.panels, 0),
);

const active = ref<string | null>(null);
const globe = ref<{ spinTo: (code: string) => void } | null>(null);
</script>

<template>
  <LandingSection
    v-if="countries.length"
    id="world"
    half
    band="soft"
    :title="t('pages.welcome.world.title', countries.length)"
    :lede="t('pages.welcome.world.lede', panels)"
    :points="[]"
  >
    <template #details>
      <ul class="mt-6 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
        <li v-for="row in countries" :key="row.country" class="min-w-0">
          <button
            type="button"
            class="flex w-full items-center gap-2 border-b border-border/70 py-1.5 text-left text-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            :class="
              active === row.country ? 'text-foreground' : 'text-foreground/70'
            "
            @mouseenter="active = row.country"
            @mouseleave="active = null"
            @focus="active = row.country"
            @blur="active = null"
            @click="globe?.spinTo(row.country)"
          >
            <TimezoneFlag :country="row.country" class="shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            <span class="shrink-0 font-semibold tabular-nums text-foreground">
              {{ row.panels }}
            </span>
          </button>
        </li>
      </ul>
    </template>
    <LandingDefer :placeholder="440">
      <LandingGlobe
        ref="globe"
        v-model:active="active"
        :countries="countries"
      />
    </LandingDefer>
  </LandingSection>
</template>
