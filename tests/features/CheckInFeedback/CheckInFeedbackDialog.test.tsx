import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AccountCheckInSection } from "~/features/AccountManagement/components/AccountDialog/checkin/AccountCheckInSection"
import AccountSnapshotTableRow from "~/features/AutoCheckin/readiness/AccountSnapshotTableRow"
import ResultsTableRow from "~/features/AutoCheckin/results/ResultsTableRow"
import ResultsTableRowActions from "~/features/AutoCheckin/results/ResultsTableRowActions"
import CheckInFeedbackDialog from "~/features/CheckInFeedback/CheckInFeedbackDialog"
import accountDialogLocale from "~/locales/en/accountDialog.json"
import autoCheckinLocale from "~/locales/en/autoCheckin.json"
import commonLocale from "~/locales/en/common.json"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { collectFeedbackCluesInBrowser } from "~/services/checkin/feedback/scanClient"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type { CheckinAccountResult } from "~/types/autoCheckin"
import type { CheckInConfig } from "~/types/checkIn"
import { sendRuntimeActionMessage } from "~/utils/browser/runtimeMessages"
import { createTab } from "~/utils/browser/tabs"
import { openAccountManagerWithSearch } from "~/utils/navigation"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/utils/browser/runtimeMessages", async (original) => ({
  ...(await original<typeof import("~/utils/browser/runtimeMessages")>()),
  sendRuntimeActionMessage: vi.fn(),
}))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAccountById: vi.fn() },
}))
vi.mock("~/utils/navigation", () => ({ openAccountManagerWithSearch: vi.fn() }))
vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: { getStatus: vi.fn() },
}))
vi.mock("~/services/checkin/feedback/scanClient", async (original) => ({
  ...(await original<
    typeof import("~/services/checkin/feedback/scanClient")
  >()),
  collectFeedbackCluesInBrowser: vi.fn(),
}))
vi.mock("~/utils/browser/tabs", async (original) => ({
  ...(await original<typeof import("~/utils/browser/tabs")>()),
  createTab: vi.fn(),
}))

const checkIn: CheckInConfig = {
  automaticExecutionEnabled: false,
  selection: { mode: "automatic" },
  methodKnowledge: { methods: {} },
}
const snapshot = {
  baseUrl: "https://user:secret@example.com/private?token=private",
  siteType: SITE_TYPES.NEW_API,
  checkIn,
}
const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>
)

