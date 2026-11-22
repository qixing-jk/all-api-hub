import { CURRENCIES } from "~/constants/money"
import { accountBalanceObservation } from "~/services/accounts/balanceSnapshot"
import { balancePosition, type UsageScope } from "~/services/amounts/balance"
import {
  addDecimal,
  normalizeDecimalUnits,
  parseDecimal,
} from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_INSTRUMENTS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import type { KimiOpenPlatformCurrency } from "~/services/kimiOpenPlatform/deployments"
import { isRecord } from "~/utils/core/object"

export const KIMI_FINANCIAL_SOURCES = {
  Console: "console",
  Inference: "inference",
} as const

/** Console integers are 1e-5 currency units. Inference is already currency. */
export function kimiConsoleAmount(value: unknown): string | undefined {
  return normalizeDecimalUnits(value, 100_000)
}

/** One verified envelope contract for account and standalone credential readers. */
export function readKimiFinancialPayload(
  payload: unknown,
  sourceKind: (typeof KIMI_FINANCIAL_SOURCES)[keyof typeof KIMI_FINANCIAL_SOURCES],
) {
  if (
    !isRecord(payload) ||
    payload.code !== 0 ||
    !isRecord(payload.data) ||
    (sourceKind === KIMI_FINANCIAL_SOURCES.Inference && payload.status !== true)
  )
    throw new Error("invalid_kimi_balance")
  return payload.data
}

/** The two sources intentionally have different available-balance contracts. */
export function parseKimiFinancialData(
  payload: unknown,
  scope: UsageScope,
  currency: KimiOpenPlatformCurrency,
  sourceKind: (typeof KIMI_FINANCIAL_SOURCES)[keyof typeof KIMI_FINANCIAL_SOURCES],
  capturedAt = Date.now(),
) {
  const raw = readKimiFinancialPayload(payload, sourceKind)
  const consoleSource = sourceKind === KIMI_FINANCIAL_SOURCES.Console
  const cash = consoleSource
    ? kimiConsoleAmount(raw.cur)
    : parseDecimal(raw.cash_balance)
  const voucher = consoleSource
    ? kimiConsoleAmount(raw.voucher_cur)
    : parseDecimal(raw.voucher_balance)
  const available = consoleSource
    ? cash !== undefined && voucher !== undefined
      ? addDecimal(cash, voucher)
      : undefined
    : parseDecimal(raw.available_balance)
  const source = {
    adapter: currency === CURRENCIES.CNY ? "kimi" : "kimi-global",
    contractVersion: "2",
    operation: consoleSource ? "console/account" : "inference/balance",
    kind: EVIDENCE_KINDS.Reported,
  }
  const position = (id: string, value: unknown) =>
    balancePosition({
      id,
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: currency },
      value,
      source,
      observedAt: capturedAt,
    })
  return {
    ...accountBalanceObservation(
      scope,
      [
        {
          ...position("available", available),
          nature: BALANCE_NATURES.Mixed,
          amount: {
            ...position("available", available).amount,
            source: {
              ...source,
              kind: consoleSource
                ? EVIDENCE_KINDS.Derived
                : EVIDENCE_KINDS.Reported,
              inputs: consoleSource
                ? ["cur", "voucher_cur"]
                : ["available_balance"],
            },
          },
        },
        {
          ...position(consoleSource ? "cur" : "cash", cash),
          role: BALANCE_ROLES.Ledger,
          parentId: "available",
          relation: BALANCE_RELATIONS.Component,
          cashClassification: consoleSource
            ? BALANCE_CASH_CLASSIFICATIONS.Unknown
            : BALANCE_CASH_CLASSIFICATIONS.ReportedCash,
          amount: {
            ...position(consoleSource ? "cur" : "cash", cash).amount,
            source: {
              ...source,
              inputs: [consoleSource ? "cur" : "cash_balance"],
            },
          },
        },
        {
          ...position("voucher", voucher),
          role: BALANCE_ROLES.Ledger,
          parentId: "available",
          relation: BALANCE_RELATIONS.Component,
          cashClassification: BALANCE_CASH_CLASSIFICATIONS.NotCash,
          instrument: BALANCE_INSTRUMENTS.Voucher,
          amount: {
            ...position("voucher", voucher).amount,
            source: {
              ...source,
              inputs: [consoleSource ? "voucher_cur" : "voucher_balance"],
            },
          },
        },
      ],
      capturedAt,
      FINANCIAL_ENUMERATION.Complete,
    ),
    today: consoleSource ? kimiConsoleAmount(raw.today_consume) : undefined,
  }
}
