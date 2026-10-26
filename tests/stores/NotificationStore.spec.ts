import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { useAuthStore } from "~/stores/AuthStore";
import { useNotificationStore } from "~/stores/NotificationStore";

const ME = "76561198000000001";

let observers: Array<{ root: string; variables: any; observer: any }> = [];

function serve({ preferences = Promise.resolve({ preferences: [] }) } = {}) {
  vi.stubGlobal(
    "$fetch",
    vi.fn(() => preferences),
  );
  const client = useApollo().clients!.default;
  // schemaHasType: every table the store asks after is served.
  vi.spyOn(client, "query").mockResolvedValue({
    data: { __type: { name: "player_dismissals" } },
  } as any);
  vi.spyOn(client, "subscribe").mockImplementation(
    (options: any) =>
      ({
        subscribe(observer: any) {
          observers.push({
            root: options.query.definitions[0].selectionSet.selections[0].name
              .value,
            variables: options.variables,
            observer,
          });
          return { unsubscribe() {}, closed: false };
        },
      }) as any,
  );
}

function feed(root: string, data: any, prefix?: string) {
  const entry = observers.find(
    (o) => o.root === root && (!prefix || o.variables?.prefix === prefix),
  );
  expect(entry, `${root} subscription`).toBeDefined();
  entry!.observer.next({ data });
}

function row(id: string, type: string, created_at: string) {
  return {
    id,
    title: type,
    message: "",
    steam_id: ME,
    type,
    role: "user",
    entity_id: ME,
    is_read: false,
    deletable: true,
    created_at,
    actions: null,
  };
}

