import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import commonEn from "~/locales/en/common.json"
import keyManagementEn from "~/locales/en/keyManagement.json"
import uiEn from "~/locales/en/ui.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import { AuthTypeEnum } from "~/types"

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

const TOKEN = {
  id: 1,
  user_id: 1,
  key: "sk-test",
  status: 1,
  name: "default",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  allow_ips: "",
  model_limits_enabled: false,
  model_limits: "",
  group: "",
} as any

describe("CopyKeyDialog", () => {
  beforeAll(() => {
    testI18n.addResourceBundle("en", "ui", uiEn, true, true)
    testI18n.addResourceBundle("en", "common", commonEn, true, true)
    testI18n.addResourceBundle(
      "en",
      "keyManagement",
      keyManagementEn,
      true,
      true,
    )
  })

  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchAccountAvailableModelsMock.mockReset()
    fetchUserGroupsMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("creates token then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: uiEn.dialog.copyKey.createKey,
    })
    await user.click(createButton)

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("keeps the dialog actionable when create fails (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: uiEn.dialog.copyKey.createKey,
    })
    await user.click(createButton)

    expect(
      await screen.findByText(
        uiEn.dialog.copyKey.createFailed.replace("{{error}}", "boom"),
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: uiEn.dialog.copyKey.createKey }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("keeps the dialog actionable when refresh stays empty after create (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: uiEn.dialog.copyKey.createKey,
    })
    await user.click(createButton)

    expect(
      await screen.findByText(uiEn.dialog.copyKey.noKeyFoundAfterCreate),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: uiEn.dialog.copyKey.createKey }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(3)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("creates a custom token via AddTokenDialog then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const customCreateButton = await screen.findByRole("button", {
      name: uiEn.dialog.copyKey.createCustomKey,
    })
    await user.click(customCreateButton)

    await user.type(await screen.findByLabelText(/token name/i), "My Key")

    await user.click(
      screen.getByRole("button", { name: keyManagementEn.dialog.createToken }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      name: "My Key",
      remain_quota: -1,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "default",
    })
  })
})
