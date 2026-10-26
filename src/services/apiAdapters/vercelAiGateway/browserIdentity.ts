import { SITE_TYPES } from "~/constants/siteType"
import {
  isCanonicalVercelUrl,
  VERCEL_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountDetectionPrivacyPolicy } from "~/services/accountSiteOnboarding/contracts"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { t } from "~/utils/i18n/core"

/** Passive identity verification for the logged-in Vercel console. */
export const vercelBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.VERCEL_AI_GATEWAY && origin === VERCEL_WEB_ORIGIN,
  observe: ({ candidateUserIds }) => ({
    sessionKey: "vercel-console-session",
    cacheResult: false,
    async verify(read) {
      // A saved account is identified by its team, so the session proves the
      // matching team rather than the personal user id.
      const body = await read({ url: `${VERCEL_WEB_ORIGIN}/api/teams` })
      const teams =
        body && typeof body === "object" && Array.isArray(body.teams)
          ? body.teams
          : []
      const teamIds = teams.flatMap((team) =>
        team &&
        typeof team === "object" &&
        "id" in team &&
        typeof team.id === "string" &&
        team.id.trim()
          ? [team.id.trim()]
          : [],
      )
      // Prefer the saved account's own team; otherwise report the session's
      // first team so a new account can adopt it.
      return (
        teamIds.find((id) => candidateUserIds.includes(id)) ??
        teamIds[0] ??
        null
      )
    },
  }),
}

/**
 * `vercel.com` serves every Vercel product, so read-only account detection is
 * allowed only on the AI Gateway console surface. Detection failures use local
 * copy; nothing here grants permission to create a token.
 */
export const vercelAccountDetectionPrivacy: AccountDetectionPrivacyPolicy = {
  siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
  matchesUrl(url) {
    return isCanonicalVercelUrl(url)
  },
  getFailureMessage: () => t("messages:vercelAiGateway.accessTokenRequired"),
}
