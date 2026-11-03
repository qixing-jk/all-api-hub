import {
  NANOGPT_DISPLAY_NAME,
  NANOGPT_INFERENCE_BASE_URL,
} from "~/services/accountSiteDefinitions/identifiers"
import type { ServiceCredentialCapability } from "~/services/apiAdapters/contracts/serviceCredential"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"

/** Saved plaintext is independent of non-exportable native inventory and never includes a management token. */
export const nanoGptServiceCredential: ServiceCredentialCapability = {
  async fetch(request) {
    const key = parseNanoGptCredentials(request.auth.accessToken).apiKey
    return {
      kind: "singleton_service_key",
      service: "nanogpt-inference",
      label: NANOGPT_DISPLAY_NAME,
      key,
      isAuthenticated: Boolean(key),
      baseUrl: NANOGPT_INFERENCE_BASE_URL,
    }
  },
}
