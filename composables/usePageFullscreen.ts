import {
  inject,
  onBeforeUnmount,
  provide,
  ref,
  watch,
  type InjectionKey,
  type Ref,
} from "vue";

// iPhone Safari only fullscreens a <video>, in iOS's own player, which draws
// its own controls over ours. A player frame that provides this fills the
// window instead: it moves to <body> (see pageFullscreenClasses), covers the
// page, and turns sideways while the phone is held upright.
export type PageFullscreen = {
  active: Ref<boolean>;
  toggle: () => void;
  exit: () => void;
};

const key: InjectionKey<PageFullscreen> = Symbol("page-fullscreen");

export const pageFullscreenClasses =
  "!fixed left-0 top-0 z-[200] !m-0 !h-[100dvh] !w-screen !max-w-none !rounded-none !border-0 !aspect-auto touch-none portrait:!h-[100vw] portrait:!w-[100dvh] portrait:origin-top-left portrait:translate-x-[100vw] portrait:rotate-90";

export const isIphone =
  typeof navigator !== "undefined" && /iPhone|iPod/.test(navigator.userAgent);

// Where element fullscreen exists it is used instead, except on iPhone, where
// it would stay locked to the page's orientation.
export function wantsPageFullscreen() {
  return (
    isIphone || (typeof document !== "undefined" && !document.fullscreenEnabled)
  );
}

export function providePageFullscreen(): PageFullscreen {
  const active = ref(false);
  let overflow = "";

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") active.value = false;
  }

  function release() {
    document.documentElement.style.overflow = overflow;
    window.removeEventListener("keydown", onKeyDown);
  }

  watch(active, (on) => {
    if (!on) {
      release();
      return;
    }
    overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
  });

  onBeforeUnmount(() => {
    if (active.value) release();
  });

  const state: PageFullscreen = {
    active,
    toggle: () => {
      active.value = !active.value;
    },
    exit: () => {
      active.value = false;
    },
  };
  provide(key, state);
  return state;
}

export function injectPageFullscreen() {
  return inject(key, null);
}
