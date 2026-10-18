import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { fetchNexaVlinksDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/nexavlinksCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { nexavlinksProvider } from "~/services/checkin/autoCheckin/providers/nexavlinks"
import { supportsCheckInStatusReadback } from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { tempWindowTriggerCheckinPageAction } from "~/utils/browser/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock(
  "~/services/apiService/sub2api/checkin/nexavlinksCheckIn",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiService/sub2api/checkin/nexavlinksCheckIn")
      >()
    return { ...actual, fetchNexaVlinksDailyCheckInStatus: vi.fn() }
  },
)

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  tempWindowTriggerCheckinPageAction: vi.fn(),
}))

type Status = Awaited<ReturnType<typeof fetchNexaVlinksDailyCheckInStatus>>

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.NexaVlinksDailyCheckIn
const CONSOLE_ORIGIN = "https://asia.nexavlinks.com"
const CHECK_IN_URL = `${CONSOLE_ORIGIN}/check-in`

const notCheckedStatus: Status = {
  enabled: true,
  checkedInToday: false,
}

const clickedAction = (verification?: {
  status: string
  provider?: string
}) => ({
  success: true,
  reason: "clicked",
  identity: { userId: "6262", user: { id: "6262" } },
  trigger: {
    status: "clicked",
    clicked: true,
    reason: "clicked",
    detection: {
      hasTurnstile: false,
      score: 0,
      reasons: [],
      title: "",
      url: null,
    },
    ...(verification ? { verification } : {}),
  },
})

const createAccount = (automaticExecutionEnabled = true) =>
  buildSiteAccount({
    id: "nexavlinks-account",
    site_url: CONSOLE_ORIGIN,
    site_type: SITE_TYPES.SUB2API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "6262",
      username: "qihang1217",
      access_token: "example-access-token",
      quota: 0,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    checkIn: {
      automaticExecutionEnabled,
      methodKnowledge: {
        methods: {
          [METHOD_ID]: {
            detection: {
              outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
              evidence: {
                source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
                observedAt: 100,
              },
            },
          },
        },
      },
      selection: {
        mode: CHECK_IN_SELECTION_MODES.Automatic,
        methodId: METHOD_ID,
      },
    },
  })

const executionContext = () => ({
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
})

const notCheckedStatusProof = {
  outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
  availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
  today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
  evidence: {
    source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
    observedAt: 200,
  },
}

const candidateIds = (siteType: AccountSiteType, origin?: string) =>
  autoCheckinMethodRegistry
    .getCandidates(siteType, origin)
    .map((registration) => registration.id)

const checkInWithStatusProof = () =>
  nexavlinksProvider.checkIn(createAccount(), {
    ...executionContext(),
    statusProof: notCheckedStatusProof,
  })

