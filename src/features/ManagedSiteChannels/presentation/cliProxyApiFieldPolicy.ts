import type {
  ManagedResourceEditorFieldPolicy,
  ManagedResourceFieldPresentation,
} from "./managedResourceFieldPolicy"

/** Optional section summaries use only non-secret projection facts. */
export const cliProxyApiSections = {
  models: {
    resolveSummary: (t, values) =>
      t("ui:resourceEditor.items", {
        count: [
          values.supportedModels,
          values.type === "openai-compatibility" ? "" : values.excluded_models,
        ]
          .map((value) => String(value ?? ""))
          .join("\n")
          .split("\n")
          .filter((line) => line.trim()).length,
      }),
  },
  routing: {
    resolveSummary: (t, values) =>
      t(
        String(values.prefix ?? "").trim()
          ? "ui:resourceEditor.configured"
          : "ui:resourceEditor.optional",
      ),
  },
  advanced: {
    resolveSummary: (t, values) =>
      t("ui:resourceEditor.items", {
        count: String(values.headers ?? "")
          .split("\n")
          .filter((line) => line.trim()).length,
      }),
  },
} satisfies ManagedResourceEditorFieldPolicy["sections"]

export const cliProxyApiFields = [
  {
    fieldId: "status",
    section: "basic",
    order: 20,
    renderer: "boolean",
    resolveLabel: (t) => t("common:status.enabled"),
  },
  {
    fieldId: "type",
    section: "basic",
    order: 0,
    renderer: "select",
    resolveLabel: (t) => t("channelDialog:fields.type.label"),
    optionLabelResolvers: {
      "openai-compatibility": () => "OpenAI Compatibility",
      "codex-api-key": () => "Codex",
      "claude-api-key": () => "Claude",
      "gemini-api-key": () => "Gemini",
      "vertex-api-key": () => "Vertex AI",
      "xai-api-key": () => "xAI",
      "interactions-api-key": () => "Gemini Interactions",
    },
  },
  {
    fieldId: "name",
    section: "basic",
    order: 10,
    renderer: "text",
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    visibleWhen: (values) => values.type === "openai-compatibility",
  },
  {
    fieldId: "baseURL",
    section: "connection",
    order: 0,
    renderer: "text",
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
  },
  {
    fieldId: "key",
    section: "connection",
    order: 10,
    renderer: "secret",
    channelFieldRole: "secret",
    visibleWhen: (values) => values.type !== "openai-compatibility",
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
  },
  {
    fieldId: "credentials",
    section: "connection",
    order: 10,
    renderer: "secret-list",
    compactSecretRows: true,
    visibleWhen: (values) => values.type === "openai-compatibility",
    resolveLabel: (t) => t("ui:secretList.title"),
    entryFields: [
      {
        fieldId: "proxy_url",
        width: "wide",
        resolveLabel: (t) => t("managedSiteChannels:cliProxyApi.proxyUrl"),
      },
      {
        fieldId: "weight",
        width: "compact",
        resolveLabel: (t) => t("channelDialog:fields.weight.label"),
        resolveHelp: (t) =>
          t("managedSiteChannels:cliProxyApi.credentialWeightHelp"),
      },
    ],
  },
  {
    fieldId: "supportedModels",
    section: "models",
    order: 0,
    renderer: "textarea",
    textEntries: {
      separator: "=",
      omitEmptyValue: true,
      resolveKeyLabel: (t) => t("ui:textEntries.modelName"),
      resolveValueLabel: (t) => t("ui:textEntries.modelAlias"),
      resolveValuePlaceholder: (t) => t("ui:textEntries.modelAliasPlaceholder"),
    },
    resolveLabel: (t) => t("channelDialog:fields.models.label"),
    resolveHelp: (t) => t("ui:textEntries.modelHelp"),
    rows: 6,
  },
  {
    fieldId: "proxy_url",
    visibleWhen: (values) => values.type !== "openai-compatibility",
    section: "connection",
    order: 20,
    renderer: "text",
    resolveLabel: (t) => t("managedSiteChannels:cliProxyApi.proxyUrl"),
  },
  {
    fieldId: "prefix",
    section: "routing",
    order: 0,
    renderer: "text",
    resolveLabel: (t) => t("managedSiteChannels:cliProxyApi.prefix"),
  },
  {
    fieldId: "headers",
    section: "advanced",
    order: 0,
    renderer: "textarea",
    textEntries: {
      separator: ":",
      resolveKeyLabel: (t) => t("ui:textEntries.headerName"),
      resolveValueLabel: (t) => t("ui:textEntries.headerValue"),
    },
    resolveLabel: (t) => t("managedSiteChannels:cliProxyApi.headers"),
    resolveHelp: (t) => t("managedSiteChannels:cliProxyApi.headersHelp"),
  },
  {
    fieldId: "excluded_models",
    visibleWhen: (values) => values.type !== "openai-compatibility",
    section: "models",
    order: 10,
    renderer: "textarea",
    resolveLabel: (t) => t("managedSiteChannels:cliProxyApi.excludedModels"),
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]
