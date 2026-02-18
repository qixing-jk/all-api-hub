import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import ModelKeyDialog from "~/entrypoints/options/pages/ModelList/components/ModelKeyDialog"
import commonEn from "~/locales/en/common.json"
import modelListEn from "~/locales/en/modelList.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import { AuthTypeEnum } from "~/types"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
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
    fetchAccountAvailableModels: vi.fn(async () => []),
    fetchUserGroups: vi.fn(async () => ({})),
    updateApiToken: vi.fn(async () => true),
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

describe("ModelKeyDialog", () => {
  beforeAll(() => {
    testI18n.addResourceBundle("en", "common", commonEn, true, true)
    testI18n.addResourceBundle("en", "modelList", modelListEn, true, true)
  })

  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("copies selected key when exactly one compatible token exists", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: commonEn.actions.copyKey }),
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows empty state and explicit create actions when no compatible tokens exist", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        modelListEn.keyDialog.noCompatibleTitle.replace("{{modelId}}", "gpt-4"),
      ),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: modelListEn.keyDialog.createKey }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: modelListEn.keyDialog.createCustomKey,
      }),
    ).toBeInTheDocument()
  })

  it("treats group mismatch as incompatible and shows empty state", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ ...TOKEN, group: "vip" }])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        modelListEn.keyDialog.noCompatibleTitle.replace("{{modelId}}", "gpt-4"),
      ),
    ).toBeInTheDocument()
  })

  it("disables create actions and explains when the account is ineligible", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, disabled: true }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(modelListEn.keyDialog.ineligible.accountDisabled),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: modelListEn.keyDialog.createKey }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: modelListEn.keyDialog.createCustomKey,
      }),
    ).toBeDisabled()
  })

  it("supports retry when token loading fails", async () => {
    fetchAccountTokensMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        modelListEn.keyDialog.loadFailed.replace("{{error}}", "boom"),
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: commonEn.actions.retry }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })

    expect(
      await screen.findByRole("button", { name: commonEn.actions.copyKey }),
    ).toBeInTheDocument()
  })
})
