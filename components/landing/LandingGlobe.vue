<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";

type Country = { country: string; panels: number; name: string };
// Written by scripts/generate-globe-dots.mjs.
type GlobeDots = {
  codes: string[];
  dots: number[];
  centres: Record<string, [number, number]>;
};

const props = defineProps<{ countries: Country[] }>();
const active = defineModel<string | null>("active", { default: null });

const RAD = Math.PI / 180;
// Degrees a second.
const SPIN = 5;
// Dots are drawn in this many depth bands, one fill each, instead of one fill
// per dot.
const BANDS = 8;

const box = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const tip = ref<{ country: Country; x: number; y: number } | null>(null);

const byCode = computed(() =>
  Object.fromEntries(props.countries.map((row) => [row.country, row])),
);

let globe: GlobeDots | null = null;
let lon = new Float32Array(0);
let cosLat = new Float32Array(0);
let sinLat = new Float32Array(0);
let codeOf = new Int16Array(0);
let lit = new Uint8Array(0);
const onScreen: { x: number; y: number; code: string }[] = [];

let size = 0;
let dpr = 1;
let centreLon = 12;
let centreLat = 24;
let drag: { x: number; y: number; moved: boolean } | null = null;
let tween: {
  start: number;
  from: [number, number];
  by: [number, number];
} | null = null;
let idleUntil = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let last = 0;
let inView = false;
let reduced = false;
let litColor = "#f7a03c";
let dotColor = "#a1a1aa";
let resizeObserver: ResizeObserver | undefined;
let viewObserver: IntersectionObserver | undefined;

function markLit() {
  if (!globe) return;
  const on = new Set(props.countries.map((row) => row.country));
  lit = new Uint8Array(codeOf.length);
  codeOf.forEach((code, i) => {
    lit[i] = code >= 0 && on.has(globe!.codes[code]) ? 1 : 0;
  });
}

function draw() {
  const ctx = canvas.value?.getContext("2d");
  if (!ctx || !globe || !size) return;

  const R = size / 2 - 8;
  const c = size / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  // The rim, as a ring of fine dots.
  const ring = Math.round((2 * Math.PI * (R + 5)) / 4.2);
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * 2 * Math.PI;
    const x = c + Math.cos(a) * (R + 5);
    const y = c + Math.sin(a) * (R + 5);
    ctx.moveTo(x + 0.9, y);
    ctx.arc(x, y, 0.9, 0, 2 * Math.PI);
  }
  ctx.fill();

  // Orthographic, centred on (centreLon, centreLat). Layers: 0 land, 1 a lit
  // country set back while another is picked, 2 lit.
  const l0 = centreLon * RAD;
  const sp0 = Math.sin(centreLat * RAD);
  const cp0 = Math.cos(centreLat * RAD);
  const r = Math.max(1.1, R / 175);
  const focus = active.value;
  const paths = Array.from({ length: BANDS * 3 }, () => new Path2D());
  onScreen.length = 0;

  for (let i = 0; i < codeOf.length; i++) {
    const dl = lon[i] - l0;
    const cosDl = Math.cos(dl);
    const depth = sp0 * sinLat[i] + cp0 * cosLat[i] * cosDl;
    if (depth <= 0.02) continue;

    const x = c + R * cosLat[i] * Math.sin(dl);
    const y = c - R * (cp0 * sinLat[i] - sp0 * cosLat[i] * cosDl);
    let layer = 0;
    let s = r * (0.6 + 0.4 * depth);
    if (lit[i]) {
      const code = globe.codes[codeOf[i]];
      onScreen.push({ x, y, code });
      layer = !focus || focus === code ? 2 : 1;
      s = r * (0.75 + 0.35 * depth) * (focus === code ? 1.45 : 1.1);
    }
    const path =
      paths[layer * BANDS + Math.min(BANDS - 1, Math.floor(depth * BANDS))];
    path.moveTo(x + s, y);
    path.arc(x, y, s, 0, 2 * Math.PI);
  }

  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = layer ? litColor : dotColor;
    for (let band = 0; band < BANDS; band++) {
      const depth = (band + 0.5) / BANDS;
      ctx.globalAlpha =
        layer === 0
          ? 0.12 + 0.42 * depth
          : layer === 1
            ? 0.22 + 0.18 * depth
            : 0.5 + 0.5 * depth;
      ctx.fill(paths[layer * BANDS + band]);
    }
  }
  ctx.globalAlpha = 1;
}

function spinning(now: number) {
  return !reduced && !drag && !active.value && now >= idleUntil;
}

function tick(now: number) {
  frame = 0;
  const dt = Math.min(64, Math.max(0, now - last)) / 1000;
  last = now;

  if (tween) {
    const t = Math.min(1, Math.max(0, (now - tween.start) / 700));
    const eased = 1 - Math.pow(1 - t, 3);
    centreLon = tween.from[0] + tween.by[0] * eased;
    centreLat = tween.from[1] + tween.by[1] * eased;
    if (t === 1) tween = null;
  } else if (spinning(now)) {
    centreLon -= SPIN * dt;
  }

  draw();
  if (inView && (tween || spinning(now))) {
    frame = requestAnimationFrame(tick);
  }
}

