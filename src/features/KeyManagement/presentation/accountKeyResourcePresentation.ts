import type { TFunction } from "i18next"

import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import type { AccountKeyResourceFacts } from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { formatKeyTime, formatLocaleDateTime } from "~/utils/core/formatters"

import type { AccountKeyResourceCardAdapter } from "./accountKeyResourceCardAdapter"
import type { KeyResourceFact } from "./keyResourceCard"
import { openRouterKeyResourceCardAdapter } from "./openRouterKeyResourceCard"

/** Common facts remain usable without interpreting an unregistered provider's fields. */
const genericKeyResourceCardAdapter: AccountKeyResourceCardAdapter = {
  buildPresentation(row, t, { hasAssociatedSecret }) {
    const availability = hasAssociatedSecret
      ? INVENTORY_SECRET_AVAILABILITIES.Recoverable
      : getSiteTypeCapabilities(row.facts.ref.siteType).account
          ?.keyResourceManagement?.inventorySecretAvailability ??
        INVENTORY_SECRET_AVAILABILITIES.Unavailable
    const status = row.facts.status
    const contextFact = {
      id: "scope",
      label: t("keyManagement:native.scope.heading"),
      value: row.scopeName,
    }
    return {
      id: row.rowKey,
      title: row.facts.displayName,
      accountLabel: row.accountName,
      status:
        status === "enabled"
          ? "active"
          : status === "unknown"
            ? "unknown"
            : "inactive",
      statusLabel:
        status === "enabled"
          ? t("keyManagement:native.status.enabled")
          : status === "disabled"
            ? t("keyManagement:native.status.disabled")
            : status === "expired"
              ? t("keyManagement:native.status.expired")
              : t("keyManagement:native.status.unknown"),
      secretAvailability: availability,
      maskedLabel: row.facts.maskedLabel,
      ...(availability === INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly
        ? {
            secretAvailabilityMessage: t(
              "keyManagement:keyDetails.createResponseOnlySecret",
            ),
          }
        : {}),
      contextFact,
      summaryFacts: [contextFact],
      detailFacts: [],
      actions: {
        copySecret: hasAssociatedSecret,
        revealSecret: hasAssociatedSecret,
        verifySecret: hasAssociatedSecret,
        exportSecret: hasAssociatedSecret,
        edit: row.facts.actions.canUpdate,
        delete: row.facts.actions.canDelete,
        batchSelect: false,
      },
    }
  },
  // Provider-specific labels and formatting must be explicitly registered.
  buildDetailFacts: () => [],
  getDetailsLoadFailedMessage: (t) =>
    t("keyManagement:native.detailsLoadFailed"),
}

const cardAdapters = new Map<string, AccountKeyResourceCardAdapter>([
  [SITE_TYPES.OPENROUTER, openRouterKeyResourceCardAdapter],
])

/** Format only fields declared by the explicitly supported native providers. */
const nativeDetailFacts = (
  facts: AccountKeyResourceFacts,
  t: TFunction,
): KeyResourceFact[] => {
  const siteType = facts.ref.siteType
  const byId = new Map(facts.fields.map((field) => [field.fieldId, field]))
  const unlimited = [
    "unlimitedQuota",
    "unlimited_quota",
    "boundlessAmount",
  ].some((id) => {
    const fact = byId.get(id)
    return fact?.kind === "boolean" && fact.value
  })
  const rawQuotaUnits =
    getSiteTypeCapabilities(siteType).family ===
      ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily ||
    siteType === SITE_TYPES.AIHUBMIX
  const money = (value: number) =>
    `$${(value / (rawQuotaUnits ? UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR : 1)).toLocaleString(undefined, { maximumFractionDigits: 6 })}`
  const details: KeyResourceFact[] = []
  for (const field of facts.fields) {
    const remaining = [
      "remainingQuota",
      "remain_quota",
      "remainingQuotaUsd",
      "amount",
    ].includes(field.fieldId)
    const used = ["usedQuota", "used_quota", "quota_used", "used"].includes(
      field.fieldId,
    )
    if (
      field.kind === "number" &&
      (remaining || used || field.fieldId === "quota")
    ) {
      details.push({
        id: field.fieldId,
        label: remaining
          ? t("keyManagement:keyDetails.remainingQuota")
          : used
            ? t("keyManagement:keyDetails.usedQuota")
            : t("keyManagement:native.editor.totalQuotaUsd"),
        value:
          unlimited && !used
            ? t("keyManagement:dialog.unlimitedQuota")
            : money(field.value),
      })
    } else if (
      ["expired_time", "expires_at", "expireTime"].includes(field.fieldId) &&
      (field.kind === "number" || field.kind === "text")
    ) {
      const value =
        typeof field.value === "number"
          ? field.value
          : field.value
            ? Date.parse(field.value)
            : -1
      details.push({
        id: field.fieldId,
        label: t("keyManagement:keyDetails.expireTime"),
        value: formatKeyTime(value),
      })
    } else if (
      field.fieldId === "accessed_time" &&
      field.kind === "number" &&
      field.value > 0
    ) {
      details.push({
        id: field.fieldId,
        label: t("keyManagement:keyDetails.lastUsedTime"),
        value: formatLocaleDateTime(
          field.value,
          t("common:labels.notAvailable"),
        ),
      })
    } else if (
      ["models", "allow_ips", "ip_whitelist", "subnet"].includes(
        field.fieldId,
      ) &&
      (field.kind === "text" || field.kind === "list")
    ) {
      const value =
        typeof field.value === "string" ? field.value : field.value.join(", ")
      if (value)
        details.push({
          id: field.fieldId,
          label:
            field.fieldId === "models"
              ? t("keyManagement:keyDetails.models")
              : field.fieldId === "subnet"
                ? t("keyManagement:dialog.subnetLimits")
                : t("keyManagement:keyDetails.ipLimits"),
          value,
        })
    }
  }
  if (facts.runtimeKey?.createdAt)
    details.push({
      id: "createdAt",
      label: t("keyManagement:keyDetails.createTime"),
      value: formatLocaleDateTime(
        facts.runtimeKey.createdAt,
        t("common:labels.notAvailable"),
      ),
    })
  if (facts.runtimeKey?.notes)
    details.push({
      id: "note",
      label: t("keyManagement:keyDetails.note"),
      value: facts.runtimeKey.notes,
    })
  return details
}

