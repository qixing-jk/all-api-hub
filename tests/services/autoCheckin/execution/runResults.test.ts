// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  buildAccountSnapshot,
  recalculateSummaryFromResults,
  selectCurrentRunResults,
  updateSnapshotWithResult,
} from "~/services/checkin/autoCheckin/execution/runResults"
import {
  mockedMethods,
  noSelectedCheckIn,
  resolveProviderForTest,
  runnableCheckIn,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("execution/runResults", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it("keeps confirmed awards from a partial attempt when the next same-day result has no grant details", () => {
    const timestamp = Date.UTC(2026, 10, 11, 5)
    const award = accountAward(buildSiteAccount({ id: "a" }), {
      id: "daily",
      operation: "/checkin",
      field: "award",
      value: "2",
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      fulfillment: AWARD_FULFILLMENT.Credited,
      target: AWARD_TARGETS.Wallet,
      observedAt: timestamp,
    })
    const previous = {
      accountId: "a",
      accountName: "A",
      status: "failed",
      timestamp,
      awards: [award],
    } as const
    const incoming = {
      accountId: "a",
      accountName: "A",
      status: "success",
      timestamp: timestamp + 1,
    } as const
    const results = selectCurrentRunResults(
      { a: { ...previous, awards: [award] } },
      { a: incoming },
    )
    expect(results.a).toMatchObject({ status: "success", awards: [award] })
    expect(results.a?.awards?.[0]?.amount).toMatchObject({
      observedAt: timestamp,
      value: "2",
    })
  })
  it("deduplicates a reliably identified award while retaining a different equal-amount grant", () => {
    const timestamp = Date.UTC(2026, 10, 11, 5)
    const account = buildSiteAccount({ id: "a" })
    const first = accountAward(account, {
      id: "daily",
      operation: "/checkin",
      field: "award",
      value: "2",
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      event: { namespace: "site-grant", id: "entry-1" },
      observedAt: timestamp,
    })
    const second = {
      ...first,
      event: { namespace: "site-grant", id: "entry-2" },
    }
    const previous = {
      accountId: "a",
      accountName: "A",
      status: "success",
      timestamp,
      awards: [first],
    } as const
    const incoming = {
      accountId: "a",
      accountName: "A",
      status: "success",
      timestamp: timestamp + 1,
      awards: [first, second],
    } as const
    const result = selectCurrentRunResults(
      { a: { ...previous, awards: [first] } },
      { a: { ...incoming, awards: [first, second] } },
    ).a
    expect(result?.awards).toEqual([first, second])
  })
  it("updates snapshots only when the matching account result exists", () => {
    const originalSnapshots = [
      { accountId: "a", lastResult: undefined, label: "A" },
      { accountId: "b", lastResult: undefined, label: "B" },
    ] as any
    const result = {
      accountId: "b",
      status: "success",
    } as any

    expect(updateSnapshotWithResult(undefined, result)).toBeUndefined()

    expect(updateSnapshotWithResult([], result)).toEqual([])

    expect(
      updateSnapshotWithResult(originalSnapshots, {
        accountId: "missing",
        status: "failed",
      } as any),
    ).toBe(originalSnapshots)

    expect(updateSnapshotWithResult(originalSnapshots, result)).toEqual([
      originalSnapshots[0],
      {
        ...originalSnapshots[1],
        lastResult: result,
      },
    ])
  })

  it("derives snapshot skip reasons from account state and provider availability", () => {
    resolveProviderForTest.mockReturnValue({
      getReadiness: vi.fn(() => ({ ready: true })),
    })

    expect(
      (buildAccountSnapshot as any)(
        {
          id: "base",
          disabled: false,
          site_type: "new-api",
          site_name: "Base",
          account_info: { username: "user" },
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        },
        "Base",
      ),
    ).toMatchObject({
      accountId: "base",
      skipReason: undefined,
      providerAvailable: true,
    })

    resolveProviderForTest.mockReturnValueOnce(null)

    expect(
      (buildAccountSnapshot as any)(
        {
          id: "no-provider",
          disabled: false,
          site_type: "new-api",
          site_name: "No Provider",
          account_info: { username: "user" },
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        },
        "No Provider",
      ),
    ).toMatchObject({
      accountId: "no-provider",
      skipReason: "no_provider",
      providerAvailable: false,
    })

    expect(
      (buildAccountSnapshot as any)(
        {
          id: "manual",
          disabled: false,
          site_type: "new-api",
          site_name: "Manual",
          account_info: { username: "user" },
          checkIn: noSelectedCheckIn(),
        },
        "Manual",
      ),
    ).toMatchObject({
      accountId: "manual",
      skipReason: "no_selected_method",
    })

    expect(
      (buildAccountSnapshot as any)(
        {
          id: "unsupported-site-type",
          disabled: false,
          site_type: SITE_TYPES.AIHUBMIX,
          site_name: "Unsupported Site Type",
          account_info: { username: "user" },
          checkIn: noSelectedCheckIn(),
        },
        "Unsupported Site Type",
      ),
    ).toMatchObject({
      accountId: "unsupported-site-type",
      skipReason: "no_provider",
    })

    resolveProviderForTest.mockReturnValueOnce({
      getReadiness: vi.fn(() => ({
        ready: false,
        reason: "account_data_missing",
      })),
    })

    expect(
      (buildAccountSnapshot as any)(
        {
          id: "provider-not-ready",
          disabled: false,
          site_type: "new-api",
          site_name: "Provider Not Ready",
          account_info: { username: "user" },
          checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
        },
        "Provider Not Ready",
      ),
    ).toMatchObject({
      accountId: "provider-not-ready",
      skipReason: "account_data_missing",
      providerAvailable: false,
    })

    expect(
      (buildAccountSnapshot as any)(
        {
          id: "auto-disabled",
          disabled: false,
          site_type: "new-api",
          site_name: "Auto Disabled",
          account_info: { username: "user" },
          checkIn: runnableCheckIn(false, SITE_TYPES.NEW_API),
        },
        "Auto Disabled",
      ),
    ).toMatchObject({
      accountId: "auto-disabled",
      skipReason: "auto_checkin_disabled",
    })
  })

  it.each([
    {
      domainReason: "already_checked",
      snapshotReason: "already_checked_today",
    },
    {
      domainReason: "method_disabled",
      snapshotReason: "method_disabled",
    },
  ])(
    "preserves $domainReason instead of reporting provider readiness",
    ({ domainReason, snapshotReason }) => {
      mockedMethods.inspectSelectedCheckInCompatibility.mockReturnValueOnce({
        state: {
          selectionState: {
            mode: "automatic",
            status: "selected",
            methodId: "new-api:daily-checkin",
          },
          executionEligibility: {
            eligible: false,
            skipReason: domainReason,
          },
        },
        providerAvailable: false,
      })

      expect(
        (buildAccountSnapshot as any)(
          {
            id: domainReason,
            disabled: false,
            site_type: "new-api",
            site_name: domainReason,
            account_info: { username: "user" },
            checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
          },
          domainReason,
        ),
      ).toMatchObject({
        skipReason: snapshotReason,
        providerAvailable: false,
      })
    },
  )

  it("recalculates summaries while preserving the previous eligible total when provided", () => {
    expect(
      (recalculateSummaryFromResults as any)(
        {
          a: { status: "success" },
          b: { status: "already_checked" },
          c: { status: "failed" },
          d: { status: "skipped" },
        },
        {
          totalEligible: 7,
        },
      ),
    ).toEqual({
      totalEligible: 7,
      executed: 3,
      successCount: 2,
      alreadyCheckedCount: 1,
      failedCount: 1,
      skippedCount: 1,
      needsRetry: true,
    })
  })
})
