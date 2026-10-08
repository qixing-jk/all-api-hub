import { QUOTA_PER_USD } from "~/constants/money"
import {
  keyExpiryDisplayFact,
  keyLastUsedDisplayFacts,
} from "~/services/apiAdapters/accountKeyResources/displayFacts"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  type AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { projectTokenCreatedAt } from "~/services/apiAdapters/newApi/keys/tokenCreatedAt"
import { projectNewApiTokenModelAccess } from "~/services/apiAdapters/newApi/keys/tokenModelAccess"
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
  const status = tokenStatus(token)
  if (status === "enabled") return ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable
  if (status === "disabled" || status === "expired") {
    return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable
  }
  return ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown
}

export const toFacts = (
  token: NewApiToken,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => ({
  ref,
  displayName: token.name?.trim() || `Token ${token.id}`,
  maskedLabel: maskSecretForDisplay(token.key ?? ""),
  status: tokenStatus(token),
  runtimeKey: {
    modelAccess: projectNewApiTokenModelAccess(token),
    legacyTokenId: token.id,
    createdAt: projectTokenCreatedAt(token),
    notes: token.note,
  },
  displayFacts: [
    {
      fieldId: "remainingQuota",
      kind: "money",
      role: "remaining",
      amountUsd: token.remain_quota / QUOTA_PER_USD,
      unlimited: token.unlimited_quota,
    },
    {
      fieldId: "usedQuota",
      kind: "money",
      role: "used",
      amountUsd: token.used_quota / QUOTA_PER_USD,
    },
    keyExpiryDisplayFact("expired_time", token.expired_time),
    ...keyLastUsedDisplayFacts(token.accessed_time),
    {
      fieldId: "group",
      kind: "group",
      value: token.group?.trim() || "",
      emptyValue: "account-group",
    },
    {
      fieldId: "models",
      kind: "restriction",
      role: "models",
      value: projectNewApiTokenModelAccess(token).allowedModelIds ?? [],
    },
    {
      fieldId: "allow_ips",
      kind: "restriction",
      role: "ip",
      value: token.allow_ips ?? "",
    },
  ],
  fields: [
    { fieldId: "group", kind: "text", value: token.group?.trim() || "" },
    {
      fieldId: "unlimitedQuota",
      kind: "boolean",
      value: token.unlimited_quota,
    },
    {
      fieldId: "remainingQuota",
      kind: "number",
      value: token.remain_quota,
    },
    { fieldId: "usedQuota", kind: "number", value: token.used_quota },
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
