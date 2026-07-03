import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { StatusIndicator } from "~/features/ModelList/components/StatusIndicator"
import {
  createAccountSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
import { buildAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"

const ACCOUNT = {
  id: "acc-1",
  name: "Example Account",
  username: "tester",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as const

describe("StatusIndicator", () => {
  it("shows Sub2API key-scoped model loading as an expected info state", async () => {
    const sub2apiAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.SUB2API,
    }

    render(
      <StatusIndicator
        selectedSource={createAccountSource(sub2apiAccount as any)}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage={null}
        currentAccount={sub2apiAccount as any}
        loadPricingData={vi.fn()}
        accountFallback={{
          isAvailable: true,
          isActive: false,
          statusScope: "runtime-key",
          hasLoadedRuntimeKeys: false,
          isLoadingRuntimeKeys: true,
          isLoadingCatalog: false,
          runtimeKeyLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          runtimeKeys: [],
          selectedRuntimeKeyId: null,
          activeRuntimeKeyName: null,
          loadRuntimeKeys: vi.fn(),
          setSelectedRuntimeKeyId: vi.fn(),
          loadCatalog: vi.fn(),
        }}
      />,
    )

    expect(
      await screen.findByText("modelList:status.runtimeKeyScopedCatalogTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelList:status.runtimeKeyScopedCatalogDescription"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelList:status.runtimeKeyScopedCatalogFallbackTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "modelList:status.runtimeKeyScopedCatalogFallbackDescription",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:status.genericLoadFailedTitle"),
    ).not.toBeInTheDocument()
  })

  it("drives key-scoped fallback labels from fallback status scope", async () => {
    const compatibleAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.NEW_API,
    }

    render(
      <StatusIndicator
        selectedSource={createAccountSource(compatibleAccount as any)}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage={null}
        currentAccount={compatibleAccount as any}
        loadPricingData={vi.fn()}
        accountFallback={{
          isAvailable: true,
          isActive: false,
          statusScope: "runtime-key",
          hasLoadedRuntimeKeys: false,
          isLoadingRuntimeKeys: true,
          isLoadingCatalog: false,
          runtimeKeyLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          runtimeKeys: [],
          selectedRuntimeKeyId: null,
          activeRuntimeKeyName: null,
          loadRuntimeKeys: vi.fn(),
          setSelectedRuntimeKeyId: vi.fn(),
          loadCatalog: vi.fn(),
        }}
      />,
    )

    expect(
      await screen.findByText("modelList:status.runtimeKeyScopedCatalogTitle"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:status.genericLoadFailedTitle"),
    ).not.toBeInTheDocument()
  })

  it("shows automatic key loading feedback before the fallback list is ready", async () => {
    render(
      <StatusIndicator
        selectedSource={createAccountSource(ACCOUNT as any)}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage="modelList:status.loadFailed"
        currentAccount={ACCOUNT as any}
        loadPricingData={vi.fn()}
        accountFallback={{
          isAvailable: true,
          isActive: false,
          statusScope: "account",
          hasLoadedRuntimeKeys: false,
          isLoadingRuntimeKeys: true,
          isLoadingCatalog: false,
          runtimeKeyLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          runtimeKeys: [],
          selectedRuntimeKeyId: null,
          activeRuntimeKeyName: null,
          loadRuntimeKeys: vi.fn(),
          setSelectedRuntimeKeyId: vi.fn(),
          loadCatalog: vi.fn(),
        }}
      />,
    )

    expect(
      await screen.findByText("modelList:status.fallback.loadingKeys"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:status.runtimeKeyScopedCatalogTitle"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:status.fallback.loadKeys",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps the fallback key select interactive when exactly one key is available", async () => {
    render(
      <StatusIndicator
        selectedSource={createAccountSource(ACCOUNT as any)}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage="modelList:status.loadFailed"
        currentAccount={ACCOUNT as any}
        loadPricingData={vi.fn()}
        accountFallback={{
          isAvailable: true,
          isActive: false,
          statusScope: "account",
          hasLoadedRuntimeKeys: true,
          isLoadingRuntimeKeys: false,
          isLoadingCatalog: false,
          runtimeKeyLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          runtimeKeys: [
            buildAccountTokenRuntimeKey(
              ACCOUNT as any,
              {
                id: 7,
                accountId: ACCOUNT.id,
                accountName: ACCOUNT.name,
                key: "sk-only",
                status: 1,
                name: "Only key",
                created_time: 0,
                accessed_time: 0,
                expired_time: -1,
                remain_quota: 0,
                unlimited_quota: true,
                used_quota: 0,
              } as any,
            ),
          ],
          selectedRuntimeKeyId: "account_token:acc-1:7",
          activeRuntimeKeyName: null,
          loadRuntimeKeys: vi.fn(),
          setSelectedRuntimeKeyId: vi.fn(),
          loadCatalog: vi.fn(),
        }}
      />,
    )

    const selectTrigger = await screen.findByRole("combobox", {
      name: "modelList:status.fallback.selectLabel",
    })

    expect(selectTrigger).toBeEnabled()
  })

  it("shows profile-specific load errors without account fallback actions", async () => {
    render(
      <StatusIndicator
        selectedSource={createProfileSource({
          id: "profile-1",
          name: "Reusable Key",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://profile.example.com",
          apiKey: "sk-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        })}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage="modelList:status.profileLoadFailed"
        currentAccount={undefined}
        loadPricingData={vi.fn()}
        accountFallback={{
          isAvailable: true,
          isActive: false,
          statusScope: "account",
          hasLoadedRuntimeKeys: false,
          isLoadingRuntimeKeys: false,
          isLoadingCatalog: false,
          runtimeKeyLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          runtimeKeys: [],
          selectedRuntimeKeyId: null,
          activeRuntimeKeyName: null,
          loadRuntimeKeys: vi.fn(),
          setSelectedRuntimeKeyId: vi.fn(),
          loadCatalog: vi.fn(),
        }}
      />,
    )

    expect(
      await screen.findByText("modelList:status.profileLoadFailedTitle"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:status.fallback.title"),
    ).not.toBeInTheDocument()
  })
})
