import { hasUsableAccountRuntimeKeySecret } from "~/services/accounts/keys/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keys/keyProductCapabilities"

import type { KeyManagementEntry } from "./types"

/** Export requires a current secret or an adapter that can recover it. */
export const isBatchSelectableEntry = (entry: KeyManagementEntry) =>
  entry.runtimeKey.capabilities.export &&
  (supportsRecoverableAccountRuntimeKeySecrets(entry.runtimeKey.siteType) ||
    hasUsableAccountRuntimeKeySecret(entry.runtimeKey))
