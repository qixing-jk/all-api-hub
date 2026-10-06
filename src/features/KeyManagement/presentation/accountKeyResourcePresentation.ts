import type { TFunction } from "i18next"

import type { AccountKeyResourceFacts } from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import type { AccountKeyResourceCardAdapter } from "./accountKeyResourceCardAdapter"
import type { KeyResourceFact } from "./keyResourceCard"
import { getKeyResourcePresentationPolicy } from "./keyResourcePresentationPolicy"
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

const displayText = (value: string | readonly string[]) =>
  typeof value === "string" ? value : value.join(", ")

/** Format only semantics declared by the explicitly supported native providers. */
const nativeDetailFacts = (
  facts: AccountKeyResourceFacts,
  t: TFunction,
): KeyResourceFact[] => {
  const details: KeyResourceFact[] = []
  for (const fact of facts.displayFacts ?? []) {
    if (fact.kind === "money" || fact.kind === "credits") {
      details.push({
        id: fact.fieldId,
        label:
          fact.kind === "credits"
            ? t("keyManagement:native.editor.quotaCredits")
            : fact.role === "remaining"
              ? t("keyManagement:keyDetails.remainingQuota")
              : fact.role === "used"
                ? t("keyManagement:keyDetails.usedQuota")
                : t("keyManagement:native.editor.totalQuotaUsd"),
        value: fact.unlimited
          ? t("keyManagement:dialog.unlimitedQuota")
          : fact.kind === "money"
            ? `$${fact.amountUsd.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
            : fact.value.toLocaleString(),
      })
    } else if (fact.kind === "expiry") {
      const date =
        typeof fact.timestampMs === "number" ? new Date(fact.timestampMs) : null
      details.push({
        id: fact.fieldId,
        label: t("keyManagement:keyDetails.expireTime"),
        value:
          fact.timestampMs === "never"
            ? t("keyManagement:keyDetails.neverExpires")
            : date && Number.isFinite(date.getTime())
              ? date.toLocaleDateString()
              : t("common:labels.notAvailable"),
      })
    } else if (fact.kind === "last-used") {
      details.push({
        id: fact.fieldId,
        label: t("keyManagement:keyDetails.lastUsedTime"),
        value: formatLocaleDateTime(
          new Date(fact.timestampMs),
          t("common:labels.notAvailable"),
        ),
      })
    }
  }
  for (const fact of facts.displayFacts ?? []) {
    if (fact.kind === "restriction") {
      const value = displayText(fact.value)
      if (value)
        details.push({
          id: fact.fieldId,
          label:
            fact.role === "models"
              ? t("keyManagement:keyDetails.models")
              : fact.role === "subnet"
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
        new Date(facts.runtimeKey.createdAt),
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
    const group = row.facts.displayFacts?.find((fact) => fact.kind === "group")
    const contextFact = group
      ? {
          id: "group",
          label: t("keyManagement:keyDetails.group"),
          value:
            displayText(group.value) ||
            (group.emptyValue === "account-group"
              ? t("keyManagement:keyDetails.followsAccountGroup")
              : t("keyManagement:keyDetails.ungrouped")),
        }
      : undefined
    const details = nativeDetailFacts(row.facts, t)
    return {
      ...base,
      contextFact,
      summaryFacts: [...(contextFact ? [contextFact] : []), ...details].slice(
        0,
        4,
      ),
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

/** Resolves all card choices from the same policy as the editor and scope UI. */
export function getAccountKeyResourceCardAdapter(siteType: string) {
  const adapters = {
    native: nativeKeyResourceCardAdapter,
    openrouter: openRouterKeyResourceCardAdapter,
    generic: genericKeyResourceCardAdapter,
  }
  return adapters[getKeyResourcePresentationPolicy(siteType).card]
}

/**
 * A sole account scope is implicit; OpenRouter keeps workspace context visible
 * even when its inventory is loading or only its default workspace is available.
 */
export function shouldShowAccountKeyScopeSelector(
  siteType: string | undefined,
  scopeCount: number,
) {
  return (
    getKeyResourcePresentationPolicy(siteType).scope === "workspace" ||
    scopeCount > 1
  )
}

/** Workspace terminology belongs to OpenRouter; other scopes use neutral copy. */
export function getAccountKeyScopeMessages(
  siteType: string | undefined,
  t: TFunction,
) {
  if (getKeyResourcePresentationPolicy(siteType).scope === "workspace") {
    return {
      heading: t("keyManagement:openRouter.workspace.heading"),
      fallback: t("keyManagement:openRouter.workspace.fallback"),
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
    fallback: t("keyManagement:native.scope.fallback"),
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
