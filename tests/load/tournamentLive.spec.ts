// The tournament page reads its live subscription in two halves for most
// viewers: the shared one as a guest, the personal one on their own session.
// Joined, they must read what the whole document reads as that viewer. Off in
// normal runs; with the api's load stack up (api/load):
//   LOAD_HASURA=http://localhost:58081/v1/graphql npx vitest run tests/load/tournamentLive
import { describe, expect, it } from "vitest";
import { print, type DocumentNode } from "graphql";
import { joinShared } from "~/utilities/sharedSubscription";
import {
  personalTournamentSubscription,
  sharedTournamentSubscription,
  tournamentSubscription,
} from "~/graphql/tournamentLive";

const HASURA = process.env.LOAD_HASURA;

const asQuery = (document: DocumentNode) =>
  print(document).replace(/^\s*subscription/, "query");

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

async function read(
  document: DocumentNode,
  variables: Record<string, unknown>,
  session: Record<string, string>,
) {
  const body = await post(
    "/v1/graphql",
    { query: asQuery(document), variables },
    session,
  );
  if (body.errors) {
    throw new Error(JSON.stringify(body.errors));
  }
  return body.data.tournaments_by_pk;
}

async function sql(text: string): Promise<string[]> {
  const body = await post("/v2/query", {
    type: "run_sql",
    args: { sql: text, read_only: true },
  });
  return body.result.slice(1).map((row: string[]) => row[0]);
}

// Everyone the personal half could differ for: the entries' players, owners
// and teams, the bracket matches' players, organizers and players' friends,
// and a few strangers.
const viewersOf = (tournamentId: string) =>
  sql(`
    WITH m AS (
      SELECT m.* FROM tournament_brackets b
      JOIN tournament_stages s ON s.id = b.tournament_stage_id
      JOIN matches m ON m.id = b.match_id
      WHERE s.tournament_id = '${tournamentId}'
    ),
    lp AS (
      SELECT steam_id FROM match_lineup_players
      WHERE match_lineup_id IN (SELECT lineup_1_id FROM m UNION SELECT lineup_2_id FROM m)
    ),
    tt AS (SELECT * FROM tournament_teams WHERE tournament_id = '${tournamentId}')
    SELECT DISTINCT s::text FROM (
      SELECT player_steam_id s FROM tournament_team_roster WHERE tournament_id = '${tournamentId}'
      UNION SELECT owner_steam_id FROM tt
      UNION SELECT owner_steam_id FROM teams WHERE id IN (SELECT team_id FROM tt)
      UNION SELECT captain_steam_id FROM teams WHERE id IN (SELECT team_id FROM tt)
      UNION SELECT player_steam_id FROM team_roster WHERE team_id IN (SELECT team_id FROM tt)
      UNION SELECT steam_id FROM lp
      UNION SELECT organizer_steam_id FROM m
      UNION SELECT organizer_steam_id FROM tournaments WHERE id = '${tournamentId}'
      UNION (SELECT player_steam_id FROM friends WHERE other_player_steam_id IN (SELECT steam_id FROM lp) LIMIT 40)
      UNION (SELECT steam_id FROM players ORDER BY md5(steam_id::text) LIMIT 10)
    ) v WHERE s IS NOT NULL`);

// An entry the personal half leaves out has no flags, which the page reads
// as false.
function comparable(tournament: any): any {
  const flagged = {
    ...tournament,
    teams: tournament.teams.map((team: any) => ({
      ...team,
      can_manage: !!team.can_manage,
      can_recruit: !!team.can_recruit,
    })),
  };
  const sorted = (value: any): any =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sorted(value[key])]),
          )
        : value;
  return sorted(flagged);
}

describe.runIf(HASURA)("the tournament page's live halves", () => {
  it("join to the whole document for every viewer around a tournament", async () => {
    const tournaments = await sql(`
      SELECT s.tournament_id::text FROM tournament_stages s
      JOIN tournament_brackets b ON b.tournament_stage_id = s.id
      GROUP BY 1 ORDER BY count(b.match_id) DESC LIMIT 3`);
    expect(tournaments.length).toBeGreaterThan(0);

    for (const tournamentId of tournaments) {
      const shared = await read(
        sharedTournamentSubscription,
        { tournamentId },
        { "x-hasura-role": "guest" },
      );
      for (const viewer of await viewersOf(tournamentId)) {
        const session = {
          "x-hasura-role": "user",
          "x-hasura-user-id": viewer,
        };
        const [whole, personal] = await Promise.all([
          read(tournamentSubscription, { tournamentId }, session),
          read(
            personalTournamentSubscription,
            { tournamentId, viewer: [viewer] },
            session,
          ),
        ]);
        expect(
          comparable(joinShared(shared, personal)),
          `viewer ${viewer} on ${tournamentId}`,
        ).toEqual(comparable(whole));
      }

      const guest = { "x-hasura-role": "guest" };
      const signedOut = await read(
        personalTournamentSubscription,
        { tournamentId, viewer: [] },
        guest,
      );
      expect(comparable(joinShared(shared, signedOut))).toEqual(
        comparable(await read(tournamentSubscription, { tournamentId }, guest)),
      );
    }
  }, 600_000);
});
