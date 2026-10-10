import { MAGPIE_ENDPOINT_FIELDS } from "~/constants/magpie"
import type {
  ManagedResourceRef,
  ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { MagpieProvider } from "~/services/apiService/magpie/providers"

const visibleModelIds = (provider: MagpieProvider) =>
  provider.chosen?.length
    ? provider.chosen
    : provider.models?.filter((model) => model.on).map((model) => model.id) ??
      []

/** Inventory and table searches share the same public provider values. */
export const magpieSearchValues = (provider: MagpieProvider): string[] => [
  provider.id,
  provider.name,
  ...MAGPIE_ENDPOINT_FIELDS.map((field) => provider[field] ?? ""),
  ...visibleModelIds(provider),
  provider.off ? "disabled" : "enabled",
  typeof provider.proxy === "string" ? provider.proxy : "",
]

/** Project native metadata without exposing secrets, headers or subscription identities. */
export function magpieDisplayFacts(
  provider: MagpieProvider,
  ref: ManagedResourceRef,
): ResourceDisplayFacts {
  const baseUrls = MAGPIE_ENDPOINT_FIELDS.map(
    (key) => provider[key] ?? "",
  ).filter(Boolean)
  const status = provider.off ? "disabled" : "enabled"
  return {
    ref,
    displayName: provider.name,
    status,
    searchValues: magpieSearchValues(provider),
    keyCleanupBaseUrls: baseUrls,
    fields: [
      { fieldId: "name", kind: "text", value: provider.name },
      { fieldId: "baseURL", kind: "text", value: baseUrls[0] ?? "" },
      { fieldId: "status", kind: "text", value: status },
      ...MAGPIE_ENDPOINT_FIELDS.map((fieldId) => ({
        fieldId,
        kind: "text" as const,
        value: provider[fieldId] ?? "",
      })),
      {
        fieldId: "supportedModels",
        kind: "list",
        value: visibleModelIds(provider),
      },
      {
        fieldId: "key",
        kind: "secret",
        state: provider.key.set ? "available" : "unavailable",
      },
      {
        fieldId: "proxy",
        kind: "text",
        value: typeof provider.proxy === "string" ? provider.proxy : "",
      },
    ],
    actions: {
      canUpdate: !provider.account,
      canDelete: !provider.account,
      ...(!provider.account
        ? {
            channel: {
              channelType:
                MAGPIE_ENDPOINT_FIELDS.find((field) => provider[field]) ??
                "chat",
              canSyncModels: !provider.off && Boolean(provider.chosen?.length),
              canOpenModelSync: Boolean(provider.chosen?.length),
              canConfigureModelFilters: Boolean(provider.chosen?.length),
            },
          }
        : {}),
    },
  }
}
