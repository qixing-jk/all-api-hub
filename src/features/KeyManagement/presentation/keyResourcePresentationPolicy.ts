import type { TFunction } from "i18next"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Tag,
  type LucideIcon,
} from "lucide-react"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES as families,
  type AccountSiteBackendFamily,
} from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountKeyResourceEditAction } from "~/services/apiAdapters/contracts/accountKeyResource"
import { REQUESTY_KEY_FIELDS } from "~/services/apiAdapters/requesty/keys/keyResourceFields"

export const KEY_RESOURCE_EDITOR_KINDS = {
  NewApi: "new-api",
  Sub2Api: "sub2api",
  VoApiV2: "voapi-v2",
  AiHubMix: "aihubmix",
  RightCode: "rightcode",
  Grsai: "grsai",
  Cubence: "cubence",
  Krill: "krill",
  Daya: "daya",
  Pmapi: "pmapi",
  Dahl: "dahl",
  FoxCode: "foxcode",
  Emrank: "emrank",
  OpenRouter: "openrouter",
  RelayFor: "relayfor",
  Requesty: "requesty",
  NameOnly: "name-only",
  Empty: "empty",
} as const

export const KEY_RESOURCE_CARD_KINDS = {
  Native: "native",
  OpenRouter: "openrouter",
  Generic: "generic",
} as const

export const KEY_RESOURCE_SCOPE_KINDS = {
  Account: "account",
  Workspace: "workspace",
} as const

type PresentationPolicy = {
  readonly factLabels?: Readonly<Record<string, (t: TFunction) => string>>
  readonly editor: (typeof KEY_RESOURCE_EDITOR_KINDS)[keyof typeof KEY_RESOURCE_EDITOR_KINDS]
  readonly card: (typeof KEY_RESOURCE_CARD_KINDS)[keyof typeof KEY_RESOURCE_CARD_KINDS]
  readonly scope: (typeof KEY_RESOURCE_SCOPE_KINDS)[keyof typeof KEY_RESOURCE_SCOPE_KINDS]
  readonly createdKey?: {
    description: (t: TFunction, name: string) => string
    continueLabel: (t: TFunction) => string
    continueIntent: AccountKeyResourceEditAction
  }
  readonly actions?: {
    /** Explicit editor operations; presentation labels never imply behavior. */
    editActions: readonly {
      intent: AccountKeyResourceEditAction
      label: (t: TFunction) => string
      icon: LucideIcon
    }[]
    deleteLabel: (t: TFunction) => string
    deleteTitle: (t: TFunction) => string
    deleteDescription: (t: TFunction, name: string) => string
  }
}

const generic: PresentationPolicy = {
  editor: KEY_RESOURCE_EDITOR_KINDS.Empty,
  card: KEY_RESOURCE_CARD_KINDS.Generic,
  scope: KEY_RESOURCE_SCOPE_KINDS.Account,
}
const native = {
  card: KEY_RESOURCE_CARD_KINDS.Native,
  scope: KEY_RESOURCE_SCOPE_KINDS.Account,
} as const

/** Frontend policies share one complete family registration; services own native facts. */
const policies = {
  [families.NewApiFamily]: {
    ...native,
    editor: KEY_RESOURCE_EDITOR_KINDS.NewApi,
  },
  [families.Sub2Api]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.Sub2Api },
  [families.VoApiV2]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.VoApiV2 },
  [families.Aihubmix]: {
    ...native,
    editor: KEY_RESOURCE_EDITOR_KINDS.AiHubMix,
  },
  [families.RightCode]: {
    ...native,
    editor: KEY_RESOURCE_EDITOR_KINDS.RightCode,
  },
  [families.Grsai]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.Grsai },
  [families.Cubence]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.Cubence },
  [families.Krill]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.Krill },
  [families.Daya]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.Daya },
  [families.Pmapi]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.Pmapi },
  [families.FoxCode]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.FoxCode },
  [families.Emrank]: { ...native, editor: KEY_RESOURCE_EDITOR_KINDS.Emrank },
  [families.Xiaoen]: generic,
  [families.OpenRouter]: {
    ...generic,
    editor: KEY_RESOURCE_EDITOR_KINDS.OpenRouter,
    card: KEY_RESOURCE_CARD_KINDS.OpenRouter,
    scope: KEY_RESOURCE_SCOPE_KINDS.Workspace,
  },
  [families.FreeModel]: {
    ...generic,
    editor: KEY_RESOURCE_EDITOR_KINDS.NameOnly,
  },
  [families.Dahl]: {
    ...native,
    editor: KEY_RESOURCE_EDITOR_KINDS.Dahl,
    createdKey: {
      description: (t, name) =>
        t("keyManagement:native.editor.dahl.createdHelp", { name }),
      continueLabel: (t) => t("keyManagement:native.editor.dahl.allocate"),
      continueIntent: editActions.Allocate,
    },
    actions: {
      editActions: [
        {
          intent: editActions.Rename,
          label: (t) => t("keyManagement:native.editor.dahl.rename"),
          icon: Tag,
        },
        {
          intent: editActions.Allocate,
          label: (t) => t("keyManagement:native.editor.dahl.allocate"),
          icon: ArrowUpFromLine,
        },
        {
          intent: editActions.Return,
          label: (t) => t("keyManagement:native.editor.dahl.return"),
          icon: ArrowDownToLine,
        },
      ],
      deleteLabel: (t) => t("keyManagement:native.editor.dahl.revoke"),
      deleteTitle: (t) => t("keyManagement:native.editor.dahl.revokeTitle"),
      deleteDescription: (t, name) =>
        t("keyManagement:native.editor.dahl.revokeDescription", { name }),
    },
  },
  [families.KimiOpenPlatform]: {
    ...generic,
    editor: KEY_RESOURCE_EDITOR_KINDS.NameOnly,
  },
  [families.SharedChat]: generic,
  [families.RelayFor]: {
    ...native,
    editor: KEY_RESOURCE_EDITOR_KINDS.RelayFor,
  },
  [families.Requesty]: {
    ...native,
    editor: KEY_RESOURCE_EDITOR_KINDS.Requesty,
    factLabels: {
      [REQUESTY_KEY_FIELDS.MonthlyLimit]: (t) =>
        t("keyManagement:native.editor.requestyMonthlyLimit"),
    },
  },
  [families.Unsupported]: generic,
} satisfies Record<AccountSiteBackendFamily, PresentationPolicy>

/** Unknown providers retain common presentation without interpreting native fields. */
export function getKeyResourcePresentationPolicy(
  siteType: string | undefined,
): PresentationPolicy {
  const family = getAccountSiteDefinition(siteType ?? "")?.adapterFamily
  return family ? policies[family] : generic
}