afterEach(async () => {
  useAuthStore().me = undefined;
  useApplicationSettingsStore().settings = [];
  await flushPromises();
  observers = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("NotificationStore counts only what has loaded", () => {
  it("leaves out a roster need until the player's dismissals say it stands", async () => {
    serve();
    const store = useNotificationStore();
    useAuthStore().me = { steam_id: ME } as any;
    await flushPromises();

    feed("my_teams", {
      my_teams: [
        {
          id: "team-1",
          name: "5Stack Devs",
          can_invite: true,
          roster: [{ status: "Starter" }, { status: "Starter" }],
        },
      ],
    });
    await flushPromises();
    expect(store.rosterNeeds).toEqual([]);
    expect(store.unreadNotificationCount).toBe(0);

    feed(
      "player_dismissals",
      {
        player_dismissals: [
          { key: "team_roster_need:team-1", value: { starters: 2 } },
        ],
      },
      "team_roster_need:%",
    );
    await flushPromises();
    expect(store.rosterNeeds).toEqual([]);
    expect(store.unreadNotificationCount).toBe(0);

    feed("player_dismissals", { player_dismissals: [] }, "team_roster_need:%");
    await flushPromises();
    expect(store.rosterNeeds).toHaveLength(1);
    expect(store.unreadNotificationCount).toBe(1);
  });

  it("holds the latest article until the player's read mark has landed", async () => {
    serve();
    useApplicationSettingsStore().settings = [
      { name: "public.news_enabled", value: "true" },
    ];
    const store = useNotificationStore();
    useAuthStore().me = { steam_id: ME } as any;
    await flushPromises();

    feed("news_articles", {
      news_articles: [
        {
          id: "news-1",
          slug: "news-1",
          title: "Patch",
          teaser: null,
          cover_image_url: null,
          published_at: "2026-10-20T12:00:00Z",
        },
      ],
    });
    await flushPromises();
    expect(store.unreadNewsArticle).toBeNull();
    expect(store.unreadNotificationCount).toBe(0);

    feed("players_by_pk", {
      players_by_pk: { last_read_news_at: "2026-10-21T12:00:00Z" },
    });
    await flushPromises();
    expect(store.unreadNewsArticle).toBeNull();

    feed("players_by_pk", { players_by_pk: { last_read_news_at: null } });
    await flushPromises();
    expect(store.unreadNewsArticle).toEqual(
      expect.objectContaining({ id: "news-1" }),
    );
    expect(store.unreadNotificationCount).toBe(1);
  });

  it("holds notifications until the muted types are known", async () => {
    let answer!: (value: any) => void;
    serve({ preferences: new Promise((resolve) => (answer = resolve)) });
    const store = useNotificationStore();
    useAuthStore().me = { steam_id: ME } as any;
    await flushPromises();

    feed("notifications", {
      notifications: [
        row("muted", "MatchStarted", "2026-10-20T12:00:00Z"),
        row("shown", "NameChangeApproved", "2026-10-19T12:00:00Z"),
      ],
    });
    await flushPromises();
    expect(store.notifications).toEqual([]);
    expect(store.unreadNotificationCount).toBe(0);
    expect(store.notificationsLoaded).toBe(false);

    answer({
      preferences: [
        { key: "MatchStarted", enabled: false, defaultEnabled: true },
      ],
    });
    await flushPromises();
    expect(store.notifications.map((n) => n.id)).toEqual(["shown"]);
    expect(store.unreadNotificationCount).toBe(1);
    expect(store.notificationsLoaded).toBe(true);
  });
});

describe("NotificationStore stacking", () => {
  it("keeps a warning out of the player's name-change stack", async () => {
    serve();
    const store = useNotificationStore();
    useAuthStore().me = { steam_id: ME } as any;
    await flushPromises();

    const feed = observers.find((entry) => entry.root === "notifications");
    expect(feed, "notifications subscription").toBeDefined();
    feed!.observer.next({
      data: {
        notifications: [
          row("name-2", "NameChangeApproved", "2026-09-28T12:00:00Z"),
          row("warning", "PlayerWarning", "2026-09-27T12:00:00Z"),
          row("name-1", "NameChangeDenied", "2026-09-26T12:00:00Z"),
        ],
      },
    });
    await flushPromises();

    expect(store.stackedNotifications).toContainEqual({
      kind: "single",
      notification: expect.objectContaining({ id: "warning" }),
    });
  });

  it("stacks banned-teammate notices about different players together", async () => {
    serve();
    const store = useNotificationStore();
    useAuthStore().me = { steam_id: ME } as any;
    await flushPromises();

    const banned = (id: string, entityId: string, created_at: string) => ({
      ...row(id, "TeammateBanned", created_at),
      entity_id: entityId,
    });

    const feed = observers.find((entry) => entry.root === "notifications");
    feed!.observer.next({
      data: {
        notifications: [
          banned("ban-2", "76561198000000003", "2026-09-28T12:00:00Z"),
          banned("ban-1", "76561198000000002", "2026-09-27T12:00:00Z"),
        ],
      },
    });
    await flushPromises();

    expect(store.stackedNotifications).toEqual([
      expect.objectContaining({
        kind: "stack",
        notifications: [
          expect.objectContaining({ id: "ban-2" }),
          expect.objectContaining({ id: "ban-1" }),
        ],
      }),
    ]);
  });
});

describe("NotificationStore tournament team invites", () => {
  it("asks for what an invite needs to link its tournament and name a team-backed entry", async () => {
    const documents: Record<string, any> = {};
    const client = useApollo().clients!.default;
    vi.spyOn(client, "subscribe").mockImplementation((options: any) => {
      const root = options.query.definitions[0].selectionSet.selections[0];
      documents[root.name.value] = root;
      return {
        subscribe() {
          return { unsubscribe() {}, closed: false };
        },
      } as any;
    });
    useNotificationStore();
    useAuthStore().me = { steam_id: ME } as any;
    await flushPromises();

    const fields = (node: any) =>
      Object.fromEntries(
        node.selectionSet.selections.map((field: any) => [
          field.name.value,
          field,
        ]),
      );
    const invite = documents.tournament_team_invites;
    expect(invite, "tournament_team_invites subscription").toBeDefined();
    expect(Object.keys(fields(invite))).toContain("joins_team");
    const team = fields(fields(invite).team);

    expect(Object.keys(team)).toEqual(
      expect.arrayContaining(["team_id", "team", "tournament"]),
    );
    expect(Object.keys(fields(team.team))).toContain("name");
    expect(Object.keys(fields(team.tournament))).toEqual(
      expect.arrayContaining(["id", "name"]),
    );
  });
});
