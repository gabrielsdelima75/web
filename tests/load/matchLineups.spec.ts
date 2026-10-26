// Matches filtered through matches.lineups must be the matches "lineup_1 or
// lineup_2" found, for players with none, a few and the most matches, and for
// teams. Off in normal runs; with the api's load stack up (api/load):
//   LOAD_HASURA=http://localhost:58081/v1/graphql npx vitest run tests/load/matchLineups
import { describe, expect, it } from "vitest";
import {
  playedBy,
  playedByAny,
  playedByAnyTeam,
} from "~/utilities/matchLineups";

const HASURA = process.env.LOAD_HASURA;

async function post(path: string, body: unknown, headers = {}) {
  const response = await fetch(HASURA!.replace(/\/v1\/graphql$/, path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasura-admin-secret": "load",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function sql(text: string): Promise<string[]> {
  const body = await post("/v2/query", {
    type: "run_sql",
    args: { sql: text, read_only: true },
  });
  return body.result.slice(1).map((row: string[]) => row[0]);
}

async function matches(where: Record<string, unknown>, viewer: string) {
  const body = await post(
    "/v1/graphql",
    {
      query: `query ($where: matches_bool_exp!) {
        matches(where: $where) { id }
        matches_aggregate(where: $where) { aggregate { count } }
      }`,
      variables: { where: { _and: [{ source: { _eq: "5stack" } }, where] } },
    },
    { "x-hasura-role": "user", "x-hasura-user-id": viewer },
  );
  if (body.errors) {
    throw new Error(JSON.stringify(body.errors));
  }
  return {
    ids: body.data.matches.map((match: { id: string }) => match.id).sort(),
    count: body.data.matches_aggregate.aggregate.count,
  };
}

const lineupOf = (player: Record<string, unknown>) => ({
  _or: [
    { lineup_1: { lineup_players: player } },
    { lineup_2: { lineup_players: player } },
  ],
});

describe.skipIf(!HASURA)("matches through their lineups", () => {
  it("are the same matches lineup_1 or lineup_2 found", async () => {
    const [viewer] = await sql(
      "SELECT steam_id::text FROM players WHERE role = 'user' ORDER BY steam_id LIMIT 1",
    );
    const players = await sql(`
      (SELECT steam_id::text FROM players p WHERE NOT EXISTS
         (SELECT 1 FROM match_lineup_players m WHERE m.steam_id = p.steam_id) LIMIT 1)
      UNION ALL
      (SELECT steam_id::text FROM match_lineup_players GROUP BY 1 HAVING count(*) = 2 LIMIT 2)
      UNION ALL
      (SELECT steam_id::text FROM match_lineup_players GROUP BY 1 ORDER BY count(*) DESC LIMIT 1)
    `);
    const teams = await sql(
      "SELECT team_id::text FROM match_lineups WHERE team_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 3",
    );
    expect(players).toHaveLength(4);
    expect(teams.length).toBeGreaterThan(0);

    for (const player of players) {
      const found = await matches(playedBy(player), viewer);
      expect({ player, ...found }).toEqual({
        player,
        ...(await matches(lineupOf({ steam_id: { _eq: player } }), viewer)),
      });
    }

    const some = players.slice(1);
    expect(await matches(playedByAny(some), viewer)).toEqual(
      await matches(lineupOf({ steam_id: { _in: some } }), viewer),
    );

    const team = await matches(playedByAnyTeam(teams), viewer);
    expect(team.count).toBeGreaterThan(0);
    expect(team).toEqual(
      await matches(
        {
          _or: [
            { lineup_1: { team_id: { _in: teams } } },
            { lineup_2: { team_id: { _in: teams } } },
          ],
        },
        viewer,
      ),
    );
  }, 120_000);
});
