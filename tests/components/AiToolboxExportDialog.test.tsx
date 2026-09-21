import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AiToolboxExportDialog } from "~/components/AiToolboxExportDialog"
import { AI_TOOLBOX_EXPORT_TEST_IDS } from "~/components/AiToolboxExportDialog.testIds"
import { SITE_TYPES } from "~/constants/siteType"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { AI_TOOLBOX_API_FORMATS } from "~/services/integrations/aiToolbox"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"
import {
  buildDisplaySiteData,
  buildNewApiToken,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

/** Keep export fixtures valid while making each test's credential inputs explicit. */
function createAccountExportSource(
  accountOverrides: Partial<DisplaySiteData>,
  tokenOverrides: Partial<NewApiToken>,
) {
  const account = buildDisplaySiteData({
    siteType: SITE_TYPES.NEW_API,
    ...accountOverrides,
  })
  return createAccountRuntimeKeyExportSource(
    account,
    buildNewApiRuntimeKey(account, buildNewApiToken(tokenOverrides)),
    { preferCurrentSecret: true },
  )
}

const mockFetchModelIds = vi.fn()
const mockOpenInAiToolbox = vi.fn()
const mockResolveDisplayAccountRuntimeKeySecret = vi.fn()
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
      resolveDisplayAccountRuntimeKeySecret: (...args: any[]) =>
        mockResolveDisplayAccountRuntimeKeySecret(...args),
    }
  },
)

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) => mockFetchModelIds(...args),
}))