// Draws on demand: the loop only keeps going while the globe is turning.
function wake() {
  if (frame || !inView) return;
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

function pause(ms: number) {
  idleUntil = performance.now() + ms;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(wake, ms);
}

function spinTo(code: string) {
  const centre = globe?.centres[code];
  if (!centre) return;
  const by: [number, number] = [
    ((((centre[0] - centreLon) % 360) + 540) % 360) - 180,
    Math.max(-35, Math.min(55, centre[1])) - centreLat,
  ];
  pause(4000);
  if (reduced) {
    centreLon += by[0];
    centreLat += by[1];
  } else {
    tween = {
      start: performance.now(),
      from: [centreLon, centreLat],
      by,
    };
  }
  wake();
}

function pick(event: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;
  let best: (typeof onScreen)[number] | null = null;
  let bestDistance = 100;
  for (const dot of onScreen) {
    const distance = (dot.x - mx) ** 2 + (dot.y - my) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = dot;
    }
  }

  const country = best && byCode.value[best.code];
  if (best && country) {
    tip.value = { country, x: best.x, y: best.y };
    active.value = best.code;
  } else if (tip.value) {
    clearPick();
  }
}

function clearPick() {
  tip.value = null;
  active.value = null;
}

function onPointerDown(event: PointerEvent) {
  drag = { x: event.clientX, y: event.clientY, moved: false };
  tween = null;
  canvas.value?.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!drag) {
    if (event.pointerType === "mouse") pick(event);
    return;
  }
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (!drag.moved && tip.value) clearPick();

  const R = size / 2 - 8;
  centreLon -= dx / R / RAD;
  centreLat = Math.max(-60, Math.min(70, centreLat + dy / R / RAD));
  drag = { x: event.clientX, y: event.clientY, moved: true };
  wake();
}

function onPointerUp(event: PointerEvent) {
  if (!drag) return;
  // A tap on a phone stands in for hovering.
  if (!drag.moved) pick(event);
  drag = null;
  pause(1500);
}

function onPointerCancel() {
  drag = null;
  pause(1500);
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === "mouse" && tip.value) clearPick();
}

function resize() {
  if (!box.value || !canvas.value) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  size = box.value.clientWidth;
  canvas.value.width = size * dpr;
  canvas.value.height = size * dpr;
  draw();
}

// The accent follows branding, so it's read from the page instead of fixed.
function themeColor(name: string, fallback: string) {
  const value = getComputedStyle(box.value!).getPropertyValue(name).trim();
  return value ? `hsl(${value})` : fallback;
}

watch(
  () => props.countries,
  () => {
    markLit();
    wake();
  },
);
watch(active, wake);

onMounted(async () => {
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  litColor = themeColor("--tac-amber", litColor);
  dotColor = themeColor("--muted-foreground", dotColor);

  let data: GlobeDots;
  try {
    data = await $fetch<GlobeDots>("/landing/globe-dots.json");
  } catch {
    return;
  }
  const count = data.dots.length / 3;
  lon = new Float32Array(count);
  cosLat = new Float32Array(count);
  sinLat = new Float32Array(count);
  codeOf = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const lat = data.dots[i * 3 + 1] * RAD;
    lon[i] = data.dots[i * 3] * RAD;
    cosLat[i] = Math.cos(lat);
    sinLat[i] = Math.sin(lat);
    codeOf[i] = data.dots[i * 3 + 2];
  }
  globe = data;
  markLit();

  if (!box.value) return;
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(box.value);
  viewObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) {
      wake();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  viewObserver.observe(box.value);
  resize();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  clearTimeout(idleTimer);
  resizeObserver?.disconnect();
  viewObserver?.disconnect();
});

defineExpose({ spinTo });
</script>

<template>
  <div
    ref="box"
    class="relative mx-auto aspect-square w-full max-w-[440px] touch-pan-y select-none"
  >
    <canvas
      ref="canvas"
      aria-hidden="true"
      class="block size-full cursor-grab active:cursor-grabbing"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerleave="onPointerLeave"
    ></canvas>
    <div
      v-if="tip"
      class="pointer-events-none absolute z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/[0.09] bg-[#0c0c0f] px-2.5 py-1.5 text-xs leading-[1.4] text-foreground shadow-[0_12px_28px_-10px_rgba(0,0,0,0.9)]"
      :style="{
        left: `${tip.x}px`,
        top: `${tip.y}px`,
        transform: 'translate(-50%, calc(-100% - 12px))',
      }"
    >
      <TimezoneFlag :country="tip.country.country" />
      {{ tip.country.name }}
      <span class="text-muted-foreground">·</span>
      {{ $t("pages.welcome.world.panels", tip.country.panels) }}
    </div>
  </div>
</template>
