import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { windhubProvider } from "~/services/checkin/autoCheckin/providers/windhub"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  createTab,
  removeTab,
  sendTabMessageWithRetry,
} from "~/utils/browser/browserApi"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/utils/browser/browserApi", () => ({
  createTab: vi.fn(),
  removeTab: vi.fn(),
  sendTabMessageWithRetry: vi.fn(),
}))

const account: SiteAccount = {
  id: "windhub-test",
  site_name: "Windhub",
  site_url: "https://windhub.cc",
  site_type: SITE_TYPES.WINDHUB,
  authType: AuthTypeEnum.None,
  exchange_rate: 7,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: true,
  excludeFromTodayIncome: true,
  checkIn: buildCheckInConfig(),
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: "123",
    access_token: "",
    username: "",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: Date.now(),
  created_at: Date.now(),
  updated_at: Date.now(),
  user_updated_at: Date.now(),
}

describe("Windhub browser provider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createTab).mockResolvedValue({ id: 7 } as Awaited<
      ReturnType<typeof createTab>
    >)
    vi.mocked(removeTab).mockResolvedValue(undefined)
  })

  it("reads status in a fresh inactive tab and closes it", async () => {
    vi.mocked(sendTabMessageWithRetry).mockResolvedValue({
      kind: "status",
      enabled: true,
      checked: true,
    })
    const status = await windhubProvider.getStatus!({
      account,
      observedAt: 123,
    })
    expect(status?.outcome).toBe(CHECK_IN_METHOD_STATUS_OUTCOMES.Known)
    expect(createTab).toHaveBeenCalledWith(
      "https://windhub.cc/console/personal",
      false,
    )
    expect(removeTab).toHaveBeenCalledWith(7)
  })

  it("keeps an uncertain clicked tab for inspection without retrying", async () => {
    vi.mocked(sendTabMessageWithRetry).mockResolvedValue({
      kind: "unconfirmed",
    })
    const result = await windhubProvider.checkIn(account, {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      ),
      statusProof: {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: { source: "probe", observedAt: 123 },
      },
    })
    expect(result.status).toBe(CHECKIN_RESULT_STATUS.UNCERTAIN)
    expect(sendTabMessageWithRetry).toHaveBeenCalledTimes(1)
    expect(removeTab).not.toHaveBeenCalled()
  })
})