vi.mock("~/services/integrations/aiToolbox", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("~/services/integrations/aiToolbox")>()
  return {
    ...original,
    openInAiToolbox: (...args: any[]) => mockOpenInAiToolbox(...args),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

describe("AiToolboxExportDialog", () => {
  beforeEach(() => {
    mockFetchModelIds.mockReset()
    mockOpenInAiToolbox.mockReset()
    mockResolveDisplayAccountRuntimeKeySecret.mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    mockResolveDisplayAccountRuntimeKeySecret.mockImplementation(
      async (_account, token) => token,
    )
    mockFetchModelIds.mockResolvedValue([])
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    // The dialog opens a custom-scheme deeplink through window.open.
    mockOpenInAiToolbox.mockReturnValue(true)
  })

  it("exposes stable test ids for E2E flows", async () => {
    const user = userEvent.setup()

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    expect(
      await screen.findByTestId(AI_TOOLBOX_EXPORT_TEST_IDS.dialog),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(AI_TOOLBOX_EXPORT_TEST_IDS.modelPicker),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(AI_TOOLBOX_EXPORT_TEST_IDS.exportButton),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(AI_TOOLBOX_EXPORT_TEST_IDS.cancelButton),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId(AI_TOOLBOX_EXPORT_TEST_IDS.modelPicker))
    expect(
      await screen.findByTestId(AI_TOOLBOX_EXPORT_TEST_IDS.modelSearchInput),
    ).toBeInTheDocument()
  })

  it("places the app selector before provider details", async () => {
    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    const appSelect = await screen.findByLabelText(
      "ui:dialog.aiToolbox.fields.app",
    )
    const nameInput = await screen.findByLabelText(
      "ui:dialog.aiToolbox.fields.name",
    )

    expect(
      appSelect.compareDocumentPosition(nameInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
  })

  it("offers every AI Toolbox target app", async () => {
    const user = userEvent.setup()

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    await user.click(
      await screen.findByLabelText("ui:dialog.aiToolbox.fields.app"),
    )

    for (const app of [
      "claude",
      "claudedesktop",
      "codex",
      "grok",
      "kimi",
      "gemini",
      "opencode",
      "openclaw",
      "pi",
      "omp",
      "hermes",
      "dsh",
    ]) {
      expect(
        await screen.findByRole("option", {
          name: `ui:dialog.aiToolbox.appOptions.${app}`,
        }),
      ).toBeInTheDocument()
    }
  })

  it("loads upstream model ids and exposes them as a selectable default model", async () => {
    const user = userEvent.setup()
    mockFetchModelIds.mockResolvedValue(["gpt-4", "claude"])

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    await waitFor(() => {
      expect(mockFetchModelIds).toHaveBeenCalledWith({
        baseUrl: "https://x.test",
        apiKey: "sk-test",
      })
    })

    await user.click(
      await screen.findByLabelText("ui:dialog.aiToolbox.fields.model"),
    )
    expect(await screen.findByText("gpt-4")).toBeInTheDocument()
  })

  it("prefills the base URL with the stored credential URL", async () => {
    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    expect(
      await screen.findByLabelText("ui:dialog.aiToolbox.fields.baseUrl"),
    ).toHaveValue("https://x.test/v1")
  })

  it("sends the target app, resolved credential, and edited fields", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={onClose}
        source={createAccountExportSource(
          { id: "acc", name: "Profile Provider", baseUrl: "https://x.test/v1" },
          { key: "sk-test", note: "token note" },
        )}
      />,
    )

    const appSelect = await screen.findByLabelText(
      "ui:dialog.aiToolbox.fields.app",
    )
    await user.click(appSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.aiToolbox.appOptions.opencode",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.aiToolbox.actions.export",
      }),
    )

    await waitFor(() => {
      expect(mockOpenInAiToolbox).toHaveBeenCalledWith({
        credential: expect.objectContaining({
          providerName: "Profile Provider",
          baseUrl: "https://x.test/v1",
          apiKey: "sk-test",
        }),
        app: "opencode",
        model: undefined,
        notes: "token note",
        name: "Profile Provider",
        homepage: "https://x.test/v1",
        endpoint: "https://x.test/v1",
        apiFormat: undefined,
      })
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("passes the explicitly selected API format and omits it by default", async () => {
    const user = userEvent.setup()

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    const formatSelect = await screen.findByLabelText(
      "ui:dialog.aiToolbox.fields.apiFormat",
    )
    expect(formatSelect).toHaveTextContent(
      "ui:dialog.aiToolbox.formatOptions.automatic",
    )

    await user.click(formatSelect)
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.aiToolbox.formatOptions.anthropicMessages",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.aiToolbox.actions.export",
      }),
    )

    await waitFor(() => {
      expect(mockOpenInAiToolbox).toHaveBeenCalledWith(
        expect.objectContaining({
          apiFormat: AI_TOOLBOX_API_FORMATS.AnthropicMessages,
        }),
      )
    })
  })

  it("keeps the model picker usable when upstream model fetch fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockFetchModelIds.mockRejectedValue(new Error("network error"))

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    await waitFor(() => {
      expect(mockFetchModelIds).toHaveBeenCalled()
    })

    const modelCombo = await screen.findByLabelText(
      "ui:dialog.aiToolbox.fields.model",
    )
    expect(modelCombo).toBeEnabled()
    expect(modelCombo).toHaveTextContent(
      "ui:dialog.aiToolbox.modelOptions.none",
    )
    warnSpy.mockRestore()
  })

  it("tracks successful exports without sensitive metadata", async () => {
    const user = userEvent.setup()

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          {
            id: "acc",
            name: "Sensitive Provider",
            baseUrl: "https://private.example.com/v1",
          },
          { key: "sk-sensitive", note: "private note" },
        )}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.aiToolbox.actions.export",
      }),
    )

    await waitFor(() => {
      expect(mockOpenInAiToolbox).toHaveBeenCalled()
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToAiToolbox,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    const analyticsCalls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      completeProductAnalyticsActionMock.mock.calls,
    ])
    expect(analyticsCalls).not.toContain("sk-sensitive")
    expect(analyticsCalls).not.toContain("https://private.example.com")
    expect(analyticsCalls).not.toContain("Sensitive Provider")
    expect(analyticsCalls).not.toContain("private note")
  })

  it("tracks refused exports as failures without closing the dialog", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockOpenInAiToolbox.mockReturnValueOnce(false)

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={onClose}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.aiToolbox.actions.export",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
      )
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("tracks thrown submissions as unknown failures", async () => {
    const user = userEvent.setup()
    mockResolveDisplayAccountRuntimeKeySecret.mockRejectedValue(
      new Error("secret unavailable"),
    )

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          // A masked key cannot be reused directly, so resolution has to call
          // the account API and observe its failure.
          { key: "sk-abcd************wxyz" },
        )}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.aiToolbox.actions.export",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    })
  })

  it("uses an explicit analytics context for profile-origin exports", async () => {
    const user = userEvent.setup()

    render(
      <AiToolboxExportDialog
        isOpen={true}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
        analyticsContext={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToAiToolbox,
          surfaceId:
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.aiToolbox.actions.export",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToAiToolbox,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
    })
  })

  it("does not export while the dialog is closed", async () => {
    render(
      <AiToolboxExportDialog
        isOpen={false}
        onClose={() => {}}
        source={createAccountExportSource(
          { id: "acc", name: "Example", baseUrl: "https://x.test/v1" },
          { key: "sk-test" },
        )}
      />,
    )

    expect(
      screen.queryByTestId(AI_TOOLBOX_EXPORT_TEST_IDS.dialog),
    ).not.toBeInTheDocument()
    expect(mockOpenInAiToolbox).not.toHaveBeenCalled()
  })
})
