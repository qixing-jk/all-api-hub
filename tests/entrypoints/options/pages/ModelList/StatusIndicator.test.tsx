import userEvent from "@testing-library/user-event"
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
        unsupportedSource={false}
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
        unsupportedSource={false}
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
        unsupportedSource={false}
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

  it("shows pending copy while reloading an empty runtime-key list", async () => {
    render(
      <StatusIndicator
        selectedSource={createAccountSource(ACCOUNT as any)}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage="modelList:status.loadFailed"
        currentAccount={ACCOUNT as any}
        loadPricingData={vi.fn()}
        unsupportedSource={false}
        accountFallback={{
          isAvailable: true,
          isActive: false,
          statusScope: "account",
          hasLoadedRuntimeKeys: true,
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

    const reloadButton = await screen.findByRole("button", {
      name: "modelList:status.fallback.loadingKeys",
    })

    expect(reloadButton).toBeDisabled()
    expect(reloadButton).toHaveAttribute("aria-busy", "true")
  })

  it("reloads runtime keys after a key-list failure", async () => {
    const user = userEvent.setup()
    const loadRuntimeKeys = vi.fn()

    render(
      <StatusIndicator
        selectedSource={createAccountSource(ACCOUNT as any)}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage="modelList:status.loadFailed"
        currentAccount={ACCOUNT as any}
        loadPricingData={vi.fn()}
        unsupportedSource={false}
        accountFallback={{
          isAvailable: true,
          isActive: false,
          statusScope: "account",
          hasLoadedRuntimeKeys: false,
          isLoadingRuntimeKeys: false,
          isLoadingCatalog: false,
          runtimeKeyLoadErrorMessage: "Unable to load runtime keys",
          catalogLoadErrorMessage: null,
          runtimeKeys: [],
          selectedRuntimeKeyId: null,
          activeRuntimeKeyName: null,
          loadRuntimeKeys,
          setSelectedRuntimeKeyId: vi.fn(),
          loadCatalog: vi.fn(),
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:status.fallback.reloadKeys",
      }),
    )

    expect(loadRuntimeKeys).toHaveBeenCalledOnce()
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
        unsupportedSource={false}
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

  it("updates catalog and runtime-key recovery actions across pending states", async () => {
    const user = userEvent.setup()
    const loadCatalog = vi.fn()
    const loadRuntimeKeys = vi.fn()
    const runtimeKeys = [
      buildAccountTokenRuntimeKey(
        ACCOUNT as any,
        {
          id: 7,
          accountId: ACCOUNT.id,
          accountName: ACCOUNT.name,
          key: "sk-example",
          status: 1,
          name: "Example key",
          created_time: 0,
          accessed_time: 0,
          expired_time: -1,
          remain_quota: 0,
          unlimited_quota: true,
          used_quota: 0,
        } as any,
      ),
    ]
    const fallback = {
      isAvailable: true,
      isActive: false,
      statusScope: "account" as const,
      hasLoadedRuntimeKeys: true,
      isLoadingRuntimeKeys: false,
      isLoadingCatalog: false,
      runtimeKeyLoadErrorMessage: null,
      catalogLoadErrorMessage: "Unable to load catalog",
      runtimeKeys,
      selectedRuntimeKeyId: runtimeKeys[0].id,
      activeRuntimeKeyName: null,
      loadRuntimeKeys,
      setSelectedRuntimeKeyId: vi.fn(),
      loadCatalog,
    }
    const renderIndicator = (accountFallback: typeof fallback) => (
      <StatusIndicator
        selectedSource={createAccountSource(ACCOUNT as any)}
        isLoading={false}
        dataFormatError={false}
        loadErrorMessage="modelList:status.loadFailed"
        currentAccount={ACCOUNT as any}
        loadPricingData={vi.fn()}
        unsupportedSource={false}
        accountFallback={accountFallback}
      />
    )
    const { rerender } = render(renderIndicator(fallback))

    const retryButton = await screen.findByRole("button", {
      name: "modelList:status.fallback.retryLoadWithKey",
    })
    await user.click(retryButton)
    expect(loadCatalog).toHaveBeenCalledOnce()

    rerender(
      renderIndicator({
        ...fallback,
        isLoadingCatalog: true,
      }),
    )

    const loadingCatalogButton = screen.getByRole("button", {
      name: "modelList:status.loading",
    })
    const catalogSibling = screen.getByRole("button", {
      name: "modelList:status.fallback.reloadKeys",
    })
    expect(loadingCatalogButton).toBeDisabled()
    expect(loadingCatalogButton).toHaveAttribute("aria-busy", "true")
    expect(catalogSibling).toBeDisabled()
    expect(catalogSibling).not.toHaveAttribute("aria-busy")

    rerender(
      renderIndicator({
        ...fallback,
        isLoadingRuntimeKeys: true,
      }),
    )

    const loadingKeysButton = screen.getByRole("button", {
      name: "modelList:status.fallback.loadingKeys",
    })
    const runtimeKeySibling = screen.getByRole("button", {
      name: "modelList:status.fallback.retryLoadWithKey",
    })
    expect(loadingKeysButton).toBeDisabled()
    expect(loadingKeysButton).toHaveAttribute("aria-busy", "true")
    expect(runtimeKeySibling).toBeDisabled()
    expect(runtimeKeySibling).not.toHaveAttribute("aria-busy")

    await user.click(loadingKeysButton)
    expect(loadRuntimeKeys).not.toHaveBeenCalled()
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
        unsupportedSource={false}
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
