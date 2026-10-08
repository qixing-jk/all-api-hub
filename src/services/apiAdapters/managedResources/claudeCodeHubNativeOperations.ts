import {
  MANAGED_RESOURCE_FAILURE_CODES,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  type ClaudeCodeHubNativeConfig,
  type ClaudeCodeHubNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/claudeCodeHubNativeContracts"
import {
  openConfig,
  runMutation,
  runRead,
  throwIfAborted,
} from "~/services/apiAdapters/managedResources/claudeCodeHubNativeRuntime"
import {
  claudeCodeHubChannelEffect,
  runClaudeCodeHubMutation,
} from "~/services/apiAdapters/managedSites/claudeCodeHubMutation"
import {
  createProviderV1,
  deleteProviderV1,
  getProvider as getProviderV1,
  getUnmaskedProviderKey,
  listProviders,
  searchProviders,
  updateProviderV1,
} from "~/services/apiService/claudeCodeHub"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import type {
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
} from "~/types/claudeCodeHub"

const isProviderDetail = (
  value: unknown,
): value is ClaudeCodeHubProviderDisplay =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "number" &&
      typeof (value as { name?: unknown }).name === "string",
  )

const stripUnknownMutationData = (
  result: ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay>,
): ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay> => {
  if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return result
  }
  if (isProviderDetail(result.data)) return result
  return {
    outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
    diagnostic: {
      code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      message: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    },
  }
}

const getProvider = async (
  nativeConfig: ClaudeCodeHubNativeConfig,
  locator: number,
  options?: ResourceOperationOptions,
) =>
  await runRead(
    nativeConfig,
    options,
    async () =>
      await getProviderV1(nativeConfig.config, locator, {
        signal: options?.signal,
      }),
  )

/** Opens the scope-bound Claude Code Hub operations shared by UI and migration. */
export async function openClaudeCodeHubNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<ClaudeCodeHubNativeResourceOperations> {
  const nativeConfig = await openConfig(options)
  const create = async (
    command: ClaudeCodeHubProviderCreatePayload,
    operationOptions?: ResourceOperationOptions,
  ) => {
    throwIfAborted(operationOptions)
    return stripUnknownMutationData(
      await runMutation(
        nativeConfig,
        async () =>
          await runClaudeCodeHubMutation({
            effect: claudeCodeHubChannelEffect("resource-created"),
            execute: async () =>
              await createProviderV1(nativeConfig.config, command, {
                signal: operationOptions?.signal,
              }),
          }),
      ),
    )
  }
  return {
    scopeKey: nativeConfig.scopeKey,
    list: async (query, operationOptions) => {
      const search = query?.search?.trim()
      const items = await runRead(nativeConfig, operationOptions, async () =>
        search
          ? await searchProviders(nativeConfig.config, search, {
              signal: operationOptions?.signal,
            })
          : await listProviders(nativeConfig.config, {
              signal: operationOptions?.signal,
            }),
      )
      return { items, total: items.length }
    },
    get: (locator, operationOptions) =>
      getProvider(nativeConfig, locator, operationOptions),
    loadSecret: (locator, operationOptions) =>
      runRead(
        nativeConfig,
        operationOptions,
        async () =>
          await getUnmaskedProviderKey(nativeConfig.config, locator, {
            signal: operationOptions?.signal,
          }),
      ),
    create,
    update: async (detail, command, operationOptions) => {
      throwIfAborted(operationOptions)
      const result = await runMutation(
        nativeConfig,
        async () =>
          await runClaudeCodeHubMutation({
            effect: claudeCodeHubChannelEffect("resource-updated", detail.id),
            execute: async () =>
              await updateProviderV1(nativeConfig.config, detail.id, command, {
                signal: operationOptions?.signal,
              }),
          }),
      )
      if (
        result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded &&
        !isProviderDetail(result.data)
      ) {
        try {
          return {
            ...result,
            data: await getProvider(nativeConfig, detail.id, operationOptions),
          }
        } catch {
          return stripUnknownMutationData(result)
        }
      }
      return stripUnknownMutationData(result)
    },
    delete: async (locator, operationOptions) => {
      throwIfAborted(operationOptions)
      return await runMutation(
        nativeConfig,
        async () =>
          await runClaudeCodeHubMutation({
            effect: claudeCodeHubChannelEffect("resource-deleted", locator),
            execute: async () =>
              await deleteProviderV1(nativeConfig.config, locator, {
                signal: operationOptions?.signal,
              }),
            successData: () => undefined,
          }),
      )
    },
  }
}
