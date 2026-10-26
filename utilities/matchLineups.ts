// Matches filtered by who played them, through matches.lineups (a match's
// lineups by match_id). "lineup_1 or lineup_2" is an OR of two EXISTS that
// Postgres can't estimate, so it read matches newest first until it found
// enough of them: every match there is for a player with few. Through lineups
// it is one EXISTS, planned from the player's or team's own lineup rows.
export function playedBy(steamId: string) {
  return { lineups: { lineup_players: { steam_id: { _eq: steamId } } } };
}

export function playedByAny(steamIds: Array<string>) {
  return { lineups: { lineup_players: { steam_id: { _in: steamIds } } } };
}

export function playedByAnyTeam(teamIds: Array<string>) {
  return { lineups: { team_id: { _in: teamIds } } };
}
