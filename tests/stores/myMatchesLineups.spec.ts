import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";
import { useAuthStore } from "~/stores/AuthStore";
import { e_player_roles_enum } from "~/generated/zeus";

vi.mock("~/web-sockets/Socket", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/web-sockets/Socket")>()),
  default: {
    connect() {},
    rejoinAll() {},
    listen: () => ({ stop() {} }),
    joinLobby: () => ({ messages: [], on() {}, leave() {} }),
    markLobbyRead() {},
  },
}));

const ME = "76561198000000001";
const MATCH = "44444444-4444-4444-8444-444444444444";

// What the answer is keyed by: my matches read my_active_matches as `matches`.
const rootField = (query: any) => {
  const selection = query.definitions[0].selectionSet.selections[0];
  return selection.alias?.value ?? selection.name.value;
};

let myMatches: ((result: any) => void) | undefined;
let lineups: Record<string, { next: (result: any) => void; closed: boolean }> =
  {};

beforeEach(async () => {
  // The store outlives a test: start from no matches.
  useMatchLobbyStore().myMatches = [];
  await flushPromises();
  myMatches = undefined;
  lineups = {};
  const client = useApollo().clients!.default;
  vi.spyOn(client, "query").mockResolvedValue({
    data: {
      __type: {
        fields: [{ name: "active_matches" }, { name: "my_active_matches" }],
      },
    },
  } as any);
  vi.spyOn(client, "subscribe").mockImplementation(
    (options: any) =>
      ({
        subscribe({ next }: { next: (result: any) => void }) {
          const field = rootField(options.query);
          const entry = { next, closed: false };
          if (field === "matches") {
            myMatches = next;
          } else if (field === "match_check_in_versions_stream") {
            lineups[options.variables.matchId] = entry;
          }
          return {
            unsubscribe() {
              entry.closed = true;
            },
            closed: false,
          };
        },
      }) as any,
  );
});

afterEach(() => {
  useAuthStore().me = undefined;
  vi.restoreAllMocks();
});

const row = (status: string, checkedIn = false) => ({
  id: MATCH,
  status,
  can_check_in: true,
  created_at: "2026-10-28T12:00:00Z",
  options: {},
  lineup_1: {
    id: "l1",
    lineup_players: [{ steam_id: ME, checked_in: checkedIn, player: {} }],
  },
  lineup_2: { id: "l2", lineup_players: [] },
});

async function poll(status: string) {
  myMatches!({ data: { matches: [row(status)] } });
  await flushPromises();
}

async function subscribe() {
  useAuthStore().me = { steam_id: ME, role: e_player_roles_enum.user } as any;
  await useMatchLobbyStore().subscribeToMyMatches();
  await flushPromises();
}

describe("my matches before they start", () => {
  it("show a check-in from the match's lineups stream, ahead of the poll", async () => {
    await subscribe();
    await poll("WaitingForCheckIn");
    expect(lineups[MATCH]).toBeDefined();

    lineups[MATCH].next({
      data: {
        match_check_in_versions_stream: [
          {
            changed_at: "2026-10-28T12:00:00.000001+00:00",
            match: {
              id: MATCH,
              status: "WaitingForCheckIn",
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

    const [match] = useMatchLobbyStore().myMatches;
    expect(match.can_check_in).toBe(false);
    expect(match.lineup_1.lineup_players[0].checked_in).toBe(true);
  });

  it("stop following a match's lineups once it starts", async () => {
    await subscribe();
    await poll("WaitingForCheckIn");

    await poll("Live");

    expect(lineups[MATCH].closed).toBe(true);
    expect(useMatchLobbyStore().myMatches[0].status).toBe("Live");
  });
});
