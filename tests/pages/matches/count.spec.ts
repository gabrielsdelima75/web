import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import MatchesPage from "~/pages/matches/index.vue";

type Observer = { next: (value: unknown) => void };

const rootField = (query: any) =>
  query.definitions[0].selectionSet.selections[0].name.value;

let subscribed: string[] = [];
let poll: ((ids: string[]) => Promise<void>) | undefined;
let counts: Array<{ refetch: ReturnType<typeof vi.fn> }> = [];
let wrapper: Awaited<ReturnType<typeof mountSuspended>> | undefined;

beforeEach(() => {
  subscribed = [];
  counts = [];
  poll = undefined;
  localStorage.removeItem("matches-filters");
  const client = (useNuxtApp() as any).$apollo.defaultClient;

  vi.spyOn(client, "subscribe").mockImplementation((options: any) => ({
    subscribe(observer: Observer) {
      const field = rootField(options.query);
      subscribed.push(field);
      if (field === "matches") {
        poll = async (ids) => {
          observer.next({ data: { matches: ids.map((id) => ({ id })) } });
          await flushPromises();
        };
      }
      return { closed: false, unsubscribe() {} };
    },
  }));

  vi.spyOn(client, "watchQuery").mockImplementation((options: any) => {
    const refetch = vi.fn(() => new Promise(() => {}));
    if (rootField(options.query) === "matches_aggregate") {
      counts.push({ refetch });
    }
    return {
      options,
      getCurrentResult: () => ({ loading: true, data: undefined }),
      subscribe: () => ({ closed: false, unsubscribe() {} }),
      refetch,
      setVariables: () => Promise.resolve(),
      setOptions: () => Promise.resolve(),
      stopPolling() {},
      getLastError() {},
      getLastResult() {},
      resetLastResults() {},
    };
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

async function mount() {
  wrapper = await mountSuspended(MatchesPage, {
    global: {
      mixins: (useNuxtApp().vueApp as any)._context.mixins,
      stubs: { MatchRowsTable: true },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("matches list total", () => {
  it("is counted by a query instead of a subscription", async () => {
    await mount();

    expect(subscribed).toContain("matches");
    expect(subscribed).not.toContain("matches_aggregate");
    expect(counts).toHaveLength(1);
  });

  it("is counted again when a poll changes the list, and not otherwise", async () => {
    await mount();

    await poll!(["a", "b"]);
    await poll!(["a", "b"]);
    expect(counts[0].refetch).not.toHaveBeenCalled();

    await poll!(["c", "a"]);
    expect(counts[0].refetch).toHaveBeenCalledTimes(1);
  });

  it("is not counted again for another page of the same list", async () => {
    const page = await mount();
    await poll!(["a", "b"]);

    (page.vm as any).page = 2;
    await flushPromises();
    await poll!(["y", "z"]);

    expect(counts[0].refetch).not.toHaveBeenCalled();
  });
});
