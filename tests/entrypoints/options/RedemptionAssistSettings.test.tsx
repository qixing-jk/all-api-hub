import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import RedemptionAssistSettings from "~/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: mockLoggerError,
  }),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe("RedemptionAssistSettings", () => {
  const updateRedemptionAssist = vi.fn()
  const resetRedemptionAssistConfig = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    updateRedemptionAssist.mockResolvedValue({ ok: true })
    resetRedemptionAssistConfig.mockResolvedValue({ ok: true })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        redemptionAssist: structuredClone(
          DEFAULT_PREFERENCES.redemptionAssist!,
        ),
      },
      updateRedemptionAssist,
      resetRedemptionAssistConfig,
    } as any)
  })

  it("marks only the URL-pattern save busy and restores it after rejection", async () => {
    const deferredSave = createDeferred<{ ok: boolean }>()
    updateRedemptionAssist.mockReturnValueOnce(deferredSave.promise)

    render(<RedemptionAssistSettings />, {
      withUserPreferencesProvider: false,
    })

    const saveButton = screen.getByRole("button", {
      name: "common:actions.save",
    })

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(saveButton).toHaveAccessibleName("common:status.saving")
    })
    expect(saveButton).toBeDisabled()
    expect(saveButton).toHaveAttribute("aria-busy", "true")

    for (const control of screen.getAllByRole("switch")) {
      expect(control).toBeDisabled()
      expect(control).not.toHaveAttribute("aria-busy")
    }
    const patternsTextarea = screen.getByRole("textbox")
    expect(patternsTextarea).toBeDisabled()
    expect(patternsTextarea).not.toHaveAttribute("aria-busy")

    fireEvent.click(saveButton)
    expect(updateRedemptionAssist).toHaveBeenCalledTimes(1)

    deferredSave.reject(new Error("write failed"))

    await waitFor(() => {
      expect(saveButton).toHaveAccessibleName("common:actions.save")
      expect(saveButton).toBeEnabled()
      expect(saveButton).not.toHaveAttribute("aria-busy")
    })

    fireEvent.click(saveButton)
    await waitFor(() => {
      expect(updateRedemptionAssist).toHaveBeenCalledTimes(2)
      expect(saveButton).toHaveAccessibleName("common:actions.save")
      expect(saveButton).toBeEnabled()
      expect(saveButton).not.toHaveAttribute("aria-busy")
    })
  })
})
