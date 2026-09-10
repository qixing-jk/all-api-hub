import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  canUseAccountDialogRecoverySidePanel,
  discardAccountDialogRecovery,
  openAccountDialogRecovery,
  prepareAccountDialogRecovery,
  type PreparedAccountDialogRecovery,
} from "~/features/AccountManagement/accountDialogRecovery"
import { AccessTokenVerificationGuide } from "~/features/AccountManagement/components/AccountDialog/AccessTokenVerificationGuide"
import { useAccountDialogRecoveryHandoff } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialogRecoveryHandoff"
import {
  createEmptyAccountDialogDraft,
  type AccountDialogRecoveryState,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { closeIfPopup } from "~/utils/navigation"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { testI18n } from "~~/tests/test-utils/i18n"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

vi.mock("~/features/AccountManagement/accountDialogRecovery", () => ({
  canUseAccountDialogRecoverySidePanel: vi.fn(),
  discardAccountDialogRecovery: vi.fn(),
  openAccountDialogRecovery: vi.fn(),
  prepareAccountDialogRecovery: vi.fn(),
}))
vi.mock("~/utils/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation")>()),
  closeIfPopup: vi.fn(),
}))

const prepared: PreparedAccountDialogRecovery = {
  id: "00000000-0000-4000-8000-000000000001",
  tab: { id: 11, windowId: 7 } as browser.tabs.Tab,
  windowId: 7,
}
const snapshot = (): AccountDialogRecoveryState => ({
  url: "https://new-api.example.invalid",
  draft: createEmptyAccountDialogDraft(SITE_TYPES.NEW_API),
  checkInSelectionChanged: false,
  checkInDiscoveryBaseSelection: null,
})
const message = (key: string) =>
  testI18n.t(`accountDialog:accessTokenVerification.${key}`)

function HandoffGuide({ state }: { state: AccountDialogRecoveryState }) {
  const continuation = useAccountDialogRecoveryHandoff({ enabled: true, state })
  return (
    <AccessTokenVerificationGuide
      message="Enter an access token"
      continuation={continuation}
    />
  )
}

