import { act, renderHook } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { VerifyApiDialog } from "~/features/Verification/api"
import { useVerifyApiDialogViewModel } from "~/features/Verification/api/useVerifyApiDialogViewModel"
import enVerification from "~/locales/en/aiApiVerification.json"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import type { AccountRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import * as siteCapabilities from "~/services/apiAdapters/registry"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import {
  createAccountModelVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import { server } from "~~/tests/msw/server"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { requireHistoryTarget } from "~~/tests/test-utils/history"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"
import { buildNewApiToken } from "~~/tests/test-utils/newApiToken"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"
import { stubVerificationOwnerStoresUnavailable } from "~~/tests/test-utils/verificationOwnerStores"
import {
  getVerificationHeader,
  mockVerificationWorkspaceLayout,
} from "~~/tests/test-utils/verificationWorkspace"

const {
  mockFetchAccountTokens,
  mockFetchDisplayAccountRuntimeKeys,
  mockResolveDisplayAccountRuntimeKeySecret,
  mockResolveTokenKey,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  mockFetchAccountTokens: vi.fn(),
  mockFetchDisplayAccountRuntimeKeys: vi.fn(),
  mockResolveDisplayAccountRuntimeKeySecret: vi.fn(),
  mockResolveTokenKey: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: () => ({
    account: {
      keyResourceManagement: {
        inventorySecretAvailability: "recoverable",
        open: vi.fn(),
      },
    },
  }),
}))

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    const fixtures = await import("~~/tests/test-utils/accountKeyFixtures")
    const runtimeKeyHelpers = await vi.importActual<
      typeof import("~/services/accounts/keys/accountRuntimeKeys")
    >("~/services/accounts/keys/accountRuntimeKeys")

    const toRuntimeKeys = async (account: any) => {
      const runtimeKeys = await mockFetchDisplayAccountRuntimeKeys(account)
      if (runtimeKeys !== undefined) return runtimeKeys

      const tokens = await mockFetchAccountTokens(account)
      return tokens.map((token: any) =>
        fixtures.buildNewApiRuntimeKey(account, token),
      )
    }

    return {
      ...actual,
      fetchDisplayAccountRuntimeKeys: (...args: unknown[]) =>
        toRuntimeKeys(args[0]),
      resolveDisplayAccountRuntimeKeySecret: async (...args: unknown[]) => {
        const resolvedRuntimeKey =
          await mockResolveDisplayAccountRuntimeKeySecret(...args)
        if (resolvedRuntimeKey !== undefined) return resolvedRuntimeKey

        const [account, runtimeKey, options] = args as [
          any,
          AccountRuntimeKey,
          { abortSignal?: AbortSignal } | undefined,
        ]
        if (runtimeKeyHelpers.isAccountKeyResourceRuntimeKey(runtimeKey)) {
          const resolvedKey = await mockResolveTokenKey({
            request: {
              baseUrl: account.baseUrl,
              accountId: account.id,
              abortSignal: options?.abortSignal,
            },
            token: { id: runtimeKey.legacyTokenId, key: runtimeKey.secret },
          })
          return runtimeKeyHelpers.formatAccountRuntimeKeySecretForSite({
            ...runtimeKey,
            secret: resolvedKey,
          })
        }

        return runtimeKey
      },
    }
  },
)

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: (error: unknown) =>
    error &&
    typeof error === "object" &&
    (error as { statusCode?: unknown }).statusCode === 401
      ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
      : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
  startProductAnalyticsAction: (...args: unknown[]) =>
    mockStartProductAnalyticsAction(...args),
}))

const mockRunApiVerificationProbe = vi.fn()
const mockProbeDefinitions = vi.fn()
const mockRunPelicanTest = vi.fn()

vi.mock("~/services/verification/modelQuality/pelican", () => ({
  PELICAN_TEST_PROMPT: "pelican",
  runPelicanTest: (...args: unknown[]) => mockRunPelicanTest(...args),
}))

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...original,
    getProbesForModality: (
      modality: Parameters<typeof original.getProbesForModality>[0],
      apiType: Parameters<typeof original.getProbesForModality>[1],
    ) =>
      (modality === undefined ||
      modality === original.MODEL_TEST_MODALITIES.Text
        ? mockProbeDefinitions(apiType)
        : undefined) ?? original.getProbesForModality(modality, apiType),
    runApiVerificationProbe: (...args: unknown[]) =>
      mockRunApiVerificationProbe(...args),
  }
})

