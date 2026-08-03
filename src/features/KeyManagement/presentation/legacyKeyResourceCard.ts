import type { TFunction } from "i18next"

import {
  ACCOUNT_RUNTIME_KEY_STATUSES,
  type AccountTokenRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
  type InventorySecretAvailability,
} from "~/services/apiAdapters/contracts/keyManagement"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  formatKeyTime,
  formatLocaleDateTime,
  formatUsedQuota,
} from "~/utils/core/formatters"

import { formatKey, formatQuota } from "../utils"
import type {
  KeyResourceActionPolicy,
  KeyResourceCardPresentation,
  KeyResourceFact,
} from "./keyResourceCard"

const getStatusLabel = (
  status: AccountTokenRuntimeKey["status"],
  t: TFunction,
) => {
  switch (status) {
    case ACCOUNT_RUNTIME_KEY_STATUSES.Active:
      return t("common:status.enabled")
    case ACCOUNT_RUNTIME_KEY_STATUSES.Inactive:
      return t("common:status.disabled")
    default:
      return t("common:labels.unknown")
  }
}

const getSecretAvailabilityMessage = (
  secretAvailability: InventorySecretAvailability,
  t: TFunction,
) => {
  switch (secretAvailability) {
    case INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly:
      return t("keyManagement:keyDetails.createResponseOnlySecret")
    case INVENTORY_SECRET_AVAILABILITIES.Unavailable:
      return t("keyManagement:keyDetails.secretUnavailable")
    default:
      return undefined
  }
}

const getSecretAvailability = (runtimeKey: AccountTokenRuntimeKey) => {
  const keyManagement = getSiteTypeCapabilities(runtimeKey.siteType).account
    ?.keyManagement

  return getInventorySecretAvailability(
    keyManagement ?? {
      inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Unavailable,
    },
  )
}

const getActionPolicy = (
  runtimeKey: AccountTokenRuntimeKey,
): KeyResourceActionPolicy => {
  const secretAvailability = getSecretAvailability(runtimeKey)
  const canRecoverStoredSecret =
    secretAvailability === INVENTORY_SECRET_AVAILABILITIES.Recoverable

  return {
    copySecret: canRecoverStoredSecret && runtimeKey.capabilities.copy,
    revealSecret: canRecoverStoredSecret && runtimeKey.capabilities.copy,
    verifySecret: canRecoverStoredSecret && runtimeKey.capabilities.verify,
    exportSecret: canRecoverStoredSecret && runtimeKey.capabilities.export,
    edit: runtimeKey.capabilities.updateToken,
    delete: runtimeKey.capabilities.deleteToken,
    batchSelect:
      canRecoverStoredSecret &&
      runtimeKey.capabilities.export &&
      runtimeKey.capabilities.verify,
  }
}

const createFact = (
  id: string,
  label: string,
  value: string,
): KeyResourceFact => ({
  id,
  label,
  value,
})

const getOptionalFact = (
  id: string,
  label: string,
  value: string | undefined,
) => {
  const normalizedValue = value?.trim()
  return normalizedValue ? createFact(id, label, normalizedValue) : undefined
}

export const isKeyResourceBatchSelectable = (
  runtimeKey: AccountTokenRuntimeKey,
) => getActionPolicy(runtimeKey).batchSelect

export const buildLegacyKeyResourceCardPresentation = (
  runtimeKey: AccountTokenRuntimeKey,
  t: TFunction,
): KeyResourceCardPresentation => {
  const { token } = runtimeKey
  const secretAvailability = getSecretAvailability(runtimeKey)
  const modelRestrictions =
    token.model_limits_enabled === true ? token.model_limits : token.models
  const isUnlimitedQuota = token.unlimited_quota || token.remain_quota < 0
  const detailFacts = [
    createFact(
      "created-at",
      t("keyManagement:keyDetails.createTime"),
      formatLocaleDateTime(token.created_time, t("common:labels.notAvailable")),
    ),
    createFact(
      "quota-policy",
      t("keyManagement:keyDetails.quotaPolicy"),
      isUnlimitedQuota
        ? t("keyManagement:dialog.unlimitedQuota")
        : t("keyManagement:keyDetails.limitedQuota"),
    ),
    token.accessed_time > 0
      ? createFact(
          "last-used-at",
          t("keyManagement:keyDetails.lastUsedTime"),
          formatLocaleDateTime(
            token.accessed_time,
            t("common:labels.notAvailable"),
          ),
        )
      : undefined,
    getOptionalFact("note", t("keyManagement:keyDetails.note"), token.note),
    getOptionalFact("group", t("keyManagement:keyDetails.group"), token.group),
    getOptionalFact(
      "models",
      t("keyManagement:keyDetails.models"),
      modelRestrictions,
    ),
    getOptionalFact(
      "ip-limits",
      t("keyManagement:keyDetails.ipLimits"),
      token.allow_ips,
    ),
  ].filter((fact): fact is KeyResourceFact => fact !== undefined)

  return {
    id: runtimeKey.id,
    title: runtimeKey.label,
    accountLabel: runtimeKey.accountName,
    status: runtimeKey.status,
    statusLabel: getStatusLabel(runtimeKey.status, t),
    secretAvailability,
    maskedLabel: runtimeKey.secret.trim()
      ? formatKey(runtimeKey.secret, runtimeKey.id, new Set())
      : undefined,
    secretAvailabilityMessage: getSecretAvailabilityMessage(
      secretAvailability,
      t,
    ),
    summaryFacts: [
      createFact(
        "remaining-quota",
        t("keyManagement:keyDetails.remainingQuota"),
        formatQuota(token.remain_quota, isUnlimitedQuota),
      ),
      createFact(
        "used-quota",
        t("keyManagement:keyDetails.usedQuota"),
        formatUsedQuota(token),
      ),
      createFact(
        "expires-at",
        t("keyManagement:keyDetails.expireTime"),
        formatKeyTime(token.expired_time),
      ),
    ],
    detailFacts,
    actions: getActionPolicy(runtimeKey),
  }
}
