// Records what the app sends to Hasura on each page, as each role, for the
// api's load tests (api/load). Off in normal runs; with the load stack up:
//   LOAD_DOCUMENTS=<api>/load/documents npx vitest run tests/load
// Every Apollo client's link is swapped for one that records the operation
// and answers it from the load stack, so pages render real seeded data and
// their child components send their own documents too.
import { describe, it } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { ApolloLink, Observable } from "@apollo/client/core";
import { ApolloClients, provideApolloClients } from "@vue/apollo-composable";
import { print, parse } from "graphql";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { useAuthStore } from "~/stores/AuthStore";
import { SidebarProvider } from "~/components/ui/sidebar";
import { TooltipProvider } from "~/components/ui/tooltip";
import TournamentPage from "~/pages/tournaments/[tournamentId]/index.vue";
import TournamentsPage from "~/pages/tournaments/index.vue";
import MatchPage from "~/pages/matches/[id]/index.vue";
import PlayerPage from "~/pages/players/[id].vue";
import LeaderboardPage from "~/pages/leaderboard.vue";
import HomePage from "~/pages/index.vue";

const OUT = process.env.LOAD_DOCUMENTS;
const HASURA = process.env.LOAD_HASURA ?? "http://localhost:58081/v1/graphql";

type Viewer = { steamId: string; role: string } | null;
type Recorded = {
  client: string;
  kind: string;
  operationName: string | null;
  query: string;
  variables: Record<string, unknown>;
};

let recorded: Recorded[] = [];

async function hasura(
  query: string,
  variables: unknown,
  headers: Record<string, string>,
) {
  const response = await fetch(HASURA, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasura-admin-secret": "load",
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

// `me` is answered by the api in production; here it is the viewer's player.
async function answerMe(query: string, viewer: Viewer) {
  if (!viewer) {
    return { data: { me: null } };
  }
  const document = parse(query) as any;
  const me = document.definitions[0].selectionSet.selections.find(
    (s: any) => s.name.value === "me",
  );
  const player = me.selectionSet.selections.find(
    (s: any) => s.name.value === "player",
  );
  const result = await hasura(
    `query { players_by_pk(steam_id: "${viewer.steamId}") ${print(player.selectionSet)} }`,
    {},
    { "x-hasura-role": viewer.role, "x-hasura-user-id": viewer.steamId },
  );
  return {
    data: {
      me: {
        __typename: "MeResponse",
        steam_id: viewer.steamId,
        role: viewer.role,
        discord_id: null,
        player: result.data?.players_by_pk ?? null,
      },
    },
  };
}

function recordingLink(client: string, viewer: Viewer) {
  const headers: Record<string, string> =
    client === "public" || !viewer
      ? { "x-hasura-role": "guest" }
      : { "x-hasura-role": viewer.role, "x-hasura-user-id": viewer.steamId };
  return new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        const definition = operation.query.definitions.find(
          (d: any) => d.kind === "OperationDefinition",
        ) as any;
        const query = print(operation.query);
        const kind = definition?.operation ?? "query";
        recorded.push({
          client,
          kind,
          operationName: operation.operationName || null,
          query,
          variables: operation.variables ?? {},
        });
        if (kind === "mutation") {
          observer.next({ data: null });
          observer.complete();
          return;
        }
        const isMe = definition.selectionSet.selections.some(
          (s: any) => s.name.value === "me",
        );
        (isMe
          ? answerMe(query, viewer)
          : hasura(
              query.replace(/^(\s*)subscription\b/, "$1query"),
              operation.variables,
              headers,
            )
        )
          .then((result) => {
            observer.next(result);
            observer.complete();
          })
          .catch((error) => observer.error(error));
      }),
  );
}

async function scene(
  name: string,
  page: unknown,
  route: string,
  viewer: Viewer,
) {
  recorded = [];
  const clients = useApollo().clients as Record<string, any>;
  clients.default.setLink(recordingLink("default", viewer));
  clients.public?.setLink(recordingLink("public", viewer));
  // Stores start subscriptions outside any component setup.
  provideApolloClients(clients);

  const auth = useAuthStore();
  auth.clearMe();
  if (viewer) {
    await auth.getMe();
  }

  // The providers the default layout gives every page.
  const shell = defineComponent({
    render: () =>
      h(SidebarProvider, () => h(TooltipProvider, () => h(page as any))),
  });
  const wrapper = await mountSuspended(shell, {
    route,
    global: {
      mixins: (useNuxtApp().vueApp as any)._context.mixins,
      provide: { [ApolloClients as symbol]: clients },
    },
  });
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flushPromises();
  }

  const unique = new Map<string, Recorded>();
  for (const op of recorded) {
    unique.set(`${op.client}|${op.query}|${JSON.stringify(op.variables)}`, op);
  }
  mkdirSync(OUT!, { recursive: true });
  writeFileSync(
    join(OUT!, `${name}.json`),
    JSON.stringify(
      { name, route, viewer, ids: ids(), operations: [...unique.values()] },
      null,
      2,
    ),
  );
  try {
    wrapper.unmount();
  } catch {
    // Children still updating when the scene ends; the recording is written.
  }
  console.log(`${name}: ${unique.size} operations`);
}

// The ids this recording used, which the load test swaps for each virtual
// user's own (they also appear inside query text, not only in variables).
const ids = () => ({
  player: process.env.LOAD_PLAYER,
  organizer: process.env.LOAD_ORGANIZER,
  tournament: process.env.LOAD_TOURNAMENT,
  match: process.env.LOAD_MATCH,
  profile: process.env.LOAD_PROFILE,
});

const env = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set; see api/load/README.md`);
  }
  return value;
};

describe.runIf(OUT)("load documents", () => {
  const player = () => ({ steamId: env("LOAD_PLAYER"), role: "user" });
  const organizer = () => ({
    steamId: env("LOAD_ORGANIZER"),
    role: "tournament_organizer",
  });
  const tournament = () => `/tournaments/${env("LOAD_TOURNAMENT")}`;
  const match = () => `/matches/${env("LOAD_MATCH")}`;

  it("tournament page", async () => {
    await scene("tournament-guest", TournamentPage, tournament(), null);
    await scene("tournament-user", TournamentPage, tournament(), player());
    await scene(
      "tournament-organizer",
      TournamentPage,
      tournament(),
      organizer(),
    );
  }, 120_000);

  it("match page", async () => {
    await scene("match-guest", MatchPage, match(), null);
    await scene("match-user", MatchPage, match(), player());
  }, 120_000);

  it("other pages", async () => {
    await scene("tournaments-user", TournamentsPage, "/tournaments", player());
    await scene("leaderboard-user", LeaderboardPage, "/leaderboard", player());
    await scene(
      "profile-user",
      PlayerPage,
      `/players/${env("LOAD_PROFILE")}`,
      player(),
    );
    await scene("home-user", HomePage, "/", player());
  }, 180_000);
});
