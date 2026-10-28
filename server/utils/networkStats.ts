type TelemetryStats = {
  totals?: { matches?: number; playersRegistered?: number };
  countries?: { country?: string; installs?: number }[];
};

export type NetworkStats = {
  matches: number;
  players: number;
  countries: { country: string; panels: number }[];
} | null;

// Cloudflare sends XX when it can't place an address and T1 for Tor.
const COUNTRY = /^(?!XX|T1)[A-Z]{2}$/;

export function networkStatsFrom(stats?: TelemetryStats): NetworkStats {
  if (!stats?.totals?.matches) {
    return null;
  }
  return {
    matches: Number(stats.totals.matches),
    players: Number(stats.totals.playersRegistered ?? 0),
    countries: (stats.countries ?? [])
      .filter((row) => COUNTRY.test(row.country ?? ""))
      .map((row) => ({
        country: row.country as string,
        panels: Number(row.installs ?? 0),
      })),
  };
}
