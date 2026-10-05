import {
  ACCOUNT_SITE_ADAPTER_FAMILIES as families,
  type AccountSiteBackendFamily,
} from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"

type PresentationPolicy = {
  readonly editor:
    | "new-api"
    | "sub2api"
    | "voapi-v2"
    | "aihubmix"
    | "rightcode"
    | "grsai"
    | "openrouter"
    | "name-only"
    | "empty"
  readonly card: "native" | "openrouter" | "generic"
  readonly scope: "account" | "workspace"
  readonly emptyGroup: "account-group" | "ungrouped"
}

const generic: PresentationPolicy = {
  editor: "empty",
  card: "generic",
  scope: "account",
  emptyGroup: "ungrouped",
}
const native = {
  card: "native",
  scope: "account",
  emptyGroup: "ungrouped",
} as const

/** Frontend policies share one complete family registration; services own native facts. */
const policies = {
  [families.NewApiFamily]: {
    ...native,
    editor: "new-api",
    emptyGroup: "account-group",
  },
  [families.Sub2Api]: { ...native, editor: "sub2api" },
  [families.VoApiV2]: { ...native, editor: "voapi-v2" },
  [families.Aihubmix]: { ...native, editor: "aihubmix" },
  [families.RightCode]: { ...native, editor: "rightcode" },
  [families.Grsai]: { ...native, editor: "grsai" },
  [families.OpenRouter]: {
    ...generic,
    editor: "openrouter",
    card: "openrouter",
    scope: "workspace",
  },
  [families.FreeModel]: { ...generic, editor: "name-only" },
  [families.KimiOpenPlatform]: { ...generic, editor: "name-only" },
  [families.SharedChat]: generic,
  [families.Unsupported]: generic,
} satisfies Record<AccountSiteBackendFamily, PresentationPolicy>

/** Unknown providers retain common presentation without interpreting native fields. */
export function getKeyResourcePresentationPolicy(
  siteType: string | undefined,
): PresentationPolicy {
  const family = getAccountSiteDefinition(siteType ?? "")?.adapterFamily
  return family ? policies[family] : generic
}
