import type { AccountKeyCreationResult } from "~/services/accounts/keys/accountKeyCreation"
import {
  buildAccountKeyResourceRuntimeKey,
  buildAccountKeyResourceRuntimeKeyId,
} from "~/services/accounts/keys/accountRuntimeKeys"
import {
  ASSET_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
} from "~/services/amounts/financialConstants"
import { keyBudgetFact } from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import {
  keyExpiryDisplayFact,
  keyLastUsedDisplayFacts,
} from "~/services/apiAdapters/accountKeyResources/displayFacts"
import type { AccountKeyResourceFacts } from "~/services/apiAdapters/contracts/accountKeyResource"
import { projectTokenCreatedAt } from "~/services/apiAdapters/newApi/keys/tokenCreatedAt"
import { projectNewApiTokenModelAccess } from "~/services/apiAdapters/newApi/keys/tokenModelAccess"
import { newApiQuotaAsset } from "~/services/apiService/newApiFamily/quotaAsset"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import { buildNewApiToken } from "./newApiToken"

type Account = Parameters<typeof buildAccountKeyResourceRuntimeKey>[0]

/** A New API wire fixture projected into the native account-resource identity. */
export function buildNewApiKeyFacts<T extends NewApiToken>(
  account: Account,
  tokenInput: T,
): AccountKeyResourceFacts {
  // Export and action tests can supply only the token fields they exercise.
  const token = buildNewApiToken(tokenInput)
  return {
    ref: {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: "account",
      resourceId: String(token.id),
    },
    displayName: token.name,
    maskedLabel: maskSecretForDisplay(
      typeof token.key === "string" ? token.key : "",
    ),
    status:
      token.status === 1
        ? "enabled"
        : token.status === 2
          ? "disabled"
          : "unknown",
    runtimeKey: {
      modelAccess: projectNewApiTokenModelAccess(token),
      legacyTokenId: token.id,
      createdAt: projectTokenCreatedAt(token),
      notes: token.note,
    },
    displayFacts: [
      keyBudgetFact(
        {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: "account",
          resourceId: String(token.id),
        },
        { authority: "https://fixture.example", observedAt: 1 },
        {
          fieldId: "remainingQuota",
          operation: "token",
          asset: {
            kind: ASSET_KINDS.Quota,
            ...newApiQuotaAsset("https://fixture.example"),
          },
          limitState: token.unlimited_quota
            ? BUDGET_LIMIT_STATES.Unlimited
            : BUDGET_LIMIT_STATES.Finite,
          remaining: token.remain_quota,
          used: token.used_quota,
          window: { kind: BUDGET_WINDOW_KINDS.Lifetime },
        },
      ),
      keyExpiryDisplayFact("expired_time", token.expired_time),
      ...keyLastUsedDisplayFacts(token.accessed_time),
    ],
    fields: [
      { fieldId: "group", kind: "text", value: token.group ?? "" },
      {
        fieldId: "unlimitedQuota",
        kind: "boolean",
        value: token.unlimited_quota,
      },
      { fieldId: "remainingQuota", kind: "number", value: token.remain_quota },
      { fieldId: "usedQuota", kind: "number", value: token.used_quota },
      { fieldId: "expired_time", kind: "number", value: token.expired_time },
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}

export function buildNewApiRuntimeKey<T extends NewApiToken>(
  account: Account,
  token: T,
) {
  const facts = buildNewApiKeyFacts(account, token)
  return buildAccountKeyResourceRuntimeKey(account, {
    ...facts.runtimeKey,
    ref: facts.ref,
    label: facts.displayName,
    secret: token.key,
    status:
      token.status === 1
        ? "active"
        : token.status === 2
          ? "inactive"
          : "unknown",
  })
}

export function buildNewApiRuntimeKeyId(accountId: string, tokenId: number) {
  return buildAccountKeyResourceRuntimeKeyId({
    accountId,
    siteType: "new-api",
    scopeKey: "account",
    resourceId: String(tokenId),
  })
}

export function buildNewApiKeyCreationResult<T extends NewApiToken>(
  account: Account,
  token: T,
): AccountKeyCreationResult {
  const facts = buildNewApiKeyFacts(account, token)
  return { ref: facts.ref, facts }
}
