import type { TFunction } from "i18next"

import { ACCOUNT_RUNTIME_KEY_STATUSES } from "~/services/accounts/keys/accountRuntimeKeys"
import { hasAccountKeyManagementPermission } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import {
  ACCOUNT_KEY_CREDENTIAL_ROLES,
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  type AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { formatQuotaAmount } from "~/services/quotaAssets/quotaAsset"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import type { AccountKeyResourceCardAdapter } from "./accountKeyResourceCardAdapter"
import type {
  KeyResourceActionPolicy,
  KeyResourceBadge,
  KeyResourceFact,
} from "./keyResourceCard"
import {
  KEY_RESOURCE_CARD_KINDS as cardKinds,
  getKeyResourcePresentationPolicy,
  KEY_RESOURCE_SCOPE_KINDS as scopeKinds,
} from "./keyResourcePresentationPolicy"
import { openRouterKeyResourceCardAdapter } from "./openRouterKeyResourceCard"

/** Highlights derived from provider-declared facts; raw fields never qualify. */
const keyBadges = (
  facts: AccountKeyResourceFacts,
  t: TFunction,
): KeyResourceBadge[] => {
  const manageGranted = hasAccountKeyManagementPermission(facts)
  const isAccountCredential =
    facts.credentialRole === ACCOUNT_KEY_CREDENTIAL_ROLES.Account
  const badges: KeyResourceBadge[] = []
  if (manageGranted) {
    badges.push({
      id: "manage-permission",
      label: isAccountCredential
        ? t("keyManagement:native.badges.accountManagePermission")
        : t("keyManagement:native.badges.managePermission"),
      variant: "warning",
      title: isAccountCredential
        ? t("keyManagement:native.permission.accountManageBadgeTitle")
        : t("keyManagement:native.permission.manageBadgeTitle"),
    })
  }
  if (isAccountCredential && !manageGranted) {
    badges.push({
      id: "account-credential",
      label: t("keyManagement:native.badges.accountCredential"),
      variant: "outline",
      title: t("keyManagement:native.credentialRole.badgeTitle"),
    })
  }
  return badges
}

/** Omit the field entirely so cards without highlights keep no empty array. */
const badgesProp = (badges: KeyResourceBadge[]) =>
  badges.length ? { badges } : {}

/**
 * Secret actions follow the credential's role, not only its secret source.
 *
 * The account's own credential is readable because the extension already stores
 * it. Export stays limited to inference keys: a management key can answer
 * completions, but exporting it would hand every client authority over the
 * organization's other credentials.
 */
const secretActionPolicy = (params: {
  hasAssociatedSecret: boolean
  recoverable: boolean
  accountCredential: boolean
  inferenceCapable: boolean
}): Omit<KeyResourceActionPolicy, "edit" | "delete"> => {
  const readable =
    params.hasAssociatedSecret || params.recoverable || params.accountCredential
  const exportable = readable && params.inferenceCapable
  return {
    copySecret: readable,
    revealSecret: readable,
    verifySecret: readable,
    exportSecret: exportable,
    batchSelect: exportable,
  }
}

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
        status === ACCOUNT_KEY_RESOURCE_STATUSES.Enabled
          ? ACCOUNT_RUNTIME_KEY_STATUSES.Active
          : status === ACCOUNT_KEY_RESOURCE_STATUSES.Unknown
            ? "unknown"
            : ACCOUNT_RUNTIME_KEY_STATUSES.Inactive,
      statusLabel:
        status === ACCOUNT_KEY_RESOURCE_STATUSES.Enabled
          ? t("keyManagement:native.status.enabled")
          : status === ACCOUNT_KEY_RESOURCE_STATUSES.Disabled
            ? t("keyManagement:native.status.disabled")
            : status === ACCOUNT_KEY_RESOURCE_STATUSES.Expired
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
      ...badgesProp(keyBadges(row.facts, t)),
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
    if (
      fact.kind === "money" ||
      fact.kind === "credits" ||
      fact.kind === "quota"
    ) {
      details.push({
        id: fact.fieldId,
        label:
          getKeyResourcePresentationPolicy(facts.ref.siteType).factLabels?.[
            fact.fieldId
          ]?.(t) ??
          (fact.kind === "credits"
            ? t("keyManagement:native.editor.quotaCredits")
            : fact.role === "remaining"
              ? t("keyManagement:keyDetails.remainingQuota")
              : fact.role === "used"
                ? t("keyManagement:keyDetails.usedQuota")
                : fact.kind === "quota"
                  ? t("keyManagement:keyDetails.totalQuota")
                  : t("keyManagement:native.editor.totalQuotaUsd")),
        value:
          fact.kind === "money" && fact.followsAccount
            ? t("keyManagement:native.editor.followsAccount")
            : fact.unlimited
              ? t("keyManagement:dialog.unlimitedQuota")
              : fact.kind === "money"
                ? `$${fact.amountUsd.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                : fact.kind === "quota"
                  ? formatQuotaAmount(fact.value, fact.asset)
                  : fact.value.toLocaleString(),
      })
    } else if (fact.kind === "rate-limit") {
      details.push({
        id: fact.fieldId,
        label: t("keyManagement:native.editor.budgetsAndLimits"),
        value: `RPM ${fact.rpm || t("keyManagement:native.editor.followsAccount")} · ${t("keyManagement:native.editor.keyConcurrency")}: ${fact.concurrency || t("keyManagement:native.editor.followsAccount")}`,
      })
    } else if (fact.kind === "budget") {
      const budgetLabel =
        fact.window === "5h"
          ? t("keyManagement:native.editor.budget5h")
          : fact.window === "day"
            ? t("keyManagement:native.editor.budgetDay")
            : fact.window === "week"
              ? t("keyManagement:native.editor.budgetWeek")
              : t("keyManagement:native.editor.budgetMonth")
      details.push({
        id: fact.fieldId,
        label: budgetLabel,
        value:
          t("keyManagement:native.editor.budgetUsage", {
            used: fact.usedUsd,
            limit: fact.limitUsd,
            remaining: fact.remainingUsd,
            reserved: fact.reservedUsd,
          }) +
          " · " +
          (fact.nextResetAt
            ? t("keyManagement:native.editor.budgetNextReset", {
                time: new Date(fact.nextResetAt).toLocaleString(undefined, {
                  timeZone: "Asia/Shanghai",
                  timeZoneName: "short",
                }),
              })
            : t("keyManagement:native.editor.budgetRolling")),
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
    if (fact.kind === "permission") {
      details.push({
        id: fact.fieldId,
        label: t("keyManagement:native.permission.manage"),
        value: fact.granted
          ? t("keyManagement:native.permission.manageGranted")
          : t("keyManagement:native.permission.manageNotGranted"),
      })
    } else if (fact.kind === "restriction") {
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
    const group = row.facts.displayFacts?.find(
      (fact) => fact.kind === "group" || fact.kind === "channels",
    )
    const contextFact = group
      ? group.kind === "channels"
        ? {
            id: "channels",
            label: t("keyManagement:keyDetails.channels"),
            value: group.usesDefault
              ? `${t("keyManagement:keyDetails.defaultChannels")}${group.value.length ? ` (${displayText(group.value)})` : ""}`
              : displayText(group.value) || t("common:labels.notAvailable"),
          }
        : {
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
    const summaryDetailCount = 4 - (contextFact ? 1 : 0)
    const secretActions = secretActionPolicy({
      hasAssociatedSecret: options.hasAssociatedSecret,
      recoverable:
        base.secretAvailability === INVENTORY_SECRET_AVAILABILITIES.Recoverable,
      accountCredential:
        row.facts.credentialRole === ACCOUNT_KEY_CREDENTIAL_ROLES.Account,
      inferenceCapable: row.facts.runtimeKey?.inference !== false,
    })
    return {
      ...base,
      contextFact,
      summaryFacts: [
        ...(contextFact ? [contextFact] : []),
        ...details.slice(0, summaryDetailCount),
      ],
      detailFacts:
        row.facts.detailAvailability ===
        ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete
          ? details.slice(summaryDetailCount)
          : details,
      actions: {
        ...base.actions,
        ...secretActions,
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
    [cardKinds.Native]: nativeKeyResourceCardAdapter,
    [cardKinds.OpenRouter]: openRouterKeyResourceCardAdapter,
    [cardKinds.Generic]: genericKeyResourceCardAdapter,
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
    getKeyResourcePresentationPolicy(siteType).scope === scopeKinds.Workspace ||
    scopeCount > 1
  )
}

/** Workspace terminology belongs to OpenRouter; other scopes use neutral copy. */
export function getAccountKeyScopeMessages(
  siteType: string | undefined,
  t: TFunction,
) {
  if (
    getKeyResourcePresentationPolicy(siteType).scope === scopeKinds.Workspace
  ) {
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
