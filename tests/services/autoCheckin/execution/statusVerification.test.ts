// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { NON_REPEAT_SAFE_CHECKIN_METHOD_IDS } from "~/services/checkin/autoCheckin/providers/registry"
import { CHECK_IN_STATUS_REFRESH_OUTCOMES } from "~/services/checkin/autoCheckin/scheduling/refresh"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import {
  expectRecordedRetryDecision,
  mockedAccountStorage,
  mockedAutoCheckinStorage,
  mockedInspection,
  mockedMethods,
  mockedRefreshSelectedStatus,
  mockedUserPreferences,
  runnableCheckIn,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("execution/statusVerification", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0))
  })
  const verificationAccount = {
    id: "verify-account",
    site_type: SITE_TYPES.NEW_API,
    checkIn: runnableCheckIn(),
  } as any
  it("verifies status before persisting the selected method", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
      verificationAccount,
    )
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
        return config
      },
    )

    await expect(
      autoCheckinScheduler.verifyAccountStatus(verificationAccount.id),
    ).resolves.toMatchObject({ outcome: "verified" })

    expect(
      mockedAccountStorage.prepareAccountForSelectedCheckIn,
    ).toHaveBeenCalledWith(verificationAccount.id, verificationAccount.checkIn)
    expect(mockedMethods.executeSelectedCheckIn).not.toHaveBeenCalled()
  })

  it("updates autoCheckinStorage when verified status is confirmed checked", async () => {
    let storedStatus: any = {
      perAccount: {
        [verificationAccount.id]: {
          accountId: verificationAccount.id,
          accountName: "Verify Account",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          timestamp: 1,
        },
      },
      retryState: {
        day: formatLocalDayKey(),
        pendingAccountIds: [verificationAccount.id],
        attemptsByAccount: { [verificationAccount.id]: 1 },
      },
    }
    mockedAutoCheckinStorage.getStatus.mockImplementation(
      async () => storedStatus,
    )
    mockedAutoCheckinStorage.updateStatus.mockImplementation(
      async (updater: any) => {
        const applied = updater(storedStatus)
        if (applied.patch) {
          storedStatus = { ...storedStatus, ...applied.patch }
        }
        return { ok: true, result: applied.result ?? null }
      },
    )

    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })
    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([verificationAccount])
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
      verificationAccount,
    )
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
        return config
      },
    )
    mockedInspection.getSelectedCheckInStatus.mockReturnValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      observedAt: Date.now(),
    })

    const outcome = await autoCheckinScheduler.verifyAccountStatus(
      verificationAccount.id,
    )
    expect(outcome).toMatchObject({
      outcome: "verified",
      verifiedStatus: "checked",
    })

    const updated = await autoCheckinStorage.getStatus()
    expect(updated?.perAccount?.[verificationAccount.id]?.status).toBe(
      CHECKIN_RESULT_STATUS.SUCCESS,
    )
    expect(updated?.retryState?.pendingAccountIds).not.toContain(
      verificationAccount.id,
    )
    expect(updated?.pendingRetry).toBe(false)
  })

  it.each([
    {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      sameDay: true,
      checked: true,
      keepsReward: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      sameDay: true,
      checked: true,
      keepsReward: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      sameDay: false,
      checked: true,
      keepsReward: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      sameDay: true,
      checked: true,
      keepsReward: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      sameDay: true,
      checked: false,
      keepsReward: false,
    },
  ])(
    "retains a reward only after confirming a same-day successful result: %j",
    async ({ status, sameDay, checked, keepsReward }) => {
      const now = Date.now()
      let storedStatus: any = {
        perAccount: {
          [verificationAccount.id]: {
            accountId: verificationAccount.id,
            accountName: "Verify Account",
            status,
            reward: { quota: 250_000 },
            timestamp: sameDay ? now : now - 48 * 60 * 60 * 1000,
          },
        },
      }
      mockedAutoCheckinStorage.getStatus.mockImplementation(
        async () => storedStatus,
      )
      mockedAutoCheckinStorage.updateStatus.mockImplementation(
        async (updater: any) => {
          const applied = updater(storedStatus)
          if (applied.patch)
            storedStatus = { ...storedStatus, ...applied.patch }
          return { ok: true, result: applied.result ?? null }
        },
      )
      mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
      mockedAccountStorage.getAllAccounts.mockResolvedValue([
        verificationAccount,
      ])
      mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
        verificationAccount,
      )
      mockedUserPreferences.getPreferences.mockResolvedValue({
        autoCheckin: DEFAULT_PREFERENCES.autoCheckin,
      })
      mockedRefreshSelectedStatus.mockImplementation(
        async ({ onOutcome, config }: any) => {
          onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
          return config
        },
      )
      mockedInspection.getSelectedCheckInStatus.mockReturnValue({
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        today: checked
          ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
          : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        observedAt: now,
      })
      const outcome = await autoCheckinScheduler.verifyAccountStatus(
        verificationAccount.id,
      )
      expect(outcome).toMatchObject({
        outcome: "verified",
        verifiedStatus: checked ? "checked" : "not_checked",
      })
      const updated = await autoCheckinStorage.getStatus()
      expect(updated?.perAccount?.[verificationAccount.id]?.reward).toEqual(
        keepsReward ? { quota: 250_000 } : undefined,
      )
    },
  )

  it("queues a verified not-checked result that was not already pending", async ({
    onTestFinished,
  }) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    let storedStatus: any = {
      perAccount: {
        [verificationAccount.id]: {
          accountId: verificationAccount.id,
          accountName: "Verify Account",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          timestamp: 1,
        },
      },
    }
    mockedAutoCheckinStorage.getStatus.mockImplementation(
      async () => storedStatus,
    )
    mockedAutoCheckinStorage.updateStatus.mockImplementation(
      async (updater: any) => {
        const applied = updater(storedStatus)
        if (applied.patch) {
          storedStatus = { ...storedStatus, ...applied.patch }
        }
        return { ok: true, result: applied.result ?? null }
      },
    )

    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([verificationAccount])
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin,
        globalEnabled: true,
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 3,
        },
      },
    })
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
      verificationAccount,
    )
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
        return config
      },
    )
    mockedInspection.getSelectedCheckInStatus.mockReturnValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      observedAt: Date.now(),
    })

    const outcome = await autoCheckinScheduler.verifyAccountStatus(
      verificationAccount.id,
    )
    expect(outcome).toMatchObject({
      outcome: "verified",
      verifiedStatus: "not_checked",
    })

    const updated = await autoCheckinStorage.getStatus()
    const result = updated?.perAccount?.[verificationAccount.id]
    expect(result?.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
    expect(result?.retryable).toBe(true)
    expectRecordedRetryDecision(result!)
    expect(updated?.retryState).toEqual({
      day: formatLocalDayKey(),
      pendingAccountIds: [verificationAccount.id],
      attemptsByAccount: { [verificationAccount.id]: 1 },
    })
    expect(updated?.pendingRetry).toBe(true)
  })

  it("marks verified not-checked results as non-retryable when the method is not repeat-safe", async () => {
    const methodId = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
    const repeatUnsafeAccount = {
      ...verificationAccount,
      checkIn: runnableCheckIn(true, SITE_TYPES.NEW_API),
    }
    let storedStatus: any = {
      perAccount: {
        [verificationAccount.id]: {
          accountId: verificationAccount.id,
          accountName: "Verify Account",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
          messageKey: "autoCheckin:skipReasons.upstream_error",
          methodId,
          timestamp: 1,
        },
      },
    }
    mockedAutoCheckinStorage.getStatus.mockImplementation(
      async () => storedStatus,
    )
    mockedAutoCheckinStorage.updateStatus.mockImplementation(
      async (updater: any) => {
        const applied = updater(storedStatus)
        if (applied.patch) {
          storedStatus = { ...storedStatus, ...applied.patch }
        }
        return { ok: true, result: applied.result ?? null }
      },
    )

    mockedAccountStorage.getAccountById.mockResolvedValue(repeatUnsafeAccount)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([repeatUnsafeAccount])
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
      repeatUnsafeAccount,
    )
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
        return config
      },
    )
    mockedInspection.getSelectedCheckInStatus.mockReturnValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      observedAt: Date.now(),
    })

    const mutableSet = NON_REPEAT_SAFE_CHECKIN_METHOD_IDS as Set<string>
    mutableSet.add(methodId)

    try {
      const outcome = await autoCheckinScheduler.verifyAccountStatus(
        verificationAccount.id,
      )
      expect(outcome).toMatchObject({
        outcome: "verified",
        verifiedStatus: "not_checked",
      })

      const updated = await autoCheckinStorage.getStatus()
      const result = updated?.perAccount?.[verificationAccount.id]
      expect(result?.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
      expect(result?.retryable).toBe(false)
      expectRecordedRetryDecision(result!)
    } finally {
      mutableSet.delete(methodId)
    }
  })

  it("rejects status verification when the account no longer exists", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValue(null)

    await expect(
      autoCheckinScheduler.verifyAccountStatus("missing-account"),
    ).resolves.toMatchObject({ outcome: "account_not_found" })
    expect(mockedRefreshSelectedStatus).not.toHaveBeenCalled()
  })

  it("does not report success when the status read is unavailable", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Unavailable)
        return config
      },
    )

    await expect(
      autoCheckinScheduler.verifyAccountStatus(verificationAccount.id),
    ).resolves.toMatchObject({ outcome: "unavailable" })
    expect(
      mockedAccountStorage.prepareAccountForSelectedCheckIn,
    ).not.toHaveBeenCalled()
  })

  it("reports unsupported when status readback is unsupported by the provider", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Unsupported)
        return config
      },
    )

    await expect(
      autoCheckinScheduler.verifyAccountStatus(verificationAccount.id),
    ).resolves.toMatchObject({
      outcome: "unsupported",
      error: "autoCheckin:messages.error.statusVerificationUnsupported",
    })
    expect(
      mockedAccountStorage.prepareAccountForSelectedCheckIn,
    ).not.toHaveBeenCalled()
  })

  it("does not report success when account-state persistence fails", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
      null,
    )
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
        return config
      },
    )

    await expect(
      autoCheckinScheduler.verifyAccountStatus(verificationAccount.id),
    ).resolves.toMatchObject({ outcome: "not_saved" })
  })

  it("does not report success when scheduler-status persistence fails", async () => {
    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([verificationAccount])
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
      verificationAccount,
    )
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
        return config
      },
    )
    mockedInspection.getSelectedCheckInStatus.mockReturnValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      observedAt: Date.now(),
    })
    mockedUserPreferences.getPreferences.mockResolvedValue({
      autoCheckin: DEFAULT_PREFERENCES.autoCheckin,
    })
    mockedAutoCheckinStorage.updateStatus.mockResolvedValueOnce({
      ok: false,
      result: null,
    })

    await expect(
      autoCheckinScheduler.verifyAccountStatus(verificationAccount.id),
    ).resolves.toMatchObject({ outcome: "not_saved" })
  })

  it("does not update stored status when verified status is unknown", async () => {
    let storedStatus: any = {
      perAccount: {
        [verificationAccount.id]: {
          accountId: verificationAccount.id,
          accountName: "Verify Account",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          timestamp: 1,
        },
      },
    }
    mockedAutoCheckinStorage.getStatus.mockImplementation(
      async () => storedStatus,
    )
    mockedAutoCheckinStorage.updateStatus.mockImplementation(
      async (updater: any) => {
        const applied = updater(storedStatus)
        if (applied.patch) {
          storedStatus = { ...storedStatus, ...applied.patch }
        }
        return { ok: true, result: applied.result ?? null }
      },
    )

    mockedAccountStorage.getAccountById.mockResolvedValue(verificationAccount)
    mockedAccountStorage.getAllAccounts.mockResolvedValue([verificationAccount])
    mockedAccountStorage.prepareAccountForSelectedCheckIn.mockResolvedValue(
      verificationAccount,
    )
    mockedRefreshSelectedStatus.mockImplementation(
      async ({ onOutcome, config }: any) => {
        onOutcome(CHECK_IN_STATUS_REFRESH_OUTCOMES.Read)
        return config
      },
    )
    mockedInspection.getSelectedCheckInStatus.mockReturnValue({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      observedAt: Date.now(),
    })

    const outcome = await autoCheckinScheduler.verifyAccountStatus(
      verificationAccount.id,
    )
    expect(outcome).toMatchObject({
      outcome: "verified",
      verifiedStatus: "unknown",
    })
    expect(storedStatus.perAccount[verificationAccount.id].status).toBe(
      CHECKIN_RESULT_STATUS.UNCERTAIN,
    )
  })
})
