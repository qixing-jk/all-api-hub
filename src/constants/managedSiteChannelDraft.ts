import type { ManagedSiteChannelDraftDefaults } from "~/types/managedSiteChannelDraft"

/** Common import defaults and New API-family native routing defaults. */
export const DEFAULT_CHANNEL_FIELDS: ManagedSiteChannelDraftDefaults & {
  priority: number
  weight: number
} = {
  enabled: true,
  priority: 0,
  weight: 0,
  groups: ["default"],
  models: [],
}
