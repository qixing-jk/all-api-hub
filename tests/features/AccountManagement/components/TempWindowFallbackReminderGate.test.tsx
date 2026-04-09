import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TempWindowFallbackReminderGate } from "~/features/AccountManagement/components/TempWindowFallbackReminderGate"
import { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"

const {
  accountDataState,
  tempWindowFallbackState,
  getTempWindowFallbackBlockStatusMock,
  reminderPreferenceState,
  updateTempWindowFallbackReminderMock,
} = vi.hoisted(() => ({
  accountDataState: {
    displayData: [] as any[],
  },
  tempWindowFallbackState: {
    enabled: true,
    useInPopup: true,
    useInSidePanel: true,
    useInOptions: true,
    useForAutoRefresh: true,
    useForManualRefresh: true,
    tempContextMode: "composite",
  },
  getTempWindowFallbackBlockStatusMock: vi.fn(),
  reminderPreferenceState: {
    dismissed: false,
  },
  updateTempWindowFallbackReminderMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    tempWindowFallback: tempWindowFallbackState,
    tempWindowFallbackReminder: reminderPreferenceState,
    updateTempWindowFallbackReminder: (...args: unknown[]) =>
      updateTempWindowFallbackReminderMock(...args),
  }),
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  getTempWindowFallbackBlockStatus: (...args: unknown[]) =>
    getTempWindowFallbackBlockStatusMock(...args),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    displayData: accountDataState.displayData,
  }),
}))

vi.mock(
  "~/features/AccountManagement/components/TempWindowFallbackReminderDialog",
  () => ({
    TempWindowFallbackReminderDialog: ({
      isOpen,
      issue,
      onClose,
      onNeverRemind,
    }: {
      isOpen: boolean
      issue: { accountName: string; settingsTab: string }
      onClose: () => void
      onNeverRemind: () => Promise<void> | void
    }) => (
      <section
        data-testid="temp-window-fallback-reminder"
        data-account-name={issue.accountName}
        data-open={String(isOpen)}
        data-settings-tab={issue.settingsTab}
      >
        <button type="button" onClick={onClose}>
          close reminder
        </button>
        <button
          type="button"
          onClick={() => {
            void onNeverRemind()
          }}
        >
          never remind
        </button>
      </section>
    ),
  }),
)

