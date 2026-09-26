import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import ResultsTable from "~/features/AutoCheckin/components/ResultsTable"
import enAutoCheckinMessages from "~/locales/en/autoCheckin.json"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { openProtectionBypassHistory } from "~/utils/navigation"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()
  return {
    ...actual,
    openProtectionBypassHistory: vi.fn().mockResolvedValue(undefined),
  }
})

describe("AutoCheckin ResultsTable troubleshooting hints", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows invalidAccessToken hint when the backend reports an invalid access token", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "account-1",
            accountName: "Account 1",
            status: CHECKIN_RESULT_STATUS.FAILED,
            rawMessage: "无权进行此操作，access token 无效",
            timestamp: 0,
          },
        ]}
      />,
    )

    expect(
      await screen.findByText("autoCheckin:execution.hints.invalidAccessToken"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "shieldBypass:history.open" }),
    ).not.toBeInTheDocument()
  })

  it("shows noTabWithId hint when a temporary tab is closed before the flow finishes", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            accountId: "account-3",
            accountName: "Account 3",
            status: CHECKIN_RESULT_STATUS.FAILED,
            rawMessage: "No tab with id: 123.",
            timestamp: 0,
          },
        ]}
      />,
    )

    expect(
      await screen.findByText("autoCheckin:execution.hints.noTabWithId"),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.open" }),
    )
    expect(openProtectionBypassHistory).toHaveBeenCalledTimes(1)
  })

  it("shows manual verification hint when protected check-in requires opening the site first", async () => {
    const user = userEvent.setup()
    render(
      <ResultsTable
        results={[
          {
            accountId: "account-5",
            accountName: "Account 5",
            status: CHECKIN_RESULT_STATUS.FAILED,
            rawMessage: "Turnstile token not available",
            timestamp: 0,
          },
        ]}
      />,
    )

    expect(
      await screen.findByText(
        "autoCheckin:execution.hints.manualVerificationRequired",
      ),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "shieldBypass:history.open" }),
    )
    expect(openProtectionBypassHistory).toHaveBeenCalledTimes(1)
  })

  it("shows site-type troubleshooting for skipped no-provider results", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "account-4",
            accountName: "Account 4",
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            messageKey: "autoCheckin:skipReasons.no_provider",
            timestamp: 0,
          },
        ]}
      />,
    )

    expect(
      await screen.findByText(
        "autoCheckin:execution.hints.siteTypeCheckinUnsupported",
      ),
    ).toBeInTheDocument()
  })

  it("names the site type a failed result should be switched to", async () => {
    const i18n = await createResourceTestI18n({
      en: { autoCheckin: enAutoCheckinMessages },
    })

    render(
      <I18nextProvider i18n={i18n}>
        <ResultsTable
          results={[
            {
              accountId: "account-6",
              accountName: "Account 6",
              status: CHECKIN_RESULT_STATUS.SKIPPED,
              reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
              timestamp: 0,
            },
          ]}
          siteTypeMismatches={{
            "account-6": {
              storedSiteType: SITE_TYPES.NEW_API,
              suggestedSiteType: SITE_TYPES.VELOERA,
            },
          }}
        />
      </I18nextProvider>,
    )

    expect(
      await screen.findByText(
        /This site matches Veloera, which differs from the selected Site Type new-api\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Today's check-in status could not be read, so nothing ran to avoid a duplicate/,
      ),
    ).toBeInTheDocument()
  })

  it("does not show invalidAccessToken hint for unrelated failure messages", async () => {
    render(
      <ResultsTable
        results={[
          {
            accountId: "account-2",
            accountName: "Account 2",
            status: CHECKIN_RESULT_STATUS.FAILED,
            rawMessage: "签到失败",
            timestamp: 0,
          },
        ]}
      />,
    )

    await screen.findByText("签到失败")

    expect(
      screen.queryByText("autoCheckin:execution.hints.invalidAccessToken"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "shieldBypass:history.open" }),
    ).not.toBeInTheDocument()
  })
})
