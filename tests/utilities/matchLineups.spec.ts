import { describe, expect, it } from "vitest";
import {
  playedBy,
  playedByAny,
  playedByAnyTeam,
} from "~/utilities/matchLineups";

describe("match lineup filters", () => {
  it("reach a match's players through its lineups, not lineup_1 or lineup_2", () => {
    expect(playedBy("76561198000000001")).toEqual({
      lineups: { lineup_players: { steam_id: { _eq: "76561198000000001" } } },
    });
    expect(playedByAny(["1", "2"])).toEqual({
      lineups: { lineup_players: { steam_id: { _in: ["1", "2"] } } },
    });
  });

  it("reach a match's teams through its lineups", () => {
    expect(playedByAnyTeam(["a", "b"])).toEqual({
      lineups: { team_id: { _in: ["a", "b"] } },
    });
  });
});
