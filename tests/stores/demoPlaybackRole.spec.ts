import { afterEach, describe, expect, it, vi } from "vitest";
import { getActivePinia } from "pinia";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";
import { useAuthStore } from "~/stores/AuthStore";
import MatchMaps from "~/components/match/MatchMaps.vue";

type Setting = { name: string; value: string };

let feed: { next: (result: { data: { settings: Setting[] } }) => void };

function dropStore() {
  const store = useApplicationSettingsStore();
  store.$dispose();
  delete getActivePinia()!.state.value[store.$id];
}

function freshStore(settings: Setting[] = []) {
  const client = useApollo().clients!.default;
  vi.spyOn(client, "subscribe").mockImplementation(
    (options: any) =>
      ({
        subscribe(observer: any) {
          const [field] = options.query.definitions[0].selectionSet.selections;
          if (field.name.value === "settings") {
            feed = observer;
          }
          return { unsubscribe() {}, closed: false };
        },
      }) as any,
  );
  dropStore();
  const store = useApplicationSettingsStore();
  feed.next({ data: { settings } });
  return store;
}

const signIn = (role: string) => {
  useAuthStore().me = { steam_id: "76561198000000001", role } as any;
};

const canWatchDemo = (isOrganizer = false) =>
  (MatchMaps as any).computed.canWatchDemo.call({
    match: { is_organizer: isOrganizer },
  });

afterEach(() => {
  useAuthStore().me = undefined;
  dropStore();
  vi.restoreAllMocks();
});

describe("demo playback role", () => {
  it("shows the demo button to a verified user when no role is set", () => {
    freshStore();
    signIn("verified_user");

    expect(canWatchDemo()).toBe(true);
  });

  it("hides it from a user below the default role", () => {
    freshStore();
    signIn("user");

    expect(canWatchDemo()).toBe(false);
  });

  it("follows the role set in demo settings", () => {
    freshStore([{ name: "public.demo_playback_role", value: "streamer" }]);

    signIn("verified_user");
    expect(canWatchDemo()).toBe(false);

    signIn("streamer");
    expect(canWatchDemo()).toBe(true);
  });

  it("shows it to every signed-in player when opened to users", () => {
    freshStore([{ name: "public.demo_playback_role", value: "user" }]);
    signIn("user");

    expect(canWatchDemo()).toBe(true);
  });

  it("shows it to the match organizer whatever the role", () => {
    freshStore([{ name: "public.demo_playback_role", value: "administrator" }]);
    signIn("user");

    expect(canWatchDemo(true)).toBe(true);
  });

  it("hides it when signed out", () => {
    freshStore([{ name: "public.demo_playback_role", value: "user" }]);

    expect(canWatchDemo()).toBe(false);
  });
});
