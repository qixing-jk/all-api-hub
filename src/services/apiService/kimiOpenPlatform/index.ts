import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { resolveKimiOpenPlatformDeployment } from "~/services/kimiOpenPlatform/deployments"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricAvailability,
} from "~/types"

import {
  kimiAmountToQuota,
  parseKimiAccountInfo,
  parseKimiCreatedKey,
  parseKimiInferenceBalance,
  parseKimiKeys,
  parseKimiOpenGatewayModels,
  parseKimiProjects,
  parseKimiUserInfo,
  type KimiApiKey,
  type KimiOpenGatewayModel,
  type KimiProject,
} from "./parsing"
import {
  ensureKimiAuthState,
  fetchKimiConsole,
  fetchKimiConsolePath,
  fetchKimiInference,
  persistKimiAuthState,
  readKimiAuthState,
} from "./transport"

export { fetchKimiPricingDoc } from "./pricingDoc"

const COMPLETE: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
}
const UNSUPPORTED: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
}

const toQuota = (
  request: { baseUrl: string; exchangeRate?: number },
  amount: number,
) => {
  const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
  if (!deployment) throw new Error("unknown_kimi_deployment")
  return kimiAmountToQuota(amount, deployment.currency, request.exchangeRate)
}

/** Reads the signed-in console user. */
export async function fetchKimiUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo & { organizationId: string }> {
  const info = parseKimiUserInfo(await fetchKimiConsole(request, "userInfo"))
  const state = readKimiAuthState(request)
  const firstOrgId = info.organizations[0]?.organization.id || ""
  const organizationId = state?.organizationId || firstOrgId
  if (state && organizationId && !state.organizationId) {
    state.organizationId = organizationId
  }
  return {
    id: info.uid,
    username: info.name || info.uid,
    access_token: state?.accessToken || request.auth.accessToken || "",
    organizationId,
  }
}

/** Resolves the organization ID, attempting stored state, then userInfo. */
export async function resolveKimiOrganizationId(
  request: ApiServiceRequest,
): Promise<string> {
  const state = await ensureKimiAuthState(request)
  if (state?.organizationId?.trim()) return state.organizationId.trim()
  const info = await fetchKimiUserInfo(request)
  if (info.organizationId?.trim()) {
    if (state) {
      state.organizationId = info.organizationId.trim()
      await persistKimiAuthState(request, state)
    }
    return info.organizationId.trim()
  }
  throw new Error("missing_kimi_organization")
}

/** Lists projects in the current organization. */
export async function fetchKimiProjects(
  request: ApiServiceRequest,
): Promise<KimiProject[]> {
  const organizationId = await resolveKimiOrganizationId(request)
  return parseKimiProjects(
    await fetchKimiConsole(request, "listProjects", {
      query: { oid: organizationId },
    }),
  )
}

/** Lists API keys in the current organization. */
export async function fetchKimiKeys(
  request: ApiServiceRequest,
): Promise<KimiApiKey[]> {
  const organizationId = await resolveKimiOrganizationId(request)
  return parseKimiKeys(
    await fetchKimiConsole(request, "organizationKeys", {
      query: { oid: organizationId },
    }),
  )
}

/** Creates a key and returns its one-time plaintext. */
export async function createKimiKey(
  request: ApiServiceRequest,
  projectId: string,
  name: string,
): Promise<KimiApiKey> {
  const organizationId = await resolveKimiOrganizationId(request)
  return parseKimiCreatedKey(
    await fetchKimiConsole(request, "createApiKey", {
      method: "POST",
      query: { pid: projectId, oid: organizationId },
      body: { name },
    }),
  )
}

/** Renames a key. The secret is not returned. */
export async function renameKimiKey(
  request: ApiServiceRequest,
  projectId: string,
  keyId: string,
  name: string,
): Promise<void> {
  const organizationId = await resolveKimiOrganizationId(request)
  await fetchKimiConsole(request, "updateApiKey", {
    method: "PUT",
    query: { pid: projectId, oid: organizationId, id: keyId },
    body: { name },
  })
}

/** Deletes a key from its project. */
export async function deleteKimiKey(
  request: ApiServiceRequest,
  projectId: string,
  keyId: string,
): Promise<void> {
  const organizationId = await resolveKimiOrganizationId(request)
  await fetchKimiConsole(request, "deleteApiKey", {
    method: "DELETE",
    query: { id: keyId, pid: projectId, oid: organizationId },
  })
}

/**
 * Lists the models the account's default project can call.
 *
 * The console serves this from its own open-gateway route, which answers to the
 * console session alone: no API key is involved, and the result is the set this
 * account may actually use rather than every model the platform sells.
 */
export async function fetchKimiAccountModelCatalog(
  request: ApiServiceRequest,
): Promise<KimiOpenGatewayModel[]> {
  const organizationId = await resolveKimiOrganizationId(request)
  const projects = await fetchKimiProjects(request)
  const project = projects.find((entry) => entry.is_default) ?? projects[0]
  if (!project) throw new Error("missing_kimi_project")
  return parseKimiOpenGatewayModels(
    await fetchKimiConsolePath(
      request,
      `/api/v1/organizations/${encodeURIComponent(organizationId)}` +
        `/projects/${encodeURIComponent(project.id)}/open-gateway/models`,
    ),
  )
}

/** Reads balance and today's spend for an account refresh. */
export async function fetchKimiAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
  if (!deployment) throw new Error("unknown_kimi_deployment")
  const accessToken = request.auth.accessToken?.trim() ?? ""
  const usingApiKey =
    accessToken.startsWith("sk-") && !readKimiAuthState(request)
  let available = 0
  let today = 0
  if (usingApiKey) {
    available = parseKimiInferenceBalance(
      await fetchKimiInference(request, "/v1/users/me/balance", accessToken),
    )
  } else {
    const organizationId = await resolveKimiOrganizationId(request)
    const account = parseKimiAccountInfo(
      await fetchKimiConsole(request, "organizationAccountInfo", {
        query: { oid: organizationId },
      }),
    )
    available = account.cur
    today = account.today_consume
  }
  return {
    quota: toQuota(request, available),
    today_quota_consumption: toQuota(request, today),
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    todayStatsAvailability: {
      consumption: usingApiKey ? UNSUPPORTED : COMPLETE,
      requests: UNSUPPORTED,
      tokens: UNSUPPORTED,
      income: UNSUPPORTED,
    },
    checkIn: request.checkIn,
  }
}
