import { SITE_TYPES } from "~/constants/siteType"
import { VERCEL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"

import type { ContentSessionExtractor } from "../contracts"

const requireOrigin = (url?: string): string | null => {
  if (!url) return null
  try {
    return new URL(url).origin === VERCEL_WEB_ORIGIN ? VERCEL_WEB_ORIGIN : null
  } catch {
    return null
  }
}

/**
 * Reads the logged-in Vercel session. Pages verify with `{user:{uid}}` (same
 * call the console uses); the team the account owns comes from `/api/teams`,
 * so identity resolves only when both sessions are present. Nothing here
 * creates or refreshes a token — a step-up email code may still be required.
 */
export const vercelContentSessionExtractor: ContentSessionExtractor = {
  id: "vercel",
  canExtract(context) {
    if (context.siteTypeHint !== SITE_TYPES.VERCEL_AI_GATEWAY || !context.url)
      return false
    return requireOrigin(context.url) !== null
  },
  async extract(context) {
    try {
      const userResponse = await fetch("/api/user", {
        credentials: "include",
        cache: "no-store",
      })
      if (!userResponse.ok) return null
      const userBody = (await userResponse.json()) as { user?: unknown }
      const user = userBody?.user
      if (!user || typeof user !== "object") return null
      // The console session uses `uid`; the public REST identity uses `id`.
      const identity = user as { uid?: unknown; id?: unknown }
      const userId = [identity.uid, identity.id]
        .find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        ?.trim()
      if (!userId) return null

      const teamsResponse = await fetch("/api/teams", {
        credentials: "include",
        cache: "no-store",
      })
      if (!teamsResponse.ok) return null
      const teamsBody = (await teamsResponse.json()) as { teams?: unknown[] }
      const teams = Array.isArray(teamsBody?.teams) ? teamsBody.teams : []
      const readableTeams = teams.filter(
        (
          candidate,
        ): candidate is { id: string; name?: string; slug?: string } =>
          !!candidate &&
          typeof candidate === "object" &&
          typeof (candidate as { id?: unknown }).id === "string" &&
          (candidate as { id: string }).id.trim().length > 0,
      )
      const slug = context.url
        ? new URL(context.url).pathname.match(
            /^\/([^/]+)\/~\/ai-gateway(?:\/|$)/,
          )?.[1]
        : undefined
      const team = slug
        ? readableTeams.find((team) => team.slug === decodeURIComponent(slug))
        : readableTeams.length === 1
          ? readableTeams[0]
          : undefined
      if (!team?.id.trim()) return null

      const username =
        typeof (user as { username?: unknown }).username === "string"
          ? (user as { username: string }).username.trim()
          : ""
      const teamName =
        typeof team.name === "string" && team.name.trim()
          ? team.name.trim()
          : ""
      return {
        userId: team.id.trim(),
        siteTypeHint: SITE_TYPES.VERCEL_AI_GATEWAY,
        user: {
          id: userId,
          username,
          ...(teamName ? { team_name: teamName } : {}),
        },
      }
    } catch {
      return null
    }
  },
}
