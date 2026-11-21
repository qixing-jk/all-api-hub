import { afterEach, expect, it, vi } from "vitest"

import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  confirmCheckInAttempt,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

afterEach(() => vi.useRealTimers())

it("retains an independent grant and the exact native award from fresh readback", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(2000)
  const account = buildSiteAccount()
  const grant = (id: string, observedAt: number) =>
    accountAward(account, {
      id,
      operation: "checkin",
      field: "amount",
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      value: "0.1234567890123456789",
      observedAt,
      event: { namespace: "grant", id },
    })
  const prior = grant("first", 1000)
  const incoming = grant("second", 2000)
  const execution = await confirmCheckInAttempt({
    account,
    startedAt: 1500,
    result: {
      status: "uncertain",
      reasonCode: "checkin_unconfirmed",
      awards: [prior],
    },
    readStatus: async () => ({
      status: {
        outcome: "known",
        today: "checked",
        evidence: { source: "probe", observedAt: 2000 },
      },
      awards: [incoming],
    }),
  })
  expect(execution.result.status).toBe("success")
  expect(execution.result.awards).toEqual([prior, incoming])
  expect(execution.result.reward).toBeUndefined()
})

it("does not carry awards from a discarded account observation into fresh confirmation", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(2000)
  const account = buildSiteAccount()
  const otherAccount = buildSiteAccount({ id: "another-account" })
  const award = accountAward(otherAccount, {
    id: "wrong-account",
    operation: "checkin",
    field: "amount",
    asset: { kind: ASSET_KINDS.Currency, code: "USD" },
    value: "99",
  })
  const result = withCheckInConfirmation(
    otherAccount,
    { status: "success", awards: [award] },
    {
      kind: "observed",
      status: {
        outcome: "known",
        today: "checked",
        evidence: { source: "probe", observedAt: 2000 },
      },
      awards: [award],
    },
  )
  const execution = await confirmCheckInAttempt({
    account,
    result,
    startedAt: 1500,
    readStatus: async () => ({
      status: {
        outcome: "known",
        today: "checked",
        evidence: { source: "probe", observedAt: 2000 },
      },
    }),
  })
  expect(execution.result.status).toBe("success")
  expect(execution.result.awards ?? []).toEqual([])
})
