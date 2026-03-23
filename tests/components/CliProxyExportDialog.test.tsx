import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { CLI_PROXY_PROVIDER_TYPES } from "~/services/integrations/cliProxyProviderTypes"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      themeMode: "system",
      updateThemeMode: vi.fn().mockResolvedValue(true),
    }),
  }
})

const mockFetchAnthropicModelIds = vi.fn()
const mockFetchGoogleModelIds = vi.fn()
const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockImportToCliProxy = vi.fn()
const mockShowResultToast = vi.fn()
const mockResolveDisplayAccountTokenForSecret = vi.fn()

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

vi.mock("~/services/apiService/anthropic", () => ({
  fetchAnthropicModelIds: (...args: any[]) =>
    mockFetchAnthropicModelIds(...args),
}))

vi.mock("~/services/apiService/google", () => ({
  fetchGoogleModelIds: (...args: any[]) => mockFetchGoogleModelIds(...args),
}))

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

vi.mock("~/services/integrations/cliProxyService", () => ({
  importToCliProxy: (...args: any[]) => mockImportToCliProxy(...args),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: (...args: any[]) => mockShowResultToast(...args),
}))

describe("CliProxyExportDialog", () => {
  beforeEach(() => {
    mockFetchAnthropicModelIds.mockReset()
    mockFetchGoogleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockImportToCliProxy.mockReset()
    mockShowResultToast.mockReset()
    mockResolveDisplayAccountTokenForSecret.mockReset()
    mockResolveDisplayAccountTokenForSecret.mockImplementation(
      async (_account, token) => token,
    )

    mockImportToCliProxy.mockResolvedValue({
      success: true,
      message: "ok",
    })
  })

  it("defaults to OpenAI compatibility and loads model suggestions", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4", "claude"])

    render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        account={buildDisplaySiteData({
          id: "acc",
          name: "Example",
          baseUrl: "https://x.test/v1",
        })}
        token={buildApiToken({ key: "sk-test" })}
      />,
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://x.test",
        apiKey: "sk-test",
      })
    })

    await screen.findByRole("dialog")
    const providerTypeTrigger = screen.getByLabelText(
      "ui:dialog.cliproxy.fields.providerType",
    )

    expect(providerTypeTrigger).toHaveTextContent(
      "ui:dialog.cliproxy.providerTypes.openaiCompatibility.label",
    )
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).toHaveValue("https://x.test/v1")
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).toBeRequired()

    const comboboxes = await screen.findAllByRole("combobox")
    await user.click(comboboxes[comboboxes.length - 1])

    expect(await screen.findByText("gpt-4")).toBeInTheDocument()
  })

  it("preselects Claude for Anthropic hints and loads Anthropic model suggestions", async () => {
    const user = userEvent.setup()
    mockFetchAnthropicModelIds.mockResolvedValueOnce(["claude-3-7-sonnet"])

    render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        apiTypeHint={API_TYPES.ANTHROPIC}
        account={buildDisplaySiteData({
          id: "acc",
          name: "Anthropic",
          baseUrl: "https://api.anthropic.com/v1/messages",
        })}
        token={buildApiToken({ key: "sk-anthropic" })}
      />,
    )

    await waitFor(() => {
      expect(mockFetchAnthropicModelIds).toHaveBeenCalledWith({
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-anthropic",
      })
    })

    expect(mockFetchOpenAICompatibleModelIds).not.toHaveBeenCalled()

    await screen.findByRole("dialog")
    const providerTypeTrigger = screen.getByLabelText(
      "ui:dialog.cliproxy.fields.providerType",
    )

    expect(providerTypeTrigger).toHaveTextContent(
      "ui:dialog.cliproxy.providerTypes.claudeApiKey.label",
    )
    expect(screen.queryByLabelText("ui:dialog.cliproxy.fields.name")).toBeNull()
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).toHaveValue("https://api.anthropic.com")
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).not.toBeRequired()

    const comboboxes = await screen.findAllByRole("combobox")
    await user.click(comboboxes[comboboxes.length - 1])

    expect(await screen.findByText("claude-3-7-sonnet")).toBeInTheDocument()
  })

  it("preselects Codex for OpenAI hints, loads suggestions, and submits the selected provider type", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-4.1"])

    render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        apiTypeHint={API_TYPES.OPENAI}
        account={buildDisplaySiteData({
          id: "acc",
          name: "OpenAI",
          baseUrl: "https://api.openai.com",
        })}
        token={buildApiToken({ key: "sk-openai" })}
      />,
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://api.openai.com",
        apiKey: "sk-openai",
      })
    })

    await screen.findByRole("dialog")
    const providerTypeTrigger = screen.getByLabelText(
      "ui:dialog.cliproxy.fields.providerType",
    )

    expect(providerTypeTrigger).toHaveTextContent(
      "ui:dialog.cliproxy.providerTypes.codexApiKey.label",
    )
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).toHaveValue("https://api.openai.com")
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).toBeRequired()

    const comboboxes = await screen.findAllByRole("combobox")
    await user.click(comboboxes[comboboxes.length - 1])

    expect(await screen.findByText("gpt-4.1")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.import" }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledWith(
        expect.objectContaining({
          apiTypeHint: API_TYPES.OPENAI,
          providerType: CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY,
          providerBaseUrl: "https://api.openai.com",
        }),
      )
    })
  })

  it("preselects Gemini for Google hints and loads Gemini model suggestions", async () => {
    const user = userEvent.setup()
    mockFetchGoogleModelIds.mockResolvedValueOnce(["gemini-2.0-flash"])

    render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        apiTypeHint={API_TYPES.GOOGLE}
        account={buildDisplaySiteData({
          id: "acc",
          name: "Gemini",
          baseUrl:
            "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent",
        })}
        token={buildApiToken({ key: "gm-test" })}
      />,
    )

    await waitFor(() => {
      expect(mockFetchGoogleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://generativelanguage.googleapis.com",
        apiKey: "gm-test",
      })
    })

    expect(mockFetchOpenAICompatibleModelIds).not.toHaveBeenCalled()
    expect(mockFetchAnthropicModelIds).not.toHaveBeenCalled()

    await screen.findByRole("dialog")
    const providerTypeTrigger = screen.getByLabelText(
      "ui:dialog.cliproxy.fields.providerType",
    )

    expect(providerTypeTrigger).toHaveTextContent(
      "ui:dialog.cliproxy.providerTypes.geminiApiKey.label",
    )
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).toHaveValue("https://generativelanguage.googleapis.com")
    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).not.toBeRequired()

    const comboboxes = await screen.findAllByRole("combobox")
    await user.click(comboboxes[comboboxes.length - 1])

    expect(await screen.findByText("gemini-2.0-flash")).toBeInTheDocument()
  })

  it("keeps in-progress edits when rerendered with an equivalent account object", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])

    const token = buildApiToken({ id: 12, key: "sk-test" })
    const initialAccount = buildDisplaySiteData({
      id: "acc",
      name: "Example",
      baseUrl: "https://x.test/v1",
    })

    const { rerender } = render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        account={initialAccount}
        token={token}
      />,
    )

    const baseUrlInput = await screen.findByLabelText(
      "ui:dialog.cliproxy.fields.baseUrl",
    )

    fireEvent.change(baseUrlInput, {
      target: { value: "https://edited.example.com/v1" },
    })

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenLastCalledWith({
        baseUrl: "https://edited.example.com",
        apiKey: "sk-test",
      })
    })

    rerender(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        account={buildDisplaySiteData({
          id: "acc",
          name: "Example",
          baseUrl: "https://x.test/v1",
        })}
        token={token}
      />,
    )

    expect(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
    ).toHaveValue("https://edited.example.com/v1")
  })

  it("submits an empty models list after the user clears edited mappings", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])

    render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        account={buildDisplaySiteData({
          id: "acc",
          name: "Example",
          baseUrl: "https://x.test/v1",
        })}
        token={buildApiToken({ key: "sk-test" })}
      />,
    )

    const nameInput = await screen.findByPlaceholderText(
      "ui:dialog.cliproxy.placeholders.modelName",
    )
    await user.type(nameInput, "gpt-4")
    await user.clear(nameInput)
    await user.click(
      screen.getByRole("button", { name: "common:actions.import" }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledWith(
        expect.objectContaining({ models: [] }),
      )
    })
  })

  it("leaves models undefined when the mappings were never edited", async () => {
    const user = userEvent.setup()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])

    render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        account={buildDisplaySiteData({
          id: "acc",
          name: "Example",
          baseUrl: "https://x.test/v1",
        })}
        token={buildApiToken({ key: "sk-test" })}
      />,
    )

    await screen.findByLabelText("ui:dialog.cliproxy.fields.baseUrl")
    await user.click(
      screen.getByRole("button", { name: "common:actions.import" }),
    )

    await waitFor(() => {
      expect(mockImportToCliProxy).toHaveBeenCalledWith(
        expect.objectContaining({ models: undefined }),
      )
    })
  })

  it("refetches model suggestions when the provider base URL changes", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValue([])

    render(
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => {}}
        account={buildDisplaySiteData({
          id: "acc",
          name: "Example",
          baseUrl: "https://x.test/v1",
        })}
        token={buildApiToken({ key: "sk-test" })}
      />,
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
        baseUrl: "https://x.test",
        apiKey: "sk-test",
      })
    })

    mockFetchOpenAICompatibleModelIds.mockClear()

    fireEvent.change(
      screen.getByLabelText("ui:dialog.cliproxy.fields.baseUrl"),
      {
        target: {
          value: "https://proxy.example.com/openai/v1/chat/completions",
        },
      },
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenLastCalledWith({
        baseUrl: "https://proxy.example.com/openai",
        apiKey: "sk-test",
      })
    })
  })
})
