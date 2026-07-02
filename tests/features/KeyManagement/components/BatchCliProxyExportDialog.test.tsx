import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { BatchCliProxyExportDialog } from "~/features/KeyManagement/components/BatchCliProxyExportDialog"
import { KEY_MANAGEMENT_ENTRY_KINDS } from "~/features/KeyManagement/types"
import { CLI_PROXY_PROVIDER_TYPES } from "~/services/integrations/cliProxyProviderTypes"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const mockResolveDisplayAccountTokenForSecret = vi.fn()
const mockImportToCliProxy = vi.fn()
const mockShowResultToast = vi.fn()
const { startProductAnalyticsActionMock, completeProductAnalyticsActionMock } =
  vi.hoisted(() => ({
    startProductAnalyticsActionMock: vi.fn(),
    completeProductAnalyticsActionMock: vi.fn(),
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
        mockResolveDisplayAccountTokenForSecret(...args),
    }
  },
)

vi.mock("~/services/integrations/cliProxyService", () => ({
  importToCliProxy: (...args: any[]) => mockImportToCliProxy(...args),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: (...args: any[]) => mockShowResultToast(...args),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

describe("BatchCliProxyExportDialog", () => {
  const account = createAccount({
    id: "acc-1",
    name: "Account 1",
    baseUrl: "https://one.example.invalid/api",
  })
  const token1 = createToken({
    id: 1,
    accountId: account.id,
    accountName: account.name,
    name: "Token 1",
    key: "sk-token-1************masked",
  })
  const token2 = createToken({
    id: 2,
    accountId: account.id,
    accountName: account.name,
    name: "Token 2",
    key: "sk-token-2************masked",
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveDisplayAccountTokenForSecret.mockImplementation(
      async (_account, token) => ({
        ...token,
        key: `resolved-${token.id}`,
      }),
    )
    mockImportToCliProxy.mockResolvedValue({
      success: true,
      message: "ok",
    })
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("imports each selected token to CLIProxyAPI with shared policy and per-token defaults", async () => {
    const user = userEvent.setup()

    render(
      <BatchCliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        items={[
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token1,
          },
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token2,
          },
        ]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:batchCliProxyExport.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledTimes(2)
    })

    expect(mockImportToCliProxy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        account,
        token: expect.objectContaining({ key: "resolved-1" }),
        providerType: CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY,
        providerName: "Account 1",
        providerBaseUrl: "https://one.example.invalid/api/v1",
        proxyUrl: "",
        models: undefined,
      }),
    )
    expect(mockImportToCliProxy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        token: expect.objectContaining({ key: "resolved-2" }),
      }),
    )
    expect(screen.getByText("Token 1")).toBeInTheDocument()
    expect(screen.getByText("Token 2")).toBeInTheDocument()
    expect(
      screen.getAllByText("keyManagement:batchCliProxyExport.results.success"),
    ).toHaveLength(2)
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokensToCliProxy,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 2,
          successCount: 2,
          failureCount: 0,
        },
      },
    )

    const analyticsCalls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      completeProductAnalyticsActionMock.mock.calls,
    ])
    expect(analyticsCalls).not.toContain("resolved-1")
    expect(analyticsCalls).not.toContain("resolved-2")
    expect(analyticsCalls).not.toContain("https://one.example.invalid")
    expect(analyticsCalls).not.toContain("Account 1")
  })

  it("continues after one token fails and reports a partial result", async () => {
    const user = userEvent.setup()
    mockImportToCliProxy
      .mockResolvedValueOnce({ success: false, message: "rejected" })
      .mockResolvedValueOnce({ success: true, message: "ok" })

    render(
      <BatchCliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        items={[
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token1,
          },
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token2,
          },
        ]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:batchCliProxyExport.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledTimes(2)
    })

    expect(
      screen.getByText("keyManagement:batchCliProxyExport.results.failed"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:batchCliProxyExport.results.success"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        insights: {
          itemCount: 2,
          successCount: 1,
          failureCount: 1,
        },
      },
    )
  })

  it("normalizes edited model mappings and provider settings before import", async () => {
    const user = userEvent.setup()

    render(
      <BatchCliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        items={[
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token1,
          },
        ]}
      />,
    )

    await screen.findByRole("dialog")
    await user.click(
      screen.getByLabelText("ui:dialog.cliproxy.fields.providerType"),
    )
    await user.click(
      await screen.findByText(
        "ui:dialog.cliproxy.providerTypes.geminiApiKey.label",
      ),
    )
    await user.type(
      screen.getByLabelText("ui:dialog.cliproxy.fields.proxyUrl"),
      "  http://localhost:4141  ",
    )
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.cliproxy.actions.addModel",
      }),
    )
    await user.type(
      screen.getByPlaceholderText("ui:dialog.cliproxy.placeholders.modelName"),
      "  gemini-2.5-pro  ",
    )
    await user.type(
      screen.getByPlaceholderText("ui:dialog.cliproxy.placeholders.modelAlias"),
      "  smart  ",
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchCliProxyExport.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledWith(
        expect.objectContaining({
          providerType: CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY,
          providerBaseUrl: "https://one.example.invalid/api",
          proxyUrl: "http://localhost:4141",
          models: [{ name: "gemini-2.5-pro", alias: "smart" }],
        }),
      )
    })
  })

  it("keeps nameless model mappings out of the batch import payload", async () => {
    const user = userEvent.setup()

    render(
      <BatchCliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        items={[
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token1,
          },
        ]}
      />,
    )

    await screen.findByRole("dialog")
    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.cliproxy.actions.addModel",
      }),
    )
    await user.type(
      screen.getByPlaceholderText("ui:dialog.cliproxy.placeholders.modelAlias"),
      "alias-only",
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchCliProxyExport.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledWith(
        expect.objectContaining({ models: [] }),
      )
    })
  })

  it("reports token resolution failures without importing that token", async () => {
    const user = userEvent.setup()
    mockResolveDisplayAccountTokenForSecret
      .mockRejectedValueOnce(new Error("token is hidden"))
      .mockImplementationOnce(async (_account, token) => ({
        ...token,
        key: `resolved-${token.id}`,
      }))

    render(
      <BatchCliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        items={[
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token1,
          },
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
            account,
            token: token2,
          },
        ]}
      />,
    )

    await screen.findByRole("dialog")
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchCliProxyExport.actions.start",
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("token is hidden")).toBeInTheDocument()
    })
    expect(mockImportToCliProxy).toHaveBeenCalledTimes(1)
    expect(mockImportToCliProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ id: token2.id, key: "resolved-2" }),
      }),
    )
    expect(mockShowResultToast).toHaveBeenCalledWith({
      success: false,
      message: "messages:errors.operation.failed",
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        insights: {
          itemCount: 2,
          successCount: 1,
          failureCount: 1,
        },
      },
    )
  })

  it("imports service credentials without resolving them as account tokens", async () => {
    const user = userEvent.setup()

    render(
      <BatchCliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        items={[
          {
            kind: KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential,
            account,
            credential: {
              kind: "singleton_service_key",
              service: "codex",
              label: "Codex API Key",
              key: "sk-service-credential",
              baseUrl: "https://codex.example.invalid/v1",
              isAuthenticated: true,
            },
          },
        ]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:batchCliProxyExport.actions.start",
      }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledTimes(1)
    })

    expect(mockResolveDisplayAccountTokenForSecret).not.toHaveBeenCalled()
    expect(mockImportToCliProxy).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        token: expect.objectContaining({
          key: "sk-service-credential",
          name: "Codex API Key",
        }),
        providerName: "Account 1",
        providerBaseUrl: "https://codex.example.invalid/v1",
      }),
    )
    expect(screen.getByText("Codex API Key")).toBeInTheDocument()
  })
})
