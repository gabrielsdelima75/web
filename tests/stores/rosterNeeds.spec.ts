import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { flushPromises } from "@vue/test-utils";
import { print } from "graphql";
import { useAuthStore } from "~/stores/AuthStore";
import { useNotificationStore } from "~/stores/NotificationStore";

const ME = "76561198000000001";

let subscriptions: Array<{ options: any; observer: any }> = [];

const root = (options: any) =>
  options.query.definitions[0].selectionSet.selections[0].name.value;
const teams = () => subscriptions.find((s) => root(s.options) === "my_teams");

beforeEach(() => {
  const client = useApollo().clients!.default;
  vi.spyOn(client, "subscribe").mockImplementation(
    (options: any) =>
      ({
        subscribe(observer: any) {
          subscriptions.push({ options, observer });
          return { unsubscribe() {}, closed: false };
        },
      }) as any,
  );
  vi.spyOn(client, "query").mockResolvedValue({ data: {} } as any);
  vi.spyOn(client, "mutate").mockResolvedValue({ data: {} } as any);
});

afterEach(() => {
  useAuthStore().me = undefined;
  subscriptions = [];
  vi.restoreAllMocks();
});

// The bell's "your roster is short" reminders come from a subscription every
// signed-in page keeps open, so it reads the player's own teams rather than
// checking every team on the site for them.
describe("roster reminders", () => {
  it("read the player's own teams", async () => {
    useNotificationStore();
    useAuthStore().me = { steam_id: ME, role: "user" } as any;
    await flushPromises();

    const query = print(teams()!.options.query);
    expect(query).not.toContain("where");
    expect(query).not.toContain("$steamId");
  });

  it("come from the teams the player can invite to that are short of five starters", async () => {
    const store = useNotificationStore();
    useAuthStore().me = { steam_id: ME, role: "user" } as any;
    await flushPromises();

    const starters = (n: number) =>
      Array.from({ length: n }, () => ({ status: "Starter" }));
    teams()!.observer.next({
      data: {
        my_teams: [
          { id: "short", name: "Short", can_invite: true, roster: starters(3) },
          { id: "full", name: "Full", can_invite: true, roster: starters(5) },
          { id: "theirs", name: "Theirs", can_invite: false, roster: [] },
        ],
      },
    });
    await nextTick();

    expect(store.rosterNeeds).toEqual([
      { teamId: "short", name: "Short", starters: 3 },
    ]);
  });
});
