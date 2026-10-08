import { type AxonHubChannelStatus } from "~/constants/axonHub"
import { type CredentialListPatch } from "~/services/apiAdapters/managedResources/shared/credentialListEditor"
import type {
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"

export type AxonHubCreateCommand = {
  credentialPatch?: CredentialListPatch
  input: AxonHubCreateChannelInput
  desiredStatus: AxonHubChannelStatus
}

// Keep the product-facing edit contract narrower than AxonHub's generated
// UpdateChannelInput. Aggregate replacements such as settings, policies, and
// endpoints are intentionally absent because an older client cannot preserve
// members added by a newer server.
export type AxonHubNativeChannelPatch = {
  credentialPatch?: CredentialListPatch
} & Pick<
  AxonHubUpdateChannelInput,
  | "type"
  | "baseURL"
  | "name"
  | "status"
  | "credentials"
  | "supportedModels"
  | "manualModels"
  | "autoSyncSupportedModels"
  | "autoSyncModelPattern"
  | "clearAutoSyncModelPattern"
  | "tags"
  | "defaultTestModel"
  | "orderingWeight"
  | "remark"
  | "clearRemark"
>
