import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import {
  buildSub2ApiAccount,
  buildSub2ApiToken,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => fetchAccountTokensMock(...args),
    createApiToken: (...args: any[]) => createApiTokenMock(...args),
    fetchAccountAvailableModels: (...args: any[]) =>
      fetchAccountAvailableModelsMock(...args),
    fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
    updateApiToken: vi.fn(async () => true),
  }),
}))

const ACCOUNT = buildSub2ApiAccount()

const TOKEN = buildSub2ApiToken()

describe("CopyKeyDialog sub2api support", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchAccountAvailableModelsMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    fetchAccountAvailableModelsMock.mockResolvedValue([])
  })

  it("auto-uses the only valid current group for Sub2API quick-create", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ group: "vip" }),
      )
    })
  })

  it("requires explicit group selection when multiple Sub2API groups exist", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(createApiTokenMock).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:sub2api.createRequiresGroupSelection"),
    ).toBeInTheDocument()
  })

  it("fails safely when no Sub2API groups are available", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({})

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(createApiTokenMock).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:sub2api.createRequiresAvailableGroup"),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("opens the constrained dialog flow before creating when multiple groups exist", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })
      .mockResolvedValueOnce({
        default: { desc: "Default", ratio: 1 },
        vip: { desc: "VIP", ratio: 2 },
      })
    createApiTokenMock.mockResolvedValueOnce(true)
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await screen.findByRole("button", {
      name: "keyManagement:dialog.createToken",
    })

    const groupTrigger = screen
      .getAllByRole("combobox")
      .find((element) =>
        element.textContent?.includes("keyManagement:dialog.groupLabel"),
      )
    expect(groupTrigger).toBeTruthy()

    await user.click(groupTrigger as HTMLElement)
    await user.click(
      await screen.findByText(
        "default - Default (keyManagement:dialog.groupRate 1)",
      ),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ group: "default" }),
      )
    })
  })
})
