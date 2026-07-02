import type { ServiceCredentialCapability } from "~/services/apiAdapters/contracts/serviceCredential"
import {
  fetchCodexServiceCredential,
  rotateCodexServiceCredential,
} from "~/services/apiService/sharedchat"

export const sharedChatServiceCredential: ServiceCredentialCapability = {
  fetch: (request) => fetchCodexServiceCredential(request),
  rotate: (request) => rotateCodexServiceCredential(request),
}
