import { afterEach, describe, expect, it } from "vitest";
import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import NotificationsPanel from "~/components/hub/NotificationsPanel.vue";

const store = {
  team_invites: [],
  tournament_team_invites: [],
  tournament_invites: [],
  draft_invites: [],
  notifications: [] as any[],
  scheduleTasks: [],
  rosterNeeds: [],
  stackedNotifications: [],
  unreadNewsArticle: null,
};

mockNuxtImport("useNotificationStore", () => () => store);

let unmount: (() => void) | null = null;

afterEach(() => {
  unmount?.();
  unmount = null;
  store.notifications = [];
});

function notification(is_read: boolean, deletable = true) {
  return { id: `${is_read}-${deletable}`, is_read, deletable, role: "user" };
}

async function mountPanel() {
  const wrapper = await mountSuspended(NotificationsPanel, {
    global: { stubs: { NewsNotification: true } },
  });
  unmount = () => wrapper.unmount();
  const button = (label: string) =>
    wrapper.findAll("button").find((b) => b.text() === label)!;
  return {
    wrapper,
    dismissAll: () => button("Dismiss All"),
    deleteRead: () => button("Delete All Read"),
  };
}

describe("NotificationsPanel header", () => {
  it("has a settings gear that opens the Notifications page", async () => {
    const { wrapper } = await mountPanel();

    const gear = wrapper.find("a[href='/settings/notifications']");
    expect(gear.exists()).toBe(true);
    expect(gear.attributes("aria-label")).toBe("Notification Settings");
    expect(gear.find("svg.lucide-settings-icon").exists()).toBe(true);
  });
});

describe("NotificationsPanel footer", () => {
  it("only offers deleting read notifications when one can be deleted", async () => {
    store.notifications = [notification(false), notification(true, false)];
    const { dismissAll, deleteRead } = await mountPanel();

    expect(dismissAll().attributes("disabled")).toBeUndefined();
    expect(deleteRead().attributes("disabled")).toBeDefined();
  });

  it("only offers dismissing when an unread one can be dismissed", async () => {
    store.notifications = [notification(true), notification(false, false)];
    const { dismissAll, deleteRead } = await mountPanel();

    expect(dismissAll().attributes("disabled")).toBeDefined();
    expect(deleteRead().attributes("disabled")).toBeUndefined();
  });
});
