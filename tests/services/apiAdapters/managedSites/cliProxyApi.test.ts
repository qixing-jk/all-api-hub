import { describe, expect, it, vi } from "vitest"

import { cliProxyApiCapabilities } from "~/services/apiAdapters/managedSites/cliProxyApi"
import { API_TYPES } from "~/services/verification/aiApiVerification"

vi.mock("~/services/managedSites/utils/fetchManagedSiteImportModels", () => ({
  fetchManagedSiteImportModels: async () => ({
    models: ["test-model"],
    fetchFailed: false,
  }),
}))

describe("CLIProxyAPI managed-site import", () => {
  it.each([
    [
      API_TYPES.OPENAI_COMPATIBLE,
      "https://gateway.example/prefix",
      "openai-compatibility",
      "https://gateway.example/prefix/v1",
    ],
    [
      API_TYPES.OPENAI_COMPATIBLE,
      "https://gateway.example/v1/chat/completions",
      "openai-compatibility",
      "https://gateway.example/v1",
    ],
    [
      API_TYPES.OPENAI,
      "https://api.openai.com/v1/responses",
      "codex-api-key",
      "https://api.openai.com/v1",
    ],
    [
      API_TYPES.OPENAI,
      "https://chatgpt.com/backend-api/codex/responses",
      "codex-api-key",
      "https://chatgpt.com/backend-api/codex",
    ],
    [
      API_TYPES.ANTHROPIC,
      "https://gateway.example/prefix/v1/messages",
      "claude-api-key",
      "https://gateway.example/prefix",
    ],
    [
      API_TYPES.GOOGLE,
      "https://gateway.example/v1beta",
      "gemini-api-key",
      "https://gateway.example",
    ],
  ] as const)(
    "prepares %s at %s for its native executor",
    async (apiType, baseUrl, kind, expectedUrl) => {
      const draft = await cliProxyApiCapabilities.channelDrafts.prepareFormData(
        {
          name: "Imported",
          apiKey: "source-key",
          baseUrl,
          apiType,
          modelHints: ["hint"],
        },
      )
      expect(draft).toMatchObject({
        name: "Imported",
        key: "source-key",
        type: kind,
        base_url: expectedUrl,
        enabled: true,
      })
      expect(draft.models).toEqual(
        kind === "openai-compatibility" || kind === "codex-api-key"
          ? ["test-model"]
          : ["hint"],
      )
    },
  )
})
