import { validateApiTokenInventory } from "~/services/accountTokens/apiTokenKey"
import { mapAccountKeyResourceFailure as mapFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  type AccountKeyResourceRef,
  type AccountRuntimeKeyResolution,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { decodeTokenId } from "~/services/apiAdapters/newApi/accountKeyIdentity"
import { type NewApiAccountKeyResourceConfig } from "~/services/apiAdapters/newApi/accountKeyResourceConfig"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const requestWithOptions = (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal
    ? { ...config.request, abortSignal: options.signal }
    : config.request

export const loadInheritedAccountGroup = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<string | null> => {
  try {
    return await config.transport.fetchCurrentUserGroup(
      requestWithOptions(config, options),
    )
  } catch {
    // Compatible forks may not expose the current user group. Keep the
    // placement unknown so reconciliation remains fail-closed.
    return null
  }
}

export const resolveRuntimeKey = async (
  config: NewApiAccountKeyResourceConfig,
  ref: AccountKeyResourceRef,
  options?: ResourceOperationOptions,
): Promise<AccountRuntimeKeyResolution> => {
  const tokenId = decodeTokenId(ref.resourceId)
  let token: NewApiToken | undefined
  try {
    // GetToken returns this token's key (masked on current New API, plaintext
    // on older compatible sites); only masked keys need the reveal transport.
    // https://github.com/QuantumNous/new-api/blob/main/controller/token.go
    token = await config.transport.fetchTokenById(
      requestWithOptions(config, options),
      tokenId,
    )
    if (token && token.id !== tokenId)
      throw new Error("token_identity_mismatch")
  } catch (error) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: mapFailure(error),
    }
  }
  if (!token) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    }
  }

  try {
    const secret = await config.transport.resolveApiTokenKey(
      requestWithOptions(config, options),
      token,
    )
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret,
    }
  } catch (error) {
    return {
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: mapFailure(error),
    }
  }
}

export const collectValidatedInventoryTokens = async (
  config: NewApiAccountKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<NewApiToken[]> =>
  validateApiTokenInventory(
    await config.transport.fetchAccountTokens(
      requestWithOptions(config, options),
    ),
  )

/** Reads selected-row settings through the bound variant, including identity checks. */
export const readEditableToken = (
  config: NewApiAccountKeyResourceConfig,
  listed: NewApiToken,
  options?: ResourceOperationOptions,
): Promise<NewApiToken> =>
  config.variant.readEditableToken(requestWithOptions(config, options), listed)