const renderGuide = (state: AccountDialogRecoveryState) =>
  render(<HandoffGuide state={state} />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

describe("account dialog recovery continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(canUseAccountDialogRecoverySidePanel).mockReturnValue(true)
    vi.mocked(prepareAccountDialogRecovery)
      .mockReset()
      .mockResolvedValue(prepared)
    vi.mocked(openAccountDialogRecovery)
      .mockReset()
      .mockResolvedValue("sidepanel")
    vi.mocked(discardAccountDialogRecovery)
      .mockReset()
      .mockResolvedValue(undefined)
  })

  it("waits for the draft before opening it once and preserves it when the popup unmounts during handoff", async () => {
    const user = userEvent.setup()
    const preparation = createDeferred<PreparedAccountDialogRecovery>()
    const opening = createDeferred<"sidepanel">()
    vi.mocked(prepareAccountDialogRecovery).mockReturnValueOnce(
      preparation.promise,
    )
    vi.mocked(openAccountDialogRecovery).mockReturnValueOnce(opening.promise)
    const state = snapshot()
    const { unmount } = renderGuide(state)

    const pendingButton = screen.getByRole("button", {
      name: message("continuing"),
    })
    expect(pendingButton).toBeDisabled()
    await user.click(pendingButton)
    expect(openAccountDialogRecovery).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(prepareAccountDialogRecovery).toHaveBeenCalledWith(state, null),
    )
    await act(async () => preparation.resolve(prepared))

    const continueButton = screen.getByRole("button", {
      name: message("continueInSidePanel"),
    })
    act(() => {
      // Two activations before React commits the disabled state must share one handoff.
      fireEvent.click(continueButton)
      fireEvent.click(continueButton)
      expect(openAccountDialogRecovery).toHaveBeenCalledExactlyOnceWith(
        prepared,
      )
    })
    expect(openAccountDialogRecovery).toHaveBeenCalledExactlyOnceWith(prepared)
    expect(closeIfPopup).not.toHaveBeenCalled()
    unmount()
    expect(discardAccountDialogRecovery).not.toHaveBeenCalled()

    await act(async () => opening.resolve("sidepanel"))
    expect(closeIfPopup).toHaveBeenCalledTimes(1)
  })

  it("offers a full page when a sidebar is unavailable", async () => {
    const user = userEvent.setup()
    vi.mocked(canUseAccountDialogRecoverySidePanel).mockReturnValue(false)
    vi.mocked(openAccountDialogRecovery).mockResolvedValue("tab")
    renderGuide(snapshot())

    await user.click(
      await screen.findByRole("button", {
        name: message("continueInFullPage"),
      }),
    )

    expect(screen.getByText(message("fullPageHint"))).toBeVisible()
    expect(openAccountDialogRecovery).toHaveBeenCalledExactlyOnceWith(prepared)
    expect(closeIfPopup).toHaveBeenCalledTimes(1)
  })

  it("keeps the form open after navigation fails and retries the same prepared draft", async () => {
    const user = userEvent.setup()
    vi.mocked(openAccountDialogRecovery).mockRejectedValueOnce(
      new Error("Navigation failed"),
    )
    renderGuide(snapshot())

    await user.click(
      await screen.findByRole("button", {
        name: message("continueInSidePanel"),
      }),
    )

    expect(await screen.findByText(message("continueFailed"))).toHaveAttribute(
      "role",
      "alert",
    )
    expect(closeIfPopup).not.toHaveBeenCalled()
    const retry = screen.getByRole("button", {
      name: message("continueInSidePanel"),
    })
    expect(retry).toBeEnabled()
    await user.click(retry)

    expect(openAccountDialogRecovery).toHaveBeenNthCalledWith(2, prepared)
    expect(prepareAccountDialogRecovery).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByText(message("continueFailed")),
    ).not.toBeInTheDocument()
    expect(closeIfPopup).toHaveBeenCalledTimes(1)
  })

  it("reports a preparation failure and prepares a newly edited form without losing the queue", async () => {
    vi.mocked(prepareAccountDialogRecovery).mockRejectedValueOnce(
      new Error("Storage unavailable"),
    )
    const state = snapshot()
    const { rerender } = renderGuide(state)

    expect(await screen.findByText(message("prepareFailed"))).toHaveAttribute(
      "role",
      "alert",
    )
    expect(
      screen.getByRole("button", { name: message("continueInSidePanel") }),
    ).toBeDisabled()
    expect(openAccountDialogRecovery).not.toHaveBeenCalled()

    const edited = {
      ...state,
      draft: { ...state.draft, notes: "Latest notes" },
    }
    rerender(<HandoffGuide state={edited} />)

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: message("continueInSidePanel") }),
      ).toBeEnabled(),
    )
    expect(prepareAccountDialogRecovery).toHaveBeenNthCalledWith(
      2,
      edited,
      null,
    )
    expect(screen.queryByText(message("prepareFailed"))).not.toBeInTheDocument()
  })

  it.each(["success", "failure"] as const)(
    "waits for the latest edits when an obsolete preparation finishes with %s",
    async (outcome) => {
      const user = userEvent.setup()
      const first = createDeferred<PreparedAccountDialogRecovery>()
      const latest = createDeferred<PreparedAccountDialogRecovery>()
      vi.mocked(prepareAccountDialogRecovery)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(latest.promise)
      const state = snapshot()
      const { rerender } = renderGuide(state)
      await waitFor(() =>
        expect(prepareAccountDialogRecovery).toHaveBeenCalledTimes(1),
      )
      const edited = {
        ...state,
        draft: { ...state.draft, accessToken: "new-token" },
      }
      rerender(<HandoffGuide state={edited} />)

      expect(prepareAccountDialogRecovery).toHaveBeenCalledTimes(1)
      await act(async () => {
        if (outcome === "success") first.resolve(prepared)
        else first.reject(new Error("Old preparation failed"))
      })

      expect(prepareAccountDialogRecovery).toHaveBeenNthCalledWith(
        2,
        edited,
        outcome === "success" ? prepared : null,
      )
      const pending = screen.getByRole("button", {
        name: message("continuing"),
      })
      expect(pending).toBeDisabled()
      await user.click(pending)
      expect(openAccountDialogRecovery).not.toHaveBeenCalled()
      expect(
        screen.queryByText(message("prepareFailed")),
      ).not.toBeInTheDocument()

      await act(async () => latest.resolve(prepared))
      await user.click(
        screen.getByRole("button", { name: message("continueInSidePanel") }),
      )
      expect(openAccountDialogRecovery).toHaveBeenCalledExactlyOnceWith(
        prepared,
      )
    },
  )

  it.each(["successful", "failed"])(
    "attempts %s cleanup when preparation finishes after the dialog closes",
    async (cleanup) => {
      const preparation = createDeferred<PreparedAccountDialogRecovery>()
      vi.mocked(prepareAccountDialogRecovery).mockReturnValueOnce(
        preparation.promise,
      )
      if (cleanup === "failed") {
        vi.mocked(discardAccountDialogRecovery).mockRejectedValueOnce(
          new Error("Cleanup unavailable"),
        )
      }
      const { unmount } = renderGuide(snapshot())
      await waitFor(() =>
        expect(prepareAccountDialogRecovery).toHaveBeenCalledTimes(1),
      )
      unmount()

      await act(async () => preparation.resolve(prepared))

      expect(discardAccountDialogRecovery).toHaveBeenCalledExactlyOnceWith(
        prepared.id,
      )
      expect(openAccountDialogRecovery).not.toHaveBeenCalled()
      expect(closeIfPopup).not.toHaveBeenCalled()
    },
  )
})
