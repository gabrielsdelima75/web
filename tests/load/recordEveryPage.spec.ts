// Records every page, as a guest, a player and an administrator, for the api
// load lab's coverage runs (api/load). Off in normal runs; with the load stack
// up and its ids exported (eval "$(psql -At -f load/document-ids.sql)"):
//   LOAD_COVERAGE=<api>/load/documents/coverage npx vitest run tests/load/recordEveryPage
// Pages come from pages/, so a new page is recorded without touching this
// file; one whose route needs an id the seed doesn't export is skipped and
// listed. coverage.json says, per scene, what it sent, what failed and which
// reads came back empty -- what the seed still has to grow.
import { describe, it } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { ApolloLink, Observable } from "@apollo/client/core";
import { ApolloClients, provideApolloClients } from "@vue/apollo-composable";
import { print, parse } from "graphql";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { useAuthStore } from "~/stores/AuthStore";
import { SidebarProvider } from "~/components/ui/sidebar";
import { TooltipProvider } from "~/components/ui/tooltip";

const OUT = process.env.LOAD_COVERAGE;
const HASURA = process.env.LOAD_HASURA ?? "http://localhost:58081/v1/graphql";

type Viewer = { steamId: string; role: string } | null;
type Recorded = {
  client: string;
  kind: string;
  operationName: string | null;
  query: string;
  variables: Record<string, unknown>;
  // It came back with errors here (an admin page as a player, an action the
  // lab doesn't run): load runs leave it out, so their errors are new ones.
  failed?: boolean;
};
type Outcome = {
  errors: string[];
  empty: string[];
  pending: Set<Promise<unknown>>;
};

const pages = import.meta.glob("~/pages/**/*.vue");

// Route segment -> the export that fills it, by the page's route.
// A value starting with "=" is used as is.
const PARAMS: Record<string, Record<string, string>> = {
  "/apps/[...slug]": { "...slug": "LOAD_APP" },
  "/file-popout/[scope]/[id]": { scope: "=server", id: "LOAD_SERVER" },
  "/awards/[id]": { id: "LOAD_AWARD" },
  "/clips/[id]": { id: "LOAD_CLIP" },
  "/dedicated-servers/[id]": { id: "LOAD_SERVER" },
  "/dedicated-servers/[serverId]/files": { serverId: "LOAD_SERVER" },
  "/demo/[matchMapId]": { matchMapId: "LOAD_MATCH_MAP" },
  "/draft-room/[id]": { id: "LOAD_DRAFT" },
  "/draft-room/[id]/edit": { id: "LOAD_DRAFT" },
  "/embed/tournaments/[tournamentId]/bracket": {
    tournamentId: "LOAD_TOURNAMENT",
  },
  "/events/[eventId]": { eventId: "LOAD_EVENT" },
  "/game-server-nodes/[nodeId]/files": { nodeId: "LOAD_NODE" },
  "/league/seasons/[seasonId]": { seasonId: "LOAD_LEAGUE_SEASON" },
  "/league/seasons/[seasonId]/tournaments/[tournamentId]": {
    seasonId: "LOAD_LEAGUE_SEASON",
    tournamentId: "LOAD_LEAGUE_TOURNAMENT",
  },
  "/match-popout/[id]": { id: "LOAD_MATCH" },
  "/matches/[id]": { id: "LOAD_MATCH" },
  "/matches/[id]/camera": { id: "LOAD_MATCH" },
  "/matches/[id]/camera-admin": { id: "LOAD_MATCH" },
  "/matches/[id]/playback/2d/[matchMapId]": {
    id: "LOAD_MATCH",
    matchMapId: "LOAD_MATCH_MAP",
  },
  "/matches/[id]/playback/3d/[matchMapId]": {
    id: "LOAD_MATCH",
    matchMapId: "LOAD_MATCH_MAP",
  },
  "/news/[slug]": { slug: "LOAD_NEWS_SLUG" },
  "/news/manage/[id]": { id: "LOAD_NEWS" },
  "/players/[id]": { id: "LOAD_PROFILE" },
  "/plugins/[slug]": { slug: "LOAD_PLUGIN" },
  "/public-servers/[id]": { id: "LOAD_PUBLIC_SERVER" },
  "/settings/application/map-pools/[id]": { id: "LOAD_MAP_POOL" },
  "/stream-deck/[matchId]": { matchId: "LOAD_MATCH" },
  "/teams/[id]": { id: "LOAD_TEAM" },
  "/tournaments/[tournamentId]": { tournamentId: "LOAD_TOURNAMENT" },
  "/tournaments/[tournamentId]/match-options": {
    tournamentId: "LOAD_TOURNAMENT",
  },
  "/tournaments/[tournamentId]/organizers": { tournamentId: "LOAD_TOURNAMENT" },
  "/utility/[map]": { map: "LOAD_UTILITY_MAP" },
  "/utility/lineup/[id]": { id: "LOAD_UTILITY_LINEUP" },
};

