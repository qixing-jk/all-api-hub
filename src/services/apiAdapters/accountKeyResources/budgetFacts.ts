import type { UsageScope } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  divideDecimalByInteger,
  parseDecimal,
} from "~/services/amounts/decimal"
import {
  EVIDENCE_KINDS,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
  type BUDGET_AMOUNT_FIELDS,
} from "~/services/amounts/financialConstants"
import type { AccountKeyFactContext } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  ACCOUNT_KEY_FINANCIAL_FACT_KINDS,
  type AccountKeyDisplayFact,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"

/** Null is verified unrestricted; undefined is unverified; an empty list allows nothing. */
export function keyRestrictionScope(input: {
  models?: readonly string[] | null
  groups?: readonly string[] | null
}): Pick<UsageScope, "models" | "groups"> {
  const selection = (
    ids: readonly string[] | null | undefined,
  ): UsageScope["models"] =>
    ids === undefined
      ? { kind: SCOPE_SELECTION_KINDS.Unknown }
      : ids === null
        ? { kind: SCOPE_SELECTION_KINDS.All }
        : { kind: SCOPE_SELECTION_KINDS.Restricted, ids: [...ids] }
  return { models: selection(input.models), groups: selection(input.groups) }
}

/** Key identity is known; wider restrictions remain unknown unless the adapter verifies them. */
export function accountKeyUsageScope(
  ref: AccountKeyResourceRef,
  context: AccountKeyFactContext,
  restrictions: Partial<UsageScope> = {},
): UsageScope {
  return {
    subject: {
      kind: FINANCIAL_SUBJECT_KINDS.Account,
      accountId: ref.accountId,
    },
    authority: context.authority,
    projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
    keys: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: [ref.resourceId] },
    models: { kind: SCOPE_SELECTION_KINDS.Unknown },
    groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
    ...restrictions,
  }
}

/** Decode explicit protocol divisors before observing an amount; never round through binary division. */
export function keyProtocolAmount(value: unknown, divisor = 1): unknown {
  const parsed = parseDecimal(value)
  return parsed === undefined ? value : divideDecimalByInteger(parsed, divisor)
}

/** Reuses shared budget semantics while keeping source operation and scope at the adapter boundary. */
export function keyBudgetFact(
  ref: AccountKeyResourceRef,
  context: AccountKeyFactContext,
  input: Omit<
    Parameters<typeof budgetConstraint>[0],
    "source" | "observedAt" | "scope"
  > & {
    fieldId: string
    operation: string
    metric?: (typeof BUDGET_AMOUNT_FIELDS)[keyof typeof BUDGET_AMOUNT_FIELDS]
    scope?: Partial<UsageScope>
  },
): Extract<
  AccountKeyDisplayFact,
  { kind: typeof ACCOUNT_KEY_FINANCIAL_FACT_KINDS.BudgetConstraint }
> {
  const { fieldId, metric, operation, scope, ...budget } = input
  return {
    kind: ACCOUNT_KEY_FINANCIAL_FACT_KINDS.BudgetConstraint,
    fieldId,
    ...(metric ? { metric } : {}),
    budget: budgetConstraint({
      ...budget,
      scope: accountKeyUsageScope(ref, context, scope),
      source: {
        adapter: ref.siteType,
        contractVersion: "key-budget/v1",
        operation,
        kind: EVIDENCE_KINDS.Reported,
      },
      observedAt: context.observedAt,
    }),
  }
}
