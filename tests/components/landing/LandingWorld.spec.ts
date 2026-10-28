import { describe, expect, it } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import LandingWorld from "~/components/landing/LandingWorld.vue";

registerEndpoint("/api/network-stats", () => ({
  matches: 1200,
  players: 340,
  countries: [
    { country: "DE", panels: 13 },
    { country: "FR", panels: 11 },
    { country: "SG", panels: 1 },
  ],
}));

describe("LandingWorld", () => {
  it("counts the countries and panels and lists each country", async () => {
    const wrapper = await mountSuspended(LandingWorld);

    expect(wrapper.find("h2").text()).toBe("5Stack runs in 3 countries.");
    expect(wrapper.text()).toContain(
      "These are the 25 panels that checked in during the last 30 days.",
    );
    expect(
      wrapper.findAll("#world li button").map((row) => row.text()),
    ).toEqual(["🇩🇪Germany13", "🇫🇷France11", "🇸🇬Singapore1"]);
  });
});
