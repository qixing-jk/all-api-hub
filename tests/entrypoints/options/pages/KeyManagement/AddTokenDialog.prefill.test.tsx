import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Z_INDEX } from "~/components/ui"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { AuthTypeEnum } from "~/types"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const {
  createApiTokenMock,
  updateApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  createApiTokenMock: vi.fn(),
  updateApiTokenMock: vi.fn(),
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
    createApiToken: (...args: any[]) => createApiTokenMock(...args),
    updateApiToken: (...args: any[]) => updateApiTokenMock(...args),
    fetchAccountAvailableModels: (...args: any[]) =>
      fetchAccountAvailableModelsMock(...args),
    fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
  }),
}))

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as any

describe("AddTokenDialog prefill", () => {
  beforeEach(() => {
    createApiTokenMock.mockReset()
    updateApiTokenMock.mockReset()
    fetchAccountAvailableModelsMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("prefills model limits when creating with createPrefill", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4", "gpt-3.5"])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
        createPrefill={{ modelId: "gpt-4", defaultName: "model gpt-4" }}
      />,
    )

    const nameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    expect(nameInput).toHaveValue("model gpt-4")

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      name: "model gpt-4",
      model_limits_enabled: true,
      model_limits: "gpt-4",
    })
  })

  it("does not apply prefill when editing a token", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4", "gpt-3.5"])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    updateApiTokenMock.mockResolvedValueOnce(true)

    const editingToken = {
      id: 123,
      accountId: ACCOUNT.id,
      accountName: ACCOUNT.name,
      name: "Existing key",
      remain_quota: -1,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "default",
    } as any

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
        editingToken={editingToken}
        createPrefill={{ modelId: "gpt-4", defaultName: "model gpt-4" }}
      />,
    )

    const nameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    expect(nameInput).toHaveValue("Existing key")

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.updateToken" }),
    )

    await waitFor(() => {
      expect(updateApiTokenMock).toHaveBeenCalledTimes(1)
    })

    expect(updateApiTokenMock.mock.calls[0]?.[2]).toMatchObject({
      name: "Existing key",
      model_limits_enabled: false,
      model_limits: "",
    })
  })

  it("falls back to the localized create failure message when the error is blank", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4", "gpt-3.5"])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockRejectedValueOnce(new Error("   "))

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
        createPrefill={{ modelId: "gpt-4", defaultName: "model gpt-4" }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "keyManagement:dialog.createFailed",
      )
    })
  })

  it("keeps the group selector popover above the modal and allows changing the group", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4", "gpt-3.5"])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
      level3: { desc: "User Group", ratio: 1.5 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
        createPrefill={{ modelId: "gpt-4", defaultName: "layering test token" }}
      />,
    )

    const modal = await screen.findByRole("dialog")
    expect(modal).toHaveClass(Z_INDEX.modal)

    await screen.findByLabelText(/keyManagement:dialog\.tokenName/)

    const groupField = screen
      .getByText("keyManagement:dialog.groupLabel")
      .closest("div")
    expect(groupField).toBeTruthy()

    const groupTrigger = within(groupField as HTMLElement).getByRole("combobox")
    await user.click(groupTrigger)

    const popoverContent = document.querySelector(
      '[data-slot="popover-content"]',
    )
    expect(popoverContent).toBeInTheDocument()
    expect(popoverContent).toHaveClass(Z_INDEX.modalFloating)
    expect(popoverContent).not.toHaveClass(Z_INDEX.floating)

    await user.click(
      await screen.findByText(
        "level3 - User Group (keyManagement:dialog.groupRate 1.5)",
      ),
    )

    expect(groupTrigger).toHaveTextContent("level3 - User Group")

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      group: "level3",
    })
  })

  it("requires a manual group choice when restricted groups are provided without a prefill group", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4"])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
        createPrefill={{
          modelId: "gpt-4",
          defaultName: "restricted token",
          allowedGroups: ["default", "vip"],
        }}
      />,
    )

    const createButton = await screen.findByRole("button", {
      name: "keyManagement:dialog.createToken",
    })

    const groupTrigger = screen
      .getAllByRole("combobox")
      .find((element) =>
        element.textContent?.includes("keyManagement:dialog.groupLabel"),
      )
    expect(groupTrigger).toBeTruthy()
    expect(groupTrigger).toHaveTextContent("keyManagement:dialog.groupLabel")

    await user.click(createButton)

    expect(createApiTokenMock).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:sub2api.createRequiresGroupSelection"),
    ).toBeInTheDocument()

    await user.click(groupTrigger as HTMLElement)
    await user.click(
      await screen.findByText("vip - VIP (keyManagement:dialog.groupRate 2)"),
    )

    await user.click(createButton)

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      group: "vip",
    })
  })
})
