import type { TFunction } from "i18next"

import {
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/channelMatch"

/**
 * Resolves the user-facing toast message for the best managed-site channel locate hint.
 */
export function resolveLocateManagedSiteChannelToastMessage(
  t: TFunction,
  inspection: ManagedSiteChannelMatchInspection,
) {
  if (inspection.key.matched && inspection.models.matched) {
    if (
      inspection.key.channel?.id != null &&
      inspection.key.channel.id === inspection.models.channel?.id
    ) {
      return t("account:actions.channelLocateKeyMatchedModelsDrifted")
    }

    return t("account:actions.channelLocateSignalsConflict")
  }

  if (inspection.key.matched) {
    return t("account:actions.channelLocateKeyMatchOnly")
  }

  switch (inspection.models.reason) {
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT:
      return t("account:actions.channelLocateSecondaryExactModels")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED:
      return t("account:actions.channelLocateSecondaryModelsContained")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR:
      return t("account:actions.channelLocateSecondaryModelsSimilar")
  }

  if (inspection.url.matched) {
    return t("account:actions.channelLocateFuzzyUrlOnly")
  }

  return t("account:actions.channelLocateUnresolved")
}
