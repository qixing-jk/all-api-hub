import {
  type ManagedResourceRef,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { cliProxyApiKeys } from "~/services/apiAdapters/managedResources/cliProxyApi/nativeRuntime"
import { type CliProxyApiResource } from "~/services/apiService/cliProxyApi"

/** Project a provider into display facts without exposing its credentials. */
export function toFacts(
  resource: CliProxyApiResource,
  ref: ManagedResourceRef,
): ResourceDisplayFacts {
  const value = resource.value
  const name = value.name || value["base-url"] || resource.kind
  return {
    keyCleanupBaseUrls: [value["base-url"] ?? ""],
    ref,
    displayName: name,
    status:
      value.disabled === true ||
      (Array.isArray(value["excluded-models"]) &&
        value["excluded-models"].includes("*"))
        ? "disabled"
        : "enabled",
    fields: [
      { fieldId: "name", kind: "text", value: name },
      { fieldId: "type", kind: "text", value: resource.kind },
      {
        fieldId: "status",
        kind: "text",
        value:
          value.disabled === true ||
          (Array.isArray(value["excluded-models"]) &&
            value["excluded-models"].includes("*"))
            ? "disabled"
            : "enabled",
      },
      { fieldId: "baseURL", kind: "text", value: value["base-url"] ?? "" },
      {
        fieldId: "supportedModels",
        kind: "list",
        value: (value.models ?? []).map((model) => model.alias || model.name),
      },
      {
        fieldId: "key",
        kind: "secret",
        state: cliProxyApiKeys(resource).some(Boolean)
          ? "available"
          : "unavailable",
      },
      {
        fieldId: "proxy_url",
        kind: "text",
        value: typeof value["proxy-url"] === "string" ? value["proxy-url"] : "",
      },
      {
        fieldId: "prefix",
        kind: "text",
        value: typeof value.prefix === "string" ? value.prefix : "",
      },
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}
