import { useMemo, type ComponentProps } from "react"

import { TokenList } from "~/features/KeyManagement/components/TokenList"
import type {
  NativeKeyManagementRow,
  ServiceCredentialState,
} from "~/features/KeyManagement/types"
import { buildServiceCredentialKeyManagementEntry } from "~/features/KeyManagement/utils"
import type { DisplaySiteData } from "~/types"
import { maskSecretForDisplay } from "~/utils/core/formatters"
import type { createToken } from "~~/tests/utils/keyManagementFactories"

type KeySeed = ReturnType<typeof createToken> & {
  group?: string
  model_limits_enabled?: boolean
  model_limits?: string
  models?: string
}
type Props = Omit<
  ComponentProps<typeof TokenList>,
  "entries" | "filteredEntries"
> &
  Partial<
    Pick<ComponentProps<typeof TokenList>, "entries" | "filteredEntries">
  > & {
    tokens?: KeySeed[]
    filteredTokens?: KeySeed[]
    serviceCredentials?: Record<string, ServiceCredentialState>
  }

/** Terse test seeds describe native resources; production never receives token DTOs. */
export const nativeRowFromSeed = (
  account: DisplaySiteData,
  seed: KeySeed,
): NativeKeyManagementRow => ({
  kind: "account-key-resource",
  rowKey: `test-resource:${account.id}:${seed.id}`,
  accountId: account.id,
  accountName: account.name,
  scopeName: "Account",
  facts: {
    ref: {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: "account",
      resourceId: String(seed.id),
    },
    displayName: seed.name,
    maskedLabel: maskSecretForDisplay(seed.key),
    status: seed.status === 1 ? "enabled" : "disabled",
    fields: [],
    actions: { canUpdate: true, canDelete: true },
    runtimeKey: {
      createdAt: seed.created_time,
      modelAccess: {
        groups: seed.group ? [seed.group] : null,
        allowedModelIds: seed.model_limits_enabled
          ? (seed.model_limits ?? "").split(",").filter(Boolean)
          : null,
        suggestedModelIds: (seed.models ?? "").split(",").filter(Boolean),
      },
    },
  },
})

export function TokenListHarness({
  tokens = [],
  filteredTokens = tokens,
  nativeRows = [],
  nativeUnfilteredRows = nativeRows,
  serviceCredentials = {},
  entries: suppliedEntries,
  filteredEntries: suppliedFilteredEntries,
  ...props
}: Props) {
  const { displayData, onCopyServiceCredential, onRotateServiceCredential } =
    props
  const rows = useMemo(() => {
    const build = (seeds: KeySeed[]) =>
      seeds.flatMap((seed) => {
        const account = displayData.find(
          (candidate) => candidate.id === seed.accountId,
        )
        return account ? [nativeRowFromSeed(account, seed)] : []
      })
    return { all: build(tokens), visible: build(filteredTokens) }
  }, [displayData, tokens, filteredTokens])
  const entries =
    suppliedEntries ??
    (onCopyServiceCredential
      ? displayData.flatMap((account) => {
          const entry = buildServiceCredentialKeyManagementEntry({
            account,
            serviceCredential: serviceCredentials[account.id],
            canRotate: Boolean(onRotateServiceCredential),
          })
          return entry ? [entry] : []
        })
      : [])
  return (
    <TokenList
      {...props}
      entries={entries}
      filteredEntries={suppliedFilteredEntries ?? entries}
      nativeRows={[...rows.visible, ...nativeRows]}
      nativeUnfilteredRows={[...rows.all, ...nativeUnfilteredRows]}
    />
  )
}
