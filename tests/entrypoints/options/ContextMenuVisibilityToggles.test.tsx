import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import RedemptionAssistSettings from "~/entrypoints/options/pages/BasicSettings/components/RedemptionAssistSettings"
import WebAiApiCheckSettings from "~/entrypoints/options/pages/BasicSettings/components/WebAiApiCheckSettings"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"
import * as browserApi from "~/utils/browserApi"

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
  })
  return { default: toast }
})

describe("Context menu visibility toggles", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("persists Web AI API Check visibility updates and triggers refresh", async () => {
    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockResolvedValue({ success: true } as any)

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      structuredClone(DEFAULT_PREFERENCES) as any,
    )
    const savePreferencesSpy = vi
      .spyOn(userPreferences, "savePreferences")
      .mockResolvedValue(true)

    render(<WebAiApiCheckSettings />)

    await screen.findByText("webAiApiCheck:settings.title")

    const switches = screen.getAllByRole("switch")
    fireEvent.click(switches[0])

    await waitFor(() => {
      expect(savePreferencesSpy).toHaveBeenCalledWith({
        webAiApiCheck: {
          contextMenu: {
            enabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
        action: RuntimeActionIds.PreferencesRefreshContextMenus,
      })
    })
  })

  it("persists Redemption Assist visibility updates and triggers refresh", async () => {
    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockResolvedValue({ success: true } as any)

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      structuredClone(DEFAULT_PREFERENCES) as any,
    )
    const savePreferencesSpy = vi
      .spyOn(userPreferences, "savePreferences")
      .mockResolvedValue(true)

    render(<RedemptionAssistSettings />)

    await screen.findByText("redemptionAssist:settings.title")

    const switches = screen.getAllByRole("switch")
    fireEvent.click(switches[1])

    await waitFor(() => {
      expect(savePreferencesSpy).toHaveBeenCalledWith({
        redemptionAssist: {
          contextMenu: {
            enabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
        action: RuntimeActionIds.PreferencesRefreshContextMenus,
      })
    })
  })
})