describe("NexaVlinks check-in integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchNexaVlinksDailyCheckInStatus).mockResolvedValue(
      notCheckedStatus,
    )
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue(
      clickedAction() as never,
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    "https://asia.nexavlinks.com",
    "https://asia.nexavlinks.com/check-in",
    "https://freeapi.site",
    "https://toolcode.top",
    "https://www.nexavlinks.com",
    undefined,
  ])("offers read-only discovery across Sub2API origins: %s", (origin) => {
    // The protocol lives on the account's own origin, so it is probed like the
    // sibling Sub2API plugins instead of being gated to one console.
    expect(candidateIds(SITE_TYPES.SUB2API, origin)).toContain(METHOD_ID)
  })

  it("limits the candidate to Sub2API accounts", () => {
    expect(candidateIds(SITE_TYPES.NEW_API, CONSOLE_ORIGIN)).not.toContain(
      METHOD_ID,
    )
  })

  it("requires account credentials", () => {
    const account = createAccount()
    account.account_info.access_token = ""
    expect(nexavlinksProvider.getReadiness?.(account)).toMatchObject({
      ready: false,
    })
  })

  it("discovers the confirmed status without submitting", async () => {
    await expect(
      nexavlinksProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({
      detection: { outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched },
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })

  it("reports the observed status facts", async () => {
    await expect(
      nexavlinksProvider.getStatus?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toEqual({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: 200,
      },
    })
  })

  it("reports an ineligible deployment as disabled", async () => {
    vi.mocked(fetchNexaVlinksDailyCheckInStatus).mockResolvedValue({
      enabled: false,
      checkedInToday: false,
    })
    await expect(
      nexavlinksProvider.getStatus?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({
      availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    })
  })

  it.each([
    [401, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown],
    [404, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported],
    [405, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported],
    [500, CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown],
  ])("classifies discovery HTTP %s as %s", async (status, outcome) => {
    vi.mocked(fetchNexaVlinksDailyCheckInStatus).mockRejectedValue(
      new ApiError("unavailable", status),
    )
    await expect(
      nexavlinksProvider.detect?.({
        account: createAccount(),
        observedAt: 200,
      }),
    ).resolves.toMatchObject({ outcome })
  })

  it("blocks the page action without authoritative status proof", async () => {
    await expect(
      nexavlinksProvider.checkIn(createAccount(), executionContext()),
    ).resolves.toMatchObject({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })

  it("opens the site's own check-in page with a scoped button trigger", async () => {
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue(
      clickedAction({ status: "completed", provider: "interactive" }) as never,
    )
    vi.mocked(fetchNexaVlinksDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: true,
    })

    await checkInWithStatusProof()

    // The site's sidebar also links "Check In", and the generic text trigger
    // prefers the shortest label, so the trigger is scoped to the page body.
    expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        originUrl: CONSOLE_ORIGIN,
        pageUrl: CHECK_IN_URL,
        siteType: SITE_TYPES.SUB2API,
        expectedUserId: "6262",
        accountId: "nexavlinks-account",
        trigger: {
          kind: "clickText",
          candidateSelector: "main button",
          positivePattern: "check\\s*in|签到",
        },
      }),
    )
  })

  it("confirms a check-in the page completed and reports it as done today", async () => {
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue(
      clickedAction({ status: "completed", provider: "interactive" }) as never,
    )
    vi.mocked(fetchNexaVlinksDailyCheckInStatus).mockResolvedValue({
      enabled: true,
      checkedInToday: true,
    })

    const result = await checkInWithStatusProof()
    expect(result).toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      // The award is credit-denominated, so no quota reward is claimed.
    })
    expect(result.reward).toBeUndefined()
  })

  it("hands an unfinished verification back to the person on the page", async () => {
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue(
      clickedAction({ status: "required", provider: "interactive" }) as never,
    )

    vi.useFakeTimers()
    try {
      const pending = checkInWithStatusProof()
      await vi.advanceTimersByTimeAsync(9_000)
      await expect(pending).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
        messageKey:
          "autoCheckin:providerFallback.nativePageVerificationRequired",
        messageParams: { checkInUrl: CHECK_IN_URL },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps an unconfirmed click as unconfirmed instead of declaring success", async () => {
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue(
      clickedAction() as never,
    )

    vi.useFakeTimers()
    try {
      const pending = checkInWithStatusProof()
      await vi.advanceTimersByTimeAsync(9_000)
      await expect(pending).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
        messageKey: "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
        messageParams: { checkInUrl: CHECK_IN_URL },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports an unreadable status after the page action as unconfirmed", async () => {
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue(
      clickedAction({ status: "completed", provider: "interactive" }) as never,
    )
    vi.mocked(fetchNexaVlinksDailyCheckInStatus).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )

    vi.useFakeTimers()
    try {
      const pending = checkInWithStatusProof()
      await vi.advanceTimersByTimeAsync(9_000)
      await expect(pending).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("refuses to drive a page whose account identity is unknown", async () => {
    const account = createAccount()
    account.account_info.id = ""

    await expect(
      nexavlinksProvider.checkIn(account, {
        ...executionContext(),
        statusProof: notCheckedStatusProof,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      messageKey: "autoCheckin:providerFallback.nativePageIdentityMissing",
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })

  it.each([
    ["identity_missing", AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED],
    ["identity_mismatch", AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED],
    ["target_not_found", AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE],
    ["throttled", AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE],
    ["trigger_failed", AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE],
    ["invalid_request", AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE],
  ] as const)("maps a %s page action to %s", async (reason, expectedReason) => {
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue({
      success: false,
      reason,
    } as never)

    await expect(checkInWithStatusProof()).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: expectedReason,
      messageParams: { checkInUrl: CHECK_IN_URL },
    })
  })

  it("keeps a thrown page action as a page-unavailable failure", async () => {
    vi.mocked(tempWindowTriggerCheckinPageAction).mockRejectedValue(
      new Error("temp window unavailable"),
    )

    await expect(checkInWithStatusProof()).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      messageParams: { checkInUrl: CHECK_IN_URL },
    })
  })

  it("declares a status readback route for feedback", () => {
    expect(supportsCheckInStatusReadback(METHOD_ID)).toBe(true)
    expect(autoCheckinMethodRegistry.resolveById(METHOD_ID)).toMatchObject({
      siteTypes: [SITE_TYPES.SUB2API],
    })
  })
})
