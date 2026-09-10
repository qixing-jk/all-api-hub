import type { TFunction } from "i18next"

import { SITE_TYPES } from "~/constants/siteType"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/keyManagement"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

import type { AccountKeyResourceCardAdapter } from "./accountKeyResourceCardAdapter"
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

/** Resolves presentation independently of whether a provider implements native CRUD. */
export function getAccountKeyResourceCardAdapter(siteType: string) {
  return cardAdapters.get(siteType) ?? genericKeyResourceCardAdapter
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
