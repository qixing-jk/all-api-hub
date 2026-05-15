import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import RedemptionAssistSettings from "~/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings"
import WebAiApiCheckSettings from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import * as browserApi from "~/utils/browser/browserApi"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

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

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...structuredClone(DEFAULT_PREFERENCES),
      webAiApiCheck: {
        ...structuredClone(DEFAULT_PREFERENCES.webAiApiCheck!),
        contextMenu: { enabled: true },
      },
    } as any)
    const savePreferencesSpy = vi
      .spyOn(userPreferences, "savePreferencesWithResult")
      .mockResolvedValue({
        ...structuredClone(DEFAULT_PREFERENCES),
        webAiApiCheck: {
          ...structuredClone(DEFAULT_PREFERENCES.webAiApiCheck!),
          contextMenu: { enabled: false },
        },
      } as any)

    render(<WebAiApiCheckSettings />)

    await waitFor(() => {
      expect(screen.getAllByRole("switch")[0]).toHaveAttribute(
        "aria-checked",
        "true",
      )
    })

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

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...structuredClone(DEFAULT_PREFERENCES),
      redemptionAssist: {
        ...structuredClone(DEFAULT_PREFERENCES.redemptionAssist!),
        contextMenu: { enabled: true },
      },
    } as any)
    const savePreferencesSpy = vi
      .spyOn(userPreferences, "savePreferencesWithResult")
      .mockResolvedValue({
        ...structuredClone(DEFAULT_PREFERENCES),
        redemptionAssist: {
          ...structuredClone(DEFAULT_PREFERENCES.redemptionAssist!),
          contextMenu: { enabled: false },
        },
      } as any)

    render(<RedemptionAssistSettings />)

    await waitFor(() => {
      expect(screen.getAllByRole("switch")[1]).toHaveAttribute(
        "aria-checked",
        "true",
      )
    })

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
