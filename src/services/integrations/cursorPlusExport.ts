import {
  hashProviderCatalogValue,
  prepareProviderCatalogExport,
  type ProviderCatalogExportInput,
} from "./providerCatalogExport"

export const CURSOR_PLUS_PROVIDER_TYPES = {
  Anthropic: "anthropic",
  OpenAIChat: "openai-chat",
  OpenAIResponses: "openai-responses",
  Gemini: "gemini",
} as const

export type CursorPlusProviderType =
  (typeof CURSOR_PLUS_PROVIDER_TYPES)[keyof typeof CURSOR_PLUS_PROVIDER_TYPES]

interface CursorPlusModel {
  id: string
  apiModel: string
  defaultOn: true
}

interface CursorPlusProvider {
  id: string
  name: string
  type: CursorPlusProviderType
  baseUrl: string
  auth: {
    kind: "apiKey"
    value: string
  }
  models: CursorPlusModel[]
}

/** Convert a provider label to Cursor++'s human-readable identifier prefix. */
function slugifyCursorPlusProviderName(value: string) {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider"
  )
}

/** Build the stable Cursor++ provider id shown in previews and exports. */
function getCursorPlusProviderId({
  selectionId,
  name,
}: Pick<ProviderCatalogExportInput, "selectionId" | "name">) {
  return `${slugifyCursorPlusProviderName(name.trim())}-${hashProviderCatalogValue(selectionId)}`
}

/** Prepare one provider object that users can merge into providers.json. */
export function prepareCursorPlusProvider(
  input: ProviderCatalogExportInput & {
    protocol?: CursorPlusProviderType
  },
): CursorPlusProvider {
  const provider = prepareProviderCatalogExport([
    { ...input, baseUrlPathSuffix: null },
  ]).providers[0]!

  if (!provider.name) throw new Error("Provider name cannot be blank")
  if (!provider.apiKey.trim()) throw new Error("Runtime key cannot be blank")
  if (!provider.modelIds.length) {
    throw new Error("Select at least one model for the provider")
  }

  let parsedBaseUrl: URL
  try {
    parsedBaseUrl = new URL(provider.baseUrl)
  } catch {
    throw new Error("Base URL must be a valid HTTP or HTTPS URL")
  }
  if (
    parsedBaseUrl.protocol !== "http:" &&
    parsedBaseUrl.protocol !== "https:"
  ) {
    throw new Error("Base URL must be a valid HTTP or HTTPS URL")
  }

  // Cursor++ 0.0.13 defines four provider types and uses baseUrl plus model-level
  // defaultOn. Source: https://www.npmjs.com/package/@cometix/ccursor
  return {
    id: getCursorPlusProviderId(provider),
    name: provider.name,
    type: input.protocol ?? CURSOR_PLUS_PROVIDER_TYPES.OpenAIChat,
    baseUrl: provider.baseUrl,
    auth: {
      kind: "apiKey",
      value: provider.apiKey,
    },
    models: provider.modelIds.map((modelId) => ({
      id: modelId,
      apiModel: modelId,
      defaultOn: true,
    })),
  }
}
