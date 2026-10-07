import type { AccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import type {
  ApiCredentialProfileCaptureInput,
  ApiCredentialProfileCaptureResult,
  ApiCredentialProfileLinkInput,
  ApiCredentialProfileRelinkInput,
} from "~/services/apiCredentialProfiles/profileStorageContracts"
import type { ApiCredentialProfileLink } from "~/types/apiCredentialProfiles"

/** Public Interface for durable credential-to-runtime-key associations. */
export const apiCredentialProfileLinks = {
  capture(
    input: ApiCredentialProfileCaptureInput,
  ): Promise<ApiCredentialProfileCaptureResult> {
    return apiCredentialProfilesStorage.captureProfile(input)
  },

  list(): Promise<ApiCredentialProfileLink[]> {
    return apiCredentialProfilesStorage.listLinks()
  },

  getById(id: string) {
    return apiCredentialProfilesStorage.getLinkById(id)
  },

  listForProfile(profileId: string) {
    return apiCredentialProfilesStorage.listLinksForProfile(profileId)
  },

  findForLocator(locator: AccountRuntimeKeyLocator) {
    return apiCredentialProfilesStorage.findLinksForLocator(locator)
  },

  resolve(locator: AccountRuntimeKeyLocator) {
    return apiCredentialProfilesStorage.resolveLink(locator)
  },

  link(input: ApiCredentialProfileLinkInput) {
    return apiCredentialProfilesStorage.linkProfile(input)
  },

  relink(input: ApiCredentialProfileRelinkInput) {
    return apiCredentialProfilesStorage.relinkProfile(input)
  },

  unlink(id: string) {
    return apiCredentialProfilesStorage.unlinkProfile(id)
  },
}

export type { ApiCredentialProfileCaptureInput }
