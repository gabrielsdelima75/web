import { describe, expect, it } from "vitest";
import { isMatchPaused } from "~/utilities/matchPaused";

describe("isMatchPaused", () => {
  it("is true for a live match with a paused map", () => {
    expect(
      isMatchPaused({
        status: "Live",
        match_maps: [{ status: "Finished" }, { status: "Paused" }],
      }),
    ).toBe(true);
  });

  it("is false while every map is live or over", () => {
    expect(
      isMatchPaused({
        status: "Live",
        match_maps: [{ status: "Finished" }, { status: "Live" }],
      }),
    ).toBe(false);
  });

  it("is false once the match is no longer live", () => {
    expect(
      isMatchPaused({ status: "Canceled", match_maps: [{ status: "Paused" }] }),
    ).toBe(false);
  });

  it("is false without maps", () => {
    expect(isMatchPaused({ status: "Live" })).toBe(false);
    expect(isMatchPaused(null)).toBe(false);
  });
});
