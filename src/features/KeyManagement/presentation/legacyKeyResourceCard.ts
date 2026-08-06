import type { TFunction } from "i18next"

import {
  ACCOUNT_RUNTIME_KEY_STATUSES,
  type AccountTokenRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  getInventorySecretAvailability,
  INVENTORY_GROUP_KINDS,
  INVENTORY_SECRET_AVAILABILITIES,
  type InventoryGroupState,
  type InventorySecretAvailability,
  type KeyManagementCapability,
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

const getKeyManagement = (runtimeKey: AccountTokenRuntimeKey) =>
  getSiteTypeCapabilities(runtimeKey.siteType).account?.keyManagement

const getSecretAvailability = (
  keyManagement: KeyManagementCapability | undefined,
) => {
  return getInventorySecretAvailability(
    keyManagement ?? {
      inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Unavailable,
    },
  )
}

const getInventoryGroup = (
  runtimeKey: AccountTokenRuntimeKey,
  keyManagement: KeyManagementCapability | undefined,
): InventoryGroupState => {
  const inventoryGroup = keyManagement?.inventoryGroup

  return (
    inventoryGroup?.resolve(runtimeKey.token) ?? {
      kind: INVENTORY_GROUP_KINDS.Unknown,
    }
  )
}

const getActionPolicy = (
  runtimeKey: AccountTokenRuntimeKey,
  secretAvailability = getSecretAvailability(getKeyManagement(runtimeKey)),
): KeyResourceActionPolicy => {
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

const getGroupFact = (
  runtimeKey: AccountTokenRuntimeKey,
  t: TFunction,
  keyManagement = getKeyManagement(runtimeKey),
): KeyResourceFact | undefined => {
  const group = getInventoryGroup(runtimeKey, keyManagement)
  const label = t("keyManagement:keyDetails.group")

  switch (group.kind) {
    case INVENTORY_GROUP_KINDS.Named:
      return createFact("group", label, group.name)
    case INVENTORY_GROUP_KINDS.FollowsAccount:
      return createFact(
        "group",
        label,
        t("keyManagement:keyDetails.followsAccountGroup"),
      )
    case INVENTORY_GROUP_KINDS.Ungrouped:
      return createFact("group", label, t("keyManagement:keyDetails.ungrouped"))
    case INVENTORY_GROUP_KINDS.Unavailable:
      return createFact("group", label, t("common:labels.notAvailable"))
    default:
      return undefined
  }
}

export const isKeyResourceBatchSelectable = (
  runtimeKey: AccountTokenRuntimeKey,
) => getActionPolicy(runtimeKey).batchSelect

export const isKeyResourceExportable = (runtimeKey: AccountTokenRuntimeKey) =>
  getActionPolicy(runtimeKey).exportSecret

export const buildLegacyKeyResourceCardPresentation = (
  runtimeKey: AccountTokenRuntimeKey,
  t: TFunction,
): KeyResourceCardPresentation => {
  const { token } = runtimeKey
  const keyManagement = getKeyManagement(runtimeKey)
  const secretAvailability = getSecretAvailability(keyManagement)
  const modelRestrictions =
    token.model_limits_enabled === true ? token.model_limits : token.models
  const isUnlimitedQuota = token.unlimited_quota || token.remain_quota < 0
  const contextFact = getGroupFact(runtimeKey, t, keyManagement)
  const detailFacts = [
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
    createFact(
      "created-at",
      t("keyManagement:keyDetails.createTime"),
      formatLocaleDateTime(token.created_time, t("common:labels.notAvailable")),
    ),
    getOptionalFact("note", t("keyManagement:keyDetails.note"), token.note),
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
    contextFact,
    summaryFacts: [
      contextFact,
      createFact(
        "used-quota",
        t("keyManagement:keyDetails.usedQuota"),
        formatUsedQuota(token),
      ),
      createFact(
        "remaining-quota",
        t("keyManagement:keyDetails.remainingQuota"),
        formatQuota(token.remain_quota, isUnlimitedQuota),
      ),
      createFact(
        "expires-at",
        t("keyManagement:keyDetails.expireTime"),
        formatKeyTime(token.expired_time),
      ),
    ].filter((fact): fact is KeyResourceFact => fact !== undefined),
    detailFacts,
    actions: getActionPolicy(runtimeKey, secretAvailability),
  }
}
