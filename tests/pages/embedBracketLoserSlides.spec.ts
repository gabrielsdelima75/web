import { describe, expect, it } from "vitest";
import EmbedBracket from "~/pages/embed/tournaments/[tournamentId]/bracket.vue";

const { distinctGroups, divisionHasLoserBracket } = (EmbedBracket as any)
  .methods;

describe("embed bracket", () => {
  it("finds the lower bracket when the api serves the numeric group as a string", () => {
    const stage = {
      groups: 1,
      brackets: [{ group: "1" }, { group: "1" }, { group: "2" }],
    };

    expect(distinctGroups.call({}, stage)).toEqual([1, 2]);
    expect(divisionHasLoserBracket.call({ distinctGroups }, stage, 1)).toBe(
      true,
    );
  });
});
