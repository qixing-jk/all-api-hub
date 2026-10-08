import {
  MANAGED_RESOURCE_FAILURE_CODES,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  channelOption,
  gptLoadReplacementKeys,
} from "~/services/apiAdapters/managedResources/gptLoadEditorProjection"
import { createGptLoadGroupUpdate } from "~/services/apiAdapters/managedResources/gptLoadGroupUpdate"
import {
  type CredentialRecord,
  type GptLoadGroupDetail,
  type GptLoadNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/gptLoadNativeContracts"
import {
  GptLoadNativeError,
  openConfig,
  runRead,
  throwIfAborted,
} from "~/services/apiAdapters/managedResources/gptLoadNativeRuntime"
import {
  gptLoadChannelEffect,
  runGptLoadMutation,
} from "~/services/apiAdapters/managedSites/gptLoadMutation"
import {
  createGptLoadGroup,
  deleteGptLoadGroup,
  getGptLoadGroupModels,
  getGptLoadGroupSettings,
  listAllGptLoadGroups,
  listGptLoadChannelCatalog,
  listGptLoadGroupCredentials,
  listGptLoadModelIds,
  revealGptLoadGroupCredential,
} from "~/services/apiService/gptLoad"
import {
  readGptLoadGroupBaseUrl,
  toGptLoadSanitizedGroup,
} from "~/services/apiService/gptLoad/redaction"

/** Opens the scope-bound gpt-load operations shared by UI and matching. */
export async function openGptLoadNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<GptLoadNativeResourceOperations> {
  const nativeConfig = await openConfig(options)
  const { config } = nativeConfig

  const readDetail = async (
    locator: number,
    readOptions?: ResourceOperationOptions,
  ): Promise<GptLoadGroupDetail> =>
    await runRead(nativeConfig, readOptions, async () => {
      const settings = await getGptLoadGroupSettings(config, locator, {
        signal: readOptions?.signal,
      })
      const modelRows = await getGptLoadGroupModels(config, locator, {
        signal: readOptions?.signal,
      })
      const credentials = await listGptLoadGroupCredentials(config, locator, {
        signal: readOptions?.signal,
      })
      const modelIds = modelRows.map((model) => model.id)
      const group: Parameters<typeof toGptLoadSanitizedGroup>[0] = {
        id: locator,
        name: settings?.name ?? "",
        channel_id: settings?.channel_id ?? "",
        channel_name: settings?.channel_id,
        params: settings?.params,
        enabled: settings?.enabled ?? true,
        price_multiplier: settings?.price_multiplier,
        weight: settings?.weight_manual,
        model_names: modelIds,
        model_count: modelIds.length,
        credential_counts: {
          total: credentials.length,
          available: credentials.length,
        },
      }
      const maskedSample = credentials[0]?.mask ?? ""
      return {
        group: toGptLoadSanitizedGroup(group, maskedSample),
        models: modelIds,
        credentials,
      }
    })

  return {
    scopeKey: nativeConfig.scopeKey,
    list: async (query, operationOptions) => {
      const search = query?.search?.trim().toLowerCase() ?? ""
      const groups = await runRead(nativeConfig, operationOptions, async () =>
        listAllGptLoadGroups(config, { signal: operationOptions?.signal }),
      )
      const items = groups
        .filter((group) =>
          search
            ? [
                group.name,
                group.channel_id,
                group.channel_name,
                readGptLoadGroupBaseUrl(group),
                group.endpoint ?? "",
                ...(Array.isArray(group.model_names) ? group.model_names : []),
              ]
                .join(" ")
                .toLowerCase()
                .includes(search)
            : true,
        )
        .map((group) => {
          const sanitized = toGptLoadSanitizedGroup(group)
          return {
            group: sanitized,
            models: sanitized.models,
            credentials: [],
          } as GptLoadGroupDetail
        })
      return { items, total: items.length }
    },
    get: readDetail,
    loadChannelOptions: async (operationOptions) => {
      const catalog = await runRead(nativeConfig, operationOptions, async () =>
        listGptLoadChannelCatalog(config, {
          signal: operationOptions?.signal,
        }),
      )
      return catalog.map((entry) =>
        channelOption(entry.channel_id, entry.name ?? ""),
      )
    },
    loadModelOptions: async (operationOptions) => {
      // The gateway's own catalogue, not a union of other groups' model lists.
      const ids = await runRead(nativeConfig, operationOptions, async () =>
        listGptLoadModelIds(config, { signal: operationOptions?.signal }),
      )
      return ids.map((id) => channelOption(id, id))
    },
    loadSecret: async (locator, operationOptions) => {
      const credentials = await runRead(
        nativeConfig,
        operationOptions,
        async () =>
          listGptLoadGroupCredentials(config, locator, {
            signal: operationOptions?.signal,
          }),
      )
      const records: CredentialRecord[] = []
      for (const credential of credentials) {
        const key = await runRead(nativeConfig, operationOptions, () =>
          revealGptLoadGroupCredential(
            config,
            locator,
            credential.credential_id,
            { signal: operationOptions?.signal },
          ),
        )
        records.push({
          id: String(credential.credential_id),
          key,
          fields: {},
        })
      }
      return records
    },
    create: async (command, operationOptions) => {
      throwIfAborted(operationOptions)
      const keys = gptLoadReplacementKeys(command)
      if (keys.length === 0) {
        throw new GptLoadNativeError({
          code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
          message: "At least one channel credential is required",
        })
      }
      return await runGptLoadMutation<GptLoadGroupDetail>({
        effect: gptLoadChannelEffect("resource-created"),
        execute: async () => {
          const created = await createGptLoadGroup(
            config,
            {
              name: command.name,
              channelId: command.channelId,
              connectionType: "api_key",
              params: command.baseUrl ? { base_url: command.baseUrl } : {},
              models: command.models,
              credentials: keys,
              priceMultiplier: command.priceMultiplier,
            },
            { signal: operationOptions?.signal },
          )
          return {
            group: toGptLoadSanitizedGroup(created),
            models: command.models,
            credentials: [],
          }
        },
      })
    },
    update: createGptLoadGroupUpdate(config, readDetail),
    delete: async (locator, operationOptions) => {
      throwIfAborted(operationOptions)
      return await runGptLoadMutation<void, void>({
        effect: gptLoadChannelEffect("resource-deleted", locator),
        execute: async () =>
          await deleteGptLoadGroup(config, locator, {
            signal: operationOptions?.signal,
          }),
        successData: () => undefined,
      })
    },
  }
}
