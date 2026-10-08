import { type AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"
import { type NewApiAccountKeyResourceConfig } from "~/services/apiAdapters/newApi/keys/accountKeyResourceConfig"

export const ACCOUNT_SCOPE_KEY = "account"

export const requireTokenId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error("invalid_token_id")
  }
  return value as number
}

export const encodeTokenId = (tokenId: number): string =>
  String(requireTokenId(tokenId))

export const decodeTokenId = (resourceId: string): number => {
  if (!/^[1-9]\d*$/.test(resourceId)) throw new Error("invalid_token_id")
  return requireTokenId(Number(resourceId))
}

export const createRef = (
  config: NewApiAccountKeyResourceConfig,
  tokenId: number,
): AccountKeyResourceRef => ({
  accountId: config.account.id,
  siteType: config.account.siteType,
  scopeKey: ACCOUNT_SCOPE_KEY,
  resourceId: encodeTokenId(tokenId),
})
