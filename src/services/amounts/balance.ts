import { z } from "zod"

import { assetSchema, type Asset } from "~/services/amounts/assets"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_INSTRUMENTS,
  BALANCE_LABEL_KEYS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
  type ASSET_KINDS,
} from "~/services/amounts/financialConstants"

const decimalSchema = z
  .string()
  .refine((value) => parseDecimal(value) === value, "Non-canonical decimal")

export const evidenceSchema = z.strictObject({
  adapter: z.string().min(1),
  contractVersion: z.string().min(1),
  operation: z.string().min(1),
  kind: z.enum(EVIDENCE_KINDS),
  inputs: z.array(z.string()).optional(),
  /** Exact provider operands retained for derivation or native-unit normalization. */
  amountInputs: z.record(z.string().min(1), decimalSchema).optional(),
})
export type EvidenceRef = z.infer<typeof evidenceSchema>
export type Observed<T> =
  | {
      status: typeof OBSERVATION_STATUSES.Known
      value: T
      source: EvidenceRef
      observedAt: number
    }
  | {
      status: typeof OBSERVATION_STATUSES.Stale
      value: T
      source: EvidenceRef
      observedAt: number
      reason: string
    }
  | {
      status: (typeof OBSERVATION_STATUSES)[
        "Unknown" | "Unsupported" | "Unavailable"]
      source: EvidenceRef
      reason: string
    }

/** Known and retained observations are readable; freshness remains a separate fact. */
export function isKnownOrStaleObservation<T extends { status?: string }>(
  observation: T | null | undefined,
): observation is T & {
  status: typeof OBSERVATION_STATUSES.Known | typeof OBSERVATION_STATUSES.Stale
} {
  return (
    observation?.status === OBSERVATION_STATUSES.Known ||
    observation?.status === OBSERVATION_STATUSES.Stale
  )
}

const selectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal(SCOPE_SELECTION_KINDS.All) }),
  z.strictObject({
    kind: z.literal(SCOPE_SELECTION_KINDS.Restricted),
    ids: z.array(z.string()),
  }),
  z.strictObject({ kind: z.literal(SCOPE_SELECTION_KINDS.Unknown) }),
])
const subjectSchema = z.discriminatedUnion("kind", [
  // Before save, a fetched account has no local record ID. Storage binds it on acceptance.
  z.strictObject({
    kind: z.literal(FINANCIAL_SUBJECT_KINDS.Account),
    accountId: z.string().min(1).optional(),
  }),
  z.strictObject({
    kind: z.literal(FINANCIAL_SUBJECT_KINDS.Credential),
    profileId: z.string().min(1),
  }),
])
export const usageScopeSchema = z.strictObject({
  subject: subjectSchema,
  authority: z.string().min(1),
  walletId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  projects: selectionSchema,
  keys: selectionSchema,
  models: selectionSchema,
  groups: selectionSchema,
  /** Native endpoint/route-prefix restrictions, separate from model or group IDs. */
  routes: selectionSchema.optional(),
})
export type UsageScope = z.infer<typeof usageScopeSchema>

/** Restriction lists denote sets; unknown and an explicitly empty set remain distinct. */
export function usageScopeKey(
  scope: UsageScope,
  includeSubject = true,
): string {
  const selections = [
    scope.projects,
    scope.keys,
    scope.models,
    scope.groups,
  ].map((selection) =>
    selection.kind === SCOPE_SELECTION_KINDS.Restricted
      ? [selection.kind, [...new Set(selection.ids)].sort()]
      : [selection.kind],
  )
  const subject =
    scope.subject.kind === FINANCIAL_SUBJECT_KINDS.Account
      ? [FINANCIAL_SUBJECT_KINDS.Account, scope.subject.accountId]
      : [FINANCIAL_SUBJECT_KINDS.Credential, scope.subject.profileId]
  return JSON.stringify([
    includeSubject ? subject : undefined,
    scope.authority,
    scope.organizationId,
    scope.walletId,
    scope.workspaceId,
    ...selections,
    ...(scope.routes
      ? [
          [
            "routes",
            scope.routes.kind,
            ...(scope.routes.kind === SCOPE_SELECTION_KINDS.Restricted
              ? [[...new Set(scope.routes.ids)].sort()]
              : []),
          ],
        ]
      : []),
  ])
}

