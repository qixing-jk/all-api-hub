import {
  MODEL_LIST_SOURCE_IDENTITY_KINDS,
  type ModelListSourceIdentity,
} from "~/services/modelCatalog/sourceIdentity"

/** Builds legacy token identities to keep compatibility consumers covered. */
export function createLegacyAccountTokenSourceIdentity(params: {
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
