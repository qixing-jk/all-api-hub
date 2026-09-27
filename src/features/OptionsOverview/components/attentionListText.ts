import type { TFunction } from "i18next"

import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "../ids"
import type {
  OptionsOverviewAttentionCategory,
  OptionsOverviewAttentionItem,
} from "../types"

type AttentionKind = OptionsOverviewAttentionItem["kind"]
type AttentionSeverity = OptionsOverviewAttentionItem["severity"]

/** Reads the aggregate total an item passes as its i18next plural count. */
function resolveAttentionCount(item: OptionsOverviewAttentionItem): number {
  const total = item.titleOptions?.total ?? item.descriptionOptions?.total
  return typeof total === "number" ? total : 0
}

const severityLabelResolvers = {
  error: (t: TFunction) => t("optionsOverview:severity.error"),
  warning: (t: TFunction) => t("optionsOverview:severity.warning"),
  info: (t: TFunction) => t("optionsOverview:severity.info"),
} as const satisfies Record<AttentionSeverity, (t: TFunction) => string>

const attentionCategoryLabelResolvers = {
  accounts: (t: TFunction) =>
    t("optionsOverview:attention.categories.accounts"),
  credentials: (t: TFunction) =>
    t("optionsOverview:attention.categories.credentials"),
  automation: (t: TFunction) =>
    t("optionsOverview:attention.categories.automation"),
  data: (t: TFunction) => t("optionsOverview:attention.categories.data"),
} as const satisfies Record<
  OptionsOverviewAttentionCategory,
  (t: TFunction) => string
>

const attentionTitleResolvers = {
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) => t("optionsOverview:attention.accountUnhealthy.title", item.titleOptions),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) => t("optionsOverview:attention.siteTypeUnknown.title", item.titleOptions),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.checkInMethodUnresolved.title",
      item.titleOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.autoCheckinNeedsAttention.title", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.usageRefreshPending.title", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.autoCheckinGloballyDisabled.title",
      item.titleOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.unreadSiteAnnouncements.title", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.checkInReloginRequired.title", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.checkInAccountDataMissing.title", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.checkInPermissionDenied.title", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.accountsAllDisabled.title", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.accountTempWindowIssue.title",
      item.titleOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) => t("optionsOverview:attention.addAccount.title", item.titleOptions),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) => t("optionsOverview:attention.addProfile.title", item.titleOptions),
} as const satisfies Record<
  AttentionKind,
  (item: OptionsOverviewAttentionItem, t: TFunction) => string
>

const attentionDescriptionResolvers = {
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.accountUnhealthy.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.siteTypeUnknown.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.checkInMethodUnresolved.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.autoCheckinNeedsAttention.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.usageRefreshPending.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.autoCheckinGloballyDisabled.description", {
      count: resolveAttentionCount(item),
    }),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.unreadSiteAnnouncements.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.checkInReloginRequired.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.checkInAccountDataMissing.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.checkInPermissionDenied.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.accountsAllDisabled.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.accountTempWindowIssue.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.addAccount.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.addProfile.description",
      item.descriptionOptions,
    ),
} as const satisfies Record<
  AttentionKind,
  (item: OptionsOverviewAttentionItem, t: TFunction) => string
>

const attentionActionResolvers = {
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy]: (t: TFunction) =>
    t("optionsOverview:attention.actions.viewAccount"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown]: (t: TFunction) =>
    t("optionsOverview:attention.actions.editAccount"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved]: (t: TFunction) =>
    t("optionsOverview:attention.actions.handleCheckIn"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention]: (
    t: TFunction,
  ) => t("optionsOverview:attention.actions.viewCheckIn"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending]: (t: TFunction) =>
    t("optionsOverview:attention.actions.refreshAccounts"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled]: (
    t: TFunction,
  ) => t("optionsOverview:attention.actions.handleCheckIn"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements]: (t: TFunction) =>
    t("optionsOverview:attention.actions.viewAnnouncements"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired]: (t: TFunction) =>
    t("optionsOverview:attention.actions.signInAgain"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing]: (
    t: TFunction,
  ) => t("optionsOverview:attention.actions.fixAccount"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied]: (t: TFunction) =>
    t("optionsOverview:attention.actions.viewCheckInResults"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled]: (t: TFunction) =>
    t("optionsOverview:attention.actions.manageAccounts"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue]: (t: TFunction) =>
    t("optionsOverview:attention.actions.openSettings"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount]: (t: TFunction) =>
    t("optionsOverview:attention.actions.addAccount"),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile]: (t: TFunction) =>
    t("optionsOverview:attention.actions.addProfile"),
} as const satisfies Record<AttentionKind, (t: TFunction) => string>

/**
 * Resolves attention severity labels from normalized severity values.
 */
export function getAttentionSeverityLabel(
  severity: AttentionSeverity,
  t: TFunction,
) {
  return severityLabelResolvers[severity](t)
}

/**
 * Resolves attention category labels from normalized category values.
 */
export function getAttentionCategoryLabel(
  category: OptionsOverviewAttentionCategory,
  t: TFunction,
) {
  return attentionCategoryLabelResolvers[category](t)
}

/**
 * Resolves attention item titles from semantic item kinds.
 */
export function getAttentionTitle(
  item: OptionsOverviewAttentionItem,
  t: TFunction,
) {
  return attentionTitleResolvers[item.kind](item, t)
}

/**
 * Resolves attention item descriptions from semantic item kinds.
 */
export function getAttentionDescription(
  item: OptionsOverviewAttentionItem,
  t: TFunction,
) {
  return attentionDescriptionResolvers[item.kind](item, t)
}

/**
 * Resolves a task-specific CTA label instead of one generic action.
 */
export function getAttentionActionLabel(
  item: OptionsOverviewAttentionItem,
  t: TFunction,
) {
  return attentionActionResolvers[item.kind](t)
}
