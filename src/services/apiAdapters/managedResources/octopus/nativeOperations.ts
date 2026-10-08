import { OctopusOutboundTypeNames } from "~/constants/octopus"
import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_FAILURE_CODES as failures,
  ManagedResourceError,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { isOctopusHttpUrl } from "~/services/apiAdapters/managedResources/octopus/editor"
import { type UpdateCommand } from "~/services/apiAdapters/managedResources/octopus/nativeContracts"
import {
  aborted,
  assertLocator,
  read,
  redactKnownSecrets,
} from "~/services/apiAdapters/managedResources/octopus/nativeRuntime"
import {
  octopusChannelEffect,
  runOctopusMutation,
} from "~/services/apiAdapters/managedSites/octopus/octopusMutation"
import {
  createChannel,
  deleteChannel,
  getChannel,
  getChannelKeyManagement,
  listChannels,
  updateChannel,
  usesChannelProtocolPaths,
} from "~/services/apiService/octopus/channels"
import { fetchRemoteModels } from "~/services/apiService/octopus/models"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"
import {
  MANAGED_SITE_MUTATION_OUTCOMES as outcomes,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { buildOctopusBaseUrl } from "~/services/managedSites/providers/octopus"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import {
  OCTOPUS_CHANNEL_DETAIL_AVAILABILITY,
  type OctopusChannel,
  type OctopusCreateChannelInput,
  type OctopusFetchModelInput,
  type OctopusOutboundType,
} from "~/types/octopus"

const isDetail = (value: unknown): value is OctopusChannel => {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<OctopusChannel>
  return (
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    typeof item.name === "string" &&
    typeof item.type === "number" &&
    typeof item.enabled === "boolean" &&
    typeof item.model === "string" &&
    Array.isArray(item.base_urls) &&
    Array.isArray(item.keys)
  )
}

const uncertain = (): ManagedSiteMutationResult<OctopusChannel> => ({
  outcome: outcomes.Uncertain,
  diagnostic: {
    code: failures.MutationStateUncertain,
    message: failures.MutationStateUncertain,
  },
})

const sanitizeMutation = <T>(
  result: ManagedSiteMutationResult<T>,
  secrets: readonly (string | undefined)[],
): ManagedSiteMutationResult<T> => {
  if (result.outcome === outcomes.Succeeded) return result
  return {
    ...result,
    diagnostic: {
      message: redactKnownSecrets(result.diagnostic.message, secrets),
      ...(result.diagnostic.code === undefined
        ? {}
        : {
            code:
              typeof result.diagnostic.code === "string"
                ? redactKnownSecrets(result.diagnostic.code, secrets)
                : result.diagnostic.code,
          }),
      ...(result.diagnostic.statusCode === undefined
        ? {}
        : { statusCode: result.diagnostic.statusCode }),
    },
  }
}

/** Opens provider-native Octopus operations for editors and channel migration. */
export async function openOctopusNativeResourceOperations(
  options?: ResourceOperationOptions,
) {
  aborted(options)
  const preferences = await userPreferences.getPreferences()
  aborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.OCTOPUS,
  )
  if (!resolved)
    throw new ManagedResourceError({ code: failures.ConfigurationRequired })
  const config = resolved.config
  const readConfigured = <T>(
    operationOptions: ResourceOperationOptions | undefined,
    action: () => Promise<T>,
    secrets: readonly (string | undefined)[] = [],
  ) => read(operationOptions, action, [config.password, ...secrets])
  if (!isOctopusHttpUrl(config.baseUrl))
    throw new ManagedResourceError({ code: failures.InvalidConfiguration })
  const scopeKey = normalizeManagedUpstreamResourceScopeKey(
    new URL(config.baseUrl.trim()).origin,
  )
  const get = async (
    id: number,
    operationOptions?: ResourceOperationOptions,
  ) => {
    assertLocator(id)
    return await readConfigured(operationOptions, async () => {
      const detail = await getChannel(config, id, operationOptions)
      if (!isDetail(detail) || detail.id !== id)
        throw new ManagedResourceError({ code: failures.Unexpected })
      return detail
    })
  }
  // New named keys use GORM default:true, which can override an explicit false.
  // Reconcile once against fresh detail; never replay creation or unknown writes.
  // Source: github.com/bestruirui/octopus/blob/master/internal/op/channel.go (syncChannelKeys)
  const reconcileDisabledKeys = async (
    result: ManagedSiteMutationResult<OctopusChannel>,
    requested: OctopusCreateChannelInput["keys"],
    operationOptions?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OctopusChannel>> => {
    if (
      result.outcome !== outcomes.Succeeded ||
      !isDetail(result.data) ||
      result.data.keyManagement !== "named" ||
      !requested?.some((key) => !key.enabled)
    )
      return result
    const partial = (): ManagedSiteMutationResult<OctopusChannel> => ({
      outcome: outcomes.Partial,
      completion: "uncertain",
      data: result.data,
      confirmedEffects: [
        result.confirmedEffects[0] ??
          octopusChannelEffect("resource-updated", result.data.id),
        ...result.confirmedEffects.slice(1),
      ],
      diagnostic: {
        code: failures.MutationStateUncertain,
        message: failures.MutationStateUncertain,
      },
    })
    try {
      const latest = await get(result.data.id, operationOptions)
      if (
        latest.keys.length !== requested.length ||
        requested.some(
          (key) =>
            !latest.keys.some(
              (saved) =>
                saved.name === key.name &&
                saved.channel_key === key.channel_key,
            ),
        )
      )
        return partial()
      const disabled = requested.filter((key) => !key.enabled)
      if (
        disabled.every(
          (key) =>
            latest.keys.find((saved) => saved.name === key.name)?.enabled ===
            false,
        )
      )
        return { ...result, data: latest }
      const correction = await runOctopusMutation({
        effect: octopusChannelEffect("resource-updated", latest.id),
        execute: () =>
          updateChannel(
            config,
            {
              id: latest.id,
              source: latest,
              keys: latest.keys.map((key) => ({
                ...key,
                originalName: key.name,
                enabled: disabled.some((wanted) => wanted.name === key.name)
                  ? false
                  : key.enabled,
              })),
            },
            operationOptions,
          ),
      })
      if (correction.outcome !== outcomes.Succeeded) return partial()
      const confirmed = await get(latest.id, operationOptions)
      if (
        confirmed.keys.length !== requested.length ||
        requested.some(
          (key) =>
            !confirmed.keys.some(
              (saved) =>
                saved.name === key.name &&
                saved.channel_key === key.channel_key &&
                saved.enabled === key.enabled,
            ),
        )
      )
        return partial()
      return {
        ...result,
        data: confirmed,
        confirmedEffects: [
          ...result.confirmedEffects,
          ...correction.confirmedEffects,
        ],
      }
    } catch {
      return partial()
    }
  }
  const loadSecret = async (
    id: number,
    operationOptions?: ResourceOperationOptions,
  ) => {
    const detail = await get(id, operationOptions)
    const key = detail.keys[0]?.channel_key
    if (!key || !hasUsableManagedSiteChannelKey(key))
      throw new ManagedResourceError({ code: failures.Unavailable })
    return key
  }
  return {
    scopeKey,
    keyManagement: (operationOptions?: ResourceOperationOptions) =>
      getChannelKeyManagement(config, operationOptions),
    get,
    loadSecret,
    prepareMigrationBaseUrl: (
      baseUrl: string,
      type: OctopusOutboundType,
      operationOptions?: ResourceOperationOptions,
    ) =>
      readConfigured(operationOptions, async () => {
        if (!isOctopusHttpUrl(baseUrl))
          throw new ManagedResourceError({ code: failures.ValidationFailed })
        const protocolPaths = await usesChannelProtocolPaths(
          config,
          operationOptions,
        )
        return buildOctopusBaseUrl(baseUrl, { protocolPaths, type })
      }),
    list: async (
      query?: ResourceListQuery,
      operationOptions?: ResourceOperationOptions,
    ) =>
      readConfigured(operationOptions, async () => {
        const items = await listChannels(config, operationOptions)
        const keyword = query?.search?.trim().toLowerCase()
        const selected = keyword
          ? items.filter((item) =>
              [
                item.name,
                ...(item.detailAvailability ===
                OCTOPUS_CHANNEL_DETAIL_AVAILABILITY.Summary
                  ? []
                  : [
                      String(item.type),
                      OctopusOutboundTypeNames[item.type] ?? "",
                    ]),
                item.model,
                ...item.base_urls.map((url) => url.url),
              ].some((value) => value.toLowerCase().includes(keyword)),
            )
          : items
        return { items: selected, total: selected.length }
      }),
    create: async (
      command: OctopusCreateChannelInput,
      operationOptions?: ResourceOperationOptions,
    ): Promise<ManagedSiteMutationResult<OctopusChannel>> => {
      aborted(operationOptions)
      const created = await runOctopusMutation({
        effect: octopusChannelEffect("resource-created"),
        execute: () => createChannel(config, command, operationOptions),
      })
      const result = await reconcileDisabledKeys(
        created,
        command.keys,
        operationOptions,
      )
      // A success envelope without an identity cannot safely attribute creation.
      // Never replay a create merely because its response lacks channel data.
      return result.outcome === outcomes.Succeeded && !isDetail(result.data)
        ? uncertain()
        : sanitizeMutation(result, [
            config.password,
            command.key,
            ...(command.keys?.map((key) => key.channel_key) ?? []),
          ])
    },
    update: async (
      detail: OctopusChannel,
      command: UpdateCommand,
      operationOptions?: ResourceOperationOptions,
    ): Promise<ManagedSiteMutationResult<OctopusChannel>> => {
      assertLocator(detail.id)
      aborted(operationOptions)
      // The codec owns primary-key/URL edits and preserves additional entries.
      // v0.13 transport separately reloads raw detail for whole-body updates.
      // Source: github.com/bestruirui/octopus/blob/27aa40dc0f3b2902bce3e96ccdba019d17041606/internal/op/channel.go
      const result = await runOctopusMutation({
        effect: octopusChannelEffect("resource-updated", detail.id),
        execute: () =>
          updateChannel(
            config,
            { ...command, id: detail.id, source: detail },
            operationOptions,
          ),
      })
      if (result.outcome !== outcomes.Succeeded)
        return sanitizeMutation(result, [
          config.password,
          command.key,
          ...(command.keys?.map((key) => key.channel_key) ?? []),
          ...detail.keys.map((key) => key.channel_key),
        ])
      if (isDetail(result.data) && result.data.id === detail.id)
        return reconcileDisabledKeys(result, command.keys, operationOptions)
      try {
        return reconcileDisabledKeys(
          { ...result, data: await get(detail.id, operationOptions) },
          command.keys,
          operationOptions,
        )
      } catch {
        return uncertain()
      }
    },
    delete: async (id: number, operationOptions?: ResourceOperationOptions) => {
      assertLocator(id)
      aborted(operationOptions)
      return sanitizeMutation(
        await runOctopusMutation<null, void>({
          effect: octopusChannelEffect("resource-deleted", id),
          execute: () => deleteChannel(config, id, operationOptions),
          successData: () => undefined,
        }),
        [config.password],
      )
    },
    fetchDraftModels: (
      command: OctopusFetchModelInput,
      operationOptions?: ResourceOperationOptions,
    ) =>
      readConfigured(
        operationOptions,
        () => fetchRemoteModels(config, command, operationOptions),
        [
          command.key,
          ...(command.source?.keys.map((key) => key.channel_key) ?? []),
        ],
      ),
  }
}