// The page file's route, as Nuxt builds it: pages/teams/[id].vue -> /teams/[id].
function template(file: string): string {
  const path = file
    .replace(/^.*\/pages/, "")
    .replace(/\.vue$/, "")
    .replace(/\/index$/, "");
  return path === "" ? "/" : path;
}

function route(path: string): string | { missing: string } {
  if (!/\[/.test(path)) return path;
  const params = PARAMS[path];
  if (!params) return { missing: `no ids for ${path}` };
  let filled = path;
  for (const [name, variable] of Object.entries(params)) {
    const value = variable.startsWith("=")
      ? variable.slice(1)
      : process.env[variable];
    if (!value) return { missing: variable };
    filled = filled.replace(`[${name}]`, encodeURIComponent(value));
  }
  return filled;
}

const sceneName = (path: string, viewer: Viewer) =>
  `${path === "/" ? "home" : path.slice(1).replace(/\[|\]/g, "").replace(/\//g, "-")}--${viewer?.role ?? "guest"}`;

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
  if (!viewer) return { data: { me: null } };
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

// A root field that came back null or an empty list: the seed has nothing
// for it, so its plan was made over no rows.
function emptyRoots(
  data: Record<string, unknown> | null | undefined,
): string[] {
  if (!data) return [];
  return Object.entries(data)
    .filter(
      ([, value]) =>
        value === null || (Array.isArray(value) && value.length === 0),
    )
    .map(([name]) => name);
}

function recordingLink(
  client: string,
  viewer: Viewer,
  recorded: Recorded[],
  outcome: Outcome,
) {
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
        const op: Recorded = {
          client,
          kind,
          operationName: operation.operationName || null,
          query,
          variables: operation.variables ?? {},
        };
        recorded.push(op);
        if (kind === "mutation") {
          observer.next({ data: null });
          observer.complete();
          return;
        }
        const isMe = definition.selectionSet.selections.some(
          (s: any) => s.name.value === "me",
        );
        const request = (
          isMe
            ? answerMe(query, viewer)
            : hasura(
                query.replace(/^(\s*)subscription\b/, "$1query"),
                operation.variables,
                headers,
              )
        )
          .then((result: any) => {
            for (const error of result.errors ?? [])
              outcome.errors.push(error.message);
            if (result.errors?.length) op.failed = true;
            outcome.empty.push(...emptyRoots(result.data));
            observer.next(result);
            observer.complete();
          })
          .catch((error) => observer.error(error))
          .finally(() => outcome.pending.delete(request));
        outcome.pending.add(request);
      }),
  );
}

