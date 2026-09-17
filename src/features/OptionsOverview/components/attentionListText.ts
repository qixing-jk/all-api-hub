import type { TFunction } from "i18next"

import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "../ids"
import type {
  OptionsOverviewAttentionCategory,
  OptionsOverviewAttentionItem,
} from "../types"

type AttentionKind = OptionsOverviewAttentionItem["kind"]
type AttentionSeverity = OptionsOverviewAttentionItem["severity"]

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
    t(
      "optionsOverview:attention.autoCheckinNeedsAttention.title",
      item.titleOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t("optionsOverview:attention.usageRefreshPending.title", item.titleOptions),
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
    t(
      "optionsOverview:attention.unreadSiteAnnouncements.title",
      item.titleOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInSkippedNeedsAction]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.checkInSkippedNeedsAction.title",
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
    t(
      "optionsOverview:attention.autoCheckinGloballyDisabled.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.unreadSiteAnnouncements.description",
      item.descriptionOptions,
    ),
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInSkippedNeedsAction]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) =>
    t(
      "optionsOverview:attention.checkInSkippedNeedsAction.description",
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
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInSkippedNeedsAction]: (
    t: TFunction,
  ) => t("optionsOverview:attention.actions.handleCheckIn"),
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
