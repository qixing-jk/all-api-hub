import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelKeyDialog from "~/features/ModelList/components/ModelKeyDialog"
import { AuthTypeEnum } from "~/types"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  toastSuccessMock,
  toastErrorMock,
  resolveDisplayAccountTokenForSecretMock,
  openKeysPageMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
  openKeysPageMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    return {
      ...original,
      resolveDisplayAccountTokenForSecret: (...args: any[]) =>
        resolveDisplayAccountTokenForSecretMock(...args),
    }
  },
)

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => fetchAccountTokensMock(...args),
    createApiToken: (...args: any[]) => createApiTokenMock(...args),
    fetchAccountAvailableModels: vi.fn(async () => []),
    fetchUserGroups: vi.fn(async () => ({})),
    updateApiToken: vi.fn(async () => true),
  }),
}))

vi.mock("~/utils/navigation", () => ({
  openKeysPage: (...args: any[]) => openKeysPageMock(...args),
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
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockReset()
    openKeysPageMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockImplementation(
      async (_account, token) => token,
    )
  })

  it("opens the current account in key management", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

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
        name: "modelList:keyDialog.openKeyManagement",
      }),
    )

    expect(openKeysPageMock).toHaveBeenCalledWith("acc-1")
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
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows the resolver error message when copying the selected key fails", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error("resolver failed"),
    )

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
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith("resolver failed")
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
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    ).toBeInTheDocument()
  })

  it("shows a one-time key dialog when default create returns a full token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: "sk-created-full-secret",
      name: "model-key",
    })

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
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-created-full-secret")
    })
  })

  it("shows a compatibility error when default create returns an incompatible full token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: "sk-created-full-secret",
      name: "wrong-group-key",
      group: "vip",
    })

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
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText(
        "modelList:keyDialog.noCompatibleFoundAfterCreate",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
    expect(writeText).not.toHaveBeenCalled()
  })

  it("refreshes tokens when default create returns a token-shaped object with an invalid secret", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        ...TOKEN,
        id: 11,
        key: "sk-refreshed-compatible",
        name: "refreshed",
      },
    ])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: null,
      name: "invalid-created-token",
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
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()
  })

  it("shows a create error when refreshed inventory has no compatible token", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...TOKEN, id: 11, group: "vip" }])
    createApiTokenMock.mockResolvedValueOnce(true)

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

    expect(
      await screen.findByText(
        "modelList:keyDialog.noCompatibleFoundAfterCreate",
      ),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
  })

  it("shows a create error when the default create request fails", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockRejectedValueOnce(new Error("create failed"))

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

    expect(
      await screen.findByText("modelList:keyDialog.createFailed"),
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
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
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
      await screen.findByText("modelList:keyDialog.ineligible.accountDisabled"),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    ).toBeDisabled()
  })

  it("explains missing auth when an account has no auth mode", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, authType: AuthTypeEnum.None, token: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.missingAuth"),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("explains missing credentials when token management credentials are incomplete", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        "modelList:keyDialog.ineligible.missingCredentials",
      ),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("uses the unknown fallback when token inventory payload is invalid", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce(null)

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
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()
  })

  it("shows a create error when the default create request returns false", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

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

    expect(
      await screen.findByText("modelList:keyDialog.createFailed"),
    ).toBeInTheDocument()
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
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })

    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()
  })
})
