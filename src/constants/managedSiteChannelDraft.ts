import { ChannelType } from "~/constants/newApi"
import type { ManagedSiteChannelDraftDefaults } from "~/types/managedSiteChannelDraft"
import { CHANNEL_STATUS } from "~/types/newApi"

/** Initial values shared by managed-site import drafts. */
export const DEFAULT_CHANNEL_FIELDS: ManagedSiteChannelDraftDefaults = {
  status: CHANNEL_STATUS.Enable,
  priority: 0,
  weight: 0,
  groups: ["default"],
  models: [],
  type: ChannelType.OpenAI,
}
