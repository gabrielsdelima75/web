export type NetworkStats = {
  matches: number;
  players: number;
  countries: { country: string; panels: number }[];
} | null;

// 5stack.gg only: the server route answers null on every other panel. One key,
// so the stats strip and the globe share the request.
export function useNetworkStats() {
  return useFetch<NetworkStats>("/api/network-stats", {
    key: "network-stats",
    default: () => null,
  });
}
