import { beforeEach, expect, it, vi } from "vitest"

import { TurnstileNotificationStatus } from "~/features/BasicSettings/components/tabs/Refresh/protectionBypass/TurnstileNotificationStatus"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { availability, request, openSettings } = vi.hoisted(() => ({
  availability: vi.fn(),
  request: vi.fn(),
  openSettings: vi.fn(),
}))
vi.mock("~/utils/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation")>()),
  openSettingsTab: openSettings,
}))
vi.mock("~/services/notifications/browserNotificationAvailability", () => ({
  getBrowserNotificationAvailability: availability,
}))
vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSION_IDS: { Notifications: "notifications" },
  requestPermissionDetailed: request,
}))

beforeEach(() => {
  availability.mockReset().mockResolvedValue("permission_required")
  request.mockReset()
  openSettings.mockReset()
})

it.each(["blocked", "unavailable", "unknown"])(
  "closes the %s permission dialog after opening permission settings",
  async (status) => {
    availability.mockResolvedValue(status)
    const change = vi.fn()
    render(<TurnstileNotificationStatus preference="page" onChange={change} />)
    fireEvent.click(
      await screen.findByRole("switch", {
        name: /shieldTurnstileAssistNotify/,
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: /turnstileNotificationManage/,
      }),
    )
    expect(openSettings).toHaveBeenCalledWith("permissions", {
      preserveHistory: true,
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(change).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  },
)

it("offers permission in a dialog and enables system reminders only after grant", async () => {
  const change = vi.fn()
  request.mockImplementation(async () => {
    availability.mockResolvedValue("available")
    return { success: true }
  })
  render(<TurnstileNotificationStatus preference="page" onChange={change} />)
  fireEvent.click(
    await screen.findByRole("switch", { name: /shieldTurnstileAssistNotify/ }),
  )
  await screen.findByRole("dialog")
  expect(
    screen.getByRole("heading", {
      name: /turnstileNotificationPermissionTitle/,
    }),
  ).toBeVisible()
  expect(change).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
  expect(
    screen.getByRole("button", { name: /turnstileNotificationEnable/ }),
  ).toHaveAttribute("data-variant", "default")
  fireEvent.click(
    screen.getByRole("button", { name: /turnstileNotificationEnable/ }),
  )
  await waitFor(() => expect(request).toHaveBeenCalledWith("notifications"))
  await waitFor(() => expect(change).toHaveBeenCalledWith("both"))
})

it("keeps system reminders off after refusal and allows cancellation", async () => {
  const change = vi.fn()
  request.mockResolvedValue({ success: false })
  render(<TurnstileNotificationStatus preference="page" onChange={change} />)
  fireEvent.click(
    await screen.findByRole("switch", { name: /shieldTurnstileAssistNotify/ }),
  )
  await screen.findByRole("dialog")
  fireEvent.click(
    screen.getByRole("button", { name: /turnstileNotificationEnable/ }),
  )
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /turnstileNotificationEnable/ }),
    ).not.toBeDisabled(),
  )
  expect(change).not.toHaveBeenCalled()
  expect(
    screen.getByRole("switch", { name: /shieldTurnstileAssistNotify/ }),
  ).not.toBeChecked()
  fireEvent.click(screen.getByRole("button", { name: /actions.cancel/ }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
})

it("changes the in-page channel independently of system reminders", async () => {
  availability.mockResolvedValue("available")
  const change = vi.fn()
  render(<TurnstileNotificationStatus preference="both" onChange={change} />)
  fireEvent.click(
    await screen.findByRole("switch", { name: /shieldTurnstileAssistPage/ }),
  )
  expect(change).toHaveBeenCalledWith("notify")
  fireEvent.click(
    await screen.findByRole("switch", { name: /shieldTurnstileAssistNotify/ }),
  )
  expect(change).toHaveBeenCalledWith("page")
})

it("enables immediately with permission and guides blocked users to settings", async () => {
  availability.mockResolvedValue("available")
  const change = vi.fn()
  const view = render(
    <TurnstileNotificationStatus preference="page" onChange={change} />,
  )
  fireEvent.click(
    await screen.findByRole("switch", { name: /shieldTurnstileAssistNotify/ }),
  )
  await waitFor(() => expect(change).toHaveBeenCalledWith("both"))
  expect(screen.queryByRole("dialog")).toBeNull()
  view.unmount()
  availability.mockResolvedValue("blocked")
  render(<TurnstileNotificationStatus preference="page" onChange={change} />)
  fireEvent.click(
    await screen.findByRole("switch", { name: /shieldTurnstileAssistNotify/ }),
  )
  await screen.findByRole("dialog")
  expect(
    screen.getByRole("button", { name: /turnstileNotificationManage/ }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: /turnstileNotificationEnable/ }),
  ).toBeNull()
})

it("renders a quiet mode notice when all reminders are disabled", async () => {
  render(<TurnstileNotificationStatus preference="quiet" onChange={vi.fn()} />)
  expect(
    await screen.findByText(/shieldTurnstileAssistQuietNotice/),
  ).toBeInTheDocument()
})

it("opens permission dialog when manage button in the row is clicked", async () => {
  availability.mockResolvedValue("blocked")
  render(<TurnstileNotificationStatus preference="notify" onChange={vi.fn()} />)
  const manageButton = await screen.findByRole("button", {
    name: /turnstileNotificationManage/,
  })
  fireEvent.click(manageButton)
  expect(await screen.findByRole("dialog")).toBeVisible()
})

it("sets status to unknown when permission request throws", async () => {
  availability.mockResolvedValue("permission_required")
  request.mockRejectedValue(new Error("Permission request crashed"))
  render(<TurnstileNotificationStatus preference="page" onChange={vi.fn()} />)
  fireEvent.click(
    await screen.findByRole("switch", { name: /shieldTurnstileAssistNotify/ }),
  )
  await screen.findByRole("dialog")
  fireEvent.click(
    screen.getByRole("button", { name: /turnstileNotificationEnable/ }),
  )
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /turnstileNotificationManage/ }),
    ).toBeInTheDocument(),
  )
})
