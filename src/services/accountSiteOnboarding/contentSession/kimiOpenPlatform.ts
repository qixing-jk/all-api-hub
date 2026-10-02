import { SITE_TYPES } from "~/constants/siteType"
import { readJwtExpiry, readJwtSubject } from "~/services/kimiOpenPlatform/auth"
import { resolveKimiOpenPlatformDeployment } from "~/services/kimiOpenPlatform/deployments"

import type { ContentSessionExtractor } from "../contracts"

const TOKEN_KEY = "token"
const REFRESH_KEY = "rtoken"
const ORGANIZATION_KEY = "currentOrganizationId"

const readOrganizationId = () => {
  const raw = localStorage.getItem(ORGANIZATION_KEY)
  if (!raw) return ""
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === "string" ? parsed.trim() : raw.trim()
  } catch {
    return raw.trim()
  }
}

/**
 * Reads the console session from localStorage.
 * `currentOrganizationId` is a JSON string. There is no cookie session.
 */
export const kimiOpenPlatformContentSessionExtractor: ContentSessionExtractor =
  {
    id: "kimi-open-platform",
    canExtract: (context) => {
      if (!context?.url || !resolveKimiOpenPlatformDeployment(context.url))
        return false
      return Boolean(localStorage.getItem(TOKEN_KEY)?.trim())
    },
    async extract(context) {
      const deployment = resolveKimiOpenPlatformDeployment(context.url ?? "")
      const accessToken = localStorage.getItem(TOKEN_KEY)?.trim() ?? ""
      const refreshToken = localStorage.getItem(REFRESH_KEY)?.trim() ?? ""
      const userId = readJwtSubject(accessToken)
      if (!deployment || !accessToken || !userId) return null
      const organizationId = readOrganizationId()
      const tokenExpiresAt = readJwtExpiry(accessToken)
      return {
        userId,
        user: { id: userId },
        accessToken,
        siteTypeHint:
          deployment.siteType === SITE_TYPES.KIMI
            ? SITE_TYPES.KIMI
            : SITE_TYPES.KIMI_GLOBAL,
        ...(refreshToken && organizationId
          ? {
              kimiOpenPlatformAuth: {
                refreshToken,
                organizationId,
                ...(tokenExpiresAt !== undefined ? { tokenExpiresAt } : {}),
              },
            }
          : {}),
      }
    },
  }
