import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import ModelList from "~/entrypoints/options/pages/ModelList"
import commonEn from "~/locales/en/common.json"
import keyManagementEn from "~/locales/en/keyManagement.json"
import modelListEn from "~/locales/en/modelList.json"
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
    updateApiToken: vi.fn(async () => true),
  }),
}))

vi.mock("~/utils/modelProviders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/modelProviders")>()
  return {
    ...actual,
    getAllProviders: () => [],
  }
})

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

vi.mock("~/entrypoints/options/pages/ModelList/hooks/useModelListData", () => ({
  useModelListData: vi.fn(() => ({
    // Account data
    accounts: [ACCOUNT],
    currentAccount: ACCOUNT,

    // UI state
    selectedAccount: ACCOUNT.id,
    setSelectedAccount: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    selectedProvider: "all",
    setSelectedProvider: vi.fn(),
    selectedGroup: "default",
    setSelectedGroup: vi.fn(),

    // Display options
    showRealPrice: false,
    setShowRealPrice: vi.fn(),
    showRatioColumn: false,
    setShowRatioColumn: vi.fn(),
    showEndpointTypes: false,
    setShowEndpointTypes: vi.fn(),

    // Data state
    pricingData: { data: [{ model_name: "gpt-4" }] },
    pricingContexts: [],
    isLoading: false,
    dataFormatError: null,

    // Computed data
    filteredModels: [],
    baseFilteredModels: [],
    availableGroups: [],

    // Operations
    loadPricingData: vi.fn(),
    getProviderFilteredCount: vi.fn(() => 0),
    accountQueryStates: [],
    allAccountsFilterAccountId: null,
    setAllAccountsFilterAccountId: vi.fn(),
  })),
}))

vi.mock(
  "~/entrypoints/options/pages/ModelList/components/ModelDisplay",
  () => ({
    ModelDisplay: ({ currentAccount, onOpenModelKeyDialog }: any) => (
      <button
        type="button"
        onClick={() => onOpenModelKeyDialog(currentAccount, "gpt-4", ["vip"])}
      >
        Open key dialog
      </button>
    ),
  }),
)

vi.mock(
  "~/entrypoints/options/pages/ModelList/components/AccountSelector",
  () => ({
    AccountSelector: () => null,
  }),
)
vi.mock(
  "~/entrypoints/options/pages/ModelList/components/AccountSummaryBar",
  () => ({
    AccountSummaryBar: () => null,
  }),
)
vi.mock(
  "~/entrypoints/options/pages/ModelList/components/ControlPanel",
  () => ({
    ControlPanel: () => null,
  }),
)
vi.mock("~/entrypoints/options/pages/ModelList/components/Footer", () => ({
  Footer: () => null,
}))
vi.mock(
  "~/entrypoints/options/pages/ModelList/components/StatusIndicator",
  () => ({
    StatusIndicator: () => null,
  }),
)

vi.mock(
  "~/entrypoints/options/pages/ModelList/components/ProviderTabs",
  async () => {
    const { TabGroup } = await import("@headlessui/react")
    return {
      ProviderTabs: ({ children }: any) => <TabGroup>{children}</TabGroup>,
    }
  },
)

describe("Model List → ModelKeyDialog", () => {
  beforeAll(() => {
    testI18n.addResourceBundle("en", "ui", uiEn, true, true)
    testI18n.addResourceBundle("en", "common", commonEn, true, true)
    testI18n.addResourceBundle("en", "modelList", modelListEn, true, true)
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

  it("opens dialog and creates a custom key with model limits prefilled", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce(["gpt-4"])
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "vip", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<ModelList />)

    await user.click(
      await screen.findByRole("button", { name: "Open key dialog" }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: modelListEn.keyDialog.createCustomKey,
      }),
    )

    expect(await screen.findByLabelText(/token name/i)).toHaveValue(
      "model gpt-4",
    )

    await user.click(
      screen.getByRole("button", { name: keyManagementEn.dialog.createToken }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      model_limits_enabled: true,
      model_limits: "gpt-4",
      group: "vip",
    })
  })
})
