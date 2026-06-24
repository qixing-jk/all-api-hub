import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelKeyDialog from "~/features/ModelList/components/ModelKeyDialog"
import {
  buildSub2ApiAccount,
  buildSub2ApiToken,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  fetchAccountTokensMock,
  adapterCreateTokenMock,
  legacyCreateApiTokenMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  adapterCreateTokenMock: vi.fn(),
  legacyCreateApiTokenMock: vi.fn(),
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
    createApiToken: (...args: any[]) => legacyCreateApiTokenMock(...args),
    fetchAccountAvailableModels: vi.fn(async () => []),
    fetchUserGroups: vi.fn(async () => ({})),
    updateApiToken: vi.fn(async () => true),
  }),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createToken: (...args: any[]) => adapterCreateTokenMock(...args),
      resolveTokenKey: async ({ token }: { token: { key: string } }) =>
        token.key,
    },
  }),
}))

const ACCOUNT = buildSub2ApiAccount()

const TOKEN = buildSub2ApiToken()

describe("ModelKeyDialog sub2api support", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    adapterCreateTokenMock.mockReset()
    legacyCreateApiTokenMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("allows creating a compatible key for sub2api accounts", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([buildSub2ApiToken({ group: "vip" })])
    adapterCreateTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["vip"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(adapterCreateTokenMock.mock.calls[0]?.[1]).toMatchObject({
        name: "vip group (auto)",
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
      })
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(legacyCreateApiTokenMock).not.toHaveBeenCalled()
  })

  it("refreshes inventory instead of showing one-time UI when Sub2API create returns a token DTO", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    adapterCreateTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-sub2api-created-full-secret",
      name: "sub2api-created",
    })

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

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(legacyCreateApiTokenMock).not.toHaveBeenCalled()
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })
})
