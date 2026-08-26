import "./accountActionButtonsMocks"

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
} from "~/services/productAnalytics/contracts"
import { render } from "~~/tests/test-utils/render"

import {
  clipboardWriteTextMock,
  completeProductAnalyticsActionMock,
  fetchAccountTokensMock,
  mockHandleSetAccountDisabled,
  resolveProductAnalyticsErrorCategoryFromErrorMock,
  startProductAnalyticsActionMock,
  toastErrorMock,
  toastSuccessMock,
} from "./accountActionButtonsMocks"
import {
  buildDisplaySiteData,
  createDeferred,
  setupAccountActionButtonsTest,
} from "./accountActionButtonsTestSupport"

describe("AccountActionButtons", () => {
  setupAccountActionButtonsTest()

  it("copies a single token directly when smart copy finds exactly one key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-single" }])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-single-key",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "acc-single-key",
        }),
      )
      expect(toastSuccessMock).toHaveBeenCalledWith("account:actions.keyCopied")
    })
    expect(onCopyKey).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
        },
      },
    )
  })

  it("keeps the smart-copy action busy and suppresses duplicate token probes until rejection settles", async () => {
    const deferredTokens = createDeferred<Array<{ key: string }>>()
    fetchAccountTokensMock.mockReturnValueOnce(deferredTokens.promise)
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pending-copy",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    const copyButton = screen.getByRole("button", {
      name: "account:actions.copyKey",
    })
    await user.click(copyButton)

    expect(copyButton).toHaveAttribute("aria-busy", "true")
    expect(copyButton).toBeDisabled()
    await user.click(copyButton)
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)

    deferredTokens.reject(new Error("token probe failed"))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "account:actions.copyKey" }),
      ).toBeEnabled()
    })
    expect(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    ).not.toHaveAttribute("aria-busy")
  })

  it("shows a fetch-info error when the token probe returns a non-array payload", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({ invalid: true } as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-non-array",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.fetchKeyInfoFailed",
      )
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("opens the copy dialog when smart copy finds multiple tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { key: "sk-one" },
      { key: "sk-two" },
    ])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-multiple-keys",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-multiple-keys" }),
      )
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          itemCount: 2,
        },
      },
    )
  })

  it("falls back to the copy dialog when the token probe throws", async () => {
    const tokenLoadError = { statusCode: 401, message: "private auth text" }
    fetchAccountTokensMock.mockRejectedValueOnce(tokenLoadError)
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValueOnce(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
    )

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-probe-failed",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.fetchKeyListFailed",
      )
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-probe-failed" }),
      )
    })
    expect(
      resolveProductAnalyticsErrorCategoryFromErrorMock,
    ).toHaveBeenCalledWith(tokenLoadError)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth },
    )
  })

  it("tracks completion when toggling account disabled succeeds", async () => {
    mockHandleSetAccountDisabled.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disable-success",
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

    const menu = await screen.findByRole("menu")
    const disableButton = (
      await within(menu).findByText("account:actions.disableAccount")
    ).closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountDisabled,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            targetState: PRODUCT_ANALYTICS_TARGET_STATES.Disabled,
          },
        },
      )
    })
  })
})