describe("TempWindowFallbackReminderGate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accountDataState.displayData = []
    tempWindowFallbackState.enabled = true
    tempWindowFallbackState.useInPopup = true
    tempWindowFallbackState.useInSidePanel = true
    tempWindowFallbackState.useInOptions = true
    tempWindowFallbackState.useForAutoRefresh = true
    tempWindowFallbackState.useForManualRefresh = true
    reminderPreferenceState.dismissed = false
    getTempWindowFallbackBlockStatusMock.mockResolvedValue({
      kind: "available",
      code: null,
      reason: null,
    })
  })

  it("renders nothing when there is no temp-window fallback issue", () => {
    render(<TempWindowFallbackReminderGate />)

    expect(
      screen.queryByTestId("temp-window-fallback-reminder"),
    ).not.toBeInTheDocument()
  })

  it("renders nothing for a stale disabled issue when the shared fallback gate reports no current block", async () => {
    accountDataState.displayData = [
      {
        id: "acc-1",
        name: "Relay",
        health: {
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
        },
      },
    ]

    render(<TempWindowFallbackReminderGate />)

    await waitFor(() => {
      expect(
        screen.queryByTestId("temp-window-fallback-reminder"),
      ).not.toBeInTheDocument()
    })
  })

  it("opens once for the first disabled issue when the shared fallback gate reports disabled and stays closed after the user dismisses it in the same session", async () => {
    accountDataState.displayData = [
      {
        id: "acc-1",
        name: "Relay",
        health: {
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
        },
      },
    ]
    getTempWindowFallbackBlockStatusMock.mockResolvedValue({
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "master_disabled",
    })

    const { rerender } = render(<TempWindowFallbackReminderGate />)

    expect(
      await screen.findByTestId("temp-window-fallback-reminder"),
    ).toHaveAttribute("data-account-name", "Relay")
    expect(
      await screen.findByTestId("temp-window-fallback-reminder"),
    ).toHaveAttribute("data-settings-tab", "refresh")
    expect(
      await screen.findByTestId("temp-window-fallback-reminder"),
    ).toHaveAttribute("data-open", "true")

    fireEvent.click(screen.getByRole("button", { name: "close reminder" }))

    await waitFor(() => {
      expect(
        screen.getByTestId("temp-window-fallback-reminder"),
      ).toHaveAttribute("data-open", "false")
    })

    rerender(<TempWindowFallbackReminderGate />)

    await waitFor(() => {
      expect(
        screen.getByTestId("temp-window-fallback-reminder"),
      ).toHaveAttribute("data-open", "false")
    })
  })

  it("renders nothing for a stale permission issue when the shared fallback gate reports disabled instead", async () => {
    accountDataState.displayData = [
      {
        id: "acc-3",
        name: "Relay",
        health: {
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
        },
      },
    ]
    getTempWindowFallbackBlockStatusMock.mockResolvedValue({
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "master_disabled",
    })

    render(<TempWindowFallbackReminderGate />)

    await waitFor(() => {
      expect(
        screen.queryByTestId("temp-window-fallback-reminder"),
      ).not.toBeInTheDocument()
    })
  })

  it("does not keep showing a stale reminder while a new block check is pending", async () => {
    accountDataState.displayData = [
      {
        id: "acc-4",
        name: "Relay",
        health: {
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
        },
      },
    ]
    tempWindowFallbackState.enabled = false

    let resolveSecondCheck:
      | ((value: { kind: "available"; code: null; reason: null }) => void)
      | undefined

    getTempWindowFallbackBlockStatusMock
      .mockResolvedValueOnce({
        kind: "blocked",
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
        reason: "master_disabled",
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondCheck = resolve
          }),
      )

    const { rerender } = render(<TempWindowFallbackReminderGate />)

    expect(
      await screen.findByTestId("temp-window-fallback-reminder"),
    ).toHaveAttribute("data-open", "true")

    tempWindowFallbackState.enabled = true
    rerender(<TempWindowFallbackReminderGate />)

    await waitFor(() => {
      expect(
        screen.queryByTestId("temp-window-fallback-reminder"),
      ).not.toBeInTheDocument()
    })

    resolveSecondCheck?.({
      kind: "available",
      code: null,
      reason: null,
    })

    await waitFor(() => {
      expect(
        screen.queryByTestId("temp-window-fallback-reminder"),
      ).not.toBeInTheDocument()
    })
  })

  it("keeps the dialog closed when the reminder is already dismissed and persists the never-remind action", async () => {
    accountDataState.displayData = [
      {
        id: "acc-2",
        name: "Permission blocked",
        health: {
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
        },
      },
    ]
    reminderPreferenceState.dismissed = true
    getTempWindowFallbackBlockStatusMock.mockResolvedValue({
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
      reason: "permission_required",
    })

    const { rerender } = render(<TempWindowFallbackReminderGate />)

    expect(
      await screen.findByTestId("temp-window-fallback-reminder"),
    ).toHaveAttribute("data-open", "false")
    expect(
      await screen.findByTestId("temp-window-fallback-reminder"),
    ).toHaveAttribute("data-settings-tab", "permissions")

    reminderPreferenceState.dismissed = false
    rerender(<TempWindowFallbackReminderGate />)

    fireEvent.click(await screen.findByRole("button", { name: "never remind" }))

    await waitFor(() => {
      expect(updateTempWindowFallbackReminderMock).toHaveBeenCalledWith({
        dismissed: true,
      })
    })
  })
})
