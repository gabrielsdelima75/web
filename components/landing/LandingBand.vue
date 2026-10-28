<script setup lang="ts">
import type { LandingBand } from "~/utilities/landing/bands";

defineProps<{ band?: LandingBand | null }>();
</script>

<template>
  <div
    v-if="band"
    aria-hidden="true"
    class="pointer-events-none absolute -z-10"
    :class="`band-${band}`"
  ></div>
</template>

<style scoped>
/* A see-through lift, so the contour lines keep running behind it. A lift this
   faint only spans a few shades of grey, which shows as stripes, so the grain
   dithers it. */
.band-soft,
.band-start,
.band-fill,
.band-end,
.band-panel {
  background: url("/landing/grain.png"), rgb(255 255 255 / 0.03);
}

/* Soft, start and end reach 160px past the section and ease in or out over
   360px. A chapter is a start, any fills, then an end, with no seam. */
.band-soft {
  inset: -160px 0;
  mask-image: linear-gradient(
    180deg,
    rgb(0 0 0 / 0) 0px,
    rgb(0 0 0 / 0.012) 40px,
    rgb(0 0 0 / 0.076) 80px,
    rgb(0 0 0 / 0.21) 120px,
    rgb(0 0 0 / 0.397) 160px,
    rgb(0 0 0 / 0.603) 200px,
    rgb(0 0 0 / 0.79) 240px,
    rgb(0 0 0 / 0.924) 280px,
    rgb(0 0 0 / 0.988) 320px,
    rgb(0 0 0 / 1) 360px,
    rgb(0 0 0 / 1) calc(100% - 360px),
    rgb(0 0 0 / 0.988) calc(100% - 320px),
    rgb(0 0 0 / 0.924) calc(100% - 280px),
    rgb(0 0 0 / 0.79) calc(100% - 240px),
    rgb(0 0 0 / 0.603) calc(100% - 200px),
    rgb(0 0 0 / 0.397) calc(100% - 160px),
    rgb(0 0 0 / 0.21) calc(100% - 120px),
    rgb(0 0 0 / 0.076) calc(100% - 80px),
    rgb(0 0 0 / 0.012) calc(100% - 40px),
    rgb(0 0 0 / 0) 100%
  );
}

.band-start {
  inset: -160px 0 0;
  mask-image: linear-gradient(
    180deg,
    rgb(0 0 0 / 0) 0px,
    rgb(0 0 0 / 0.012) 40px,
    rgb(0 0 0 / 0.076) 80px,
    rgb(0 0 0 / 0.21) 120px,
    rgb(0 0 0 / 0.397) 160px,
    rgb(0 0 0 / 0.603) 200px,
    rgb(0 0 0 / 0.79) 240px,
    rgb(0 0 0 / 0.924) 280px,
    rgb(0 0 0 / 0.988) 320px,
    rgb(0 0 0 / 1) 360px
  );
}

.band-fill {
  inset: 0;
}

.band-end {
  inset: 0 0 -160px;
  mask-image: linear-gradient(
    180deg,
    rgb(0 0 0 / 1) calc(100% - 360px),
    rgb(0 0 0 / 0.988) calc(100% - 320px),
    rgb(0 0 0 / 0.924) calc(100% - 280px),
    rgb(0 0 0 / 0.79) calc(100% - 240px),
    rgb(0 0 0 / 0.603) calc(100% - 200px),
    rgb(0 0 0 / 0.397) calc(100% - 160px),
    rgb(0 0 0 / 0.21) calc(100% - 120px),
    rgb(0 0 0 / 0.076) calc(100% - 80px),
    rgb(0 0 0 / 0.012) calc(100% - 40px),
    rgb(0 0 0 / 0) 100%
  );
}

/* A rounded surface inside the page width. */
.band-panel {
  inset: 0 max(16px, calc((100% - 1352px) / 2));
  border-radius: 24px;
}

@media (max-width: 639px) {
  .band-panel {
    inset: 0 8px;
    border-radius: 18px;
  }
}

/* Just dots. */
.band-dots {
  inset: 0;
  background-image: radial-gradient(
    circle,
    rgb(161 161 170 / 0.09) 1px,
    transparent 1.2px
  );
  background-size: 16px 16px;
}
</style>
