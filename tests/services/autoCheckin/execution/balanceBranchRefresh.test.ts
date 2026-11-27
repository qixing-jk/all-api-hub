import { ASSET_KINDS } from "~/services/amounts/financialConstants"

import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import { accountCheckinRunWorkflow } from "~/services/checkin/autoCheckin/execution/runAccountWorkflow"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  mockedAccountStorage,
  mockedMethods,
  runnableCheckIn,
  SCHEDULED_EXECUTION,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

it("keeps an earlier native grant separate from the new day's confirmed check-in observation", async () => {
  vi.clearAllMocks()
  const grantAt = new Date(2026, 0, 31, 23, 59, 59).getTime()
  const observedAt = new Date(2026, 1, 1, 0, 0, 1).getTime()
  const completedAt = observedAt + 5_000
  const account = buildSiteAccount({
    id: "confirmed-native-grant",
    site_type: SITE_TYPES.NEW_API,
    checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
  })
  const award = accountAward(account, {
    id: "grant-1",
    operation: "checkin",
    field: "quota",
    asset: {
      kind: ASSET_KINDS.Quota,
      id: "fixture:native-quota",
      label: "quota",
      displayLabel: "quota",
      displayScale: 1,
    },
    value: "17.000000000000017",
    observedAt: grantAt,
  })
  mockedMethods.executeSelectedCheckIn.mockResolvedValueOnce({
    kind: "executed",
    methodId: "new-api:daily-checkin",
    completedAt,
    confirmation: { observedAt },
    executionReceiptId: "grant-receipt",
    result: { status: "success", awards: [award] },
  })

  const outcome = await accountCheckinRunWorkflow.runAccountCheckin(
    account,
    account.site_name,
    TEMP_WINDOW_REQUEST_SOURCES.Background,
    SCHEDULED_EXECUTION,
  )

  expect(outcome.result).toMatchObject({
    status: "success",
    timestamp: observedAt,
    executionReceiptId: "grant-receipt",
    awardExecutionReceiptIds: ["grant-receipt"],
    awards: [
      {
        amount: {
          value: "17.000000000000017",
          observedAt: grantAt,
        },
      },
    ],
  })
  expect(mockedAccountStorage.markAccountAsSiteCheckedIn).toHaveBeenCalledWith(
    account.id,
    observedAt,
    expect.objectContaining({ account }),
  )
})
