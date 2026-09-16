import type { ModelListSourceInfo } from "~/services/modelList/pricingModel"

export const MODEL_LIST_SOURCE_IDENTITY_KINDS = {
  ACCOUNT: "account",
  ACCOUNT_TOKEN: "account-token",
  ACCOUNT_RUNTIME_KEY: "account-runtime-key",
  PERSONALIZED_CATALOG: "personalized-catalog",
  PROVIDER_CATALOG: "provider-catalog",
} as const

export type ModelListSourceIdentity =
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT
      id: string
    }
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN
      id: string
      tokenId: number
      tokenName?: string
    }
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY
      id: string
      runtimeKeyId: string
      runtimeKeyName?: string
    }
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.PERSONALIZED_CATALOG
      id: string
      accountId: string
    }
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.PROVIDER_CATALOG
      id: string
      provider: NonNullable<ModelListSourceInfo["provider"]>
      providerName: string
    }

/** Creates the default account-scoped source identity for model-list rows. */
export function createAccountModelListSourceIdentity(
  accountId: string,
): ModelListSourceIdentity {
  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT,
    id: accountId,
  }
}

/** Creates a token-scoped account source identity for model-list rows. */
export function createAccountTokenModelListSourceIdentity(params: {
  accountId: string
  tokenId: number
  tokenName?: string
}): ModelListSourceIdentity {
  const tokenName = params.tokenName?.trim()

  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_TOKEN,
    id: `${params.accountId}:token:${params.tokenId}`,
    tokenId: params.tokenId,
    ...(tokenName ? { tokenName } : {}),
  }
}

/** Creates a runtime-key-scoped account source identity for model-list rows. */
export function createAccountRuntimeKeyModelListSourceIdentity(params: {
  accountId: string
  runtimeKeyId: string
  runtimeKeyName?: string
}): ModelListSourceIdentity {
  const runtimeKeyName = params.runtimeKeyName?.trim()

  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
    id: `${params.accountId}:runtime-key:${params.runtimeKeyId}`,
    runtimeKeyId: params.runtimeKeyId,
    ...(runtimeKeyName ? { runtimeKeyName } : {}),
  }
}

/** Creates a provider-wide identity shared by every account using one catalog. */
export function createProviderCatalogModelListSourceIdentity(params: {
  sourceId: string
  provider: NonNullable<ModelListSourceInfo["provider"]>
  providerName: string
}): ModelListSourceIdentity {
  const providerName = params.providerName.trim() || params.sourceId

  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.PROVIDER_CATALOG,
    id: `provider-catalog:${params.sourceId}`,
    provider: params.provider,
    providerName,
  }
}

/** Creates an account-isolated identity for a personalized provider catalog. */
export function createPersonalizedCatalogModelListSourceIdentity(
  accountId: string,
): ModelListSourceIdentity {
  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.PERSONALIZED_CATALOG,
    id: `personalized-catalog:${accountId}`,
    accountId,
  }
}
