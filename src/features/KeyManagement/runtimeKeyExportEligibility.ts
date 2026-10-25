import {
  hasUsableAccountRuntimeKeySecret,
  isInferenceCapableAccountRuntimeKey,
} from "~/services/accounts/keys/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keys/keyProductCapabilities"

import type { KeyManagementEntry } from "./types"

/**
 * Export requires a current secret or an adapter that can recover it.
 *
 * A management key may answer inference requests, but exporting it would give
 * every client authority over the organization's other credentials.
 */
export const isBatchSelectableEntry = (entry: KeyManagementEntry) =>
  entry.runtimeKey.capabilities.export &&
  isInferenceCapableAccountRuntimeKey(entry.runtimeKey) &&
  (supportsRecoverableAccountRuntimeKeySecrets(entry.runtimeKey.siteType) ||
    hasUsableAccountRuntimeKeySecret(entry.runtimeKey))
