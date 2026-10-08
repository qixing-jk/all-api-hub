import { OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS } from "~/constants/omniroute"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { providerOption } from "~/services/apiAdapters/managedResources/omniRoute/editorProjection"
import {
  type OmniRouteNativeCreateCommand,
  type OmniRouteNativeResourceOperations,
  type OmniRouteNativeUpdateCommand,
} from "~/services/apiAdapters/managedResources/omniRoute/nativeContracts"
import {
  OmniRouteNativeError,
  openConfig,
  runRead,
  throwIfAborted,
} from "~/services/apiAdapters/managedResources/omniRoute/nativeRuntime"
import {
  omniRouteChannelEffect,
  runOmniRouteMutation,
} from "~/services/apiAdapters/managedSites/omnirouteMutation"
import {
  createOmniRouteConnection,
  createOmniRouteProviderNode,
  deleteOmniRouteConnection,
  deleteOmniRouteProviderNode,
  getOmniRouteConnection,
  listAllOmniRouteConnections,
  listOmniRouteModelProviderIds,
  updateOmniRouteConnection,
} from "~/services/apiService/omniroute"
import {
  toOmniRouteSanitizedConnection,
  type OmniRouteSanitizedConnection,
} from "~/services/apiService/omniroute/redaction"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { fetchOmniRouteChannelSecretKey } from "~/services/managedSites/providers/omniroute"

/** Opens the scope-bound OmniRoute operations shared by UI and migration. */
export async function openOmniRouteNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<OmniRouteNativeResourceOperations> {
  const nativeConfig = await openConfig(options)
  const { config } = nativeConfig

  const readDetail = async (
    locator: string,
    readOptions?: ResourceOperationOptions,
  ) =>
    toOmniRouteSanitizedConnection(
      await runRead(nativeConfig, readOptions, async () =>
        getOmniRouteConnection(config, locator, {
          signal: readOptions?.signal,
        }),
      ),
    )

  /**
   * Reads one stored credential in plaintext.
   *
   * The shared helper owns the client-route semantics; a deployment that
   * tightens that route turns this into a failure the match resolver degrades
   * from, not an import blocker.
   */
  const readSecret = async (
    locator: string,
    readOptions?: ResourceOperationOptions,
  ) =>
    await runRead(nativeConfig, readOptions, async () =>
      fetchOmniRouteChannelSecretKey(config, locator, {
        signal: readOptions?.signal,
      }),
    )

  const create = async (
    command: OmniRouteNativeCreateCommand,
    operationOptions?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>> => {
    throwIfAborted(operationOptions)
    let createdNodeId: string | null = null

    const result = await runOmniRouteMutation<OmniRouteSanitizedConnection>({
      effect: omniRouteChannelEffect("resource-created"),
      execute: async () => {
        let provider = command.provider
        if (command.prefix) {
          // A dedicated model prefix needs its own provider node, because the
          // connection snapshots the node's prefix/baseUrl at creation.
          createdNodeId = await createOmniRouteProviderNode(
            config,
            {
              name: command.name,
              prefix: command.prefix,
              apiType: "chat",
              baseUrl: command.baseUrl,
              type: "openai-compatible",
            },
            { signal: operationOptions?.signal },
          )
          provider = createdNodeId
        }

        const created = await createOmniRouteConnection(
          config,
          {
            provider,
            name: command.name,
            apiKey: command.apiKey,
            ...(command.defaultModel
              ? { defaultModel: command.defaultModel }
              : {}),
            // The connection-level override wins over the provider's static
            // endpoint, which is what makes a one-step import of an arbitrary
            // relay possible. A node-backed connection inherits the node's URL.
            ...(command.baseUrl && !command.prefix
              ? { providerSpecificData: { baseUrl: command.baseUrl } }
              : {}),
          },
          { signal: operationOptions?.signal },
        )
        return toOmniRouteSanitizedConnection(created)
      },
    })

    if (
      result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Rejected &&
      createdNodeId
    ) {
      // Only a confirmed rejection proves the connection was not stored. A 5xx
      // or a transport failure may have committed it, and deleting the node
      // would then break a live connection.
      await deleteOmniRouteProviderNode(config, createdNodeId, {
        signal: operationOptions?.signal,
      }).catch(() => {
        // Best-effort compensation; the connection failure is what the user sees.
      })
    }
    return result
  }

  const update = async (
    sanitized: OmniRouteSanitizedConnection,
    command: OmniRouteNativeUpdateCommand,
    operationOptions?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>> => {
    throwIfAborted(operationOptions)
    if (Object.keys(command).length === 0) {
      throw new OmniRouteNativeError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await runOmniRouteMutation<OmniRouteSanitizedConnection>({
      effect: omniRouteChannelEffect("resource-updated", sanitized.id),
      execute: async () =>
        toOmniRouteSanitizedConnection(
          await updateOmniRouteConnection(config, sanitized.id, command, {
            signal: operationOptions?.signal,
          }),
        ),
    })
  }

  return {
    scopeKey: nativeConfig.scopeKey,
    list: async (query, operationOptions) => {
      const search = query?.search?.trim().toLowerCase() ?? ""
      const connections = await runRead(
        nativeConfig,
        operationOptions,
        async () =>
          listAllOmniRouteConnections(config, {
            signal: operationOptions?.signal,
          }),
      )
      const items = connections
        .map(toOmniRouteSanitizedConnection)
        .filter((sanitized) =>
          search
            ? [
                sanitized.name,
                sanitized.provider,
                sanitized.nodePrefix,
                sanitized.baseUrl,
                sanitized.defaultModel,
              ]
                .join(" ")
                .toLowerCase()
                .includes(search)
            : true,
        )
      return { items, total: items.length }
    },
    get: readDetail,
    loadSecret: readSecret,
    loadProviderOptions: async (operationOptions) => {
      const providerIds = await runRead(
        nativeConfig,
        operationOptions,
        async () =>
          listOmniRouteModelProviderIds(config, {
            signal: operationOptions?.signal,
          }),
      )
      const values = new Set<string>([
        ...providerIds,
        ...Object.keys(OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS),
      ])
      return [...values]
        .sort((left, right) => left.localeCompare(right))
        .map(providerOption)
    },
    create,
    update,
    delete: async (locator, operationOptions) => {
      throwIfAborted(operationOptions)
      // A prefix identifies a node, not its owner. The upstream node DELETE
      // cascades to all its connections and aliases; even an inventory read
      // cannot prevent a sibling being created between that read and deletion.
      // Delete only the requested connection. In-flight create compensation
      // separately retains the authoritative id returned by node creation.
      // OmniRoute release/v3.8.51: src/app/api/provider-nodes/[id]/route.ts
      return await runOmniRouteMutation<void, void>({
        effect: omniRouteChannelEffect("resource-deleted", locator),
        execute: async () =>
          await deleteOmniRouteConnection(config, locator, {
            signal: operationOptions?.signal,
          }),
        successData: () => undefined,
      })
    },
  }
}
