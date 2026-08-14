// @vitest-environment jsdom

import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildKelivoProviderShareCode,
  copyKelivoProviderShareCode,
  createKelivoProviderExportDraft,
  isValidKelivoBaseUrl,
} from "~/services/integrations/kelivo"
import { API_TYPES } from "~/services/verification/aiApiVerification"

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const writeTextMock = vi.fn()
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: writeTextMock },
})

function decodeShareCode(code: string) {
  const encoded = code.slice("ai-provider:v1:".length)
  const bytes = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0),
  )
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
}

describe("Kelivo integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeTextMock.mockReset()
  })

  it("builds an OpenAI-compatible share code with the user's exact API base URL", () => {
    const code = buildKelivoProviderShareCode({
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      name: "Example Provider",
      baseUrl: "https://api.example.invalid/gateway",
      apiKey: "sk-example",
    })

    expect(code).toMatch(/^ai-provider:v1:/)
    expect(decodeShareCode(code)).toEqual({
      type: "openai",
      name: "Example Provider",
      apiKey: "sk-example",
      baseUrl: "https://api.example.invalid/gateway",
    })
  })

  it("prefills editable OpenAI and Anthropic URLs with the conventional v1 suffix", () => {
    expect(
      createKelivoProviderExportDraft({
        apiType: API_TYPES.OPENAI,
        name: "Example Provider",
        baseUrl: "https://api.example.invalid/gateway",
        apiKey: "sk-example",
      }),
    ).toEqual({
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      name: "Example Provider",
      baseUrl: "https://api.example.invalid/gateway/v1",
      apiKey: "sk-example",
    })
  })

  it("uses Google's fixed endpoint when preparing an editable draft", () => {
    expect(
      createKelivoProviderExportDraft({
        apiType: API_TYPES.GOOGLE,
        name: "Google Example",
        baseUrl: "https://proxy.example.invalid",
        apiKey: "google-example-key",
      }),
    ).toEqual({
      apiType: API_TYPES.GOOGLE,
      name: "Google Example",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "google-example-key",
    })
  })

  it("rejects unsafe or non-HTTP Base URLs", () => {
    expect(isValidKelivoBaseUrl("not-a-url")).toBe(false)
    expect(isValidKelivoBaseUrl("ftp://api.example.invalid")).toBe(false)
    expect(isValidKelivoBaseUrl("https://user@example.invalid")).toBe(false)
    expect(isValidKelivoBaseUrl("https://example.invalid?key=value")).toBe(
      false,
    )
    expect(isValidKelivoBaseUrl("https://example.invalid#fragment")).toBe(false)
    expect(isValidKelivoBaseUrl("https://api.example.invalid/v1")).toBe(true)
  })

  it("preserves Unicode names and maps Anthropic profiles to Claude", () => {
    const code = buildKelivoProviderShareCode({
      apiType: API_TYPES.ANTHROPIC,
      name: "Example 凭证",
      baseUrl: "https://claude.example.invalid/v1",
      apiKey: "sk-ant-example",
    })

    expect(decodeShareCode(code)).toEqual({
      type: "claude",
      name: "Example 凭证",
      apiKey: "sk-ant-example",
      baseUrl: "https://claude.example.invalid/v1",
    })
  })

  it("omits the fixed official Google endpoint from Google share codes", () => {
    const code = buildKelivoProviderShareCode({
      apiType: API_TYPES.GOOGLE,
      name: "Google Example",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "google-example-key",
    })

    expect(decodeShareCode(code)).toEqual({
      type: "google",
      name: "Google Example",
      apiKey: "google-example-key",
    })
  })

  it("rejects custom Google endpoints because Kelivo would discard them", () => {
    expect(() =>
      buildKelivoProviderShareCode({
        apiType: API_TYPES.GOOGLE,
        name: "Google Proxy",
        baseUrl: "https://google-proxy.example.invalid",
        apiKey: "google-example-key",
      }),
    ).toThrow(/custom Google/i)
  })

  it("copies a share code and confirms the next step", async () => {
    writeTextMock.mockResolvedValue(undefined)

    await expect(
      copyKelivoProviderShareCode({
        apiType: API_TYPES.OPENAI,
        name: "OpenAI Example",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-example",
      }),
    ).resolves.toBe(true)

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-provider:v1:/),
    )
    expect(toast.success).toHaveBeenCalledWith("messages:kelivo.copied")
  })

  it("reports clipboard failures without exposing the share code", async () => {
    writeTextMock.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    )

    await expect(
      copyKelivoProviderShareCode({
        apiType: API_TYPES.OPENAI,
        name: "OpenAI Example",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-sensitive-example",
      }),
    ).resolves.toBe(false)

    expect(toast.error).toHaveBeenCalledWith("messages:kelivo.copyFailed")
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls)).not.toContain(
      "sk-sensitive-example",
    )
  })

  it.each([
    {
      input: {
        apiType: API_TYPES.GOOGLE,
        name: "Google Proxy",
        baseUrl: "https://google-proxy.example.invalid",
        apiKey: "google-example-key",
      },
      message: "messages:kelivo.customGoogleEndpointUnsupported",
    },
    {
      input: {
        apiType: API_TYPES.OPENAI,
        name: "OpenAI Example",
        baseUrl: "not-a-url",
        apiKey: "sk-example",
      },
      message: "messages:kelivo.invalidBaseUrl",
    },
    {
      input: {
        apiType: API_TYPES.OPENAI,
        name: "",
        baseUrl: "https://api.example.invalid",
        apiKey: "",
      },
      message: "messages:kelivo.missingCredentials",
    },
    {
      input: {
        apiType: "responses" as typeof API_TYPES.OPENAI,
        name: "Unsupported Example",
        baseUrl: "https://api.example.invalid",
        apiKey: "sk-example",
      },
      message: "messages:kelivo.unsupportedApiType",
    },
  ])(
    "reports the safe localized error $message",
    async ({ input, message }) => {
      await expect(copyKelivoProviderShareCode(input)).resolves.toBe(false)
      expect(toast.error).toHaveBeenCalledWith(message)
    },
  )

  it("reports when clipboard writing is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })

    await expect(
      copyKelivoProviderShareCode({
        apiType: API_TYPES.OPENAI,
        name: "OpenAI Example",
        baseUrl: "https://api.example.invalid",
        apiKey: "sk-example",
      }),
    ).resolves.toBe(false)
    expect(toast.error).toHaveBeenCalledWith("messages:kelivo.copyFailed")

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    })
  })
})
