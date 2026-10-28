import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { provideApolloClient } from "@vue/apollo-composable";
import MatchPage from "~/pages/matches/[id]/index.vue";
import { useAuthStore } from "~/stores/AuthStore";
import { e_match_status_enum } from "~/generated/zeus";

const MATCH = "11111111-1111-4111-8111-111111111111";
const ME = "76561198000000001";
const MATE = "76561198000000002";

type Observer = { next: (result: any) => void };

let lives: Array<{ client: string; observer: Observer }> = [];
let checkIns: Observer[] = [];
let mounted: { unmount: () => void } | null = null;

const rootField = (query: any) =>
  query.definitions[0].selectionSet.selections[0].name.value;

function spySubscriptions(name: "default" | "public") {
  const client = (useApollo().clients as Record<string, any>)[name];
  vi.spyOn(client, "subscribe").mockImplementation((options: any) => ({
    subscribe(observer: Observer) {
      const field = rootField(options.query);
      if (field === "matches_by_pk") {
        lives.push({ client: name, observer });
      } else if (field === "match_check_in_versions_stream") {
        checkIns.push(observer);
      }
      return { unsubscribe() {}, closed: false };
    },
  }));
}

async function mountMatch() {
  useAuthStore().me = { steam_id: ME, role: "user" } as any;
  const client = (useNuxtApp() as any).$apollo.defaultClient;
  provideApolloClient(client);
  spySubscriptions("default");
  spySubscriptions("public");
  vi.spyOn(client, "watchQuery").mockImplementation(
    () =>
      ({
        getCurrentResult: () => ({ loading: true, data: undefined }),
        subscribe: () => ({ closed: false, unsubscribe() {} }),
        refetch: () => Promise.resolve({}),
        setVariables: () => Promise.resolve(),
        setOptions: () => Promise.resolve(),
        stopPolling() {},
        getLastError() {},
        getLastResult() {},
        resetLastResults() {},
      }) as any,
  );

  const wrapper = await mountSuspended(MatchPage, {
    route: `/matches/${MATCH}`,
    shallow: true,
    global: { mixins: (useNuxtApp().vueApp as any)._context.mixins },
  });
  mounted = wrapper;
  await flushPromises();
  return wrapper;
}

const players = (checkedIn: boolean) => [
  { steam_id: ME, checked_in: checkedIn, player: { name: "me" } },
  { steam_id: MATE, checked_in: false, player: { name: "mate" } },
];

// The page's poll: both halves, still showing nobody checked in.
async function poll(status: string) {
  const shared = {
    id: MATCH,
    status,
    options: { best_of: 1 },
    match_maps: [],
    streams: [],
    lineup_1: { id: "l1", name: "One", lineup_players: players(false) },
    lineup_2: { id: "l2", name: "Two", lineup_players: [] },
  };
  const personal = {
    id: MATCH,
    invite_code: "abc",
    draft_games: [],
    can_start: false,
    can_check_in: true,
    tournament_brackets: [],
    connection_link: null,
    connection_string: null,
    tv_connection_string: null,
    lineup_1: { id: "l1", is_on_lineup: true },
    lineup_2: { id: "l2", is_on_lineup: false },
  };
  for (const live of lives) {
    live.observer.next({
      data: { matches_by_pk: live.client === "public" ? shared : personal },
    });
  }
  await flushPromises();
}

async function streamCheckIn() {
  for (const observer of checkIns) {
    observer.next({
      data: {
        match_check_in_versions_stream: [
          {
            changed_at: "2026-10-28T12:00:00.000001+00:00",
            match: {
              id: MATCH,
              status: e_match_status_enum.WaitingForCheckIn,
              cancels_at: null,
              can_check_in: false,
              lineup_1: {
                id: "l1",
                lineup_players: [
                  { steam_id: ME, checked_in: true },
                  { steam_id: MATE, checked_in: false },
                ],
              },
              lineup_2: { id: "l2", lineup_players: [] },
            },
          },
        ],
      },
    });
  }
  await flushPromises();
}

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  lives = [];
  checkIns = [];
  useAuthStore().me = undefined;
  vi.restoreAllMocks();
});

describe("the match page during check-in", () => {
  it("shows who has checked in from the check-in stream, ahead of its poll", async () => {
    const wrapper = await mountMatch();
    await poll(e_match_status_enum.WaitingForCheckIn);
    expect(checkIns.length).toBeGreaterThan(0);

    await streamCheckIn();

    const match = (wrapper.vm as any).match;
    expect(match.can_check_in).toBe(false);
    expect(match.lineup_1.lineup_players).toMatchObject([
      { steam_id: ME, checked_in: true, player: { name: "me" } },
      { steam_id: MATE, checked_in: false },
    ]);
  });

  it("goes back to the poll once the match has left check-in", async () => {
    const wrapper = await mountMatch();
    await poll(e_match_status_enum.WaitingForCheckIn);
    await streamCheckIn();

    await poll(e_match_status_enum.Veto);

    const match = (wrapper.vm as any).match;
    expect(match.status).toBe(e_match_status_enum.Veto);
    expect(match.can_check_in).toBe(true);
    expect((wrapper.vm as any).checkInStreamed).toBeUndefined();
  });

  it("doesn't stream check-in for a match that isn't waiting on it", async () => {
    await mountMatch();
    await poll(e_match_status_enum.Live);

    expect(checkIns).toHaveLength(0);
  });
});
