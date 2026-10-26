import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  VERCEL_ACCESS_TOKENS_PATH,
  VERCEL_AI_GATEWAY_DISPLAY_NAME,
  VERCEL_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import {
  createVercelCatalogSnapshot,
  fetchAccountData,
  fetchVercelModelCatalog,
  fetchVercelTeams,
  fetchVercelUser,
  resolveVercelAccountScope,
} from "~/services/apiService/vercelAiGateway"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import { vercelAiGatewayKeyResources } from "./keyResources"

/** Reads the team the saved account belongs to; it is the account identity. */
const readTeamId = (request: ApiServiceRequest): string => {
  const teamId =
    typeof request.auth.userId === "string" ? request.auth.userId.trim() : ""
  if (!teamId) {
    throw new ApiError(
      "Vercel AI Gateway account is missing its team",
      undefined,
      undefined,
      API_ERROR_CODES.HTTP_401,
    )
  }
  return teamId
}

export const vercelAiGatewayCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.VercelAiGateway,
  account: {
    persistence: {
      async prepareIdentity({ accessToken, userId }) {
        const teams = await fetchVercelTeams({
          baseUrl: VERCEL_WEB_ORIGIN,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken },
        })
        const selected = teams.find((team) => team.id === userId.trim())
        if (!selected)
          throw new Error(t("accountDialog:form.vercelTeamLoadFailed"))
        return selected.id
      },
      getValidationFailureMessage: getErrorMessage,
      getHealthFailureReason: getErrorMessage,
      getOperationLogDetails: (ordinaryDetails) => ordinaryDetails,
    },
    bootstrap: {
      dynamicRoutes: ["usage", "adminCredentials"],
      // The console identity is the personal user; the saved account is the
      // team that owns the AI Gateway keys and credits.
      fetchUserInfo: async (request) => {
        const user = await fetchVercelUser(request)
        const teams = await fetchVercelTeams(request)
        const scope = resolveVercelAccountScope(
          user,
          teams,
          typeof request.auth.userId === "string"
            ? request.auth.userId.trim() || undefined
            : undefined,
        )
        return {
          id: scope.teamId,
          username: scope.teamName ?? user.username,
          access_token: null,
        }
      },
      // Vercel access tokens are issued only by the console, behind an email
      // step-up code; no background flow can mint one.
      getOrCreateAccessToken: async () => {
        throw new ApiError(
          "Vercel access tokens must be created in the Vercel console",
          undefined,
          VERCEL_ACCESS_TOKENS_PATH,
          API_ERROR_CODES.ACCESS_TOKEN_VERIFICATION_REQUIRED,
        )
      },
      loadBootstrapFacts: async () => ({
        displayName: VERCEL_AI_GATEWAY_DISPLAY_NAME,
        // AI Gateway has no check-in flow.
        checkInSupported: false,
      }),
      fetchCheckInSupport: async () => false,
      resolveRoutePath: async (target, route) => {
        if (route === "usage" || route === "adminCredentials") {
          if (!target.token || typeof target.userId !== "string") return null
          const teams = await fetchVercelTeams({
            baseUrl: target.baseUrl,
            auth: {
              authType: AuthTypeEnum.AccessToken,
              accessToken: target.token,
              userId: target.userId,
            },
          })
          const team = teams.find((team) => team.id === target.userId)
          return team
            ? `/${encodeURIComponent(team.slug)}/~/ai-gateway/${route === "usage" ? "logs" : "api-keys"}`
            : null
        }
        return resolveStaticAccountRoutePath(
          { ...target, siteType: SITE_TYPES.VERCEL_AI_GATEWAY },
          route,
        )
      },
    },
    completion: {
      async complete(request, helpers) {
        const accessToken =
          request.existingAccessToken?.trim() ??
          request.detected.accessToken?.trim() ??
          ""
        if (!accessToken) {
          // The session proves the account, but a Vercel access token can only
          // be issued by the console behind an email step-up code. Report a
          // guided detour rather than a generic detection miss.
          throw helpers.createCompletionError(
            AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
            new Error("Vercel AI Gateway requires a Vercel access token"),
          )
        }
        const serviceRequest = helpers.createServiceRequest({
          baseUrl: request.url,
          auth: {
            authType: request.requestedAuthType,
            userId: request.detected.userId,
            accessToken,
          },
          context: request.context,
        })
        const user = await fetchVercelUser(serviceRequest)
        const teams = await fetchVercelTeams(serviceRequest)
        const scope = resolveVercelAccountScope(
          user,
          teams,
          request.detected.userId || undefined,
        )
        const username = scope.teamName ?? user.username
        helpers.captureRecoveryData({
          userId: scope.teamId,
          username,
          authType: AuthTypeEnum.AccessToken,
        })
        return {
          userId: scope.teamId,
          username,
          accessToken,
          siteName: VERCEL_AI_GATEWAY_DISPLAY_NAME,
          exchangeRate: DEFAULT_USD_TO_CNY_RATE,
          authType: AuthTypeEnum.AccessToken,
          checkIn: helpers.createInitialCheckInConfig({ supported: false }),
        }
      },
    },
    data: { fetchData: fetchAccountData },
    refresh: {
      async refreshAccount(request) {
        try {
          return {
            success: true,
            data: await fetchAccountData(request),
            healthStatus: {
              status: SiteHealthStatus.Healthy,
              message: t("account:healthStatus.normal"),
            },
          }
        } catch (error) {
          return { success: false, healthStatus: determineHealthStatus(error) }
        }
      },
    },
    keyResourceManagement: vercelAiGatewayKeyResources,
    modelPricing: {
      async fetchPricing(request) {
        const models = await fetchVercelModelCatalog(
          request,
          readTeamId(request),
        )
        return createVercelCatalogSnapshot(models)
      },
    },
  },
}
