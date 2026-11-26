import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import RedemptionAssistSettings from "~/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings"
import toast from "~/lib/notify"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { getAllTabs } from "~/utils/browser/tabs"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

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

vi.mock("~/utils/browser/tabs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tabs")>()),
  getAllTabs: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe("RedemptionAssistSettings", () => {
  const updateRedemptionAssist = vi.fn()
  const resetRedemptionAssistConfig = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAllTabs).mockReset().mockResolvedValue([])
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

  it("round-trips tab selections through the regex draft while preserving custom and closed-site patterns", async () => {
    vi.mocked(getAllTabs).mockResolvedValue([
      {
        url: "https://docs.example/guide",
        title: "Docs",
        favIconUrl: "https://docs.example/icon.png",
      },
      { url: "http://portal.example:8080/redeem", title: "Portal" },
    ] as browser.tabs.Tab[])
    const user = userEvent.setup()
    render(<RedemptionAssistSettings />, { withUserPreferencesProvider: false })

    const picker = screen.getByRole("combobox", {
      name: "redemptionAssist:settings.urlWhitelist.tabPicker",
    })
    const patterns = screen.getByRole("textbox")
    const save = screen.getByRole("button", { name: "common:actions.save" })
    const docs = "^https://docs\\.example(?:[/?#].*)?$"
    const portal = "^http://portal\\.example:8080(?:[/?#].*)?$"
    const closedSite = "^https://closed\\.example(?:[/?#].*)?$"
    const custom = "^https://docs\\.example/guide$"
    fireEvent.change(patterns, {
      target: { value: `${custom}\n  ${docs}  \n${closedSite}` },
    })

    await user.type(picker, "Portal")
    await user.click(
      await screen.findByRole("option", { name: /Portal/, selected: false }),
    )
    expect(patterns).toHaveValue(
      `${custom}\n  ${docs}  \n${closedSite}\n${portal}`,
    )
    await user.type(picker, "Docs")
    const selectedDocs = await screen.findByRole("option", {
      name: /Docs/,
      selected: true,
    })
    expect(selectedDocs.querySelector("img")).toHaveAttribute(
      "src",
      "https://docs.example/icon.png",
    )
    await user.click(selectedDocs)
    expect(patterns).toHaveValue(`${custom}\n${closedSite}\n${portal}`)
    expect(updateRedemptionAssist).not.toHaveBeenCalled()
    await user.click(save)
    await waitFor(() => {
      expect(updateRedemptionAssist).toHaveBeenCalledOnce()
      expect(save).toBeDisabled()
    })
    expect(updateRedemptionAssist).toHaveBeenCalledWith({
      urlWhitelist: { patterns: [custom, closedSite, portal] },
    })

    await user.type(picker, "Docs")
    await user.click(
      await screen.findByRole("option", { name: /Docs/, selected: false }),
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "common:actions.reset",
      }),
    )
    await waitFor(() =>
      expect(patterns).toHaveValue(
        DEFAULT_PREFERENCES.redemptionAssist!.urlWhitelist.patterns.join("\n"),
      ),
    )
    expect(resetRedemptionAssistConfig).toHaveBeenCalledOnce()
    await user.type(picker, "Portal")
    expect(
      await screen.findByRole("option", { name: /Portal/, selected: false }),
    ).toBeVisible()
  })

  it("persists each switch as an independent partial update", async () => {
    render(<RedemptionAssistSettings />, {
      withUserPreferencesProvider: false,
    })

    const cases = [
      {
        name: "redemptionAssist:settings.enable",
        update: { enabled: false },
      },
      {
        name: "redemptionAssist:settings.contextMenu.enable",
        update: { contextMenu: { enabled: false } },
      },
      {
        name: "redemptionAssist:settings.relaxedCodeValidation",
        update: { relaxedCodeValidation: false },
      },
      {
        name: "redemptionAssist:settings.urlWhitelist.enable",
        update: { urlWhitelist: { enabled: false } },
      },
      {
        name: "redemptionAssist:settings.urlWhitelist.includeAccountSiteUrls",
        update: { urlWhitelist: { includeAccountSiteUrls: false } },
      },
      {
        name: "redemptionAssist:settings.urlWhitelist.includeCheckInAndRedeemUrls",
        update: { urlWhitelist: { includeCheckInAndRedeemUrls: false } },
      },
    ]

    for (const testCase of cases) {
      updateRedemptionAssist.mockClear()
      fireEvent.click(screen.getByRole("switch", { name: testCase.name }))
      await waitFor(() => {
        expect(updateRedemptionAssist).toHaveBeenCalledWith(testCase.update)
      })
    }
  })

  it("shows failure feedback when a switch update is rejected by storage", async () => {
    updateRedemptionAssist.mockResolvedValueOnce({
      ok: false,
      reason: { type: "storage-error", error: new Error("write failed") },
    })

    render(<RedemptionAssistSettings />, {
      withUserPreferencesProvider: false,
    })

    fireEvent.click(
      screen.getByRole("switch", {
        name: "redemptionAssist:settings.enable",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })
    expect(toast.success).not.toHaveBeenCalled()
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
    const patternsTextarea = screen.getByRole("textbox")
    fireEvent.change(patternsTextarea, {
      target: { value: "^https://draft.example.invalid" },
    })

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(saveButton).toHaveAccessibleName("common:status.saving")
    })
    expect(saveButton).toBeDisabled()
    expect(saveButton).toHaveAttribute("aria-busy", "true")

    for (const control of screen.getAllByRole("switch")) {
      expect(control).toBeEnabled()
      expect(control).not.toHaveAttribute("aria-busy")
    }
    expect(patternsTextarea).toBeDisabled()
    expect(screen.getByRole("combobox")).toBeDisabled()
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
      expect(saveButton).toBeDisabled()
      expect(saveButton).not.toHaveAttribute("aria-busy")
    })
  })
})
