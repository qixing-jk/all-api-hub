import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PermissionSettings from "~/features/BasicSettings/components/tabs/Permissions/PermissionSettings"

const {
  changedListenerRef,
  hasPermissionMock,
  onOptionalPermissionsChangedMock,
  removePermissionMock,
  requestPermissionMock,
  showResultToastMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  changedListenerRef: {
    current: null as null | (() => void),
  },
  hasPermissionMock: vi.fn(),
  onOptionalPermissionsChangedMock: vi.fn(),
  removePermissionMock: vi.fn(),
  requestPermissionMock: vi.fn(),
  showResultToastMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}))

vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSIONS: ["cookies", "clipboardRead"],
  OPTIONAL_PERMISSION_DEFINITIONS: [{ id: "cookies" }, { id: "clipboardRead" }],
  hasPermission: (id: string) => hasPermissionMock(id),
  onOptionalPermissionsChanged: (listener: () => void) =>
    onOptionalPermissionsChangedMock(listener),
  removePermission: (id: string) => removePermissionMock(id),
  requestPermission: (id: string) => requestPermissionMock(id),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: (...args: unknown[]) => showResultToastMock(...args),
}))

describe("PermissionSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockImplementation(async (id: string) => id === "cookies")
    requestPermissionMock.mockResolvedValue(true)
    removePermissionMock.mockResolvedValue(false)
    onOptionalPermissionsChangedMock.mockImplementation((listener) => {
      changedListenerRef.current = listener
      return unsubscribeMock
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("loads permission states, refreshes, and toggles grant/remove actions", async () => {
    render(<PermissionSettings />)

    expect(
      await screen.findByText("permissions.status.granted"),
    ).toBeInTheDocument()
    expect(screen.getByText("permissions.status.denied")).toBeInTheDocument()

    const actionButtons = await screen.findAllByRole("button", {
      name: /permissions\.actions\.(allow|remove)/,
    })

    fireEvent.click(actionButtons[0])
    fireEvent.click(actionButtons[1])
    fireEvent.click(
      screen.getByRole("button", { name: "permissions.actions.refresh" }),
    )

    await waitFor(() => {
      expect(removePermissionMock).toHaveBeenCalledWith("cookies")
    })
    expect(requestPermissionMock).toHaveBeenCalledWith("clipboardRead")
    expect(showResultToastMock).toHaveBeenCalledWith(
      true,
      "permissions.messages.granted",
      "permissions.messages.grantFailed",
    )
    expect(showResultToastMock).toHaveBeenCalledWith(
      false,
      "permissions.messages.revoked",
      "permissions.messages.revokeFailed",
    )
    expect(hasPermissionMock).toHaveBeenCalledTimes(4)
  })

  it("reloads statuses on external permission change and unsubscribes on cleanup", async () => {
    const { unmount } = render(<PermissionSettings />)

    await screen.findByText("permissions.status.granted")

    hasPermissionMock.mockResolvedValue(false)
    const listener = changedListenerRef.current
    if (!listener) {
      throw new Error("Expected optional-permissions change listener")
    }
    await listener()

    await waitFor(() => {
      expect(hasPermissionMock).toHaveBeenCalledTimes(4)
    })

    unmount()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })
})
