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
import { AccountCheckInSection } from "~/features/AccountManagement/components/AccountDialog/AccountCheckInSection"
import AccountSnapshotTableRow from "~/features/AutoCheckin/components/AccountSnapshotTableRow"
import ResultsTableRow from "~/features/AutoCheckin/components/ResultsTableRow"
import ResultsTableRowActions from "~/features/AutoCheckin/components/ResultsTableRowActions"
import CheckInFeedbackDialog from "~/features/CheckInFeedback/CheckInFeedbackDialog"
import accountDialogLocale from "~/locales/en/accountDialog.json"
import autoCheckinLocale from "~/locales/en/autoCheckin.json"
import commonLocale from "~/locales/en/common.json"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { collectFeedbackCluesInBrowser } from "~/services/checkin/feedback/scanClient"
import type { CheckinAccountResult } from "~/types/autoCheckin"
import type { CheckInConfig } from "~/types/checkIn"
import { createTab } from "~/utils/browser/browserApi"
import { openAccountManagerWithSearch } from "~/utils/navigation"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"

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
vi.mock("~/utils/browser/browserApi", async (original) => ({
  ...(await original<typeof import("~/utils/browser/browserApi")>()),
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
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("check-in feedback workflow", () => {
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
      const message = cells[2].textContent!
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
        within(dialog).getByText(cells[1].textContent!, { selector: "span" }),
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
      buildSiteAccount({ id: "failed", checkIn }),
    )
    render(
      wrap(
        <ResultsTableRowActions
          result={{
            accountId: "failed",
            accountName: "Private",
            status: "failed",
            timestamp: 1,
            rawMessage: "Upstream denied: Authorization: Bearer private-token",
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
      await screen.findByText("Upstream denied: Authorization: [REDACTED]", {
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
    expect(accountQueries.getAccountById).not.toHaveBeenCalled()
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
        new URL(vi.mocked(createTab).mock.calls[0][0]).searchParams.get("body"),
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
      screen.getByRole("button", { name: "Copy and open GitHub" }),
    )
    expect(createTab).not.toHaveBeenCalled()
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
      new URL(vi.mocked(createTab).mock.calls[0][0]).searchParams.has("body"),
    ).toBe(false)
    write.mockRestore()
  })

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
    const signal = vi.mocked(collectFeedbackCluesInBrowser).mock.calls[0][1]
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
