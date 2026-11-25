import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { getChatflowsCheckInPeriodBounds } from "~/services/apiService/sub2api/checkin/chatflowsCheckInProtocol"
import {
  createChatflowsResetTarget,
  mergeChatflowsResetTargets,
  parseChatflowsResetTargets,
  partitionChatflowsResetTargets,
  scheduleChatflowsResetForCheckedAccounts,
  selectChatflowsResetStatusRetryTargets,
  selectRunnableChatflowsResetAccountIds,
  takeDueChatflowsResetTargets,
  type ChatflowsResetTarget,
} from "~/services/checkin/autoCheckin/scheduling/chatflowsResetAlarm"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { clearAlarm, createAlarm, getAlarm } from "~/utils/browser/alarms"
import {
  getLocalStorageValues,
  removeLocalStorage,
  setLocalStorage,
} from "~/utils/browser/storage"
import {
  buildCheckInConfig,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

vi.mock("~/utils/browser/storage", () => ({
  getLocalStorageValues: vi.fn(),
  removeLocalStorage: vi.fn(),
  setLocalStorage: vi.fn(),
}))

vi.mock("~/utils/browser/alarms", () => ({
  clearAlarm: vi.fn(),
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: vi.fn() },
}))

const methodId = AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn
const beforeReset = Date.parse("2026-11-25T03:59:00.000Z")
const afterReset = Date.parse("2026-11-25T04:01:00.000Z")

const makeAccount = (id: string, automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id,
    site_url: "https://ai.chatflowsai.com",
    site_type: SITE_TYPES.SUB2API,
    checkIn: buildCheckInConfig({
      automaticExecutionEnabled,
      selection: { mode: "manual", methodId },
      methodKnowledge: {
        methods: {
          [methodId]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: beforeReset },
            },
          },
        },
      },
    }),
  })

const knownStatus = (
  today: (typeof CHECK_IN_METHOD_TODAY_STATUSES)[keyof typeof CHECK_IN_METHOD_TODAY_STATUSES],
  observedAt: number,
): CheckInMethodStatus => ({
  outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
  availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
  today,
  evidence: { source: "execution", observedAt },
})

