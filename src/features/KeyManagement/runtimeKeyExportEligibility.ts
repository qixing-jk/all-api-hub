import { hasUsableAccountRuntimeKeySecret } from "~/services/accounts/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keyProductCapabilities"

import type { KeyManagementEntry } from "./types"

/** Export requires a current secret or an adapter that can recover it. */
export const isBatchSelectableEntry = (entry: KeyManagementEntry) =>
  entry.runtimeKey.capabilities.export &&
  (supportsRecoverableAccountRuntimeKeySecrets(entry.runtimeKey.siteType) ||
    hasUsableAccountRuntimeKeySecret(entry.runtimeKey))
