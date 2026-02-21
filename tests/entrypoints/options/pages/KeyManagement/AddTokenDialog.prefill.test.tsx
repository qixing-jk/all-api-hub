import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import AddTokenDialog from "~/entrypoints/options/pages/KeyManagement/components/AddTokenDialog"
import commonEn from "~/locales/en/common.json"
import keyManagementEn from "~/locales/en/keyManagement.json"
import uiEn from "~/locales/en/ui.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import { AuthTypeEnum } from "~/types"

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

    const nameInput = await screen.findByLabelText(/token name/i)
    expect(nameInput).toHaveValue("model gpt-4")

    await user.click(
      screen.getByRole("button", { name: keyManagementEn.dialog.createToken }),
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

    const nameInput = await screen.findByLabelText(/token name/i)
    expect(nameInput).toHaveValue("Existing key")

    await user.click(
      screen.getByRole("button", { name: keyManagementEn.dialog.updateToken }),
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
})
