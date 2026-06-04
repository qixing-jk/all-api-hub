import type { TFunction } from "i18next"

import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "../ids"
import type { OptionsOverviewAttentionItem } from "../types"

type AttentionKind = OptionsOverviewAttentionItem["kind"]
type AttentionSeverity = OptionsOverviewAttentionItem["severity"]

const severityLabelResolvers = {
  error: (t: TFunction) => t("optionsOverview:severity.error"),
  warning: (t: TFunction) => t("optionsOverview:severity.warning"),
  info: (t: TFunction) => t("optionsOverview:severity.info"),
} as const satisfies Record<AttentionSeverity, (t: TFunction) => string>

const attentionTitleResolvers = {
  [OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy]: (
    item: OptionsOverviewAttentionItem,
    t: TFunction,
  ) => t("optionsOverview:attention.accountUnhealthy.title", item.titleOptions),
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
