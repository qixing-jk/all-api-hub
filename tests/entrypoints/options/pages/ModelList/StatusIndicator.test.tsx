import { describe, expect, it, vi } from "vitest"

import { StatusIndicator } from "~/features/ModelList/components/StatusIndicator"
import {
  createAccountSource,
  createProfileSource,
} from "~/features/ModelList/modelManagementSources"
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
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
} as const

describe("StatusIndicator", () => {
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
          hasLoadedTokens: false,
          isLoadingTokens: true,
          isLoadingCatalog: false,
          tokenLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          tokens: [],
          selectedTokenId: null,
          activeTokenName: null,
          loadTokens: vi.fn(),
          setSelectedTokenId: vi.fn(),
          loadCatalog: vi.fn(),
        }}
      />,
    )

    expect(
      await screen.findByText("modelList:status.fallback.loadingKeys"),
    ).toBeInTheDocument()
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
          hasLoadedTokens: true,
          isLoadingTokens: false,
          isLoadingCatalog: false,
          tokenLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          tokens: [
            {
              id: 7,
              user_id: 1,
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
          ],
          selectedTokenId: 7,
          activeTokenName: null,
          loadTokens: vi.fn(),
          setSelectedTokenId: vi.fn(),
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
          hasLoadedTokens: false,
          isLoadingTokens: false,
          isLoadingCatalog: false,
          tokenLoadErrorMessage: null,
          catalogLoadErrorMessage: null,
          tokens: [],
          selectedTokenId: null,
          activeTokenName: null,
          loadTokens: vi.fn(),
          setSelectedTokenId: vi.fn(),
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