describe("VerifyApiDialog", () => {
  it("locks the model in an idle test while another single probe is running", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: { aiApiVerification: enVerification },
    })
    mockFetchAccountTokens.mockResolvedValue([
      buildNewApiToken({ key: "synthetic-key" }),
    ])
    const pending = createDeferred<ApiVerificationProbeResult>()
    mockRunApiVerificationProbe.mockReturnValue(pending.promise)
    render(
      <I18nextProvider i18n={i18n}>
        <VerifyApiDialog
          isOpen
          onClose={vi.fn()}
          account={buildDisplaySiteData()}
          initialModelId="gpt-first"
        />
      </I18nextProvider>,
    )
    const row = await screen.findByTestId("verify-probe-text-generation")
    const run = within(row).getByRole("button", { name: "Run" })
    await waitFor(() => expect(run).toBeEnabled())
    await user.click(run)
    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledOnce(),
    )
    await user.click(
      screen.getByRole("button", {
        name: "Tool/function calling",
      }),
    )
    const detail = screen
      .getByRole("textbox", {
        name: "Tool/function calling prompt",
      })
      .closest("[data-verification-detail]")!
    expect(
      within(detail as HTMLElement).getByRole("button", {
        name: "Model",
      }),
    ).toBeDisabled()
    await act(async () => {
      pending.resolve({
        id: "text-generation",
        status: "pass",
        latencyMs: 1,
        summary: "Finished",
      })
    })
    expect(
      within(detail as HTMLElement).getByRole("button", {
        name: "Model",
      }),
    ).toBeEnabled()
  })
  it("enables testing after retry retrieves a usable runtime key", async () => {
    const account = buildDisplaySiteData()
    const runtime = buildNewApiRuntimeKey(
      account,
      buildNewApiToken({ key: "synthetic-runtime-key", status: 1 }),
    )
    mockFetchDisplayAccountRuntimeKeys
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue([runtime])
    const { result } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: { isOpen: true, account, initialModelId: "test-model" },
    })
    await waitFor(() => expect(result.current.runtimeKeysLoadFailed).toBe(true))
    expect(result.current.canRunAll).toBe(false)
    await act(async () => {
      await result.current.reloadRuntimeKeys()
    })
    expect(result.current.runtimeKeysLoadFailed).toBe(false)
    expect(result.current.selectedRuntimeKey?.id).toBe(runtime.id)
    expect(result.current.canRunAll).toBe(true)
    expect(result.current.tools.contextCapacity?.canRun).toBe(true)
  })
  it("distinguishes runtime-key loading failure from an empty inventory and retries it", async () => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: { aiApiVerification: enVerification },
    })
    mockFetchDisplayAccountRuntimeKeys
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue([])
    render(
      <I18nextProvider i18n={i18n}>
        <VerifyApiDialog
          isOpen
          onClose={vi.fn()}
          account={buildDisplaySiteData()}
          initialModelId="test-model"
        />
      </I18nextProvider>,
    )
    const failure = await screen.findByText(
      "Could not load API keys. Retry to retrieve the key list.",
    )
    expect(failure).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(
      await screen.findByText(
        "Select an API key in configuration to run tests.",
      ),
    ).toBeVisible()
    expect(failure).not.toBeInTheDocument()
    expect(mockFetchDisplayAccountRuntimeKeys).toHaveBeenCalledTimes(2)
  })
  it("explains missing runtime keys and opens configuration with a management destination", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900)
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({
      en: { aiApiVerification: enVerification },
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([])
    const onManageModelKey = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <VerifyApiDialog
          isOpen
          onClose={vi.fn()}
          account={buildDisplaySiteData()}
          initialModelId="test-model"
          onManageModelKey={onManageModelKey}
        />
      </I18nextProvider>,
    )
    expect(
      await screen.findByText(
        "Select an API key in configuration to run tests.",
      ),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Expand configuration" }),
    )
    const manage = await screen.findByRole("button", {
      name: enVerification.verifyDialog.actions.manageModelKey,
    })
    expect(manage).toBeVisible()
    await user.click(manage)
    expect(onManageModelKey).toHaveBeenCalledOnce()
  })
  afterEach(() => vi.restoreAllMocks())

  beforeEach(async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1440)
    mockVerificationWorkspaceLayout()

    // This suite passes accounts in as props instead of persisting them, so the
    // orphan sweep must not read the empty owner stores as "every owner is gone".
    stubVerificationOwnerStoresUnavailable()

    // Prevent cross-test leakage from `mockResolvedValueOnce` and call counts.
    mockFetchAccountTokens.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockReset()
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue(undefined)
    mockResolveDisplayAccountRuntimeKeySecret.mockReset()
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(undefined)
    mockResolveTokenKey.mockReset()
    mockResolveTokenKey.mockImplementation(
      async ({ token }: { token: { key: string } }) => token.key,
    )
    mockRunApiVerificationProbe.mockReset()
    mockProbeDefinitions.mockReset()
    mockStartProductAnalyticsAction.mockReset()
    mockCompleteProductAnalyticsAction.mockReset()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    await verificationResultHistoryStorage.clearAllData()
    mockRunPelicanTest.mockReset()
  })

  it("opens a CLI shortcut with editable protocol and normal test order", async () => {
    const user = userEvent.setup()
    mockProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
      { id: "tool-calling", requiresModelId: true },
    ])
    const account = buildDisplaySiteData()
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([])
    render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        account={account}
        initialModelId="test-model"
        initialRequestProfile="claude"
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", {
          name: "aiApiVerification:verifyDialog.meta.requestProfile",
        }),
      ).toHaveTextContent(
        "aiApiVerification:verifyDialog.requestProfiles.claude",
      ),
    )
    expect(
      screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.apiType",
      }),
    ).toHaveTextContent("aiApiVerification:verifyDialog.apiTypes.anthropic")
    expect(
      screen
        .getAllByTestId(/^verify-probe-/)
        .map((node) => node.getAttribute("data-testid")),
    ).toEqual([
      "verify-probe-models",
      "verify-probe-text-generation",
      "verify-probe-tool-calling",
    ])
    expect(
      screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.apiType",
      }),
    ).toBeEnabled()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
    expect(screen.queryByTestId("cli-tool-comparison")).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.requestProfiles.shortcutHint",
      ),
    ).toBeVisible()
    await user.click(screen.getByRole("switch", { name: /enhancedLabel/ }))
    await user.click(
      screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.apiType",
      }),
    )
    await user.click(
      screen.getByRole("option", {
        name: "aiApiVerification:verifyDialog.apiTypes.openaiCompatible",
      }),
    )
    expect(
      screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.requestProfile",
      }),
    ).toHaveTextContent("aiApiVerification:verifyDialog.requestProfiles.claude")
    expect(screen.getByRole("switch", { name: /enhancedLabel/ })).toBeChecked()
    expect(
      screen.queryByText(
        "aiApiVerification:verifyDialog.requestProfiles.shortcutHint",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.requestProfiles.protocolMismatch",
      ),
    ).toBeVisible()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it.each(["known-secret", "sk-known-secret"])(
    "restores account capacity for effective New API secret %s without fetching credentials",
    async (secret) => {
      const { contextCapacityHistory } =
        await import("~/services/verification/verificationResultHistory/contextCapacityHistory")
      const account = buildDisplaySiteData({ siteType: SITE_TYPES.NEW_API })
      const runtime = buildServiceCredentialRuntimeKey(account, {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: secret,
        isAuthenticated: true,
        baseUrl: "https://runtime.example.invalid",
      })
      const request = {
        apiType: "openai-compatible" as const,
        baseUrl: runtime.baseUrl,
        apiKey: "sk-known-secret",
        modelId: "gpt-test",
      }
      const target = requireHistoryTarget(
        createAccountModelVerificationHistoryTarget(account.id, "gpt-test"),
      )
      await contextCapacityHistory.save(
        request,
        {
          lowerBoundTokens: 4096,
          reason: "test-limit",
          attempts: [],
          counter: { encoding: "o200k_base", estimated: true },
        },
        target,
      )
      mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([runtime])
      const first = renderHook(useVerifyApiDialogViewModel, {
        initialProps: { isOpen: true, account, initialModelId: "gpt-test" },
      })
      await waitFor(() =>
        expect(
          first.result.current.tools.contextCapacity?.history?.lowerBoundTokens,
        ).toBe(4096),
      )
      expect(mockResolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
      await act(async () => first.result.current.clearHistory())
      expect(first.result.current.tools.contextCapacity?.history).toBeNull()
      first.unmount()
      await contextCapacityHistory.save(
        request,
        {
          lowerBoundTokens: 4096,
          reason: "test-limit",
          attempts: [],
          counter: { encoding: "o200k_base", estimated: true },
        },
        target,
      )
      mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([
        {
          ...runtime,
          secret: "rotated",
          baseUrl: "https://changed.example.invalid",
        },
      ])
      const second = renderHook(useVerifyApiDialogViewModel, {
        initialProps: { isOpen: true, account, initialModelId: "gpt-test" },
      })
      await waitFor(() =>
        expect(second.result.current.selectedRuntimeKey?.secret).toBe(
          "rotated",
        ),
      )
      expect(second.result.current.tools.contextCapacity?.history).toBeNull()
      expect(mockResolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    },
  )

  it.each(["masked", "empty"])(
    "restores %s New API capacity history after a run through the real secret resolver",
    async (inventory) => {
      const realRegistry = await vi.importActual<
        typeof import("~/services/apiAdapters/registry")
      >("~/services/apiAdapters/registry")
      vi.spyOn(siteCapabilities, "getSiteTypeCapabilities").mockReturnValue(
        realRegistry.getSiteTypeCapabilities(SITE_TYPES.NEW_API),
      )
      const realApi = await vi.importActual<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >("~/services/accounts/utils/apiServiceRequest")
      mockResolveDisplayAccountRuntimeKeySecret.mockImplementation(
        realApi.resolveDisplayAccountRuntimeKeySecret,
      )
      const account = buildDisplaySiteData({
        id: `masked-capacity-${inventory}`,
        siteType: SITE_TYPES.NEW_API,
        baseUrl: `https://${inventory}.masked-capacity.example.invalid`,
      })
      const runtime = {
        ...buildNewApiRuntimeKey(
          account,
          buildNewApiToken({
            id: 73291,
            key: "sk-visible****suffix",
            status: 1,
          }),
        ),
        keyMask: { prefix: "sk-visible", suffix: "suffix" },
        ...(inventory === "empty" ? { secret: "" } : {}),
      }
      mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([runtime])
      let reveals = 0
      server.use(
        http.get(`${account.baseUrl}/api/token/73291`, () =>
          HttpResponse.json({
            success: true,
            data: buildNewApiToken({
              id: 73291,
              key: "sk-visible****suffix",
              status: 1,
            }),
          }),
        ),
        http.post(`${account.baseUrl}/api/token/73291/key`, () => {
          reveals++
          return HttpResponse.json({
            success: true,
            data: { key: "masked-resolved-secret" },
          })
        }),
      )
      const capacity =
        await import("~/services/verification/modelQuality/contextCapacityRun")
      const run = vi.spyOn(capacity, "runContextCapacity").mockResolvedValue({
        lowerBoundTokens: 4096,
        reason: "test-limit",
        attempts: [],
        counter: { encoding: "o200k_base", estimated: true },
      })
      const props = { isOpen: true, account, initialModelId: "gpt-test" }
      try {
        const first = renderHook(useVerifyApiDialogViewModel, {
          initialProps: props,
        })
        await waitFor(() =>
          expect(first.result.current.tools.contextCapacity?.canRun).toBe(true),
        )
        expect(reveals).toBe(0)
        act(() => first.result.current.tools.contextCapacity!.run())
        await waitFor(() =>
          expect(first.result.current.tools.contextCapacity?.running).toBe(
            false,
          ),
        )
        expect(first.result.current.tools.contextCapacity?.error).toBeNull()
        await waitFor(() =>
          expect(
            first.result.current.tools.contextCapacity?.history
              ?.lowerBoundTokens,
          ).toBe(4096),
        )
        expect(run).toHaveBeenCalledWith(
          expect.objectContaining({ apiKey: "sk-masked-resolved-secret" }),
        )
        expect(reveals).toBe(1)
        first.unmount()
        const second = renderHook(useVerifyApiDialogViewModel, {
          initialProps: props,
        })
        await waitFor(() =>
          expect(
            second.result.current.tools.contextCapacity?.history
              ?.lowerBoundTokens,
          ).toBe(4096),
        )
        expect(
          second.result.current.tools.contextCapacity?.history
            ?.requiresCredentialVerification,
        ).toBe(true)
        expect(reveals).toBe(1)
        expect(mockResolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledOnce()
      } finally {
        run.mockRestore()
      }
    },
  )

  it("blocks capacity when no runtime key is available", async () => {
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([])
    const { result } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: {
        isOpen: true,
        onClose: vi.fn(),
        account: buildDisplaySiteData(),
        initialModelId: "gpt-test",
      },
    })
    await waitFor(() => expect(result.current.isLoadingRuntimeKeys).toBe(false))
    expect(result.current.tools.contextCapacity?.canRun).toBe(false)
  })

  it("explains credential-library recovery for keys only revealed at creation", async () => {
    vi.spyOn(siteCapabilities, "getSiteTypeCapabilities").mockReturnValue({
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      account: {
        keyResourceManagement: {
          inventorySecretAvailability: "create-response-only",
        },
      },
    } as any)
    mockFetchAccountTokens.mockResolvedValue([])
    const onManageModelKey = vi.fn()
    render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        account={buildDisplaySiteData({
          siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
        })}
        onManageModelKey={onManageModelKey}
        initialModelId="deepseek/deepseek-v4.1-flash-1017"
      />,
    )
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.associatedCredentialHint",
      ),
    ).toBeVisible()
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.manageModelKey",
      }),
    )
    expect(onManageModelKey).toHaveBeenCalledOnce()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("shows key loading inside the key select and restores selection when loaded", async () => {
    const pending = createDeferred<AccountRuntimeKey[]>()
    const account = buildDisplaySiteData({ siteType: SITE_TYPES.NEW_API })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Loaded key",
      key: "synthetic-key",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockReturnValueOnce(pending.promise)
    render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
      />,
    )
    const select = await screen.findByRole("combobox", {
      name: "aiApiVerification:verifyDialog.meta.runtimeKey",
    })
    await waitFor(() =>
      expect(select).toHaveTextContent(
        "aiApiVerification:verifyDialog.loadingRuntimeKeysHint",
      ),
    )
    expect(select).toHaveAttribute("aria-busy", "true")
    expect(select).toBeDisabled()
    expect(
      screen.getAllByText(
        "aiApiVerification:verifyDialog.loadingRuntimeKeysHint",
      ),
    ).toHaveLength(1)
    await act(async () => {
      pending.resolve([key])
      await pending.promise
    })
    await waitFor(() => expect(select).toHaveTextContent("Loaded key"))
    expect(select).toBeEnabled()
    expect(select).not.toHaveAttribute("aria-busy", "true")
    expect(
      screen.queryByText(
        "aiApiVerification:verifyDialog.loadingRuntimeKeysHint",
      ),
    ).not.toBeInTheDocument()
  })

  it("lets an account text test opt into a CLI profile and resets it on reopening", async () => {
    const account = buildDisplaySiteData({ id: "profile-selection" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)
    mockRunApiVerificationProbe.mockResolvedValue({
      id: "text-generation",
      status: "pass",
      latencyMs: 1,
      summary: "OK",
    })
    const props = { isOpen: true, account, initialModelId: "gpt-4o" }
    const { result, rerender } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: props,
    })
    await waitFor(() => expect(result.current.selectedRuntimeKey).toBeTruthy())
    expect(result.current.requestProfile).toBe("default")
    act(() =>
      result.current.setRequestProfile(API_VERIFICATION_REQUEST_PROFILES.Codex),
    )
    expect(result.current.apiType).toBe("openai")
    expect(result.current.requestProfileEnhanced).toBe(false)
    act(() => result.current.setRequestProfileEnhanced(true))
    act(() => result.current.runSingleProbe("text-generation"))
    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
          requestProfileEnhanced: true,
          probeId: "text-generation",
        }),
      ),
    )
    await waitFor(() => expect(result.current.canClose).toBe(true))
    rerender({ ...props, isOpen: false })
    rerender(props)
    expect(result.current.requestProfile).toBe("default")
    await waitFor(() => expect(result.current.selectedRuntimeKey).toBeTruthy())
  })

  it("dynamically updates modality and probe definitions when modelId changes in input", async () => {
    const account = buildDisplaySiteData({ id: "session-a" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)
    const props = { isOpen: true, account, initialModelId: "gpt-4o" }
    const { result } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: props,
    })
    await waitFor(() => expect(result.current.selectedRuntimeKey).toBeTruthy())
    expect(result.current.modelModality).toBe("text")
    expect(result.current.probes.map((p) => p.definition.id)).toEqual([
      "models",
      "text-generation",
      "tool-calling",
      "structured-output",
      "web-search",
    ])

    act(() => {
      result.current.setModelId("text-embedding-3-small")
    })

    await waitFor(() => {
      expect(result.current.modelModality).toBe("embedding")
    })
    expect(result.current.probes.map((p) => p.definition.id)).toEqual([
      "models",
      "embedding",
    ])
  })

  it("clears outcomes from another API protocol without changing the model", async () => {
    const account = buildDisplaySiteData({ id: "protocol-switch" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)
    mockRunApiVerificationProbe.mockResolvedValue({
      id: "text-generation",
      status: "pass",
      latencyMs: 1,
      summary: "Old protocol",
    })
    const { result } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: { isOpen: true, account, initialModelId: "gpt-4o" },
    })
    await waitFor(() => expect(result.current.selectedRuntimeKey).toBeTruthy())
    act(() => result.current.runSingleProbe("text-generation"))
    await waitFor(() => expect(result.current.hasAnyResult).toBe(true))

    act(() => result.current.setApiType(API_TYPES.ANTHROPIC))

    await waitFor(() => expect(result.current.hasAnyResult).toBe(false))
    expect(result.current.modelId).toBe("gpt-4o")
  })

  it.each(["target", "reopen"] as const)(
    "ignores a late account probe after %s",
    async (transition) => {
      const account = buildDisplaySiteData({ id: "session-a" })
      const key = buildServiceCredentialRuntimeKey(account, {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "credential",
        isAuthenticated: true,
        baseUrl: account.baseUrl,
      })
      mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
      mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)
      const oldRequest = createDeferred<ApiVerificationProbeResult>()
      const newRequest = createDeferred<ApiVerificationProbeResult>()
      mockRunApiVerificationProbe
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(newRequest.promise)
      const props = { isOpen: true, account, initialModelId: "test-model" }
      const { result, rerender } = renderHook(useVerifyApiDialogViewModel, {
        initialProps: props,
      })
      await waitFor(() =>
        expect(result.current.selectedRuntimeKey).toBeTruthy(),
      )
      act(() => result.current.runSingleProbe("text-generation"))
      await waitFor(() =>
        expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
      )
      if (transition === "reopen") rerender({ ...props, isOpen: false })
      rerender(
        transition === "target"
          ? { ...props, account: { ...account, id: "session-b" } }
          : props,
      )
      await waitFor(() =>
        expect(result.current.selectedRuntimeKey).toBeTruthy(),
      )
      act(() => result.current.runSingleProbe("text-generation"))
      await waitFor(() =>
        expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(2),
      )
      await act(async () => {
        oldRequest.resolve({
          id: "text-generation",
          status: "pass",
          latencyMs: 1,
          summary: "old",
        })
        await oldRequest.promise
      })
      expect(
        result.current.probes.find(
          (row) => row.definition.id === "text-generation",
        )?.isRunning,
      ).toBe(true)
      expect(result.current.persistedSummary).toBeNull()
      await act(async () => {
        newRequest.resolve({
          id: "text-generation",
          status: "pass",
          latencyMs: 1,
          summary: "new",
        })
        await newRequest.promise
      })
      await waitFor(() =>
        expect(
          result.current.probes.find(
            (row) => row.definition.id === "text-generation",
          )?.result?.summary,
        ).toBe("new"),
      )
    },
  )

  it("uses the selected mode and keeps completed results labeled when the selection changes", async () => {
    const user = userEvent.setup()
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    let finishProbe!: () => void
    mockRunApiVerificationProbe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishProbe = () =>
            resolve({
              id: "text-generation",
              status: "pass",
              latencyMs: 12,
              summary: "Text generation succeeded",
              mode: "non-streaming",
            })
        }),
    )

    render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        initialModelId="gpt-test"
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.invalid",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
      />,
    )

    const modeSelect = await screen.findByRole("combobox", {
      name: "aiApiVerification:verifyDialog.meta.mode",
    })
    expect(modeSelect).toHaveTextContent(
      "aiApiVerification:verifyDialog.modes.streaming",
    )
    await user.click(modeSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.modes.nonStreaming",
      }),
    )
    const probeCard = screen.getByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    await user.click(runButton)
    expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "non-streaming",
        probeId: "text-generation",
      }),
    )
    expect(modeSelect).toBeDisabled()

    await act(async () => finishProbe())
    expect(
      await within(
        within(probeCard)
          .getByRole("button", {
            name: "aiApiVerification:verifyDialog.probes.text-generation",
          })
          .closest<HTMLElement>("[data-verification-summary]")!,
      ).findByText("aiApiVerification:verifyDialog.modes.nonStreaming"),
    ).toBeVisible()
    await waitFor(() => expect(modeSelect).toBeEnabled())
    await user.click(modeSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.modes.streaming",
      }),
    )
    expect(
      within(
        within(probeCard)
          .getByRole("button", {
            name: "aiApiVerification:verifyDialog.probes.text-generation",
          })
          .closest<HTMLElement>("[data-verification-summary]")!,
      ).getByText("aiApiVerification:verifyDialog.modes.nonStreaming"),
    ).toBeVisible()
  })

  it.each([
    ["claude-3-5-sonnet", "aiApiVerification:verifyDialog.apiTypes.anthropic"],
    ["gemini-2.5-flash", "aiApiVerification:verifyDialog.apiTypes.google"],
  ])(
    "keeps AUTO protocol initialization for %s",
    async (initialModelId, expectedApiTypeLabel) => {
      mockFetchAccountTokens.mockResolvedValueOnce([])

      render(
        <VerifyApiDialog
          isOpen={true}
          onClose={() => {}}
          account={{
            id: "a1",
            name: "Account",
            username: "u",
            balance: { USD: 0, CNY: 0 },
            todayConsumption: { USD: 0, CNY: 0 },
            todayIncome: { USD: 0, CNY: 0 },
            todayTokens: { upload: 0, download: 0 },
            todayStatsAvailability: buildCompleteTodayStatsAvailability(),
            health: { status: "healthy" as any },
            siteType: SITE_TYPES.NEW_API,
            baseUrl: "https://example.invalid",
            token: "t",
            userId: "1",
            authType: "access_token" as any,
            checkIn: buildCheckInConfig(),
          }}
          initialModelId={initialModelId}
        />,
      )

      const apiTypeLabel = await screen.findByText(
        "aiApiVerification:verifyDialog.meta.apiType",
      )
      const apiTypeField = apiTypeLabel.parentElement

      expect(apiTypeField).not.toBeNull()
      expect(within(apiTypeField!).getByRole("combobox")).toHaveTextContent(
        expectedApiTypeLabel,
      )
    },
  )

  it("renders probe items before running", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const sourceLink = await screen.findByRole("link", {
      name: "https://example.com",
    })
    expect(sourceLink).toHaveAttribute("href", "https://example.com")
    expect(sourceLink).toHaveAttribute("target", "_blank")
    expect(
      await screen.findByRole("button", {
        name: "aiApiVerification:verifyDialog.probes.text-generation",
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "aiApiVerification:verifyDialog.probes.tool-calling",
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "aiApiVerification:verifyDialog.probes.structured-output",
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "aiApiVerification:verifyDialog.probes.web-search",
      }),
    ).toBeInTheDocument()
  })

  it("runs and retries a single probe and shows input/output in request details", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
      input: { foo: 1 },
      output: { bar: 2 },
    })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    // The action button is disabled until runtime keys are fetched and selected.
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )

    expect(
      await within(getVerificationHeader(probeCard)).findByText(
        "Text generation succeeded",
      ),
    ).toBeInTheDocument()

    expect(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.retry",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.probes.text-generation",
      }),
    )
    await userEvent.setup().click(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.generation.requestDetails",
      }),
    )
    expect(await within(probeCard).findByText(/"foo": 1/)).toBeInTheDocument()

    expect(await within(probeCard).findByText(/"bar": 2/)).toBeInTheDocument()
  })

  it("defaults to a token compatible with the requested model group", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 2,
        user_id: 1,
        key: "vip-secret",
        status: 1,
        name: "vip-token",
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
    })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
        modelEnableGroups={["vip"]}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-vip-secret",
          fallbackModelId: undefined,
        }),
      ),
    )
  })

  it("uses enabled tokens without group filtering when model group context is omitted", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
    })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-default-secret",
          fallbackModelId: undefined,
        }),
      ),
    )
  })

  it("keeps probes disabled when runtime-key loading fails", async () => {
    mockFetchDisplayAccountRuntimeKeys.mockRejectedValueOnce(
      new Error("inventory offline"),
    )

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    await waitFor(() =>
      expect(mockFetchDisplayAccountRuntimeKeys).toHaveBeenCalledTimes(1),
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    expect(runButton).toBeDisabled()
    fireEvent.click(runButton)
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("verifies service-credential runtime keys without token conversion", async () => {
    const account = {
      id: "a1",
      name: "Account",
      username: "u",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: "healthy" as any },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://example.invalid",
      token: "t",
      userId: "1",
      authType: "access_token" as any,
      checkIn: buildCheckInConfig(),
      tagIds: [],
    }
    const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "service-secret",
        isAuthenticated: true,
        baseUrl: "https://runtime.example.invalid",
      },
    )

    mockFetchDisplayAccountRuntimeKeys.mockResolvedValueOnce([
      serviceCredentialRuntimeKey,
    ])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValueOnce({
      ...serviceCredentialRuntimeKey,
      secret: "resolved-service-secret",
      credential: {
        ...serviceCredentialRuntimeKey.credential,
        key: "resolved-service-secret",
      },
    })
    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "text-generation",
      status: "pass",
      latencyMs: 12,
      summary: "Text generation succeeded",
    })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
        modelEnableGroups={["vip"]}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(mockResolveDisplayAccountRuntimeKeySecret).toHaveBeenCalledWith(
        account,
        serviceCredentialRuntimeKey,
        { abortSignal: expect.any(AbortSignal) },
      )
      expect(mockRunApiVerificationProbe).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://runtime.example.invalid",
          apiKey: "resolved-service-secret",
          fallbackModelId: undefined,
        }),
      )
    })
    expect(mockResolveTokenKey).not.toHaveBeenCalled()
  })

  it("does not fall back to selecting empty service-credential runtime keys", async () => {
    const account = {
      id: "a1",
      name: "Account",
      username: "u",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability(),
      health: { status: "healthy" as any },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://example.invalid",
      token: "t",
      userId: "1",
      authType: "access_token" as any,
      checkIn: buildCheckInConfig(),
      tagIds: [],
    }
    const emptyServiceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "",
        isAuthenticated: false,
        baseUrl: "https://runtime.example.invalid",
      },
    )

    mockFetchDisplayAccountRuntimeKeys.mockResolvedValueOnce([
      emptyServiceCredentialRuntimeKey,
    ])

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={account}
        initialModelId="gpt-test"
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(runButton).toBeDisabled())
    fireEvent.click(runButton)

    expect(mockResolveDisplayAccountRuntimeKeySecret).not.toHaveBeenCalled()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it.each(["allow", "deny"] as const)(
    "enforces the model %s-list without model groups",
    async (policy) => {
      const account = buildDisplaySiteData()
      const key = buildNewApiRuntimeKey(account, buildNewApiToken())
      key.modelAccess = {
        ...key.modelAccess,
        allowedModelIds: policy === "allow" ? ["other-model"] : null,
        deniedModelIds: policy === "deny" ? ["gpt-test"] : [],
      }
      const runtimeKeys = createDeferred<AccountRuntimeKey[]>()
      mockFetchDisplayAccountRuntimeKeys.mockReturnValueOnce(
        runtimeKeys.promise,
      )
      render(
        <VerifyApiDialog
          isOpen
          onClose={() => {}}
          account={account}
          initialModelId="gpt-test"
        />,
      )
      const probe = await screen.findByTestId("verify-probe-text-generation")
      const runButton = within(probe).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      })
      expect(runButton).toBeDisabled()
      // Resolve the external read inside React's update boundary; rendering the
      // dialog must not consume the hint query's default one-second deadline.
      await act(async () => {
        runtimeKeys.resolve([key])
        await runtimeKeys.promise
      })
      expect(
        screen.getByText(
          "aiApiVerification:verifyDialog.noCompatibleRuntimeKeyHint",
        ),
      ).toBeInTheDocument()
      expect(runButton).toBeDisabled()
      expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
    },
  )

  it("does not fall back to an incompatible enabled token for a requested model group", async () => {
    const onManageModelKey = vi.fn()
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
        modelEnableGroups={["vip"]}
        onManageModelKey={onManageModelKey}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1))
    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.noCompatibleRuntimeKeyHint",
      ),
    ).toBeInTheDocument()
    const manageButton = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.manageModelKey",
    })
    fireEvent.click(manageButton)
    expect(onManageModelKey).toHaveBeenCalledTimes(1)
    expect(runButton).toBeDisabled()
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("blocks verification when the selected token becomes incompatible with the model group", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "default-secret",
        status: 1,
        name: "default-token",
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
      {
        id: 2,
        user_id: 1,
        key: "vip-secret",
        status: 1,
        name: "vip-token",
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
        models: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        modelEnableGroups={["vip"]}
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    await waitFor(() => expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1))
    fireEvent.change(
      screen.getByPlaceholderText(
        "aiApiVerification:verifyDialog.meta.modelPlaceholder",
      ),
      { target: { value: "gpt-test" } },
    )

    expect(
      screen.getByText(
        "aiApiVerification:verifyDialog.selectedRuntimeKeyIncompatibleHint",
      ),
    ).toBeInTheDocument()
    expect(runButton).toBeDisabled()
    fireEvent.click(runButton)
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("shows i18n summary for unsupported probes", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    mockRunApiVerificationProbe.mockResolvedValueOnce({
      id: "web-search",
      status: "unsupported",
      latencyMs: 0,
      summary: "service-provided summary",
    })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const probeCard = await screen.findByTestId("verify-probe-web-search")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })

    // Wait for async token load/selection so the click reliably triggers `runProbe`.
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() =>
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1),
    )
    expect(
      await within(getVerificationHeader(probeCard)).findByText(
        "aiApiVerification:verifyDialog.unsupportedProbeForApiType",
      ),
    ).toBeInTheDocument()
  })

  it("restores persisted history and clears it", async () => {
    mockProbeDefinitions.mockReturnValue([
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    const target = requireHistoryTarget(
      createAccountModelVerificationHistoryTarget("a1", "gpt-test"),
    )

    const summary = createVerificationHistorySummary({
      target,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      preferredModelId: "gpt-restored",
      results: [
        {
          id: "text-generation",
          mode: "non-streaming",
          status: "pass",
          latencyMs: 5,
          summary: "Stored history",
        },
      ],
    })

    if (!summary) {
      throw new Error("Expected history summary")
    }

    await verificationResultHistoryStorage.upsertLatestSummary(summary)

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.history.lastVerified",
      ),
    ).toBeInTheDocument()
    expect(await screen.findByText("Stored history")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.probes.text-generation",
      }),
    ).toHaveAccessibleDescription(
      /aiApiVerification:verifyDialog.modes.nonStreaming/,
    )
    expect(
      screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.mode",
      }),
    ).toHaveTextContent("aiApiVerification:verifyDialog.modes.streaming")

    fireEvent.click(
      screen.getByRole("button", {
        name: "aiApiVerification:verifyDialog.history.clear",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByText(
          "aiApiVerification:verifyDialog.history.lastVerified",
        ),
      ).not.toBeInTheDocument()
    })
  })

  it("completes run-all analytics as success when probes pass", async () => {
    mockProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunApiVerificationProbe
      .mockResolvedValueOnce({
        id: "models",
        status: "pass",
        latencyMs: 8,
        summary: "Models listed",
      })
      .mockResolvedValueOnce({
        id: "text-generation",
        status: "pass",
        latencyMs: 12,
        summary: "Text generation succeeded",
      })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runAll",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            successCount: 2,
            failureCount: 0,
          },
        },
      )
    })
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("stops a running verification suite and aborts the active probe", async () => {
    let receivedSignal: AbortSignal | undefined
    mockProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunApiVerificationProbe.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () =>
              resolve({
                id: "models",
                status: "fail",
                latencyMs: 1,
                summary: "Stopped late",
              }),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runAll",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    const stopButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.stop",
    })
    expect(stopButton).toBeEnabled()
    expect(stopButton).toHaveAttribute("aria-busy", "true")
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    await waitFor(() => {
      expect(mockRunApiVerificationProbe).toHaveBeenCalledTimes(1)
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            successCount: 0,
            failureCount: 0,
          },
        },
      )
    })
  })

  it("stops while resolving the full token key before starting a probe", async () => {
    let receivedSignal: AbortSignal | undefined
    mockProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "masked-secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockResolveTokenKey.mockImplementationOnce(
      ({
        request,
        token,
      }: {
        request: { abortSignal?: AbortSignal }
        token: { key: string }
      }) => {
        receivedSignal = request.abortSignal
        if (!request.abortSignal) return Promise.resolve(token.key)

        return new Promise<string>((resolve) => {
          request.abortSignal?.addEventListener(
            "abort",
            () => resolve(token.key),
            { once: true },
          )
        })
      },
    )
    mockRunApiVerificationProbe.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise((resolve) => {
          abortSignal?.addEventListener(
            "abort",
            () =>
              resolve({
                id: "models",
                status: "fail",
                latencyMs: 1,
                summary: "Stopped late",
              }),
            { once: true },
          )
        }),
    )

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runAll",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => expect(mockResolveTokenKey).toHaveBeenCalledTimes(1))

    const stopButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.stop",
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    await waitFor(() => {
      expect(
        within(screen.getByTestId("verify-probe-models")).getByRole("button", {
          name: "aiApiVerification:verifyDialog.actions.retry",
        }),
      ).toBeInTheDocument()
    })
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("marks a single probe stopped when its request rejects after cancellation", async () => {
    const user = userEvent.setup()
    let receivedSignal: AbortSignal | undefined
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunApiVerificationProbe.mockImplementationOnce(
      ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return new Promise((_resolve, reject) => {
          abortSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      },
    )

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const modeSelect = await screen.findByRole("combobox", {
      name: "aiApiVerification:verifyDialog.meta.mode",
    })
    await user.click(modeSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.modes.nonStreaming",
      }),
    )

    const probeCard = await screen.findByTestId("verify-probe-text-generation")
    const runButton = within(probeCard).getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    const stopButton = await within(probeCard).findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.stopProbe",
    })
    fireEvent.click(stopButton)

    await waitFor(() => {
      expect(receivedSignal?.aborted).toBe(true)
    })
    expect(
      await within(getVerificationHeader(probeCard)).findByText(
        "aiApiVerification:verifyDialog.summaries.stopped",
      ),
    ).toBeInTheDocument()
    expect(
      within(probeCard).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.retry",
      }),
    ).toBeInTheDocument()
    expect(
      within(
        within(probeCard)
          .getByRole("button", {
            name: "aiApiVerification:verifyDialog.probes.text-generation",
          })
          .closest<HTMLElement>("[data-verification-summary]")!,
      ).getByText("aiApiVerification:verifyDialog.modes.nonStreaming"),
    ).toBeVisible()
  })

  it("completes run-all analytics as failure when any probe fails", async () => {
    mockProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunApiVerificationProbe
      .mockResolvedValueOnce({
        id: "models",
        status: "pass",
        latencyMs: 8,
        summary: "Models listed",
      })
      .mockResolvedValueOnce({
        id: "text-generation",
        status: "fail",
        latencyMs: 12,
        summary: "Request failed",
      })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runAll",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            successCount: 1,
            failureCount: 1,
          },
        },
      )
    })
  })

  it("maps structured thrown probe status to an auth analytics failure", async () => {
    const user = userEvent.setup()
    mockProbeDefinitions.mockReturnValue([
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])
    mockRunApiVerificationProbe
      .mockRejectedValueOnce({
        statusCode: 401,
        message: "Model catalog unavailable",
      })
      .mockRejectedValueOnce({
        statusCode: 401,
        message: "Unauthorized",
      })

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId="gpt-test"
      />,
    )

    const modeSelect = await screen.findByRole("combobox", {
      name: "aiApiVerification:verifyDialog.meta.mode",
    })
    await user.click(modeSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "aiApiVerification:verifyDialog.modes.nonStreaming",
      }),
    )

    const runAllButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runAll",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            successCount: 0,
            failureCount: 2,
          },
        },
      )
    })
    expect(
      within(
        screen
          .getByRole("button", {
            name: "aiApiVerification:verifyDialog.probes.text-generation",
          })
          .closest<HTMLElement>("[data-verification-summary]")!,
      ).getByText("aiApiVerification:verifyDialog.modes.nonStreaming"),
    ).toBeVisible()
    expect(
      within(screen.getByTestId("verify-probe-models")).queryByText(
        "aiApiVerification:verifyDialog.modes.nonStreaming",
      ),
    ).not.toBeInTheDocument()
    const historyTarget = requireHistoryTarget(
      createAccountModelVerificationHistoryTarget("a1", "gpt-test"),
    )
    const summary =
      await verificationResultHistoryStorage.getLatestSummary(historyTarget)
    expect(
      summary?.probes.find((probe) => probe.id === "text-generation"),
    ).toMatchObject({ status: "fail", mode: "non-streaming" })
    const modelsResult = summary?.probes.find((probe) => probe.id === "models")
    expect(modelsResult?.status).toBe("fail")
    expect(modelsResult?.mode).toBeUndefined()
  })

  it("completes run-all analytics as skipped when no probes execute", async () => {
    mockProbeDefinitions.mockReturnValue([
      { id: "text-generation", requiresModelId: true },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      {
        id: 1,
        user_id: 1,
        key: "secret",
        status: 1,
        name: "token-1",
        models: "",
        model_limits: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: 0,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
      },
    ])

    render(
      <VerifyApiDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          id: "a1",
          name: "Account",
          username: "u",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
          todayTokens: { upload: 0, download: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
          health: { status: "healthy" as any },
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://example.com",
          token: "t",
          userId: "1",
          authType: "access_token" as any,
          checkIn: buildCheckInConfig(),
        }}
        initialModelId=""
      />,
    )

    const runAllButton = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runAll",
    })
    await waitFor(() => expect(runAllButton).toBeEnabled())
    fireEvent.click(runAllButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          insights: {
            successCount: 0,
            failureCount: 0,
          },
        },
      )
    })
    expect(mockRunApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("displays modality notices for image and video models", async () => {
    const account = buildDisplaySiteData({ id: "modality-notice-account" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)

    const { rerender } = render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        initialModelId="flux-schnell"
        account={account}
      />,
    )
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.modalityNotice.image",
      ),
    ).toBeInTheDocument()

    rerender(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        initialModelId="sora-1"
        account={account}
      />,
    )
    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.modalityNotice.video",
      ),
    ).toBeInTheDocument()
  })

  it("stops unfinished probes and records failure when suite execution throws unexpectedly", async () => {
    const account = buildDisplaySiteData({ id: "suite-crash-account" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)
    mockRunApiVerificationProbe.mockResolvedValue({
      id: "models",
      status: "pass",
      latencyMs: 1,
      summary: "Models pass",
    })

    const { result } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: { isOpen: true, account, initialModelId: "gpt-4o" },
    })
    await waitFor(() => expect(result.current.selectedRuntimeKey).toBeTruthy())

    const historyModule =
      await import("~/services/verification/verificationResultHistory")
    vi.spyOn(
      historyModule,
      "createVerificationHistorySummary",
    ).mockImplementationOnce(() => {
      throw new Error("Simulated storage crash")
    })

    await act(async () => {
      await result.current.runAll()
    })

    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        }),
      }),
    )
  })

  it("runs probes alongside drawing and blocks closing until both finish", async () => {
    const account = buildDisplaySiteData({ id: "quality-run" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)

    let finishPelican!: (
      value: import("~/services/verification/modelQuality/pelican").PelicanTestResult,
    ) => void
    mockRunPelicanTest.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPelican = resolve
        }),
    )

    const { result } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: { isOpen: true, account, initialModelId: "gpt-4o" },
    })
    await waitFor(() => expect(result.current.selectedRuntimeKey).toBeTruthy())
    expect(result.current.tools.canRunPelican).toBe(true)

    act(() => result.current.tools.runPelican())

    await waitFor(() =>
      expect(mockRunPelicanTest).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: "gpt-4o",
          apiType: "openai-compatible",
          requestProfile: API_VERIFICATION_REQUEST_PROFILES.Default,
        }),
      ),
    )
    await waitFor(() => expect(result.current.tools.isRunning).toBe(true))
    expect(result.current.canClose).toBe(false)

    const probe = createDeferred<ApiVerificationProbeResult>()
    mockRunApiVerificationProbe.mockReturnValue(probe.promise)
    expect(result.current.canRunAll).toBe(true)
    act(() => {
      void result.current.runSingleProbe("text-generation")
    })
    await waitFor(() => expect(mockRunApiVerificationProbe).toHaveBeenCalled())
    await act(async () => {
      probe.resolve({
        id: "text-generation",
        status: "pass",
        summary: "Concurrent",
        latencyMs: 1,
      })
    })
    await waitFor(() =>
      expect(
        result.current.probes.find((p) => p.definition.id === "text-generation")
          ?.result?.summary,
      ).toBe("Concurrent"),
    )
    expect(result.current.tools.isRunning).toBe(true)

    await act(async () => {
      finishPelican({
        runAt: 0,
        latencyMs: 1,
        text: "<svg/>",
        svg: "<svg/>",
        analysis: {
          hasSvg: true,
          safe: true,
          viewBox: null,
          byteSize: 6,
          counts: {
            path: 0,
            circle: 0,
            ellipse: 0,
            rect: 0,
            polygon: 0,
            polyline: 0,
            line: 0,
            text: 0,
            group: 0,
          },
          shapeCount: 0,
          wheelClues: 0,
        },
      })
    })

    await waitFor(() => expect(result.current.tools.isRunning).toBe(false))
    expect(result.current.canClose).toBe(true)
  })

  it("keeps other test buttons available during an account probe", async () => {
    const user = userEvent.setup()
    const account = buildDisplaySiteData({ id: "concurrent-buttons" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)
    mockRunApiVerificationProbe.mockReturnValue(new Promise(() => {}))
    mockRunPelicanTest.mockReturnValue(new Promise(() => {}))
    render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        account={account}
        initialModelId="gpt-4o"
      />,
    )
    const text = within(
      await screen.findByTestId("verify-probe-text-generation"),
    )
    const runText = text.getByRole("button", {
      name: "aiApiVerification:verifyDialog.actions.runOne",
    })
    await waitFor(() => expect(runText).toBeEnabled())
    await user.click(runText)
    const drawing = screen.getByRole("button", {
      name: "aiApiVerification:verifyDialog.tools.pelican.run",
    })
    expect(drawing).toBeEnabled()
    await user.click(drawing)
    expect(
      within(screen.getByTestId("verify-probe-models")).getByRole("button", {
        name: "aiApiVerification:verifyDialog.actions.runOne",
      }),
    ).toBeEnabled()
    expect(text.getByRole("button", { name: /stopProbe/ })).toBeEnabled()
  })

  it("does not offer the drawing test for non-text models", async () => {
    const account = buildDisplaySiteData({ id: "quality-embedding" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)

    const { result } = renderHook(useVerifyApiDialogViewModel, {
      initialProps: {
        isOpen: true,
        account,
        initialModelId: "text-embedding-3-small",
      },
    })
    await waitFor(() => expect(result.current.selectedRuntimeKey).toBeTruthy())

    expect(result.current.modelModality).toBe("embedding")
    expect(result.current.tools.canRunPelican).toBe(false)
  })

  it("renders the shared verification tools in the dialog", async () => {
    const account = buildDisplaySiteData({ id: "quality-panel" })
    const key = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "credential",
      isAuthenticated: true,
      baseUrl: account.baseUrl,
    })
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([key])
    mockResolveDisplayAccountRuntimeKeySecret.mockResolvedValue(key)

    render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        initialModelId="gpt-4o"
        account={account}
      />,
    )

    expect(
      await screen.findByRole("region", {
        name: "aiApiVerification:verifyDialog.tools.pelican.title",
      }),
    ).toBeInTheDocument()
  })

  it("allows selecting a model directly inside the AI conversation prompt composer", async () => {
    const user = userEvent.setup()
    const account = buildDisplaySiteData()
    const runtimeKey = {
      ...buildNewApiRuntimeKey(account, buildNewApiToken()),
      modelAccess: {
        groups: null,
        allowedModelIds: null,
        suggestedModelIds: ["gpt-4o", "gpt-4o-mini"],
      },
    }
    mockFetchDisplayAccountRuntimeKeys.mockResolvedValue([runtimeKey])

    render(
      <VerifyApiDialog
        isOpen
        onClose={() => {}}
        initialModelId="gpt-4o"
        account={account}
      />,
    )

    // Select text generation probe to open its conversation composer
    const textGenRow = await screen.findByTestId("verify-probe-text-generation")
    const textGenButton = within(textGenRow).getByRole("button", {
      name: "aiApiVerification:verifyDialog.probes.text-generation",
    })
    await user.click(textGenButton)

    const modelSelectorTrigger = await screen.findByRole("button", {
      name: "aiApiVerification:verifyDialog.meta.model",
    })
    expect(modelSelectorTrigger).toHaveTextContent("gpt-4o")

    await user.click(modelSelectorTrigger)

    const miniOption = await screen.findByText("gpt-4o-mini")
    await user.click(miniOption)

    expect(modelSelectorTrigger).toHaveTextContent("gpt-4o-mini")

    const sidebarInput = screen.getByRole("textbox", {
      name: "aiApiVerification:verifyDialog.meta.model",
    })
    expect(sidebarInput).toHaveValue("gpt-4o-mini")
  })
})