const nativeKeyResourceCardAdapter: AccountKeyResourceCardAdapter = {
  buildPresentation(row, t, options) {
    const base = genericKeyResourceCardAdapter.buildPresentation(
      row,
      t,
      options,
    )
    const usableSecret =
      options.hasAssociatedSecret ||
      base.secretAvailability === INVENTORY_SECRET_AVAILABILITIES.Recoverable
    const group = row.facts.fields.find(
      (field) => field.fieldId === "group" || field.fieldId === "groups",
    )
    const groupValue =
      group?.kind === "text"
        ? group.value
        : group?.kind === "list"
          ? group.value.join(", ")
          : ""
    const contextFact = group
      ? {
          id: "group",
          label: t("keyManagement:keyDetails.group"),
          value:
            groupValue ||
            (getSiteTypeCapabilities(row.facts.ref.siteType).family ===
            ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
              ? t("keyManagement:keyDetails.followsAccountGroup")
              : t("keyManagement:keyDetails.ungrouped")),
        }
      : undefined
    const details = nativeDetailFacts(row.facts, t)
    return {
      ...base,
      contextFact,
      summaryFacts: details.length
        ? details.slice(0, 4)
        : contextFact
          ? [contextFact]
          : [],
      detailFacts: details,
      actions: {
        ...base.actions,
        copySecret: usableSecret,
        revealSecret: usableSecret,
        verifySecret: usableSecret,
        exportSecret: usableSecret,
        batchSelect: usableSecret,
      },
    }
  },
  buildDetailFacts: nativeDetailFacts,
  getDetailsLoadFailedMessage: (t) =>
    t("keyManagement:native.detailsLoadFailed"),
}

const nativeCardFamilies = new Set<string>([
  ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
  ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
  ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
  ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
])

/** Resolves presentation independently of whether a provider implements native CRUD. */
export function getAccountKeyResourceCardAdapter(siteType: string) {
  const registered = cardAdapters.get(siteType)
  if (registered) return registered
  const family = getAccountSiteDefinition(siteType)?.adapterFamily
  return family && nativeCardFamilies.has(family)
    ? nativeKeyResourceCardAdapter
    : genericKeyResourceCardAdapter
}

/**
 * A sole account scope is implicit; OpenRouter keeps workspace context visible
 * even when its inventory is loading or only its default workspace is available.
 */
export function shouldShowAccountKeyScopeSelector(
  siteType: string | undefined,
  scopeCount: number,
) {
  return siteType === SITE_TYPES.OPENROUTER || scopeCount > 1
}

/** Workspace terminology belongs to OpenRouter; other scopes use neutral copy. */
export function getAccountKeyScopeMessages(
  siteType: string | undefined,
  t: TFunction,
) {
  if (siteType === SITE_TYPES.OPENROUTER) {
    return {
      heading: t("keyManagement:openRouter.workspace.heading"),
      label: t("keyManagement:openRouter.workspace.label"),
      empty: t("keyManagement:openRouter.workspace.empty"),
      error: t("keyManagement:openRouter.workspace.error"),
      errorHelp: t("keyManagement:openRouter.workspace.errorHelp"),
      loading: t("keyManagement:openRouter.workspace.loading"),
      partial: t("keyManagement:openRouter.workspace.partial"),
      placeholder: t("keyManagement:openRouter.workspace.placeholder"),
      retry: t("keyManagement:openRouter.workspace.retry"),
    }
  }
  return {
    heading: t("keyManagement:native.scope.heading"),
    label: t("keyManagement:native.scope.label"),
    empty: t("keyManagement:native.scope.empty"),
    error: t("keyManagement:native.scope.error"),
    errorHelp: t("keyManagement:native.scope.errorHelp"),
    loading: t("keyManagement:native.scope.loading"),
    partial: t("keyManagement:native.scope.partial"),
    placeholder: t("keyManagement:native.scope.placeholder"),
    retry: t("keyManagement:native.scope.retry"),
  }
}
