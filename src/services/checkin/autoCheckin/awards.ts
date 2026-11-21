import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { quotaAssetSchema, type Asset } from "~/services/amounts/assets"
import {
  confirmedAward,
  confirmedAwardSchema,
  mergeConfirmedAwards,
  type ConfirmedAward,
} from "~/services/amounts/awards"
import { type EvidenceRef } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { SiteAccount } from "~/types"
import type { CheckinAccountResult } from "~/types/autoCheckin"
import { formatLocalDayKey } from "~/utils/core/dayKey"

/** Adapt one confirmed grant; unknown amount, scope and expiry never become zero or unrestricted. */
export function accountAward(
  account: SiteAccount,
  input: {
    id: string
    operation: string
    field: string
    asset: Asset
    value: unknown
    nativeUnitsPerAsset?: number
    target?: ConfirmedAward["target"]
    fulfillment?: ConfirmedAward["fulfillment"]
    event?: ConfirmedAward["event"]
    validity?: ConfirmedAward["validity"]
    scope?: ConfirmedAward["scope"]
    observedAt?: number
    adapter?: string
    contractVersion?: string
    amountInputs?: EvidenceRef["amountInputs"]
  },
): ConfirmedAward {
  const source: EvidenceRef = {
    adapter: input.adapter ?? account.site_type,
    operation: input.operation,
    contractVersion: input.contractVersion ?? "1",
    kind: EVIDENCE_KINDS.Reported,
    inputs: [input.field],
    ...(input.amountInputs ? { amountInputs: input.amountInputs } : {}),
  }
  return confirmedAward({
    id: input.id,
    asset: input.asset,
    value: input.value,
    nativeUnitsPerAsset: input.nativeUnitsPerAsset,
    source,
    observedAt: input.observedAt ?? Date.now(),
    scope:
      input.scope ??
      accountBalanceScope({ baseUrl: account.site_url, accountId: account.id }),
    validity: input.validity ?? { kind: BALANCE_VALIDITY_KINDS.Unknown },
    target: input.target ?? AWARD_TARGETS.Unknown,
    fulfillment: input.fulfillment ?? AWARD_FULFILLMENT.Unknown,
    ...(input.event ? { event: input.event } : {}),
  })
}

/** The sole legacy reward read bridge; reading never rewrites the stored result. */
export function readCheckinAwards(
  result: Pick<
    CheckinAccountResult,
    "accountId" | "timestamp" | "awards" | "reward"
  >,
): ConfirmedAward[] {
  if (result.awards !== undefined)
    return confirmedAwardSchema.array().parse(result.awards)
  const reward = result.reward
  if (!reward || typeof reward !== "object") return []
  const native = quotaAssetSchema.safeParse(reward.asset)
  const asset: Asset =
    reward.asset !== undefined
      ? native.success
        ? { kind: ASSET_KINDS.Quota, ...native.data }
        : { kind: ASSET_KINDS.Unknown }
      : {
          kind: ASSET_KINDS.Quota,
          id: "legacy:checkin:quota",
          label: "quota",
          displayScale: 1,
          displayLabel: "quota",
        }
  return [
    confirmedAward({
      id: "legacy-reward",
      asset,
      value: reward.asset !== undefined ? reward.amount : reward.quota,
      observedAt: result.timestamp,
      source: {
        adapter: "legacy",
        contractVersion: "1",
        operation: "stored-checkin-reward",
        kind: EVIDENCE_KINDS.Legacy,
        inputs: [reward.asset !== undefined ? "reward.amount" : "reward.quota"],
      },
      scope: {
        subject: {
          kind: FINANCIAL_SUBJECT_KINDS.Account,
          accountId: result.accountId,
        },
        authority: `legacy:${result.accountId}`,
        models: { kind: SCOPE_SELECTION_KINDS.Unknown },
        keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
        projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
        groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
      },
    }),
  ]
}

/** Only award-bearing executions contribute receipt identity; legacy observations have none. */
function awardReceiptIds(result: CheckinAccountResult): string[] {
  if (!result.awards?.length) return []
  const ids = result.awardExecutionReceiptIds ?? [result.executionReceiptId]
  return [
    ...new Set(
      ids.filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ]
}

/** Keep confirmed grants and their local receipt provenance when the result status changes. */
export function preserveCheckinAwards(
  previous: CheckinAccountResult | undefined,
  incoming: CheckinAccountResult,
  { preferPreviousResult = false }: { preferPreviousResult?: boolean } = {},
): CheckinAccountResult {
  const selected = preferPreviousResult && previous ? previous : incoming
  if (
    !previous ||
    previous.accountId !== incoming.accountId ||
    (previous.methodId &&
      incoming.methodId &&
      previous.methodId !== incoming.methodId) ||
    formatLocalDayKey(new Date(previous.timestamp)) !==
      formatLocalDayKey(new Date(incoming.timestamp))
  )
    return selected
  const previousAwards = readCheckinAwards(previous)
  const incomingAwards = readCheckinAwards(incoming)
  if (selected === previous && !incomingAwards.length) return selected
  if (!previousAwards.length && !incomingAwards.length) return selected
  const previousReceipts = awardReceiptIds(previous)
  const incomingReceipts = awardReceiptIds(incoming)
  const incomingAlreadyIncluded =
    incomingReceipts.length > 0 &&
    incomingReceipts.every((id) => previousReceipts.includes(id))
  // The persisted side may also hold legacy/unassociated observations. A
  // replay can omit those, so receipt membership never replaces that set.
  const awards =
    incomingAlreadyIncluded ||
    (incoming.awards === previous.awards && incoming.awards !== undefined)
      ? previousAwards
      : mergeConfirmedAwards(previousAwards, incomingAwards)
  return {
    ...selected,
    awards,
    awardExecutionReceiptIds: [
      ...new Set([...previousReceipts, ...incomingReceipts]),
    ],
  }
}
