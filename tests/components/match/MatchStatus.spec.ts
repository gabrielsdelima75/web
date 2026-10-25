import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import MatchStatus from "~/components/match/MatchStatus.vue";

function match(status: string, winner: string | null) {
  return {
    status,
    e_match_status: { description: status },
    winning_lineup_id: winner,
    match_maps: [],
  };
}

describe("MatchStatus", () => {
  it.each(["Forfeit", "Surrendered"])(
    "shows a %s with a winner as a neutral result",
    async (status) => {
      const wrapper = await mountSuspended(MatchStatus, {
        props: { match: match(status, "l1") },
      });

      expect(wrapper.text()).toBe(status);
      expect(wrapper.classes()).not.toContain("text-destructive");
      expect(wrapper.classes()).toContain("text-muted-foreground");
    },
  );

  it.each(["Forfeit", "Surrendered"])(
    "keeps a %s without a winner red",
    async (status) => {
      const wrapper = await mountSuspended(MatchStatus, {
        props: { match: match(status, null) },
      });

      expect(wrapper.text()).toBe(status);
      expect(wrapper.classes()).toContain("text-destructive");
    },
  );

  it("shows a live match on a paused map as paused, not live", async () => {
    const wrapper = await mountSuspended(MatchStatus, {
      props: {
        match: {
          ...match("Live", null),
          match_maps: [{ status: "Finished" }, { status: "Paused" }],
        },
      },
    });

    expect(wrapper.text()).toBe("Paused");
    expect(wrapper.classes()).toContain("paused-hatch");
    expect(wrapper.classes()).not.toContain("text-green-500");
  });
});
