import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { print } from "graphql";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";

vi.mock("~/web-sockets/Socket", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/web-sockets/Socket")>()),
  default: {
    listen: () => ({ stop() {} }),
    joinLobby: () => ({ messages: [], on() {}, leave() {} }),
    markLobbyRead() {},
  },
}));

let subscriptions: Array<{ client: string; options: any; observer: any }> = [];

function serve(name: "default" | "public") {
  const client = (useApollo().clients as Record<string, any>)[name];
  vi.spyOn(client, "subscribe").mockImplementation(
    (options: any) =>
      ({
        subscribe(observer: any) {
          subscriptions.push({ client: name, options, observer });
          return { unsubscribe() {}, closed: false };
        },
      }) as any,
  );
}

beforeEach(() => {
  serve("default");
  serve("public");
});

afterEach(() => {
  subscriptions = [];
  vi.restoreAllMocks();
});

// Live and open-registration counts are the same for every viewer: a guest
// sees every tournament not in Setup, and a signed-in viewer only adds Setup
// ones they organize. On a viewer's own session Hasura polled a copy per
// viewer, each reading every tournament; as a guest everyone shares one.
describe("tournament counts", () => {
  it.each([
    ["subscribeToLiveTournaments", "Live", "liveTournamentsCount"],
    [
      "subscribeToOpenRegistrationTournaments",
      "RegistrationOpen",
      "openRegistrationTournamentsCount",
    ],
  ] as const)(
    "%s reads one count shared by every viewer",
    async (subscribe, status, count) => {
      const store = useMatchLobbyStore();
      await store[subscribe]();

      expect(subscriptions.map(({ client }) => client)).toEqual(["public"]);
      const [{ options, observer }] = subscriptions;
      expect(print(options.query)).toContain("tournaments_aggregate");
      expect(print(options.query)).toContain(status);

      observer.next({
        data: { tournaments_aggregate: { aggregate: { count: 3 } } },
      });
      await nextTick();

      expect(store[count]).toBe(3);
    },
  );
});
