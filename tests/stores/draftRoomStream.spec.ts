import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { useDraftGamesStore } from "~/stores/DraftGamesStore";

const ROOM = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const ME = "76561198000000001";

const rootField = (query: any) =>
  query.definitions[0].selectionSet.selections[0].name.value;

let streams: Record<string, Array<(result: any) => void>> = {};
let roomRead: (value: unknown) => void;

beforeEach(() => {
  streams = {};
  const client = (useApollo().clients as Record<string, any>).default;
  vi.spyOn(client, "subscribe").mockImplementation(
    (options: any) =>
      ({
        subscribe({ next }: { next: (result: any) => void }) {
          const field = rootField(options.query);
          (streams[field] ??= []).push(next);
          return { unsubscribe() {}, closed: false };
        },
      }) as any,
  );
  vi.spyOn(client, "query").mockImplementation(
    () => new Promise((resolve) => (roomRead = resolve)) as any,
  );
});

afterEach(() => {
  useDraftGamesStore().unsubscribeFromDraftGame();
  useDraftGamesStore().unsubscribeFromMatch();
  vi.restoreAllMocks();
});

const room = (status: string) => ({ id: ROOM, status, players: [], picks: [] });

async function streamRoom(draftGame: unknown) {
  streams.draft_game_versions_stream.at(-1)!({
    data: {
      draft_game_versions_stream: [
        {
          changed_at: "2026-10-28T12:00:00.000001+00:00",
          draft_game: draftGame,
        },
      ],
    },
  });
  await flushPromises();
}

describe("the draft room", () => {
  it("follows the room's version stream", async () => {
    const store = useDraftGamesStore();
    void store.subscribeToDraftGame(ROOM);
    await flushPromises();

    await streamRoom(room("Drafting"));
    expect(store.currentRoom).toMatchObject({ status: "Drafting" });

    // A room that goes away is streamed as gone.
    await streamRoom(null);
    expect(store.currentRoom).toBeNull();
  });

  it("answers from a read until the stream has spoken, and never over it", async () => {
    const store = useDraftGamesStore();
    const subscribing = store.subscribeToDraftGame(ROOM);
    await flushPromises();
    await streamRoom(room("Drafting"));

    roomRead({ data: { draft_games_by_pk: room("Open") } });
    await subscribing;

    expect(store.currentRoom).toMatchObject({ status: "Drafting" });
  });

  it("says a room that was never there is gone", async () => {
    const store = useDraftGamesStore();
    const subscribing = store.subscribeToDraftGame(ROOM);
    await flushPromises();

    roomRead({ data: { draft_games_by_pk: null } });
    await subscribing;

    expect(store.currentRoom).toBeNull();
  });
});

describe("the draft room's match during check-in", () => {
  const polled = (status: string) => ({
    id: MATCH,
    status,
    can_check_in: true,
    lineup_1: {
      id: "l1",
      lineup_players: [{ steam_id: ME, checked_in: false, player: {} }],
    },
    lineup_2: { id: "l2", lineup_players: [] },
  });

  async function poll(status: string) {
    streams.matches_by_pk.at(-1)!({
      data: { matches_by_pk: polled(status) },
    });
    await flushPromises();
  }

  it("shows who has checked in from the check-in stream, ahead of the poll", async () => {
    const store = useDraftGamesStore();
    await store.subscribeToMatch(MATCH);
    await poll("WaitingForCheckIn");

    streams.match_check_in_versions_stream.at(-1)!({
      data: {
        match_check_in_versions_stream: [
          {
            changed_at: "2026-10-28T12:00:00.000001+00:00",
            match: {
              id: MATCH,
              status: "WaitingForCheckIn",
              cancels_at: null,
              can_check_in: false,
              lineup_1: {
                id: "l1",
                lineup_players: [{ steam_id: ME, checked_in: true }],
              },
              lineup_2: { id: "l2", lineup_players: [] },
            },
          },
        ],
      },
    });
    await flushPromises();

    expect(store.currentMatch.can_check_in).toBe(false);
    expect(store.currentMatch.lineup_1.lineup_players[0].checked_in).toBe(true);

    await poll("Veto");
    expect(store.currentMatch.status).toBe("Veto");
    expect(store.currentMatch.can_check_in).toBe(true);
  });

  it("doesn't stream check-in for a match past it", async () => {
    const store = useDraftGamesStore();
    await store.subscribeToMatch(MATCH);
    await poll("Live");

    expect(streams.match_check_in_versions_stream).toBeUndefined();
  });
});
