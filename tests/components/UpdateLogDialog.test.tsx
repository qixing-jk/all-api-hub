import { afterEach, describe, expect, it, vi } from "vitest"

import { UpdateLogDialog } from "~/components/dialogs/UpdateLogDialog"
import { UPDATE_LOG_DIALOG_TEST_IDS } from "~/components/dialogs/UpdateLogDialog/testIds"
import type { PreferenceWriteResult } from "~/services/preferences/userPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"
import * as browserApi from "~/utils/browser/browserApi"
import * as docsLinks from "~/utils/navigation/docsLinks"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}))

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
    success: vi.fn(),
  },
}))

describe("UpdateLogDialog", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    toastErrorMock.mockReset()
  })

  it("toggles the open-changelog-on-update preference from the dialog", async () => {
    const preferences = buildUserPreferences({ openChangelogOnUpdate: true })
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(preferences)
    const disableDeferred = createDeferred<PreferenceWriteResult>()
    const enableDeferred = createDeferred<PreferenceWriteResult>()

    const updateSpy = vi
      .spyOn(userPreferences, "updateOpenChangelogOnUpdate")
      .mockReturnValueOnce(disableDeferred.promise)
      .mockReturnValueOnce(enableDeferred.promise)

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    const toggleButton = await screen.findByTestId(
      UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle,
    )

    expect(toggleButton).toHaveTextContent(
      "ui:dialog.updateLog.disableAutoOpen",
    )

    fireEvent.click(toggleButton)

    expect(toggleButton).toHaveAccessibleName("common:status.disabling")
    expect(toggleButton).toHaveAttribute("aria-busy", "true")
    expect(toggleButton).toBeDisabled()
    const closeButton = screen.getByTestId(
      UPDATE_LOG_DIALOG_TEST_IDS.closeButton,
    )
    const openFullChangelogButton = screen.getByTestId(
      UPDATE_LOG_DIALOG_TEST_IDS.openFullChangelogButton,
    )
    expect(closeButton).not.toHaveAttribute("aria-busy")
    expect(openFullChangelogButton).not.toHaveAttribute("aria-busy")

    fireEvent.click(toggleButton)
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(false)
    })
    expect(updateSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      disableDeferred.resolve({
        ok: true,
        preferences: {
          ...preferences,
          openChangelogOnUpdate: false,
          lastUpdated: preferences.lastUpdated + 1,
        },
      })
    })

    await waitFor(() => {
      expect(toggleButton).toHaveTextContent(
        "ui:dialog.updateLog.enableAutoOpen",
      )
    })

    fireEvent.click(toggleButton)

    expect(toggleButton).toHaveAccessibleName("common:status.enabling")
    expect(toggleButton).toHaveAttribute("aria-busy", "true")
    expect(toggleButton).toBeDisabled()
    expect(closeButton).not.toHaveAttribute("aria-busy")
    expect(openFullChangelogButton).not.toHaveAttribute("aria-busy")

    fireEvent.click(toggleButton)
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(true)
    })
    expect(updateSpy).toHaveBeenCalledTimes(2)

    await act(async () => {
      enableDeferred.resolve({
        ok: true,
        preferences: {
          ...preferences,
          openChangelogOnUpdate: true,
          lastUpdated: preferences.lastUpdated + 2,
        },
      })
    })

    await waitFor(() => {
      expect(toggleButton).toHaveTextContent(
        "ui:dialog.updateLog.disableAutoOpen",
      )
    })
  })

  it("keeps the current auto-open label and surfaces feedback when saving the toggle fails", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    const updateSpy = vi
      .spyOn(userPreferences, "updateOpenChangelogOnUpdate")
      .mockResolvedValue({
        ok: false,
        reason: {
          type: "storage-error",
          error: new Error("save failed"),
        },
      })

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    const toggleButton = await screen.findByTestId(
      UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle,
    )

    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(false)
    })

    expect(toggleButton).toHaveTextContent(
      "ui:dialog.updateLog.disableAutoOpen",
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "settings:messages.updateFailed",
    )
  })

  it("opens the full changelog in a new active tab", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    const createTabSpy = vi
      .spyOn(browserApi, "createTab")
      .mockResolvedValue(undefined as any)
    const getDocsChangelogUrlSpy = vi.spyOn(docsLinks, "getDocsChangelogUrl")

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    fireEvent.click(
      await screen.findByTestId(
        UPDATE_LOG_DIALOG_TEST_IDS.openFullChangelogButton,
      ),
    )

    await waitFor(() => {
      expect(createTabSpy).toHaveBeenCalledWith(
        getDocsChangelogUrlSpy.mock.results.at(-1)?.value,
        true,
      )
    })
  })

  it("uses a responsive footer layout so action buttons do not overflow", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    expect(
      await screen.findByTestId(UPDATE_LOG_DIALOG_TEST_IDS.footer),
    ).toHaveClass("flex-col", "sm:flex-row")

    expect(
      screen.getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.footerActions),
    ).toHaveClass("flex-col", "sm:flex-row")

    expect(
      screen.getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle),
    ).toHaveClass("h-auto", "min-h-9", "w-full", "whitespace-normal")

    expect(
      screen.getByTestId(UPDATE_LOG_DIALOG_TEST_IDS.openFullChangelogButton),
    ).toHaveClass("h-auto", "min-h-9", "w-full", "whitespace-normal")
  })

  it("shows the fallback message when the iframe does not finish loading in time", async () => {
    vi.useFakeTimers()
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText("ui:dialog.updateLog.loading")).toBeVisible()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })

    expect(
      screen.getByText("ui:dialog.updateLog.missingSection", {
        exact: false,
      }),
    ).toBeVisible()
  })

  it("keeps the fallback hidden after the iframe loads before the timeout elapses", async () => {
    vi.useFakeTimers()
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const iframe = screen.getByTitle("ui:dialog.updateLog.title")
    fireEvent.load(iframe)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })

    expect(
      screen.queryByText("ui:dialog.updateLog.missingSection", {
        exact: false,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.updateLog.loading"),
    ).not.toBeInTheDocument()
  })

  it("ignores repeat auto-open toggles while a save is already in flight and re-enables the control after it settles", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      buildUserPreferences({ openChangelogOnUpdate: true }),
    )

    const preferences = buildUserPreferences({ openChangelogOnUpdate: false })
    let resolveUpdate: ((value: PreferenceWriteResult) => void) | undefined
    const updateSpy = vi
      .spyOn(userPreferences, "updateOpenChangelogOnUpdate")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpdate = resolve
          }),
      )

    render(<UpdateLogDialog isOpen onClose={() => {}} version="2.39.0" />)

    const toggleButton = await screen.findByTestId(
      UPDATE_LOG_DIALOG_TEST_IDS.autoOpenToggle,
    )

    fireEvent.click(toggleButton)
    fireEvent.click(toggleButton)

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith(false)
    expect(toggleButton).toBeDisabled()

    resolveUpdate?.({ ok: true, preferences })

    await waitFor(() => {
      expect(toggleButton).not.toBeDisabled()
    })
    expect(toggleButton).toHaveTextContent("ui:dialog.updateLog.enableAutoOpen")
  })
})