/** Value-bearing observations share strict provenance and freshness validation. */
export function observedValueSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal(OBSERVATION_STATUSES.Known),
      value,
      source: evidenceSchema,
      observedAt: z.number().finite(),
    }),
    z.strictObject({
      status: z.literal(OBSERVATION_STATUSES.Stale),
      value,
      source: evidenceSchema,
      observedAt: z.number().finite(),
      reason: z.string(),
    }),
    ...(
      [
        OBSERVATION_STATUSES.Unknown,
        OBSERVATION_STATUSES.Unsupported,
        OBSERVATION_STATUSES.Unavailable,
      ] as const
    ).map((status) =>
      z.strictObject({
        status: z.literal(status),
        source: evidenceSchema,
        reason: z.string(),
      }),
    ),
  ])
}

export const observedAmountSchema = observedValueSchema(decimalSchema)
export const observationWindowSchema = z
  .strictObject({
    start: z.number().finite(),
    end: z.number().finite(),
    timeZone: z.string().min(1),
    resetsAt: z.number().finite().optional(),
  })
  .refine((window) => window.start < window.end, "Invalid observation window")
export const balancePositionSchema = z
  .strictObject({
    id: z.string().min(1),
    collectionKey: z.string().min(1),
    label: z.string().optional(),
    labelKey: z.enum(BALANCE_LABEL_KEYS).optional(),
    // Retain upstream timing text when its timezone cannot establish an instant.
    reportedTiming: z
      .strictObject({
        startsAt: z.string().optional(),
        expiresAt: z.string().optional(),
        resetsAt: z.string().optional(),
      })
      .optional(),
    scope: usageScopeSchema,
    role: z.enum(BALANCE_ROLES),
    nature: z.enum(BALANCE_NATURES),
    funding: z.enum(BALANCE_FUNDING),
    cashClassification: z.enum(BALANCE_CASH_CLASSIFICATIONS),
    instrument: z.enum(BALANCE_INSTRUMENTS).optional(),
    asset: assetSchema,
    amount: observedAmountSchema,
    parentId: z.string().min(1).optional(),
    relation: z.enum(BALANCE_RELATIONS).optional(),
    validity: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal(BALANCE_VALIDITY_KINDS.NoExpiry) }),
      z.strictObject({
        kind: z.literal(BALANCE_VALIDITY_KINDS.Expires),
        at: z.number().finite(),
      }),
      z.strictObject({ kind: z.literal(BALANCE_VALIDITY_KINDS.Unknown) }),
    ]),
    window: observationWindowSchema.optional(),
  })
  .refine(
    (p) =>
      p.role !== BALANCE_ROLES.CreditLimit ||
      p.nature === BALANCE_NATURES.Credit,
    "Credit limits are credit, not prepaid funds",
  )
  .refine(
    (p) => Boolean(p.parentId) === Boolean(p.relation),
    "Relations require a parent",
  )
  .refine(
    (p) => !p.window || p.window.start < p.window.end,
    "Invalid observation window",
  )
export type BalancePosition = z.infer<typeof balancePositionSchema>
export type Amount = {
  value: string
  asset: Exclude<Asset, { kind: typeof ASSET_KINDS.Unknown }>
}

/** Keep known asset identity even when its amount is absent or invalid. */
export function observeAmount(
  value: unknown,
  source: EvidenceRef,
  observedAt: number,
): Observed<string> {
  const parsed = parseDecimal(value)
  return parsed === undefined
    ? {
        status: OBSERVATION_STATUSES.Unavailable,
        source,
        reason: "invalid-or-missing-amount",
      }
    : { status: OBSERVATION_STATUSES.Known, value: parsed, source, observedAt }
}

/** Build a position without inventing unknown financial classifications. */
export function balancePosition(
  input: Pick<BalancePosition, "id" | "scope" | "asset"> &
    Partial<Omit<BalancePosition, "id" | "scope" | "asset" | "amount">> & {
      value: unknown
      source: EvidenceRef
      observedAt: number
    },
): BalancePosition {
  const { value, source, observedAt, ...position } = input
  return {
    collectionKey: source.operation,
    role: BALANCE_ROLES.Available,
    nature: BALANCE_NATURES.Unknown,
    funding: BALANCE_FUNDING.Unknown,
    cashClassification: BALANCE_CASH_CLASSIFICATIONS.Unknown,
    validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
    ...position,
    amount: observeAmount(value, source, observedAt),
  }
}
