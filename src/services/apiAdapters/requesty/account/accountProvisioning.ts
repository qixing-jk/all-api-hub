import { createAccountConnectionLabel } from "~/constants/accountConnectionLabel"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { REQUESTY_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { tempWindowRequestyManagementKeyAction } from "~/services/apiAdapters/requesty/keys/managementKeyActionClient"
import {
  normalizeRequestyManagementKeyName,
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  REQUESTY_PROVISIONING_STATES,
  type RequestyProvisioningFailureReason,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"
import { fetchRequestySelfKeyInfo } from "~/services/apiService/requesty"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { safeRandomUUID } from "~/utils/core/identifier"

/** How long a freshly created key is validated before it is offered to the form. */
const REQUESTY_PROVISIONING_VALIDATION_TIMEOUT_MS = 20_000

export const REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES = {
  Created: "created",
  Unavailable: "unavailable",
} as const

export type RequestyManagementKeyProvisioningResult =
  | {
      status: typeof REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES.Created
      accessToken: string
      keyId: string
      name: string
      /** Identity resolved from the credential itself. */
      username: string
      exchangeRate: number
    }
  | {
      status: typeof REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES.Unavailable
      /** Why the automatic path could not produce a key; the form falls back. */
      reason: RequestyProvisioningFailureReason
      /**
       * True when the create may have reached the provider. The caller must not
       * claim nothing was created; the console list is the source of truth.
       */
      possiblyCreated: boolean
      name: string
    }

/**
 * Creates a Requesty manage key inside the console page and validates it.
 *
 * Requesty's console authenticates the management host with a short-lived
 * Clerk JWT that never reaches the extension, so the create must run in the
 * console tab. Every failure returns a machine-readable reason instead of
 * throwing, so the caller can fall back to the manual guidance path.
 */
export async function provisionRequestyManagementKey(params: {
  name?: string
  suppressMinimize?: boolean
  protectionBypassExecution?: ProtectionBypassExecution
  onCredentialCreated?: (credential: string) => void
}): Promise<RequestyManagementKeyProvisioningResult> {
  const requestId = safeRandomUUID()
  const name = normalizeRequestyManagementKeyName(
    params.name ?? createAccountConnectionLabel(requestId),
  )

  let result
  try {
    const create = (protectionBypassExecution: ProtectionBypassExecution) =>
      tempWindowRequestyManagementKeyAction({
        requestId,
        name,
        suppressMinimize: params.suppressMinimize,
        protectionBypassExecution,
      })
    result = params.protectionBypassExecution
      ? await create(params.protectionBypassExecution)
      : await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
          PROTECTION_BYPASS_SURFACES.Options,
          create,
        )
  } catch {
    return {
      status: REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES.Unavailable,
      reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
      possiblyCreated: true,
      name,
    }
  }

  if (result.state !== REQUESTY_PROVISIONING_STATES.Created) {
    return {
      status: REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES.Unavailable,
      reason: result.reason,
      possiblyCreated:
        result.state === REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
      name,
    }
  }

  // Retain one-time plaintext for manual recovery before validation. Only a
  // verified credential may complete automatic onboarding.
  params.onCredentialCreated?.(result.accessToken)
  const controller = new AbortController()
  const deadline = setTimeout(
    () => controller.abort(),
    REQUESTY_PROVISIONING_VALIDATION_TIMEOUT_MS,
  )
  try {
    const info = await fetchRequestySelfKeyInfo({
      baseUrl: REQUESTY_WEB_ORIGIN,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: result.accessToken,
      },
      abortSignal: controller.signal,
    })
    return {
      status: REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES.Created,
      accessToken: result.accessToken,
      keyId: result.keyId,
      name: result.name,
      username: info.orgName,
      exchangeRate: DEFAULT_USD_TO_CNY_RATE,
    }
  } catch {
    return {
      status: REQUESTY_MANAGEMENT_KEY_PROVISIONING_STATUSES.Unavailable,
      reason: REQUESTY_PROVISIONING_FAILURE_REASONS.CreateRejected,
      possiblyCreated: true,
      name: result.name,
    }
  } finally {
    clearTimeout(deadline)
  }
}
