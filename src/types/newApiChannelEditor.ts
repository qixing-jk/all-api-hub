import type { CredentialListPatch } from "~/services/apiAdapters/managedResources/credentialListEditor"

import type { NewApiFamilyChannelCommand } from "./newApiFamilyChannelEditor"

/** Only explicitly edited advanced settings, merged with fresh native detail. */
export type NewApiChannelAdvancedPatch = {
  test_model?: string
  auto_ban?: number
  model_mapping?: string
  tag?: string
  remark?: string
  setting?: { proxy?: string }
  settings?: {
    upstream_model_update_check_enabled?: boolean
    upstream_model_update_auto_sync_enabled?: boolean
    upstream_model_update_ignored_models?: string[]
  }
}

/** New API additions stay outside the shared New API-family command. */
export type NewApiChannelCommand = NewApiFamilyChannelCommand & {
  /** Private, editor-lifetime disclosure used only when preserving unread slots during replacement. */
  disclosedKeys?: readonly string[]
  credentialPatch?: CredentialListPatch
  multiKeyMode?: string
  advanced?: NewApiChannelAdvancedPatch
}
