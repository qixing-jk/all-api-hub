import { beforeEach, describe, expect, it, vi } from "vitest"

import RedemptionAssistSettings from "~/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings"
import WebAiApiCheckSettings from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings"
import {
  PreferencesMessageTypes,
  sendPreferencesMessage,
} from "~/services/preferences/messaging"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { RedemptionAssistMessageTypes } from "~/services/redemption/redemptionAssistMessaging"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockSendPreferencesMessage, mockSendRedemptionAssistMessage } =
  vi.hoisted(() => ({
    mockSendPreferencesMessage: vi.fn(),
    mockSendRedemptionAssistMessage: vi.fn(),
  }))

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
  })
  return { default: toast }
})

vi.mock("~/services/preferences/messaging", () => ({
  PreferencesMessageTypes: {
    UpdateActionClickBehavior: "preferences:updateActionClickBehavior",
    RefreshContextMenus: "preferences:refreshContextMenus",
  },
  sendPreferencesMessage: mockSendPreferencesMessage,
}))

vi.mock("~/services/redemption/redemptionAssistMessaging", () => ({
  RedemptionAssistMessageTypes: {
    UpdateSettings: "redemptionAssist:updateSettings",
    ShouldPrompt: "redemptionAssist:shouldPrompt",
    AutoRedeem: "redemptionAssist:autoRedeem",
    AutoRedeemByUrl: "redemptionAssist:autoRedeemByUrl",
  },
  sendRedemptionAssistMessage: mockSendRedemptionAssistMessage,
}))

describe("Context menu visibility toggles", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendPreferencesMessage.mockResolvedValue({
      success: true,
      data: undefined,
    })
    mockSendRedemptionAssistMessage.mockResolvedValue({
      success: true,
      data: undefined,
    })
  })

  it("persists Web AI API Check visibility updates and triggers refresh", async () => {
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
        ok: true,
        preferences: {
          ...structuredClone(DEFAULT_PREFERENCES),
          webAiApiCheck: {
            ...structuredClone(DEFAULT_PREFERENCES.webAiApiCheck!),
            contextMenu: { enabled: false },
          },
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
      expect(sendPreferencesMessage).toHaveBeenCalledWith(
        PreferencesMessageTypes.RefreshContextMenus,
      )
    })
  })

  it("persists Redemption Assist visibility updates and triggers refresh", async () => {
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
        ok: true,
        preferences: {
          ...structuredClone(DEFAULT_PREFERENCES),
          redemptionAssist: {
            ...structuredClone(DEFAULT_PREFERENCES.redemptionAssist!),
            contextMenu: { enabled: false },
          },
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
      expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
        RedemptionAssistMessageTypes.UpdateSettings,
        {
          settings: {
            contextMenu: {
              enabled: false,
            },
          },
        },
      )
    })

    await waitFor(() => {
      expect(sendPreferencesMessage).toHaveBeenCalledWith(
        PreferencesMessageTypes.RefreshContextMenus,
      )
    })
  })
})
