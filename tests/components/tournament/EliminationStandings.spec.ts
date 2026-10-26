import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import EliminationStandings from "~/components/tournament/EliminationStandings.vue";

function bracket(
  id: string,
  round: number,
  group: string,
  a: string,
  b: string,
  parent?: string,
) {
  return {
    id,
    round,
    group,
    path: "WB",
    match_number: 1,
    bye: false,
    finished: true,
    team_1: { id: `tt-${a}`, name: a, team_id: null },
    team_2: { id: `tt-${b}`, name: b, team_id: null },
    parent_bracket: parent ? { id: parent } : null,
    loser_bracket: null,
    feeding_brackets: [],
    match: {
      status: "Finished",
      lineup_1_id: `${id}-1`,
      lineup_2_id: `${id}-2`,
      winning_lineup_id: `${id}-1`,
      options: { best_of: 1 },
      match_maps: [{ lineup_1_score: 13, lineup_2_score: 7 }],
    },
  };
}

describe("EliminationStandings", () => {
  it("places teams when the api serves the numeric group as a string", async () => {
    const wrapper = await mountSuspended(EliminationStandings, {
      props: {
        title: "Standings",
        isFinalStage: true,
        stage: {
          type: "SingleElimination",
          order: 1,
          groups: 1,
          brackets: [
            bracket("sf1", 1, "1", "Alpha", "Bravo", "f"),
            bracket("sf2", 1, "1", "Charlie", "Delta", "f"),
            bracket("f", 2, "1", "Alpha", "Charlie"),
          ],
        },
      },
    });

    const text = wrapper.text();
    for (const name of ["Alpha", "Bravo", "Charlie", "Delta"]) {
      expect(text).toContain(name);
    }
  });
});
