import type { ManagedSiteChannelDraftDefaults } from "~/types/managedSiteChannelDraft"

/** Initial values shared by managed-site import drafts. */
export const DEFAULT_CHANNEL_FIELDS: ManagedSiteChannelDraftDefaults = {
  enabled: true,
  priority: 0,
  weight: 0,
  groups: ["default"],
  models: [],
}
