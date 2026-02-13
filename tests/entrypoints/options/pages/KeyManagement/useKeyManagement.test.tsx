import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { useKeyManagement } from "~/entrypoints/options/pages/KeyManagement/hooks/useKeyManagement"
import { useAccountData } from "~/hooks/useAccountData"
import keyManagementEn from "~/locales/en/keyManagement.json"
import messagesEn from "~/locales/en/messages.json"
import { getApiService } from "~/services/apiService"
import testI18n from "~/tests/test-utils/i18n"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

vi.mock("~/hooks/useAccountData", () => ({
  useAccountData: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
}))

const createDisplayAccount = (
  overrides: Partial<DisplaySiteData>,
): DisplaySiteData => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "default",
  baseUrl: "https://example.com",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const createWrapper = () => {
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
  )
}

describe("useKeyManagement enabled account filtering", () => {
  beforeAll(() => {
    testI18n.addResourceBundle(
      "en",
      "keyManagement",
      keyManagementEn,
      true,
      true,
    )
    testI18n.addResourceBundle("en", "messages", messagesEn, true, true)
  })

  it("uses enabledDisplayData from useAccountData for selectors", () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const enabledAccount = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockedUseAccountData.mockReturnValue({
      displayData: [
        enabledAccount,
        createDisplayAccount({
          id: "disabled",
          name: "Disabled",
          disabled: true,
        }),
      ],
      enabledDisplayData: [enabledAccount],
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    expect(result.current.displayData.map((account) => account.id)).toEqual([
      "enabled",
    ])
  })

  it("clears selectedAccount when a disabled account id is set", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const enabledAccount = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [enabledAccount],
    } as any)

    const { result } = renderHook(() => useKeyManagement(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.setSelectedAccount("disabled")
    })
    await waitFor(() => expect(result.current.selectedAccount).toBe(""))
  })

  it("ignores routeParams.accountId when it points to a disabled account", async () => {
    const mockedUseAccountData = vi.mocked(useAccountData)
    const enabledAccount = createDisplayAccount({
      id: "enabled",
      name: "Enabled",
    })
    mockedUseAccountData.mockReturnValue({
      enabledDisplayData: [enabledAccount],
    } as any)

    const fetchAccountTokens = vi.fn().mockResolvedValue([])
    const mockedGetApiService = vi.mocked(getApiService)
    mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)

    const { result } = renderHook(
      () => useKeyManagement({ accountId: "disabled" }),
      {
        wrapper: createWrapper(),
      },
    )

    await waitFor(() => expect(result.current.selectedAccount).toBe(""))
  })
})
