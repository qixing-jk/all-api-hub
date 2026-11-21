import { afterEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import type { UsageScope } from "~/services/amounts/balance"
import {
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { normalizeTelemetryPatchToFacts } from "~/services/apiCredentialProfiles/telemetry/facts"
import { parseKimiOpenPlatformBalance } from "~/services/apiCredentialProfiles/telemetry/parsers"
import {
  KIMI_FINANCIAL_SOURCES,
  parseKimiFinancialData,
} from "~/services/apiService/kimiOpenPlatform/balance"

afterEach(() => vi.restoreAllMocks())
describe("Kimi inference financial contract across account and credential consumers", () => {
  it.each([CURRENCIES.CNY, CURRENCIES.USD] as const)(
    "preserves the same %s amount roles, funding, nature and field evidence",
    (currency) => {
      vi.spyOn(Date, "now").mockReturnValue(5000)
      const payload = {
        status: true,
        code: 0,
        data: {
          available_balance: "10",
          cash_balance: "-2",
          voucher_balance: "10",
        },
      }
      const scope: UsageScope = {
        subject: {
          kind: FINANCIAL_SUBJECT_KINDS.Account,
          accountId: "account",
        },
        authority: "https://platform.kimi.com",
        projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
        keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
        models: { kind: SCOPE_SELECTION_KINDS.Unknown },
        groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
      }
      const account = parseKimiFinancialData(
        payload,
        scope,
        currency,
        KIMI_FINANCIAL_SOURCES.Inference,
      ).balance
      const credential = normalizeTelemetryPatchToFacts(
        parseKimiOpenPlatformBalance(payload, currency),
        "kimiOpenPlatformBalance",
        {
          profileId: "credential",
          baseUrl: "https://api.moonshot.cn",
          observedAt: 5000,
        },
      ).balanceSnapshot!
      expect(
        credential.positions.map(({ scope: _, ...position }) => position),
      ).toEqual(account.positions.map(({ scope: _, ...position }) => position))
      expect(
        credential.positions.map((position) => [
          position.id,
          position.nature,
          position.funding,
        ]),
      ).toEqual([
        ["available", "mixed", "unknown"],
        ["cash", "unknown", "unknown"],
        ["voucher", "unknown", "unknown"],
      ])
      expect(credential.subject).toEqual({
        kind: "credential",
        profileId: "credential",
      })
    },
  )
  it("uses the same numeric success-code contract as the account reader", () => {
    expect(
      parseKimiOpenPlatformBalance(
        { status: true, code: "0", data: { available_balance: 10 } },
        "CNY",
      ),
    ).toEqual({})
  })
})
