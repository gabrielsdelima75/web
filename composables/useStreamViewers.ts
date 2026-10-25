import { ref, computed, onScopeDispose } from "vue";

const POLL_INTERVAL_MS = 30_000;

const viewers = ref<Record<string, number>>({});
// Matches this tab is playing. The api reads MediaMTX every 30s and this
// reads the api every 30s, so a new viewer can wait a minute to be counted;
// until then they still count themselves.
const own = ref<Record<string, number>>({});
let consumers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;

async function fetchOnce() {
  if (inFlight) return inFlight;
  const config = useRuntimeConfig();
  inFlight = (async () => {
    try {
      const response = await fetch(
        `https://${config.public.apiDomain}/matches/stream-viewers`,
        { credentials: "include" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as Record<string, number>;
      viewers.value = data ?? {};
    } catch {
      // transient — keep previous map
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function startPolling() {
  if (pollTimer) return;
  void fetchOnce();
  pollTimer = setInterval(() => {
    void fetchOnce();
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function useStreamViewers() {
  consumers += 1;
  if (consumers === 1) {
    startPolling();
  }

  onScopeDispose(() => {
    consumers -= 1;
    if (consumers <= 0) {
      consumers = 0;
      stopPolling();
    }
  });

  function getCount(matchId: string) {
    return computed<number | null>(() => {
      const v = viewers.value[matchId];
      const self = own.value[matchId] ? 1 : 0;
      return typeof v === "number" ? Math.max(v, self) : self || null;
    });
  }

  return { viewers, getCount, refresh: fetchOnce };
}

// Counts this tab as watching the match until the returned function is called.
export function countOwnViewing(matchId: string) {
  own.value = { ...own.value, [matchId]: (own.value[matchId] ?? 0) + 1 };

  return () => {
    const { [matchId]: count = 1, ...rest } = own.value;
    own.value = count > 1 ? { ...rest, [matchId]: count - 1 } : rest;
  };
}
