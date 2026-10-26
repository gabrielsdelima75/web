import { $, e_match_status_enum, order_by } from "~/generated/zeus";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { generateSubscription } from "~/graphql/graphqlGen";
import tournamentTeamFields from "~/graphql/tournamentTeamFields";
import { playerFieldsWithoutRanksOrElo } from "~/graphql/playerFields";
import { bracketProposalSelection } from "~/graphql/bracketNegotiation";
import { tournamentRosterCounts } from "~/graphql/tournamentCardFields";
import { splitSubscription } from "~/utilities/sharedSubscription";

// The tournament page's live subscription: whole for moderators and above,
// and in two halves for everyone else (see utilities/sharedSubscription.ts).

// The tournament's flags for whoever is looking.
const VIEWER_FLAGS = {
  is_organizer: true,
  can_join: true,
  joined_tournament: true,
  can_start: true,
  can_cancel: true,
  can_open_registration: true,
  can_close_registration: true,
  can_pause: true,
  can_resume: true,
  can_setup: true,
};

const BRACKET_MATCH = {
  id: true,
  status: true,
  scheduled_at: true,
  winning_lineup_id: true,
  lineup_1_id: true,
  lineup_2_id: true,
  options: {
    best_of: true,
  },
  match_maps: [
    {
      order_by: [
        {
          order: order_by.asc,
        },
      ],
    },
    {
      // joinShared lines rows up by id: a bracket the personal half carries
      // for its parent's match brings its own visible match along too.
      id: true,
      lineup_1_score: true,
      lineup_2_score: true,
      winning_lineup_id: true,
    },
  ],
  lineup_1: {
    id: true,
    name: true,
  },
  lineup_2: {
    id: true,
    name: true,
  },
};

export const tournamentSubscription = typedGql("subscription")({
  tournaments_by_pk: [
    {
      id: $("tournamentId", "uuid!"),
    },
    {
      id: true,
      name: true,
      start: true,
      status: true,
      // Cast: current_stage is a new computed field; drop it once
      // `yarn codegen` has run against a migrated stack.
      ...({ current_stage: true } as {}),
      auto_start: true,
      scheduling_mode: true,
      league_season_division: {
        id: true,
      },
      awards_enabled: true,
      substitutes_enabled: true,
      e_tournament_status: {
        description: true,
      },
      ...VIEWER_FLAGS,
      min_players_per_lineup: true,
      max_players_per_lineup: true,
      teams: [
        {
          order_by: [
            {
              seed: order_by.asc,
            },
            {
              eligible_at: order_by.asc,
            },
            {
              created_at: order_by.asc,
            },
          ],
        },
        tournamentTeamFields,
      ],
      teams_aggregate: [
        {},
        {
          aggregate: {
            count: true,
          },
        },
      ],
      __alias: tournamentRosterCounts,
      stages: [
        {
          order_by: [
            {
              order: order_by.asc,
            },
          ],
        },
        {
          id: true,
          type: true,
          e_tournament_stage_type: {
            description: true,
          },
          order: true,
          groups: true,
          min_teams: true,
          max_teams: true,
          max_rounds: true,
          swiss_no_elimination: true,
          decider_best_of: true,
          default_best_of: true,
          final_map_advantage: true,
          settings: true,
          third_place_match: true,
          // What the stage form and bracket cards read; the rest of a stage's
          // match options are shown from the tournament's own.
          options: {
            id: true,
            best_of: true,
            match_mode: true,
            tv_delay: true,
            veto_pick_timeout: true,
            region_veto: true,
            regions: true,
            check_in_setting: true,
            ready_setting: true,
            tech_timeout_setting: true,
            map_pool: {
              id: true,
              maps: [{}, { id: true }],
            },
          },
          windows: [
            {},
            {
              round: true,
              opens_at: true,
              closes_at: true,
              default_match_at: true,
            },
          ],
          results: [
            {},
            {
              tournament_team_id: true,
              group_number: true,
              rank: true,
              placement: true,
              wins: true,
              losses: true,
              matches_played: true,
              team: {
                id: true,
                name: true,
                team: {
                  id: true,
                  name: true,
                },
                roster: [
                  {},
                  {
                    player: playerFieldsWithoutRanksOrElo,
                  },
                ],
              },
            },
          ],
          brackets: [
            {
              order_by: [
                {
                  round: order_by.asc,
                },
                {
                  group: order_by.asc,
                },
                {
                  path: order_by.desc,
                },
                {
                  match_number: order_by.asc,
                },
              ],
            },
            {
              // Heavy match fields are fetched by TournamentMatches.vue.
              id: true,
              round: true,
              group: true,
              bye: true,
              finished: true,
              match_number: true,
              scheduled_at: true,
              scheduled_eta: true,
              team_1_seed: true,
              team_2_seed: true,
              path: true,
              options: {
                match_mode: true,
              },
              parent_bracket: {
                id: true,
                round: true,
                group: true,
                match_number: true,
                path: true,
                match: {
                  status: true,
                },
              },
              loser_bracket: {
                id: true,
                round: true,
                group: true,
                match_number: true,
                path: true,
                match: {
                  status: true,
                },
              },
              feeding_brackets: {
                id: true,
                round: true,
                group: true,
                match_number: true,
                path: true,
                parent_bracket_id: true,
                loser_parent_bracket_id: true,
              },
              match: BRACKET_MATCH,
              team_1: {
                id: true,
                name: true,
                team_id: true,
                team: {
                  name: true,
                },
              },
              team_2: {
                id: true,
                name: true,
                team_id: true,
                team: {
                  name: true,
                },
              },
              ...bracketProposalSelection,
            },
          ],
        },
      ],
    },
  ],
});

