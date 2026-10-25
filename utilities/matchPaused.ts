type PausableMatch =
  | {
      status?: string | null;
      match_maps?: Array<{ status?: string | null }> | null;
    }
  | null
  | undefined;

// A live match held on a paused map. The match itself stays Live; only the
// map's status says it is paused.
export function isMatchPaused(match: PausableMatch): boolean {
  return (
    match?.status === "Live" &&
    !!match.match_maps?.some((matchMap) => matchMap.status === "Paused")
  );
}
