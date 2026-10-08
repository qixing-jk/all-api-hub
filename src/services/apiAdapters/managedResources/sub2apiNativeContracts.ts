import { type Sub2ApiApiKeyAccountCreateInput } from "~/services/managedSites/providers/sub2api"
import type { Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"

export type Sub2ApiNativeConfig = {
  config: Sub2ApiManagedSiteConfig
  scopeKey: string
}

export type Sub2ApiCreateCommand = {
  input: Sub2ApiApiKeyAccountCreateInput
  desiredStatus: "active" | "inactive"
}
