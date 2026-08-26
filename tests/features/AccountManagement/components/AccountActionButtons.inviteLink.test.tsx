import "./accountActionButtonsMocks"

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import * as inviteLinkCopyWorkflow from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render } from "~~/tests/test-utils/render"

import {
  canFetchDisplayAccountInviteLinkMock,
  clipboardWriteTextMock,
  completeProductAnalyticsActionMock,
  fetchDisplayAccountInviteLinkMock,
  mockHandleRefreshAccount,
  resolveProductAnalyticsErrorCategoryFromErrorMock,
  startProductAnalyticsActionMock,
  toastDismissMock,
  toastErrorMock,
  toastLoadingMock,
  toastSuccessMock,
} from "./accountActionButtonsMocks"
import {
  buildDisplaySiteData,
  copyInviteLinkFromRowMenu,
  createDeferred,
  setupAccountActionButtonsTest,
} from "./accountActionButtonsTestSupport"

describe("AccountActionButtons", () => {
  setupAccountActionButtonsTest()

  it("shows local menu refresh as busy and restores it after completion", async () => {
    const deferredRefresh = createDeferred<void>()
    mockHandleRefreshAccount.mockReturnValueOnce(deferredRefresh.promise)
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-local-refresh",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    await user.click(
      screen.getByRole("menuitem", { name: "account:actions.refresh" }),
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const pendingRefresh = screen.getByRole("menuitem", {
      name: "common:status.refreshing",
    })
    expect(pendingRefresh).toBeDisabled()
    expect(pendingRefresh).toHaveAttribute("aria-busy", "true")
    await user.click(pendingRefresh)
    expect(mockHandleRefreshAccount).toHaveBeenCalledTimes(1)

    deferredRefresh.resolve()

    await waitFor(() => {
      expect(
        screen.getByRole("menuitem", { name: "account:actions.refresh" }),
      ).toBeEnabled()
    })
    expect(
      screen.getByRole("menuitem", { name: "account:actions.refresh" }),
    ).not.toHaveAttribute("aria-busy")
  })

  it("copies a supported account invite link from the row menu", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText: clipboardWriteTextMock }),
    })
    const site = buildDisplaySiteData({
      id: "invite-row",
      disabled: false,
      name: "Invite Row",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://invite.example.invalid",
    })

    render(
      <AccountActionButtons
        site={site}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const copyInviteLinkItem = await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    })

    await user.click(copyInviteLinkItem)

    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "invite-row" }),
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      )
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        "https://invite.example.invalid/register?aff=row",
      )
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.inviteLinkCopied",
      )
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountInviteLink,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 1,
            successCount: 1,
            failureCount: 0,
          },
        },
      )
    })
  })

  it("tracks a cancelled invite-link copy without showing failure feedback", async () => {
    vi.spyOn(
      inviteLinkCopyWorkflow,
      "runInviteLinkCopyWorkflow",
    ).mockResolvedValueOnce({
      result: inviteLinkCopyWorkflow.INVITE_LINK_COPY_RESULTS.Cancelled,
      selectedCount: 1,
      itemCount: 1,
      successCount: 0,
      failureCount: 0,
      unsupportedCount: 0,
      skippedCount: 0,
    })

    await copyInviteLinkFromRowMenu("invite-cancelled")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
      )
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      analyticsErrorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      result: inviteLinkCopyWorkflow.INVITE_LINK_COPY_RESULTS.Unsupported,
      itemCount: 0,
      failureCount: 0,
      unsupportedCount: 1,
      toastKey: "account:actions.copyInviteLinkUnsupported",
    },
    {
      analyticsErrorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      result: inviteLinkCopyWorkflow.INVITE_LINK_COPY_RESULTS.Failure,
      itemCount: 1,
      failureCount: 1,
      unsupportedCount: 0,
      toastKey: "account:actions.copyInviteLinkFailedWithReason",
    },
  ])(
    "shows failure feedback and tracks $analyticsErrorCategory for the $result invite-link result",
    async ({
      analyticsErrorCategory,
      failureCount,
      itemCount,
      result,
      toastKey,
      unsupportedCount,
    }) => {
      vi.spyOn(
        inviteLinkCopyWorkflow,
        "runInviteLinkCopyWorkflow",
      ).mockResolvedValueOnce({
        result,
        selectedCount: 1,
        itemCount,
        successCount: 0,
        failureCount,
        unsupportedCount,
        skippedCount: 0,
      })

      await copyInviteLinkFromRowMenu(`invite-${result}`)

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith(toastKey)
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: analyticsErrorCategory },
      )
    },
  )

  it("shows an actionable reason when invite links are disabled by the site", async () => {
    vi.spyOn(
      inviteLinkCopyWorkflow,
      "runInviteLinkCopyWorkflow",
    ).mockResolvedValueOnce({
      result: inviteLinkCopyWorkflow.INVITE_LINK_COPY_RESULTS.Failure,
      selectedCount: 1,
      itemCount: 1,
      successCount: 0,
      failureCount: 1,
      failureReasonCounts: {
        [INVITE_LINK_FAILURE_REASONS.FeatureDisabled]: 1,
      },
      unsupportedCount: 0,
      skippedCount: 0,
    })

    await copyInviteLinkFromRowMenu("invite-feature-disabled")

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.copyInviteLinkFailedWithReason",
      )
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported },
    )
  })

  it("shows fallback feedback when the invite-link workflow rejects unexpectedly", async () => {
    const workflowError = new Error("Invite-link workflow failed")
    vi.spyOn(
      inviteLinkCopyWorkflow,
      "runInviteLinkCopyWorkflow",
    ).mockRejectedValueOnce(workflowError)
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValueOnce(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
    )

    await copyInviteLinkFromRowMenu("invite-workflow-rejected")

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.copyInviteLinkFailed",
      )
    })
    expect(
      resolveProductAnalyticsErrorCategoryFromErrorMock,
    ).toHaveBeenCalledWith(workflowError)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network },
    )
  })

  it("prevents rapid invite-link re-entry from leaking its loading toast", async () => {
    const deferredInviteLink = createDeferred<string>()
    fetchDisplayAccountInviteLinkMock.mockReturnValue(
      deferredInviteLink.promise,
    )
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "invite-row-rapid",
          disabled: false,
          name: "Invite Row Rapid",
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://invite.example.invalid",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const copyInviteLinkItem = await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    })
    toastLoadingMock
      .mockImplementationOnce(() => {
        copyInviteLinkItem.click()
        return "toast-invite-link-first"
      })
      .mockReturnValueOnce("toast-invite-link-second")

    await user.click(copyInviteLinkItem)
    deferredInviteLink.resolve(
      "https://invite.example.invalid/register?aff=rapid",
    )

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith("toast-invite-link-first")
    })
    expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(1)
    expect(toastLoadingMock).toHaveBeenCalledTimes(1)
  })

  it("shows an unavailable invite-link action for unsupported enabled accounts", async () => {
    const user = userEvent.setup()
    canFetchDisplayAccountInviteLinkMock.mockReturnValue(false)

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "invite-unsupported",
          disabled: false,
          siteType: SITE_TYPES.ONE_API,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const copyInviteLinkItem = await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    })
    expect(copyInviteLinkItem).toBeDisabled()
    expect(copyInviteLinkItem).toHaveAttribute(
      "title",
      "account:actions.copyInviteLinkUnsupported",
    )
  })

  it("omits the invite-link action for disabled accounts", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "invite-disabled",
          disabled: true,
          siteType: SITE_TYPES.NEW_API,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    expect(
      screen.queryByRole("menuitem", {
        name: "account:actions.copyInviteLink",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps the fetched invite link available for manual copy when clipboard access fails", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText: clipboardWriteTextMock }),
    })
    clipboardWriteTextMock.mockRejectedValueOnce(
      new DOMException("Clipboard access denied", "NotAllowedError"),
    )

    await copyInviteLinkFromRowMenu("invite-manual-copy", user)

    expect(
      await screen.findByRole("dialog", {
        name: "account:inviteLinkManualCopy.title",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.inviteLinkManualCopyTextarea,
      ),
    ).toHaveValue("https://invite.example.invalid/register?aff=row")
    expect(toastErrorMock).toHaveBeenCalledWith(
      "account:actions.copyInviteLinkClipboardFailed",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
        insights: {
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
        },
      },
    )

    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "account:inviteLinkManualCopy.title",
        }),
      ).not.toBeInTheDocument()
    })
  })
})