beforeAll(() => {
  testI18n.addResourceBundle("en", "accountDialog", accountDialogLocale)
  testI18n.addResourceBundle("en", "autoCheckin", autoCheckinLocale)
  testI18n.addResourceBundle("en", "common", commonLocale)
})
afterAll(() => {
  testI18n.removeResourceBundle("en", "accountDialog")
  testI18n.removeResourceBundle("en", "autoCheckin")
  testI18n.removeResourceBundle("en", "common")
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(autoCheckinStorage.getStatus).mockResolvedValue(null)
  vi.mocked(collectFeedbackCluesInBrowser).mockRejectedValue(
    new Error("unavailable"),
  )
  vi.mocked(createTab).mockResolvedValue(undefined)
  vi.mocked(sendRuntimeActionMessage).mockResolvedValue({ success: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("check-in feedback workflow", () => {
  it("opens a snapshot with execution without waiting for execution storage", async () => {
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(
      buildSiteAccount(),
    )
    vi.mocked(autoCheckinStorage.getStatus).mockImplementation(
      () => new Promise(() => {}),
    )
    render(
      wrap(
        <CheckInFeedbackDialog
          source={{
            accountId: "account",
            snapshot: {
              ...snapshot,
              execution: {
                timestamp: 1,
                status: "failed",
              },
            },
          }}
          onClose={vi.fn()}
        />,
      ),
    )
    expect(
      await screen.findByLabelText("What happened? (optional)"),
    ).toBeVisible()
  })

  it("retains draft feedback when the saved account read fails", async () => {
    vi.mocked(accountQueries.getAccountById).mockRejectedValueOnce(
      new Error("unavailable"),
    )
    render(
      wrap(
        <CheckInFeedbackDialog
          source={{ accountId: "account", snapshot }}
          onClose={vi.fn()}
        />,
      ),
    )
    expect(
      await screen.findByLabelText("What happened? (optional)"),
    ).toBeVisible()
  })

  it("ignores a saved account lookup completed after closing", async () => {
    let resolve!: (account: ReturnType<typeof buildSiteAccount>) => void
    vi.mocked(accountQueries.getAccountById).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const view = render(
      wrap(
        <CheckInFeedbackDialog
          source={{ accountId: "account", snapshot }}
          onClose={vi.fn()}
        />,
      ),
    )
    view.unmount()
    await act(async () => {
      resolve(buildSiteAccount())
    })
    expect(
      screen.queryByLabelText("What happened? (optional)"),
    ).not.toBeInTheDocument()
  })
  it.each(["editor", "saved"])(
    "includes saved refresh diagnostics in %s feedback while preserving drafts",
    async (kind) => {
      const user = userEvent.setup()
      vi.mocked(accountQueries.getAccountById).mockResolvedValue(
        buildSiteAccount({
          health: {
            status: SiteHealthStatus.Error,
            reason:
              "Failed saved-access-secret session=saved-access-secret; private_field=hidden-cookie-value saved-refresh-secret",
          },
          account_info: {
            ...buildSiteAccount().account_info,
            access_token: "saved-access-secret",
          },
          cookieAuth: {
            sessionCookie:
              "session=saved-access-secret; private_field=hidden-cookie-value",
          },
          sub2apiAuth: { refreshToken: "saved-refresh-secret" },
          last_sync_time: 1000,
        }),
      )
      vi.mocked(autoCheckinStorage.getStatus).mockResolvedValue({
        perAccount: {
          account: {
            accountId: "account",
            accountName: "Account",
            status: "failed",
            timestamp: 1,
            rawMessage:
              "Failed session=saved-access-secret; private_field=hidden-cookie-value saved-refresh-secret",
          },
        },
      } as Awaited<ReturnType<typeof autoCheckinStorage.getStatus>>)
      render(
        wrap(
          <CheckInFeedbackDialog
            source={
              kind === "editor"
                ? {
                    accountId: "account",
                    snapshot,
                    auth: {
                      authType: AuthTypeEnum.AccessToken,
                      accessToken: "private-access-token",
                    },
                  }
                : { accountId: "account" }
            }
            onClose={vi.fn()}
          />,
        ),
      )
      await screen.findByLabelText("What happened? (optional)")
      await user.click(screen.getByText("Review and edit submission"))
      await user.click(
        screen.getByText(accountDialogLocale.checkInFeedback.editReport),
      )
      const details = screen.getByLabelText(
        accountDialogLocale.checkInFeedback.details,
      )
      const diagnosticText = (details as HTMLTextAreaElement).value
      expect(diagnosticText).toContain("accountRefreshHealth: error")
      expect(diagnosticText).toContain(
        "accountRefreshRecordedAt: 1970-01-01T00:00:01.000Z",
      )
      expect(diagnosticText).toContain("[REDACTED]")
      expect(diagnosticText).not.toContain("saved-access-secret")
      expect(diagnosticText).not.toContain("hidden-cookie-value")
      expect(diagnosticText).not.toContain("saved-refresh-secret")
      expect((details as HTMLTextAreaElement).value).not.toContain(
        "private-access-token",
      )
      expect((details as HTMLTextAreaElement).value).not.toContain("/private")
    },
  )

  it("opens adaptation feedback as the primary action for an unsupported result", async () => {
    const user = userEvent.setup()
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(
      buildSiteAccount(),
    )
    render(
      wrap(
        <ResultsTableRowActions
          result={{
            accountId: "unsupported",
            accountName: "Account",
            timestamp: 1,
            status: "skipped",
            reasonCode: "no_provider",
          }}
        />,
      ),
    )
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.checkInFeedback.request,
      }),
    )
    expect(
      await screen.findByLabelText("What happened? (optional)"),
    ).toBeVisible()
    expect(accountQueries.getAccountById).toHaveBeenCalledWith("unsupported")
  })

  it("retries the selected result from its overflow menu", async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    render(
      wrap(
        <ResultsTableRowActions
          result={{
            accountId: "retry-target",
            accountName: "Account",
            timestamp: 1,
            status: "failed",
          }}
          onRetryAccount={retry}
        />,
      ),
    )
    await user.click(screen.getByRole("button", { name: "More" }))
    await user.click(
      screen.getByRole("menuitem", {
        name: autoCheckinLocale.execution.actions.retryAccount,
      }),
    )
    expect(retry).toHaveBeenCalledWith("retry-target")
  })

  it.each(["editor", "saved"])(
    "keeps %s feedback available if execution history cannot be read",
    async (sourceKind) => {
      vi.mocked(autoCheckinStorage.getStatus).mockRejectedValueOnce(
        new Error("storage unavailable"),
      )
      vi.mocked(accountQueries.getAccountById).mockResolvedValue(
        buildSiteAccount(),
      )
      render(
        wrap(
          <CheckInFeedbackDialog
            source={
              sourceKind === "editor"
                ? { accountId: "account", snapshot }
                : { accountId: "account" }
            }
            onClose={vi.fn()}
          />,
        ),
      )
      expect(
        await screen.findByLabelText("What happened? (optional)"),
      ).toBeVisible()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    },
  )

  it("returns to the requested account after an account read failure", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.mocked(accountQueries.getAccountById).mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    render(
      wrap(
        <CheckInFeedbackDialog
          source={{ accountId: "unreadable" }}
          onClose={onClose}
        />,
      ),
    )
    await screen.findByRole("alert")
    await user.click(
      screen.getByRole("button", {
        name: accountDialogLocale.checkInFeedback.accounts,
      }),
    )
    expect(openAccountManagerWithSearch).toHaveBeenCalledWith("unreadable")
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("lets users edit completed clues and retry a failed GitHub opening", async () => {
    const user = userEvent.setup()
    vi.mocked(collectFeedbackCluesInBrowser).mockResolvedValue({
      status: "completed",
      routes: ["/api/checkin"],
      statusQueries: [],
      authenticatedQueriesUnavailable: false,
    })
    vi.mocked(createTab).mockRejectedValueOnce(new Error("tabs unavailable"))
    render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    await screen.findByText(accountDialogLocale.checkInFeedback.scanCompleted)
    await user.click(screen.getByText("Review and edit submission"))
    await user.click(
      screen.getByText(accountDialogLocale.checkInFeedback.editReport),
    )
    const clues = screen.getByLabelText(
      accountDialogLocale.checkInFeedback.clues,
    )
    await user.clear(clues)
    await user.type(clues, "Manually corrected clue")
    await user.click(screen.getByRole("button", { name: "Continue to GitHub" }))
    expect(
      await screen.findByText(accountDialogLocale.checkInFeedback.openFailed),
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Continue to GitHub" }))
    expect(
      await screen.findByText(accountDialogLocale.checkInFeedback.opened),
    ).toBeVisible()
    expect(vi.mocked(createTab).mock.calls.at(-1)?.[0]).toContain("Manually")
  })

  it("does not collect from an invalid site address", async () => {
    render(
      wrap(
        <CheckInFeedbackDialog
          source={{ snapshot: { ...snapshot, baseUrl: "invalid" } }}
          onClose={vi.fn()}
        />,
      ),
    )
    await screen.findByLabelText("What happened? (optional)")
    expect(collectFeedbackCluesInBrowser).not.toHaveBeenCalled()
  })

  it("presents collected information without an incomplete-query warning and retains diagnostic notes", async () => {
    const user = userEvent.setup()
    vi.mocked(collectFeedbackCluesInBrowser).mockResolvedValue({
      status: "partial",
      statusQueries: [
        { path: "/api/user/check_in_status", status: 403, keys: ["success"] },
      ],
      routes: [],
      authenticatedQueriesUnavailable: false,
      resources: { discovered: 11, scanned: 7 },
      issues: ["timeout"],
    })
    render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    expect(
      await screen.findByText("Supporting information collected."),
    ).toBeVisible()
    expect(
      screen.queryByText(/other queries did not complete/i),
    ).not.toBeInTheDocument()
    await user.click(screen.getByText("Review and edit submission"))
    const report = (
      screen.getByLabelText(
        "Full submission (select to copy)",
      ) as HTMLTextAreaElement
    ).value
    expect(report).toContain("scan notes</th><td>timeout")
    expect(report).toContain("resources</th><td>7/11")
  })

  it.each([
    {
      status: "failed",
      rawMessage: "Check-in failed: upstream returned HTTP 403",
    },
    {
      status: "success",
      messageKey: "autoCheckin:providerFallback.checkinSuccessful",
    },
    {
      status: "uncertain",
      reconciliation: "unknown",
      rawMessage: "ambiguous response",
    },
  ] as const)(
    "matches the execution table's $status result in the report",
    async (fields) => {
      const user = userEvent.setup()
      const result = {
        accountId: "same",
        accountName: "Account",
        timestamp: 1,
        ...fields,
      } as CheckinAccountResult
      render(
        wrap(
          <table>
            <tbody>
              <ResultsTableRow result={result} />
            </tbody>
          </table>,
        ),
      )
      const row = screen.getByRole("row")
      const cells = within(row).getAllByRole("cell")
      const message = atIndex(cells, 2).textContent!
      render(
        wrap(
          <CheckInFeedbackDialog
            source={{ snapshot: { ...snapshot, execution: result } }}
            onClose={vi.fn()}
          />,
        ),
      )
      const dialog = screen.getByRole("dialog")
      expect(
        await within(dialog).findByText(message, { selector: "p" }),
      ).toBeVisible()
      expect(
        within(dialog).getByText(atIndex(cells, 1).textContent!, {
          selector: "span",
        }),
      ).toBeVisible()
      await user.click(within(dialog).getByText("Review and edit submission"))
      expect(
        (
          within(dialog).getByLabelText(
            "Full submission (select to copy)",
          ) as HTMLTextAreaElement
        ).value,
      ).toContain(`<td>${message}</td>`)
    },
  )

  it("carries the result row's upstream message into feedback with secrets redacted", async () => {
    const user = userEvent.setup()
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(
      buildSiteAccount({
        id: "failed",
        checkIn,
        account_info: {
          ...buildSiteAccount().account_info,
          access_token: "private-token",
        },
        cookieAuth: {
          sessionCookie:
            "session=private-token; private_field=execution-cookie-value",
        },
      }),
    )
    render(
      wrap(
        <ResultsTableRowActions
          result={{
            accountId: "failed",
            accountName: "Private",
            status: "failed",
            timestamp: 1,
            rawMessage:
              "Upstream denied: session=private-token; private_field=execution-cookie-value",
          }}
        />,
      ),
    )
    await user.click(screen.getByRole("button", { name: "More" }))
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Report a check-in problem",
      }),
    )
    expect(
      await screen.findByText("Upstream denied: [REDACTED]", {
        selector: "p",
      }),
    ).toBeVisible()
    await user.click(screen.getByText("Review and edit submission"))
    const report = (
      screen.getByLabelText(
        "Full submission (select to copy)",
      ) as HTMLTextAreaElement
    ).value
    expect(report).toContain("Upstream denied")
    expect(report).not.toContain("execution-cookie-value")
    expect(report).not.toContain("private-token")
  })

  it("includes saved execution for an editor snapshot while retaining unsaved configuration", async () => {
    const user = userEvent.setup()
    vi.mocked(autoCheckinStorage.getStatus).mockResolvedValue({
      perAccount: {
        edited: {
          accountId: "edited",
          accountName: "Private name",
          status: "failed",
          reasonCode: "permission_denied",
          timestamp: 1,
        },
      },
    })
    render(
      wrap(
        <CheckInFeedbackDialog
          source={{ snapshot, accountId: "edited" }}
          onClose={vi.fn()}
        />,
      ),
    )
    await screen.findByLabelText("What happened? (optional)")
    await user.click(screen.getByText("Review and edit submission"))
    const report = (
      screen.getByLabelText(
        "Full submission (select to copy)",
      ) as HTMLTextAreaElement
    ).value
    expect(report).toContain("execution</th><td>failed</td>")
    expect(report).toContain("execution reason</th><td>permission_denied</td>")
    expect(report).toContain("automatic execution enabled</th><td>false</td>")
    expect(accountQueries.getAccountById).toHaveBeenCalledWith("edited")
  })
  it("opens the result row's account and includes its controlled execution reason", async () => {
    const user = userEvent.setup()
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(
      buildSiteAccount({
        id: "failed-account",
        site_url: "https://failed.example",
        checkIn,
      }),
    )
    render(
      wrap(
        <ResultsTableRowActions
          result={{
            accountId: "failed-account",
            accountName: "Private name",
            status: "failed",
            reasonCode: "permission_denied",
            rawMessage: "secret raw response",
            timestamp: 1,
          }}
        />,
      ),
    )
    await user.click(screen.getByRole("button", { name: "More" }))
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Report a check-in problem",
      }),
    )
    await screen.findByLabelText("What happened? (optional)")
    await user.click(screen.getByText("Review and edit submission"))
    const report = (
      screen.getByLabelText(
        "Full submission (select to copy)",
      ) as HTMLTextAreaElement
    ).value
    expect(accountQueries.getAccountById).toHaveBeenCalledWith("failed-account")
    expect(report).toContain("## Site\n\nhttps://failed.example")
    expect(report).toContain("execution reason</th><td>permission_denied</td>")
    expect(report).not.toMatch(/Private name|secret raw response/)
  })

  it("opens feedback from the readiness table without running check-in", async () => {
    const user = userEvent.setup()
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(
      buildSiteAccount({
        id: "unconfigured",
        site_url: "https://unconfigured.example",
        checkIn,
      }),
    )
    vi.mocked(autoCheckinStorage.getStatus).mockResolvedValue({
      perAccount: {
        unconfigured: {
          accountId: "unconfigured",
          accountName: "Private account name",
          status: "failed",
          reasonCode: "permission_denied",
          rawMessage: "private backend payload",
          timestamp: 1,
        },
        other: {
          accountId: "other",
          accountName: "Other account",
          status: "success",
          timestamp: 1,
        },
      },
    })
    render(
      wrap(
        <table>
          <tbody>
            <AccountSnapshotTableRow
              snapshot={{
                accountId: "unconfigured",
                accountName: "Unconfigured",
                siteType: SITE_TYPES.NEW_API,
                detectionEnabled: false,
                autoCheckinEnabled: false,
                providerAvailable: false,
              }}
            />
          </tbody>
        </table>,
      ),
    )
    await user.click(
      screen.getByRole("button", { name: "Report a check-in problem" }),
    )
    await screen.findByLabelText("What happened? (optional)")
    expect(accountQueries.getAccountById).toHaveBeenCalledWith("unconfigured")
    expect(autoCheckinStorage.getStatus).toHaveBeenCalledOnce()
    expect(collectFeedbackCluesInBrowser).toHaveBeenCalledOnce()
    expect(
      screen.getByRole("button", { name: "Continue to GitHub" }),
    ).toBeEnabled()
    await user.click(screen.getByText("Review and edit submission"))
    const report = (
      screen.getByLabelText(
        "Full submission (select to copy)",
      ) as HTMLTextAreaElement
    ).value
    expect(report).toContain("execution</th><td>failed</td>")
    expect(report).toContain("execution reason</th><td>permission_denied</td>")
    expect(report).not.toMatch(
      /Private account name|private backend payload|Other account|execution<\/th><td>success/,
    )
  })

  it.each([true, false])(
    "opens from an unsupported account editor without losing edits (explicit feedback source: %s)",
    async (hasFeedbackSource) => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const redetect = vi.fn()
      render(
        wrap(
          <AccountCheckInSection
            checkIn={checkIn}
            siteType={SITE_TYPES.UNKNOWN}
            siteUrl={snapshot.baseUrl}
            onCheckInChange={onChange}
            onCheckInSelectionChange={onChange}
            onRedetectCheckInMethods={redetect}
            isRedetectingCheckInMethods={false}
            checkInRedetectionFeedback={null}
            feedbackSource={hasFeedbackSource ? { snapshot } : undefined}
          />,
        ),
      )
      await user.click(
        screen.getByRole("button", { name: "Request check-in support" }),
      )
      await screen.findByLabelText("What happened? (optional)")
      expect(accountQueries.getAccountById).not.toHaveBeenCalled()
      expect(collectFeedbackCluesInBrowser).toHaveBeenCalledOnce()
      expect(autoCheckinStorage.getStatus).not.toHaveBeenCalled()
      expect(redetect).not.toHaveBeenCalled()
      await user.type(
        screen.getByLabelText("What happened? (optional)"),
        "Website works",
      )
      await user.click(screen.getByText("Review and edit submission"))
      await user.click(screen.getByText("Edit diagnostic details"))
      await user.clear(screen.getByLabelText("Extension and check-in status"))
      await user.type(
        screen.getByLabelText("Extension and check-in status"),
        "My edited details",
      )
      await user.click(
        screen.getByRole("switch", { name: "Include site address" }),
      )
      const preview = screen.getByLabelText(
        "Full submission (select to copy)",
      ) as HTMLTextAreaElement
      expect(preview.value).toContain("## What happened\n\nWebsite works")
      expect(preview.value).toContain('<td colspan="2">My edited details</td>')
      expect(preview.value).not.toContain("https://example.com")
      await user.click(screen.getByRole("button", { name: "Copy content" }))
      expect(await navigator.clipboard.readText()).toBe(preview.value)
      await user.click(
        screen.getByRole("button", { name: "Continue to GitHub" }),
      )
      expect(
        new URL(
          atIndex(vi.mocked(createTab).mock.calls, 0)[0],
        ).searchParams.get("feedback"),
      ).toBe(preview.value)
      expect(screen.getByLabelText("What happened? (optional)")).toHaveValue(
        "Website works",
      )
      expect(onChange).not.toHaveBeenCalled()
      await user.keyboard("{Escape}")
      await user.click(
        screen.getByRole("button", { name: "Request check-in support" }),
      )
      expect(
        await screen.findByLabelText("What happened? (optional)"),
      ).toHaveValue("")
    },
  )

  it("copies the complete current report before opening GitHub in one action", async () => {
    const user = userEvent.setup()
    render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    const notes = await screen.findByLabelText("What happened? (optional)")
    await user.click(notes)
    await user.paste("Long description ".repeat(800))
    let finishCopy!: () => void
    const originalWrite = navigator.clipboard.writeText.bind(
      navigator.clipboard,
    )
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockImplementationOnce(async (text) => {
        await new Promise<void>((resolve) => {
          finishCopy = resolve
        })
        await originalWrite(text)
      })
    expect(
      screen.queryByRole("button", { name: "Copy content" }),
    ).not.toBeInTheDocument()
    const button = screen.getByRole("button", {
      name: "Copy report and open GitHub",
    })
    await user.click(button)
    expect(sendRuntimeActionMessage).not.toHaveBeenCalled()
    expect(button).toBeDisabled()
    await act(async () => finishCopy())
    expect(sendRuntimeActionMessage).toHaveBeenCalledOnce()
    expect(await navigator.clipboard.readText()).toContain(
      "Long description ".repeat(800),
    )
    const url = new URL(
      atIndex(vi.mocked(sendRuntimeActionMessage).mock.calls, 0)[0]
        .url as string,
    )
    expect(url.searchParams.get("site-url")).toBe("https://example.com")
    expect(url.searchParams.get("template")).toBe("checkin_adaptation.yml")
    expect(url.searchParams.has("feedback")).toBe(false)
    expect(
      screen.queryByRole("button", { name: "Copy content" }),
    ).not.toBeInTheDocument()
    await user.type(notes, " revised")
    await user.click(
      screen.getByRole("button", { name: "Copy report and open GitHub" }),
    )
    expect(sendRuntimeActionMessage).toHaveBeenCalledTimes(2)
    expect(await navigator.clipboard.readText()).toContain("revised")
    write.mockRestore()
  })

  it("keeps the report available after a failed background open and recopies on retry", async () => {
    const user = userEvent.setup()
    render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    const notes = await screen.findByLabelText("What happened? (optional)")
    await user.click(notes)
    await user.paste("Long report ".repeat(800))
    vi.mocked(sendRuntimeActionMessage).mockResolvedValueOnce({
      success: false,
    })
    await user.click(
      screen.getByRole("button", { name: "Copy report and open GitHub" }),
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Could not open GitHub")
    await navigator.clipboard.writeText(
      "Other content copied since the failure",
    )
    await user.click(
      screen.getByRole("button", { name: "Copy report and open GitHub" }),
    )
    expect(await navigator.clipboard.readText()).toContain(
      "Long report ".repeat(800),
    )
    expect(sendRuntimeActionMessage).toHaveBeenCalledTimes(2)
  })

  it("allows copying the latest draft after an older clipboard write finishes", async () => {
    const user = userEvent.setup()
    render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    const notes = await screen.findByLabelText("What happened? (optional)")
    await user.click(notes)
    await user.paste("Long description ".repeat(800))
    let finishCopy!: () => void
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishCopy = resolve
          }),
      )
    await user.click(
      screen.getByRole("button", { name: "Copy report and open GitHub" }),
    )
    await user.type(notes, " revised")
    await act(async () => finishCopy())
    expect(sendRuntimeActionMessage).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "Copy report and open GitHub" }),
    ).toBeEnabled()
    write.mockRestore()
  })

  it("lets manual copying recover a long report when clipboard access stays denied", async () => {
    const user = userEvent.setup()
    render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    await screen.findByLabelText("What happened? (optional)")
    await user.click(screen.getByText("Review and edit submission"))
    await user.click(screen.getByText("Edit diagnostic details"))
    const details = screen.getByLabelText("Extension and check-in status")
    await user.clear(details)
    await user.click(details)
    await user.paste("long report ".repeat(800))
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"))
    await user.click(
      screen.getByRole("button", { name: "Copy report and open GitHub" }),
    )
    expect(sendRuntimeActionMessage).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        "Copy failed. Retry, or expand the submission and copy it manually.",
      ),
    ).toBeVisible()
    expect(
      screen.getByLabelText("Full submission (select to copy)"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "I copied it — open GitHub" }),
    )
    expect(write).toHaveBeenCalledTimes(1)
    expect(
      new URL(
        atIndex(vi.mocked(sendRuntimeActionMessage).mock.calls, 0)[0]
          .url as string,
      ).searchParams.has("feedback"),
    ).toBe(false)
    write.mockRestore()
  })

  it("does not navigate when a rejected clipboard write belongs to a closed report", async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    const notes = await screen.findByLabelText("What happened? (optional)")
    await user.click(notes)
    await user.paste("Long report ".repeat(800))
    let rejectCopy!: (error: Error) => void
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectCopy = reject
          }),
      )
    await user.click(
      screen.getByRole("button", { name: "Copy report and open GitHub" }),
    )
    unmount()
    await act(async () => rejectCopy(new Error("denied")))
    expect(sendRuntimeActionMessage).not.toHaveBeenCalled()
    write.mockRestore()
  })

  it.each([false, true])(
    "keeps a new draft free of an old navigation result (failure: %s)",
    async (fails) => {
      const user = userEvent.setup()
      render(
        wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
      )
      const notes = await screen.findByLabelText("What happened? (optional)")
      let finish!: () => void
      vi.mocked(createTab).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = () =>
              fails
                ? reject(new Error("navigation failed"))
                : resolve(undefined)
          }),
      )
      await user.click(
        screen.getByRole("button", { name: "Continue to GitHub" }),
      )
      await user.type(notes, "new draft")
      await act(async () => finish())
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "Continue to GitHub" }),
      ).toBeEnabled()
      expect(notes).toHaveValue("new draft")
    },
  )

  it("reveals selectable report text when the independent copy action fails", async () => {
    const user = userEvent.setup()
    render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    await screen.findByLabelText("What happened? (optional)")
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"))
    await user.click(screen.getByRole("button", { name: "Copy content" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Copy failed")
    expect(
      screen.getByLabelText("Full submission (select to copy)"),
    ).toBeVisible()
    write.mockRestore()
  })

  it("keeps submission available during scanning and cancels on unmount", async () => {
    const user = userEvent.setup()
    let complete!: (
      value: Awaited<ReturnType<typeof collectFeedbackCluesInBrowser>>,
    ) => void
    vi.mocked(collectFeedbackCluesInBrowser).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const { unmount } = render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    await screen.findByLabelText("What happened? (optional)")
    expect(
      screen.getByRole("button", { name: "Continue to GitHub" }),
    ).toBeEnabled()
    expect(
      screen.getByText("Collecting clues. You can still submit now."),
    ).toBeVisible()
    expect(collectFeedbackCluesInBrowser).toHaveBeenCalledOnce()
    await user.type(
      screen.getByLabelText("What happened? (optional)"),
      "Keep my description",
    )
    await act(async () =>
      complete({
        status: "partial",
        statusQueries: [],
        routes: ["/api/checkin"],
        authenticatedQueriesUnavailable: false,
      }),
    )
    expect(screen.getByLabelText("What happened? (optional)")).toHaveValue(
      "Keep my description",
    )
    await user.click(screen.getByText("Review and edit submission"))
    expect(screen.getByLabelText("Additional clues")).toHaveValue(
      "scan: partial\nroute_hint: /api/checkin",
    )
    unmount()
  })

  it("aborts an active scan when the feedback view closes", async () => {
    vi.mocked(collectFeedbackCluesInBrowser).mockImplementation(
      () => new Promise(() => {}),
    )
    const { unmount } = render(
      wrap(<CheckInFeedbackDialog source={{ snapshot }} onClose={vi.fn()} />),
    )
    await screen.findByLabelText("What happened? (optional)")
    const signal = atIndex(
      vi.mocked(collectFeedbackCluesInBrowser).mock.calls,
      0,
    )[1]
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it("reports a deleted account without opening a report for another account", async () => {
    vi.mocked(accountQueries.getAccountById).mockResolvedValue(null)
    render(
      wrap(
        <CheckInFeedbackDialog
          source={{ accountId: "deleted" }}
          onClose={vi.fn()}
        />,
      ),
    )
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("This account could not be found or read")
    expect(accountQueries.getAccountById).toHaveBeenCalledWith("deleted")
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", {
        name: "Continue to GitHub",
      }),
    ).not.toBeInTheDocument()
  })
})
