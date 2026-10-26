import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { VERCEL_ACCOUNT_ENDPOINTS } from "./constants"
import { VercelTeamRequiredError } from "./errors"
import { readVercelString as readString } from "./parsing"
import {
  createVercelAccountRequest,
  vercelRequests,
  withVercelQuery,
} from "./request"

const TEAMS_PAGE_LIMIT = 100

export type VercelUserIdentity = {
  id: string
  username: string
  email?: string
  /** Team the dashboard last used; the only account-scope hint the console exposes. */
  defaultTeamId?: string
  /** Billing plan of the personal account, e.g. `hobby`. */
  plan?: string
}

export type VercelTeam = {
  id: string
  slug: string
  name: string
  role?: string
  roles?: readonly string[]
}

export type VercelAccountScope = {
  teamId: string
  teamSlug?: string
  teamName?: string
}

/** Reads the documented identity payload, rejecting unverifiable shapes. */
export function parseVercelUser(body: unknown): VercelUserIdentity | null {
  if (!isRecord(body) || !isRecord(body.user)) return null
  const user = body.user
  const id = readString(user.id)
  const username = readString(user.username)
  if (!id || !username) return null
  const billing = isRecord(user.billing) ? user.billing : undefined
  return {
    id,
    username,
    ...(readString(user.email) ? { email: readString(user.email)! } : {}),
    ...(readString(user.defaultTeamId)
      ? { defaultTeamId: readString(user.defaultTeamId)! }
      : {}),
    ...(billing && readString(billing.plan)
      ? { plan: readString(billing.plan)! }
      : {}),
  }
}

/** Reads the documented team list, dropping rows without an id or slug. */
export function parseVercelTeams(body: unknown): VercelTeam[] {
  if (!isRecord(body) || !Array.isArray(body.teams)) return []
  const teams: VercelTeam[] = []
  for (const value of body.teams) {
    if (!isRecord(value)) continue
    const id = readString(value.id)
    const slug = readString(value.slug)
    if (!id || !slug) continue
    const membership = isRecord(value.membership) ? value.membership : undefined
    teams.push({
      id,
      slug,
      name: readString(value.name) ?? slug,
      ...(membership && readString(membership.role)
        ? { role: readString(membership.role)! }
        : {}),
      ...(membership && Array.isArray(membership.teamRoles)
        ? {
            roles: membership.teamRoles.filter(
              (role): role is string => typeof role === "string",
            ),
          }
        : {}),
    })
  }
  return teams
}

/**
 * Picks the team that owns the account's AI Gateway keys. A dashboard default
 * decides when the token can act for several teams; a single team is
 * unambiguous; anything else stays a hard failure rather than a guess.
 */
export function resolveVercelAccountScope(
  user: VercelUserIdentity,
  teams: readonly VercelTeam[],
  preferredTeamId?: string,
): VercelAccountScope {
  const defaultTeam = user.defaultTeamId
    ? teams.find((team) => team.id === user.defaultTeamId)
    : undefined
  const selected = preferredTeamId
    ? teams.find((team) => team.id === preferredTeamId)
    : defaultTeam ?? (teams.length === 1 ? teams[0] : undefined)
  if (!selected) throw new VercelTeamRequiredError()
  return {
    teamId: selected.id,
    teamSlug: selected.slug,
    teamName: selected.name,
  }
}

/** Reads the console identity for one Vercel access token. */
export async function fetchVercelUser(
  request: ApiServiceRequest,
): Promise<VercelUserIdentity> {
  const body = await vercelRequests.payload<unknown>(
    createVercelAccountRequest(request),
    {
      endpoint: VERCEL_ACCOUNT_ENDPOINTS.User,
      options: { method: "GET", cache: "no-store" },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  const user = parseVercelUser(body)
  if (!user) {
    throw new VercelIdentityError()
  }
  return user
}

/** Reads every team the token can act for. */
export async function fetchVercelTeams(
  request: ApiServiceRequest,
): Promise<VercelTeam[]> {
  const teams = new Map<string, VercelTeam>()
  const seen = new Set<number>()
  let cursor: number | undefined
  do {
    const body = await vercelRequests.payload<unknown>(
      createVercelAccountRequest(request),
      {
        endpoint: withVercelQuery(VERCEL_ACCOUNT_ENDPOINTS.Teams, {
          limit: TEAMS_PAGE_LIMIT,
          until: cursor,
        }),
        options: { method: "GET", cache: "no-store" },
        tempWindowFallback: { statusCodes: [], codes: [] },
      },
    )
    if (!isRecord(body) || !Array.isArray(body.teams)) {
      throw new VercelIdentityError()
    }
    for (const team of parseVercelTeams(body)) teams.set(team.id, team)
    const next = isRecord(body.pagination) ? body.pagination.next : undefined
    if (next === null || next === undefined) break
    if (typeof next !== "number" || !Number.isFinite(next) || seen.has(next))
      throw new VercelIdentityError()
    seen.add(next)
    cursor = next
  } while (cursor !== undefined)
  return [...teams.values()]
}

/** The deployment answered with a body this adapter cannot verify. */
class VercelIdentityError extends Error {
  constructor() {
    super("vercel_identity_unreadable")
    this.name = "VercelIdentityError"
  }
}
