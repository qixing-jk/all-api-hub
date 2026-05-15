import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Z_INDEX } from "~/components/ui"
import { SITE_TYPES } from "~/constants/siteType"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { AuthTypeEnum } from "~/types"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
  createApiTokenMock,
  updateApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  startProductAnalyticsActionMock,
  toastSuccessMock,
  toastErrorMock,
  trackerCompleteMock,
} = vi.hoisted(() => ({
  createApiTokenMock: vi.fn(),
  updateApiTokenMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  trackerCompleteMock: vi.fn(),
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

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: SITE_TYPES.NEW_API,
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
    startProductAnalyticsActionMock.mockReset()
    trackerCompleteMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackerCompleteMock,
    })
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
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "model gpt-4",
    )
  })

  it("keeps a successful create flow successful when analytics completion rejects", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)
    trackerCompleteMock.mockRejectedValueOnce(new Error("analytics offline"))
    const onClose = vi.fn()

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={onClose}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "Analytics best effort",
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "keyManagement:dialog.createSuccess",
      )
      expect(onClose).toHaveBeenCalled()
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("keeps a successful create flow successful when analytics start throws", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)
    startProductAnalyticsActionMock.mockImplementationOnce(() => {
      throw new Error("analytics unavailable")
    })
    const onClose = vi.fn()

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={onClose}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "Analytics start best effort",
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "keyManagement:dialog.createSuccess",
      )
      expect(onClose).toHaveBeenCalled()
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
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
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(JSON.stringify(trackerCompleteMock.mock.calls)).not.toContain(
      "Existing key",
    )
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
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("falls back to the localized update failure message when the error is blank", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4", "gpt-3.5"])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    updateApiTokenMock.mockRejectedValueOnce(new Error("   "))

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
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:dialog.updateToken",
      }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "keyManagement:dialog.updateFailed",
      )
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("shows a one-time key dialog when create returns a full token", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      id: 7,
      user_id: 1,
      key: "sk-created-full-secret",
      status: 1,
      name: "My Key",
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "My Key",
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")
    fireEvent.focus(screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-created-full-secret")
    })
  })

  it("keeps the one-time key dialog open and shows a fallback when clipboard copy fails", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      id: 7,
      user_id: 1,
      key: "sk-created-full-secret",
      status: 1,
      name: "My Key",
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    })

    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("clipboard denied"),
    )

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "My Key",
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("clipboard denied")
    })

    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")
  })

  it("does not treat token-shaped create results with invalid secrets as one-time keys", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      id: 7,
      key: null,
      name: "invalid secret",
    })
    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "Invalid secret",
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "keyManagement:dialog.createSuccess",
      )
      expect(onSuccess).toHaveBeenCalledWith(undefined)
      expect(onClose).toHaveBeenCalled()
    })

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("passes a created one-time token to onSuccess when inline display is disabled", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    const createdToken = {
      id: 7,
      user_id: 1,
      key: "sk-created-full-secret",
      status: 1,
      name: "My Key",
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    }
    createApiTokenMock.mockResolvedValueOnce(createdToken)
    const onClose = vi.fn()
    const onSuccess = vi.fn()

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
        showOneTimeKeyDialog={false}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "My Key",
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "keyManagement:dialog.createSuccess",
      )
      expect(onSuccess).toHaveBeenCalledWith(createdToken)
      expect(onClose).toHaveBeenCalled()
    })

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("continues closing the dialog when the create onSuccess callback rejects", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)
    const onClose = vi.fn()
    const onSuccess = vi
      .fn()
      .mockRejectedValueOnce(new Error("callback failed"))

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "Callback failure",
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "keyManagement:dialog.createSuccess",
      )
      expect(onSuccess).toHaveBeenCalledWith(undefined)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it("closes through the one-time key dialog acknowledgement", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      id: 7,
      user_id: 1,
      key: "sk-created-full-secret",
      status: 1,
      name: "My Key",
      created_time: 1,
      accessed_time: 1,
      expired_time: -1,
      remain_quota: -1,
      unlimited_quota: true,
      used_quota: 0,
    })
    const onClose = vi.fn()

    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={onClose}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "My Key",
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "keyManagement:oneTimeKey.close" }),
    )

    expect(onClose).toHaveBeenCalled()
  })

  it("creates tokens without rendering or requiring group selection when the site has no groups", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4"])
    fetchUserGroupsMock.mockRejectedValueOnce(
      new ApiError(
        "aihubmix_user_groups_unsupported",
        undefined,
        undefined,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      ),
    )
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[ACCOUNT]}
        preSelectedAccountId={ACCOUNT.id}
        createPrefill={{ modelId: "gpt-4", defaultName: "group-less token" }}
      />,
    )

    await screen.findByLabelText(/keyManagement:dialog\.tokenName/)

    expect(screen.queryByText("keyManagement:dialog.groupLabel")).toBeNull()

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      name: "group-less token",
      model_limits_enabled: true,
      model_limits: "gpt-4",
    })
  })

  it("lets AIHubMix submit subnet values for backend validation", async () => {
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockRejectedValueOnce(
      new ApiError(
        "aihubmix_user_groups_unsupported",
        undefined,
        undefined,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      ),
    )
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const aihubmixAccount = {
      ...ACCOUNT,
      id: "aihubmix-1",
      name: "AIHubMix",
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    }

    render(
      <AddTokenDialog
        isOpen={true}
        onClose={() => {}}
        availableAccounts={[aihubmixAccount]}
        preSelectedAccountId={aihubmixAccount.id}
      />,
    )

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "AIHubMix subnet test",
    )
    await user.type(
      screen.getByLabelText("keyManagement:dialog.subnetLimits"),
      "111",
    )
    expect(
      screen.getByText("keyManagement:dialog.subnetExample"),
    ).toBeInTheDocument()
    expect(screen.queryByText("keyManagement:dialog.ipExample")).toBeNull()

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      name: "AIHubMix subnet test",
      allow_ips: "111",
    })
    expect(toastErrorMock).not.toHaveBeenCalledWith(
      "keyManagement:dialog.validIp",
    )
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
