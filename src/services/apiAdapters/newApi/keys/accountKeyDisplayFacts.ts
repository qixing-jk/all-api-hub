import { SITE_TYPES } from "~/constants/siteType"
import { readEdgeKeyMask } from "~/services/accountTokens/keyMaskEvidence"
import {
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
} from "~/services/amounts/financialConstants"
import {
  keyBudgetFact,
  keyRestrictionScope,
} from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import type {
  AccountKeyFactContext,
  AccountKeyResourceProviderFacts,
} from "~/services/apiAdapters/accountKeyResources/definition"
import {
  keyExpiryDisplayFact,
  keyLastUsedDisplayFacts,
  keyProvisioningCoverage,
} from "~/services/apiAdapters/accountKeyResources/displayFacts"
import {
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_RESTRICTION_ROLES,
  type ACCOUNT_KEY_PROVISIONING_COVERAGE,
  type AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { projectTokenCreatedAt } from "~/services/apiAdapters/newApi/keys/tokenCreatedAt"
import { projectNewApiTokenModelAccess } from "~/services/apiAdapters/newApi/keys/tokenModelAccess"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { maskSecretForDisplay } from "~/utils/core/formatters"

const tokenStatus = (token: NewApiToken): AccountKeyResourceFacts["status"] => {
  if (token.expired_time !== -1) {
    if (!Number.isSafeInteger(token.expired_time) || token.expired_time < 0) {
      return "unknown"
    }
    if (token.expired_time <= Math.floor(Date.now() / 1000)) return "expired"
  }
  if (token.status === 1) return "enabled"
  if (token.status === 2) return "disabled"
  return "unknown"
}

export const tokenCoverage = (
  token: NewApiToken,
): (typeof ACCOUNT_KEY_PROVISIONING_COVERAGE)[keyof typeof ACCOUNT_KEY_PROVISIONING_COVERAGE] => {
  return keyProvisioningCoverage(tokenStatus(token))
}

export const toFacts = (
  token: NewApiToken,
  ref: AccountKeyResourceFacts["ref"],
  context: AccountKeyFactContext,
): AccountKeyResourceProviderFacts => ({
  ref,
  displayName: token.name?.trim() || `Token ${token.id}`,
  maskedLabel: maskSecretForDisplay(token.key ?? ""),
  runtimeSecret: token.key,
  // Source: QuantumNous/new-api model/token.go:MaskTokenKey. Other family
  // variants do not inherit this evidence without their own confirmed contract.
  ...(ref.siteType === SITE_TYPES.NEW_API
    ? {
        keyMask: readEdgeKeyMask(token.key),
      }
    : {}),
  status: tokenStatus(token),
  runtimeKey: {
    modelAccess: projectNewApiTokenModelAccess(token),
    legacyTokenId: token.id,
    createdAt: projectTokenCreatedAt(token),
    notes: token.note,
  },
  displayFacts: [
    keyBudgetFact(ref, context, {
      fieldId: "remainingQuota",
      operation: "token",
      asset: newApiFinancialAmount(
        token.remain_quota,
        context.authority,
        ref.siteType,
      ).asset,
      limitState: token.unlimited_quota
        ? BUDGET_LIMIT_STATES.Unlimited
        : BUDGET_LIMIT_STATES.Finite,
      remaining: newApiFinancialAmount(
        token.remain_quota,
        context.authority,
        ref.siteType,
      ).value,
      used: newApiFinancialAmount(
        token.used_quota,
        context.authority,
        ref.siteType,
      ).value,
      scope: keyRestrictionScope({
        models: projectNewApiTokenModelAccess(token).allowedModelIds,
        groups: token.group?.trim() ? [token.group.trim()] : undefined,
      }),
      window: { kind: BUDGET_WINDOW_KINDS.Lifetime },
    }),
    keyExpiryDisplayFact("expired_time", token.expired_time),
    ...keyLastUsedDisplayFacts(token.accessed_time),
    {
      fieldId: "group",
      kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Group,
      value: token.group?.trim() || "",
      emptyValue: "account-group",
    },
    {
      fieldId: "models",
      kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Restriction,
      role: ACCOUNT_KEY_RESTRICTION_ROLES.Models,
      value: projectNewApiTokenModelAccess(token).allowedModelIds ?? [],
    },
    {
      fieldId: "allow_ips",
      kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Restriction,
      role: ACCOUNT_KEY_RESTRICTION_ROLES.Ip,
      value: token.allow_ips ?? "",
    },
  ],
  fields: [
    { fieldId: "group", kind: "text", value: token.group?.trim() || "" },
    { fieldId: "expired_time", kind: "number", value: token.expired_time },
    ...(Number.isFinite(token.accessed_time) && token.accessed_time > 0
      ? [
          {
            fieldId: "accessed_time",
            kind: "number" as const,
            value: token.accessed_time,
          },
        ]
      : []),
    {
      fieldId: "models",
      kind: "list",
      value: projectNewApiTokenModelAccess(token).allowedModelIds ?? [],
    },
    { fieldId: "allow_ips", kind: "text", value: token.allow_ips ?? "" },
  ],
  searchValues: [
    String(token.id),
    token.name ?? "",
    maskSecretForDisplay(token.key ?? ""),
    token.group ?? "",
  ],
  actions: { canUpdate: true, canDelete: true },
})
