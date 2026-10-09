import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  ManagedResourceError,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type Command } from "~/services/apiAdapters/managedResources/cliProxyApi/editorProjection"
import {
  cliProxyApiFailure,
  cliProxyApiScope,
  invalid,
  readCliProxyApiResource,
} from "~/services/apiAdapters/managedResources/cliProxyApi/nativeRuntime"
import {
  CliProxyApiError,
  cliProxyApiResource,
  listCliProxyApiProviders,
  requestCliProxyApi,
  type CliProxyApiProvider,
  type CliProxyApiResource,
} from "~/services/apiService/cliProxyApi"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations/contracts"
import type { CliProxyApiConfig } from "~/types/cliProxyApiConfig"

/** Compare persisted editable values while accepting omitted empty/default fields. */
function normalizedConfiguration(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined
  if (Array.isArray(value))
    return value.length ? value.map(normalizedConfiguration) : undefined
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, value]) => {
        const normalized = normalizedConfiguration(value)
        return normalized === undefined ? [] : [[key, normalized]]
      })
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return value
}

/** Confirm the server persisted the requested editable configuration. */
function confirmsEditableConfiguration(
  expected: CliProxyApiProvider,
  actual: CliProxyApiProvider,
) {
  return [
    "name",
    "base-url",
    "api-key",
    "api-key-entries",
    "models",
    "prefix",
    "headers",
    "proxy-url",
    "excluded-models",
    "disabled",
  ].every((key) => {
    if (key === "disabled")
      return Boolean(expected[key]) === Boolean(actual[key])
    const normalize = (provider: CliProxyApiProvider) =>
      normalizedConfiguration(
        key === "models"
          ? provider.models?.map((model) => ({
              ...model,
              alias: model.alias || model.name,
            }))
          : provider[key],
      )
    return (
      JSON.stringify(normalize(expected)) === JSON.stringify(normalize(actual))
    )
  })
}

/** Serialize this extension's collection writes; upstream has no compare-and-swap API. */
async function mutateUnlocked(
  config: CliProxyApiConfig,
  operation: "create" | "update" | "delete",
  command: Command | undefined,
  original: CliProxyApiResource | undefined,
  options?: ResourceOperationOptions,
  inventory?: CliProxyApiResource[],
): Promise<ManagedSiteMutationResult<CliProxyApiResource | undefined>> {
  let dispatched = false
  try {
    if (
      original &&
      command?.expected !== undefined &&
      JSON.stringify(original.value) !== command.expected
    )
      throw new ManagedResourceError({ code: "resource_changed" })
    const kind = command?.kind ?? original!.kind
    const list =
      inventory ?? (await listCliProxyApiProviders(config, kind, options))
    const matches = original
      ? list.filter((item) => item.id === original.id)
      : []
    const [matched] = matches
    if (
      original &&
      (matches.length !== 1 ||
        !matched ||
        JSON.stringify(matched.value) !== JSON.stringify(original.value))
    )
      throw new ManagedResourceError({ code: "resource_changed" })
    const next = command
      ? await cliProxyApiResource(kind, command.value)
      : undefined
    if (
      next &&
      list.some((item) => item.id === next.id && item.id !== original?.id)
    )
      throw invalid()
    const index = original
      ? list.findIndex((item) => item.id === original.id)
      : -1
    options?.signal?.throwIfAborted()
    dispatched = true
    if (operation === "delete") {
      await requestCliProxyApi(
        config,
        `${kind}?index=${index}`,
        "DELETE",
        undefined,
        options,
      )
    } else if (
      operation === "create" ||
      (["gemini-api-key", "interactions-api-key"].includes(kind) &&
        JSON.stringify(original?.value.models) !==
          JSON.stringify(next?.value.models))
    ) {
      // https://github.com/router-for-me/CLIProxyAPI/blob/7fac6b15/internal/api/handlers/management/config_lists.go
      // No POST exists; Gemini PATCH omits models entirely. PUT is required here.
      const values = list.map((item) => item.value)
      if (operation === "create") values.push(next!.value)
      else values[index] = next!.value
      await requestCliProxyApi(config, kind, "PUT", values, options)
    } else {
      await requestCliProxyApi(
        config,
        kind,
        "PATCH",
        { index, value: next!.value },
        options,
      )
    }
    const refreshed = await listCliProxyApiProviders(config, kind, options)
    const result = next ? refreshed.filter((item) => item.id === next.id) : []
    if (
      next
        ? result.length !== 1
        : refreshed.some((item) => item.id === original!.id)
    )
      throw new CliProxyApiError()
    const confirmedMatch = result[0]
    if (
      next &&
      (!confirmedMatch ||
        !confirmsEditableConfiguration(next.value, confirmedMatch.value))
    )
      throw new CliProxyApiError()
    return {
      outcome: "succeeded",
      data: result[0],
      confirmedEffects: [
        {
          kind:
            operation === "create"
              ? "resource-created"
              : operation === "delete"
                ? "resource-deleted"
                : "resource-updated",
          resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          resourceId: next?.id ?? original!.id,
        },
      ],
    }
  } catch (error) {
    return {
      outcome:
        dispatched &&
        (!(error instanceof CliProxyApiError) ||
          error.status === undefined ||
          error.status >= 500)
          ? "uncertain"
          : "rejected",
      diagnostic: {
        code: cliProxyApiFailure(error).code,
        message: cliProxyApiFailure(error).code,
      },
    }
  }
}

/** Coordinate read/modify/write across the extension's management callers. */
export function mutate(...args: Parameters<typeof mutateUnlocked>) {
  return withExtensionStorageWriteLock(
    `cliproxy:${cliProxyApiScope(args[0])}`,
    () => mutateUnlocked(...args),
  )
}

/** Reuse the native create lock and persistence readback for migrations. */
export const createCliProxyApiResource = async (
  config: CliProxyApiConfig,
  command: Command,
  options?: ResourceOperationOptions,
) =>
  mutate(config, "create", command, undefined, options) as Promise<
    ManagedSiteMutationResult<CliProxyApiResource>
  >
/** Deletes one identity through a single locked inventory and confirmed readback. */
export const deleteCliProxyApiResource = async (
  config: CliProxyApiConfig,
  id: string,
  options?: ResourceOperationOptions,
) =>
  withExtensionStorageWriteLock(
    `cliproxy:${cliProxyApiScope(config)}`,
    async () => {
      // Resolve identity and deletion index from one inventory under the mutation lock.
      // Post-write readback still confirms that the intended provider disappeared.
      const { resource, list } = await readCliProxyApiResource(
        config,
        id,
        options,
      )
      const result = await mutateUnlocked(
        config,
        "delete",
        undefined,
        resource,
        options,
        list,
      )
      return result.outcome === "succeeded"
        ? { ...result, data: undefined }
        : (result as ManagedSiteMutationResult<void>)
    },
  )