// The bracket is read as a guest, so everyone watching shares one poll of it.
// What depends on who is looking is read on the viewer's own session: their
// flags, their teams' and the matches a guest isn't shown.
export const { shared: sharedTournamentSubscription } = splitSubscription(
  tournamentSubscription,
  [...Object.keys(VIEWER_FLAGS), "teams.can_recruit", "teams.can_manage"],
);

// A guest isn't shown a match still picking players or canceled; the viewer
// may be, when it's theirs, they organize it or a friend plays in it.
const HIDDEN_FROM_GUESTS = {
  status: {
    _in: [e_match_status_enum.PickingPlayers, e_match_status_enum.Canceled],
  },
};

// Each personal list holds only the rows that can differ from the guest's,
// rather than every team and bracket again for every viewer.
// Built untyped like the check-in list: typed, it is one more instantiation
// too deep for vue-tsc.
export const personalTournamentSubscription = generateSubscription({
  tournaments_by_pk: [
    {
      id: $("tournamentId", "uuid!"),
    },
    {
      id: true,
      ...VIEWER_FLAGS,
      // Every entry can_manage could be true for: the viewer owns it or plays
      // on it, or owns, captains or plays for its team.
      teams: [
        {
          where: {
            _or: [
              { owner_steam_id: { _in: $("viewer", "[bigint!]!") } },
              {
                roster: { player_steam_id: { _in: $("viewer", "[bigint!]!") } },
              },
              {
                team: {
                  _or: [
                    { owner_steam_id: { _in: $("viewer", "[bigint!]!") } },
                    { captain_steam_id: { _in: $("viewer", "[bigint!]!") } },
                    {
                      roster: {
                        player_steam_id: { _in: $("viewer", "[bigint!]!") },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          id: true,
          can_recruit: true,
          can_manage: true,
        },
      ],
      stages: [
        {},
        {
          id: true,
          brackets: [
            {
              where: {
                _or: [
                  { match: HIDDEN_FROM_GUESTS },
                  { parent_bracket: { match: HIDDEN_FROM_GUESTS } },
                  { loser_bracket: { match: HIDDEN_FROM_GUESTS } },
                ],
              },
            },
            {
              id: true,
              match: BRACKET_MATCH,
              parent_bracket: {
                id: true,
                match: {
                  status: true,
                },
              },
              loser_bracket: {
                id: true,
                match: {
                  status: true,
                },
              },
            },
          ],
        },
      ],
    },
  ],
} as any);