async function record(
  name: string,
  page: unknown,
  path: string,
  viewer: Viewer,
) {
  const recorded: Recorded[] = [];
  const outcome: Outcome = { errors: [], empty: [], pending: new Set() };
  const clients = useApollo().clients as Record<string, any>;
  clients.default.setLink(recordingLink("default", viewer, recorded, outcome));
  clients.public?.setLink(recordingLink("public", viewer, recorded, outcome));
  provideApolloClients(clients);

  const auth = useAuthStore();
  auth.clearMe();
  if (viewer) await auth.getMe();

  let mountError: string | null = null;
  let wrapper: any = null;
  try {
    const shell = defineComponent({
      render: () =>
        h(SidebarProvider, () => h(TooltipProvider, () => h(page as any))),
    });
    wrapper = await mountSuspended(shell, {
      route: path,
      global: {
        mixins: (useNuxtApp().vueApp as any)._context.mixins,
        provide: { [ApolloClients as symbol]: clients },
      },
    });
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await flushPromises();
    }
  } catch (error) {
    mountError = String((error as Error)?.message ?? error).slice(0, 300);
  }
  // What is still on its way decides whether its operation failed.
  await Promise.race([
    Promise.allSettled([...outcome.pending]),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  try {
    wrapper?.unmount();
  } catch {
    // Children still updating when the scene ends; the recording is kept.
  }

  const key = (op: Recorded) =>
    `${op.client}|${op.query}|${JSON.stringify(op.variables)}`;
  const failed = new Set(recorded.filter((op) => op.failed).map(key));
  const unique = new Map<string, Recorded>();
  for (const op of recorded)
    unique.set(key(op), failed.has(key(op)) ? { ...op, failed: true } : op);
  const operations = [...unique.values()];
  if (operations.length > 0) {
    writeFileSync(
      join(OUT!, `${name}.json`),
      JSON.stringify(
        { name, route: path, viewer, ids: ids(), operations },
        null,
        2,
      ),
    );
  }
  return {
    name,
    route: path,
    role: viewer?.role ?? "guest",
    operations: operations.length,
    queries: operations.filter((o) => o.kind === "query").length,
    subscriptions: operations.filter((o) => o.kind === "subscription").length,
    mutations: operations.filter((o) => o.kind === "mutation").length,
    errors: [...new Set(outcome.errors)],
    empty: [...new Set(outcome.empty)].sort(),
    mountError,
  };
}

// Every export a route can use, so the lab can swap in each user's own.
const ids = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        key.startsWith("LOAD_") &&
        key !== "LOAD_COVERAGE" &&
        key !== "LOAD_HASURA",
    ),
  );

describe.runIf(OUT)("every page", () => {
  it("records each page as a guest, a player and an administrator", async () => {
    mkdirSync(OUT!, { recursive: true });
    const viewers: Viewer[] = [
      null,
      { steamId: process.env.LOAD_PLAYER!, role: "user" },
      { steamId: process.env.LOAD_ADMIN!, role: "administrator" },
    ];
    // LOAD_RESUME (tests/load/recordEveryPage.mjs sets it): carry on from where
    // the last process stopped.
    const previous = process.env.LOAD_RESUME
      ? JSON.parse(readFileSync(join(OUT!, "coverage.json"), "utf8"))
      : null;
    const report: Array<Awaited<ReturnType<typeof record>>> =
      previous?.scenes ?? [];
    const skipped: Array<{ page: string; missing: string }> =
      previous?.skipped ?? [];
    let next: string | null = null;
    // Written as it goes, so a page that takes the run down leaves the rest.
    const save = () =>
      writeFileSync(
        join(OUT!, "coverage.json"),
        JSON.stringify({ scenes: report, skipped, next }, null, 2),
      );
    // LOAD_PAGES: a pattern to record only the routes it matches.
    const only = process.env.LOAD_PAGES
      ? new RegExp(process.env.LOAD_PAGES)
      : null;
    const files = Object.keys(pages).sort();
    const start = previous?.next ? files.indexOf(previous.next) : 0;
    let mountedHere = false;
    for (const file of files.slice(Math.max(0, start))) {
      const path = template(file);
      if (only && !only.test(path)) continue;
      const target = route(path);
      if (typeof target !== "string") {
        skipped.push({ page: path, missing: target.missing });
        continue;
      }
      let page: unknown;
      try {
        page = ((await pages[file]()) as any).default;
      } catch (error) {
        skipped.push({
          page: path,
          missing: `does not load here: ${String((error as Error)?.message ?? error).slice(0, 200)}`,
        });
        save();
        continue;
      }
      const results = [];
      for (const viewer of viewers) {
        results.push(
          await record(sceneName(path, viewer), page, target, viewer),
        );
      }
      // A page can leave this process's app unable to mount anything after it.
      // A signed-in mount failing that way after others here worked is that,
      // not this page: it is recorded again in a fresh process.
      const broken = results.some(
        (r) =>
          r.role !== "guest" &&
          r.mountError &&
          /reading '\$'/.test(r.mountError),
      );
      if (broken && mountedHere) {
        next = file;
        save();
        console.log(
          `stopping before ${path}: this process's app no longer mounts pages`,
        );
        return;
      }
      for (const result of results) {
        report.push(result);
        if (!result.mountError) mountedHere = true;
        console.log(
          `${result.name}: ${result.operations} ops, ${result.errors.length} errors, ${result.empty.length} empty${result.mountError ? ", did not mount" : ""}`,
        );
      }
      save();
    }
    next = null;
    save();
    console.log(
      `${report.length} scenes recorded, ${skipped.length} pages skipped`,
    );
  }, 3_600_000);
});
