import { afterEach, describe, expect, it, vi } from "vitest"

import { fireEvent, render, screen } from "~/tests/test-utils/render"

// Shared mocks to control account data and capture bulk check-in clicks.
let displayDataMock: any[] = []
const handleOpenExternalCheckInsMock = vi.fn()

vi.mock("~/hooks/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({
    handleAddAccountClick: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    displayData: displayDataMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: handleOpenExternalCheckInsMock,
  }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  displayDataMock = []
  handleOpenExternalCheckInsMock.mockReset()
})

describe("popup ActionButtons", () => {
  it("opens auto check-in page and triggers run when quick check-in button clicked", async () => {
    vi.resetModules()
    const navigation = await import("~/utils/navigation")
    const openAutoCheckinPageSpy = vi
      .spyOn(navigation, "openAutoCheckinPage")
      .mockImplementation(vi.fn() as any)

    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(<ActionButtons />)

    const quickCheckinButton = await screen.findByRole("button", {
      name: "navigation.autoCheckinRunNow",
    })

    fireEvent.click(quickCheckinButton)

    expect(openAutoCheckinPageSpy).toHaveBeenCalledWith({ runNow: "true" })
  })

  it("hides external check-in button when no custom check-in URLs exist", async () => {
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(<ActionButtons />)

    expect(
      screen.queryByRole("button", {
        name: "navigation.externalCheckinAll",
      }),
    ).toBeNull()
  })

  it("opens external check-ins with default unchecked-only mode", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(<ActionButtons />)

    const externalButton = await screen.findByRole("button", {
      name: "navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton)

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: false,
      },
    )
  })

  it("opens all external check-ins on ctrl/cmd click", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
      {
        id: "a2",
        checkIn: { customCheckIn: { url: "https://checkin.a2" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(<ActionButtons />)

    const externalButton = await screen.findByRole("button", {
      name: "navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton, { ctrlKey: true })

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: true,
      },
    )
  })

  it("opens external check-ins in a new window on shift click", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(<ActionButtons />)

    const externalButton = await screen.findByRole("button", {
      name: "navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton, { shiftKey: true })

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: false,
        openInNewWindow: true,
      },
    )
  })

  it("supports ctrl/cmd + shift together for external check-ins", async () => {
    displayDataMock = [
      {
        id: "a1",
        checkIn: { customCheckIn: { url: "https://checkin.a1" } },
      },
      {
        id: "a2",
        checkIn: { customCheckIn: { url: "https://checkin.a2" } },
      },
    ]
    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(<ActionButtons />)

    const externalButton = await screen.findByRole("button", {
      name: "navigation.externalCheckinAll",
    })

    fireEvent.click(externalButton, { ctrlKey: true, shiftKey: true })

    expect(handleOpenExternalCheckInsMock).toHaveBeenCalledWith(
      displayDataMock,
      {
        openAll: true,
        openInNewWindow: true,
      },
    )
  })
})