describe("Chatflows noon reset alarm", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("stores only a checked selected account and runs that account once after the next period is eligible", () => {
    vi.spyOn(Date, "now").mockReturnValue(beforeReset)
    const target = createChatflowsResetTarget({
      accountId: "chatflows-account",
      methodId,
      automaticExecutionEnabled: true,
      accountDisabled: false,
      globalAutomaticExecutionEnabled: true,
      status: knownStatus(CHECK_IN_METHOD_TODAY_STATUSES.Checked, beforeReset),
    })
    expect(target).toEqual({
      accountId: "chatflows-account",
      methodId,
      ...getChatflowsCheckInPeriodBounds(beforeReset),
    })

    const account = makeAccount("chatflows-account")
    const otherAccount = makeAccount("other-account", false)
    const runIds = selectRunnableChatflowsResetAccountIds({
      targets: [target!],
      now: afterReset,
      globalAutomaticExecutionEnabled: true,
      accounts: [account, otherAccount],
      statuses: new Map([
        [
          account.id,
          knownStatus(CHECK_IN_METHOD_TODAY_STATUSES.NotChecked, afterReset),
        ],
      ]),
    })
    expect(runIds).toEqual([account.id])

    const alreadyClaimed = selectRunnableChatflowsResetAccountIds({
      targets: [target!],
      now: afterReset,
      globalAutomaticExecutionEnabled: true,
      accounts: [account, otherAccount],
      statuses: new Map([
        [
          account.id,
          knownStatus(CHECK_IN_METHOD_TODAY_STATUSES.Checked, afterReset),
        ],
      ]),
    })
    expect(alreadyClaimed).toEqual([])

    const retries = selectChatflowsResetStatusRetryTargets({
      targets: [target!],
      now: afterReset,
      globalAutomaticExecutionEnabled: true,
      accounts: [account, otherAccount],
      statuses: new Map([
        [
          account.id,
          {
            outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
            reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network,
            attemptedAt: afterReset,
          },
        ],
      ]),
    })
    expect(retries).toHaveLength(1)
    expect(retries[0]).toMatchObject({
      accountId: account.id,
      statusReadAttempts: 1,
      nextAttemptAt: afterReset + 30_000,
      nextResetAt: target!.nextResetAt,
    })
    expect(
      selectRunnableChatflowsResetAccountIds({
        targets: retries,
        now: afterReset + 30_000,
        globalAutomaticExecutionEnabled: true,
        accounts: [account],
        statuses: new Map([
          [
            account.id,
            {
              outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
              reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network,
              attemptedAt: afterReset + 30_000,
            },
          ],
        ]),
      }),
    ).toEqual([])
    expect(
      selectChatflowsResetStatusRetryTargets({
        targets: retries,
        now: afterReset + 30_000,
        globalAutomaticExecutionEnabled: true,
        accounts: [account],
        statuses: new Map([
          [
            account.id,
            {
              outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
              reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network,
              attemptedAt: afterReset + 30_000,
            },
          ],
        ]),
      }),
    ).toEqual([])
  })

  it("rejects stale periods, changed account intent, and a disabled global switch", () => {
    vi.spyOn(Date, "now").mockReturnValue(beforeReset)
    const target = createChatflowsResetTarget({
      accountId: "chatflows-account",
      methodId,
      automaticExecutionEnabled: true,
      accountDisabled: false,
      globalAutomaticExecutionEnabled: true,
      status: knownStatus(CHECK_IN_METHOD_TODAY_STATUSES.Checked, beforeReset),
    })!
    const laterPeriod = Date.parse("2026-11-26T04:01:00.000Z")
    const account = makeAccount("chatflows-account")
    const status = knownStatus(
      CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      laterPeriod,
    )
    expect(
      selectRunnableChatflowsResetAccountIds({
        targets: [target],
        now: laterPeriod,
        globalAutomaticExecutionEnabled: true,
        accounts: [account],
        statuses: new Map([[account.id, status]]),
      }),
    ).toEqual([])
    expect(
      selectRunnableChatflowsResetAccountIds({
        targets: [target],
        now: afterReset,
        globalAutomaticExecutionEnabled: false,
        accounts: [account],
        statuses: new Map([
          [
            account.id,
            knownStatus(CHECK_IN_METHOD_TODAY_STATUSES.NotChecked, afterReset),
          ],
        ]),
      }),
    ).toEqual([])
    expect(
      createChatflowsResetTarget({
        accountId: "other",
        methodId: AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
        automaticExecutionEnabled: true,
        accountDisabled: false,
        globalAutomaticExecutionEnabled: true,
        status: knownStatus(
          CHECK_IN_METHOD_TODAY_STATUSES.Checked,
          beforeReset,
        ),
      }),
    ).toBeUndefined()
  })

  it("validates persisted protocol identity and consumes due targets before execution", async () => {
    const bounds = getChatflowsCheckInPeriodBounds(beforeReset)
    const due = {
      accountId: "due-account",
      methodId,
      ...bounds,
    }
    const future = {
      ...due,
      accountId: "future-account",
      ...getChatflowsCheckInPeriodBounds(
        Date.parse("2026-11-25T04:01:00.000Z"),
      ),
    }
    expect(
      parseChatflowsResetTargets({
        version: 1,
        targets: [due, { ...due, periodKey: "stale" }],
      }),
    ).toEqual([due])
    expect(
      partitionChatflowsResetTargets([due, future], bounds.nextResetAt),
    ).toEqual({
      due: [due],
      future: [future],
    })

    vi.mocked(getLocalStorageValues).mockResolvedValue({
      autoCheckin_chatflowsResetQueue_v1: {
        version: 1,
        targets: [due, future],
      },
    })
    vi.mocked(getAlarm).mockResolvedValue(undefined)
    await expect(
      takeDueChatflowsResetTargets(bounds.nextResetAt),
    ).resolves.toEqual([due])
    expect(setLocalStorage).toHaveBeenCalledWith({
      autoCheckin_chatflowsResetQueue_v1: { version: 1, targets: [future] },
    })
    expect(createAlarm).toHaveBeenCalledWith("autoCheckinChatflowsReset", {
      when: future.nextResetAt,
    })
    expect(removeLocalStorage).not.toHaveBeenCalled()
    expect(clearAlarm).toHaveBeenCalledTimes(1)
  })

  it("keeps a later daily-scan reset when an older due target is requeued", () => {
    const oldPeriod = getChatflowsCheckInPeriodBounds(beforeReset)
    const afterResetNextDay = Date.parse("2026-11-26T04:01:00.000Z")
    const laterPeriod = getChatflowsCheckInPeriodBounds(afterResetNextDay)
    const oldRetry: ChatflowsResetTarget = {
      accountId: "chatflows-account",
      methodId,
      ...oldPeriod,
      statusReadAttempts: 1,
      nextAttemptAt: afterReset + 30_000,
    }
    const newerDailyTarget: ChatflowsResetTarget = {
      accountId: "chatflows-account",
      methodId,
      ...laterPeriod,
    }

    expect(mergeChatflowsResetTargets([newerDailyTarget], [oldRetry])).toEqual([
      newerDailyTarget,
    ])
    expect(
      mergeChatflowsResetTargets(
        [
          {
            ...oldRetry,
            nextAttemptAt: afterReset + 60_000,
          },
        ],
        [oldRetry],
      ),
    ).toEqual([oldRetry])
  })

  it("does not clear the queue if the global switch was re-enabled before lock acquisition", async () => {
    vi.mocked(userPreferences.getPreferences)
      .mockResolvedValueOnce({ autoCheckin: { globalEnabled: false } } as any)
      .mockResolvedValueOnce({ autoCheckin: { globalEnabled: true } } as any)

    await scheduleChatflowsResetForCheckedAccounts(beforeReset)

    expect(userPreferences.getPreferences).toHaveBeenCalledTimes(2)
    expect(removeLocalStorage).not.toHaveBeenCalled()
    expect(setLocalStorage).not.toHaveBeenCalled()
    expect(clearAlarm).not.toHaveBeenCalled()
  })
})
