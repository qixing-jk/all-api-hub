import type { TFunction } from "i18next"

import { KEY_RESOURCE_CARD_STATUSES } from "~/features/KeyManagement/presentation/keyResourceCard"
import { isProviderConfirmedAccountCredential } from "~/services/accounts/keys/accountCredentialIdentityFacts"
import { ACCOUNT_RUNTIME_KEY_STATUSES } from "~/services/accounts/keys/accountRuntimeKeys"
import { BUDGET_AMOUNT_FIELDS } from "~/services/amounts/financialConstants"
import { hasAccountKeyManagementPermission } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_EXPIRY_STATES,
  ACCOUNT_KEY_FINANCIAL_FACT_KINDS,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  ACCOUNT_KEY_RESTRICTION_ROLES,
  type AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { RESOURCE_DISPLAY_FACT_KINDS } from "~/services/apiAdapters/contracts/resourceNative"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { VERCEL_KEY_SPEND_ATTRIBUTIONS as attributions } from "~/services/apiService/vercelAiGateway/keys"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import { buildAccountCredentialBadges } from "./accountCredentialBadges"
import type { AccountKeyResourceCardAdapter } from "./accountKeyResourceCardAdapter"
import { formatKeyFinancialFact } from "./keyBudgetPresentation"
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
  buildPresentation(
    row,
    t,
    { hasAssociatedSecret, accountCredentialIdentity },
  ) {
    const availability =
      hasAssociatedSecret || Boolean(row.facts.runtimeSecret)
        ? INVENTORY_SECRET_AVAILABILITIES.Recoverable
        : (getSiteTypeCapabilities(row.facts.ref.siteType).account
            ?.keyResourceManagement?.inventorySecretAvailability ??
          INVENTORY_SECRET_AVAILABILITIES.Unavailable)
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
            ? KEY_RESOURCE_CARD_STATUSES.Unknown
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
        : availability === INVENTORY_SECRET_AVAILABILITIES.WebsiteVerification
          ? {
              secretAvailabilityMessage: t(
                "keyManagement:keyDetails.websiteVerificationSecret",
              ),
            }
          : {}),
      contextFact,
      summaryFacts: [contextFact],
      detailFacts: [],
      ...badgesProp(
        buildAccountCredentialBadges(
          accountCredentialIdentity ?? row.facts.accountCredentialIdentity,
          hasAccountKeyManagementPermission(row.facts),
          t,
        ),
      ),
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
      fact.kind === ACCOUNT_KEY_FINANCIAL_FACT_KINDS.BudgetConstraint ||
      fact.kind === ACCOUNT_KEY_FINANCIAL_FACT_KINDS.Allocation
    ) {
      const value = formatKeyFinancialFact(fact, t)
      details.push({
        id: fact.fieldId,
        label:
          fact.kind === ACCOUNT_KEY_FINANCIAL_FACT_KINDS.Allocation
            ? t("keyManagement:financial.allocation")
            : (getKeyResourcePresentationPolicy(
                facts.ref.siteType,
              ).factLabels?.[fact.fieldId]?.(t) ??
              (fact.metric
                ? t(
                    `keyManagement:financial.${fact.metric === BUDGET_AMOUNT_FIELDS.ByokUsed ? "used" : fact.metric}`,
                  )
                : t("keyManagement:financial.budget"))),
        value,
        ...(fact.kind === ACCOUNT_KEY_FINANCIAL_FACT_KINDS.BudgetConstraint &&
        !fact.metric
          ? { budget: fact.budget }
          : {}),
      })
    } else if (fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.RateLimit) {
      details.push({
        id: fact.fieldId,
        label: t("keyManagement:native.editor.budgetsAndLimits"),
        value: `RPM ${fact.rpm || t("keyManagement:native.editor.followsAccount")} · ${t("keyManagement:native.editor.keyConcurrency")}: ${fact.concurrency || t("keyManagement:native.editor.followsAccount")}`,
      })
    } else if (fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Expiry) {
      const date =
        typeof fact.timestampMs === "number" ? new Date(fact.timestampMs) : null
      details.push({
        id: fact.fieldId,
        label: t("keyManagement:keyDetails.expireTime"),
        value:
          fact.timestampMs === ACCOUNT_KEY_EXPIRY_STATES.Never
            ? t("keyManagement:keyDetails.neverExpires")
            : date && Number.isFinite(date.getTime())
              ? date.toLocaleDateString()
              : t("common:labels.notAvailable"),
      })
    } else if (fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Attribution) {
      details.push({
        id: fact.fieldId,
        label: t(
          "keyManagement:native.editor.vercelAiGateway.spendAttribution",
        ),
        // Provider-declared keys only; unknown values stay verbatim.
        value:
          fact.value === attributions.User
            ? t("keyManagement:native.editor.vercelAiGateway.attribution.user")
            : fact.value === attributions.Team
              ? t(
                  "keyManagement:native.editor.vercelAiGateway.attribution.team",
                )
              : fact.value,
      })
    } else if (fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.LastUsed) {
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
    if (fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Permission) {
      details.push({
        id: fact.fieldId,
        label: t("keyManagement:native.permission.manage"),
        value: fact.granted
          ? t("keyManagement:native.permission.manageGranted")
          : t("keyManagement:native.permission.manageNotGranted"),
      })
    } else if (fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Restriction) {
      const value = displayText(fact.value)
      if (value)
        details.push({
          id: fact.fieldId,
          label:
            fact.role === ACCOUNT_KEY_RESTRICTION_ROLES.Models
              ? t("keyManagement:keyDetails.models")
              : fact.role === ACCOUNT_KEY_RESTRICTION_ROLES.Tools
                ? t("keyManagement:keyDetails.tools")
                : fact.role === ACCOUNT_KEY_RESTRICTION_ROLES.Subnet
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
  const labels = getKeyResourcePresentationPolicy(facts.ref.siteType).factLabels
  for (const field of facts.fields) {
    const label = labels?.[field.fieldId]
    if (
      label &&
      !details.some((detail) => detail.id === field.fieldId) &&
      (field.kind === RESOURCE_DISPLAY_FACT_KINDS.Text ||
        field.kind === RESOURCE_DISPLAY_FACT_KINDS.Number)
    )
      details.push({
        id: field.fieldId,
        label: label(t),
        value: String(field.value),
      })
  }
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
      (fact) =>
        fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Group ||
        fact.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Channels,
    )
    const contextFact = group
      ? group.kind === ACCOUNT_KEY_DISPLAY_FACT_KINDS.Channels
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
      accountCredential: isProviderConfirmedAccountCredential(
        row.facts.accountCredentialIdentity,
      ),
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
          ? [
              ...details
                .slice(0, summaryDetailCount)
                .filter((fact) => fact.budget),
              ...details.slice(summaryDetailCount),
            ]
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
