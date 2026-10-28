// @vitest-environment node
import { describe, expect, it } from "vitest";
import { networkStatsFrom } from "~/server/utils/networkStats";

describe("networkStatsFrom", () => {
  it("answers null until the fleet has played a match", () => {
    expect(networkStatsFrom(undefined)).toBeNull();
    expect(networkStatsFrom({ totals: { matches: 0 } })).toBeNull();
  });

  it("keeps real country codes and counts their panels", () => {
    expect(
      networkStatsFrom({
        totals: { matches: 1200, playersRegistered: 340 },
        countries: [
          { country: "DE", installs: 13 },
          { country: "XX", installs: 4 },
          { country: "T1", installs: 1 },
          { country: "", installs: 2 },
          { country: "FR", installs: 11 },
        ],
      }),
    ).toEqual({
      matches: 1200,
      players: 340,
      countries: [
        { country: "DE", panels: 13 },
        { country: "FR", panels: 11 },
      ],
    });
  });
});
