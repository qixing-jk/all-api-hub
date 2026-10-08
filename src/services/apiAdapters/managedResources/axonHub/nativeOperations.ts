import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  type ManagedResourceRef,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  getAxonHubCredentialKey,
  isRegularAxonHubChannelType,
} from "~/services/apiAdapters/managedResources/axonHub/credentialProjection"
import { type AxonHubNativeResourceOperations } from "~/services/apiAdapters/managedResources/axonHub/nativeContracts"
import {
  applyAxonHubNativeChannelPatch,
  channelMutationEffect,
  finishAxonHubNativeMutation,
  omitAxonHubChannelCredentials,
  runAxonHubNativeMutationStep,
} from "~/services/apiAdapters/managedResources/axonHub/nativeMutation"
import {
  AxonHubNativeError,
  callRead,
  createControlledNativeFailure,
  createNativeFailure,
  mapRequestFailure,
  normalizeOrigin,
} from "~/services/apiAdapters/managedResources/axonHub/nativeRuntime"
import { signIn } from "~/services/apiService/axonHub/authSession"
import {
  createAxonHubChannel,
  deleteAxonHubChannel,
  getAxonHubChannel,
  listAxonHubChannelPage,
  updateAxonHubChannel,
  updateAxonHubChannelStatus,
} from "~/services/apiService/axonHub/channels"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"
import { MANAGED_SITE_MUTATION_EFFECT_KINDS } from "~/services/managedSites/mutations/contracts"
import { createManagedSiteMutationSequence } from "~/services/managedSites/mutations/execution"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { AxonHubChannel } from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"

// Resource-wide search is client-side, so cap both upstream work and retained
// input at conservative levels well above normal managed-site inventories.
const AXON_HUB_SEARCH_PAGE_LIMIT = 100

const AXON_HUB_SEARCH_ITEM_LIMIT = 5_000

/** Opens a validated, scope-bound AxonHub native resource session. */
export async function openAxonHubNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<AxonHubNativeResourceOperations> {
  let preferences: Awaited<ReturnType<typeof userPreferences.getPreferences>>
  try {
    preferences = await userPreferences.getPreferences()
  } catch (error) {
    throw mapRequestFailure(error)
  }

  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.AXON_HUB,
  )
  if (!resolved) throw createNativeFailure("configuration_required")

  let scopeKey: string
  let config: AxonHubConfig
  try {
    scopeKey = normalizeOrigin(resolved.config.baseUrl)
    const email = resolved.config.email.trim()
    const password = resolved.config.password.trim()
    if (!email || !password) throw new Error("invalid credentials")
    config = {
      baseUrl: resolved.config.baseUrl,
      email,
      password,
    }
  } catch {
    throw createNativeFailure("invalid_configuration")
  }

  const requestOptions = (operationOptions?: ResourceOperationOptions) =>
    operationOptions?.signal ? { signal: operationOptions.signal } : undefined

  await callRead(() => signIn(config, requestOptions(options)))

  const assertRef = (ref: ManagedResourceRef) => {
    if (
      ref.siteType !== SITE_TYPES.AXON_HUB ||
      ref.kind !== MANAGED_RESOURCE_KINDS.Channel ||
      ref.scopeKey !== scopeKey ||
      !ref.resourceId
    ) {
      throw createNativeFailure("unexpected")
    }
  }

  return {
    scopeKey,
    list: async (query, operationOptions) => {
      const normalizedSearch = query?.search?.trim().toLowerCase() ?? ""
      if (!normalizedSearch) {
        return callRead(async () => {
          const page = await listAxonHubChannelPage(
            config,
            {
              ...(query?.cursor ? { cursor: query.cursor } : {}),
              limit: query?.limit ?? 100,
            },
            requestOptions(operationOptions),
          )
          return {
            items: page.items,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          }
        })
      }

      return callRead(async () => {
        const items: AxonHubChannel[] = []
        const seenCursors = new Set<string>()
        let cursor: string | undefined
        let pageCount = 0
        let itemCount = 0
        do {
          if (pageCount >= AXON_HUB_SEARCH_PAGE_LIMIT) {
            throw createNativeFailure("unexpected")
          }
          pageCount += 1
          const page = await listAxonHubChannelPage(
            config,
            { ...(cursor ? { cursor } : {}), limit: 100 },
            operationOptions?.signal
              ? { signal: operationOptions.signal }
              : undefined,
          )
          itemCount += page.items.length
          if (itemCount > AXON_HUB_SEARCH_ITEM_LIMIT) {
            throw createNativeFailure("unexpected")
          }
          items.push(
            ...page.items.filter((item) =>
              searchableValues(item).some((value) =>
                value.toLowerCase().includes(normalizedSearch),
              ),
            ),
          )
          const nextCursor = page.nextCursor
          if (nextCursor && seenCursors.has(nextCursor)) {
            throw createNativeFailure("unexpected")
          }
          if (nextCursor) seenCursors.add(nextCursor)
          cursor = nextCursor
        } while (cursor)
        return { items }
      })
    },
    get: (ref, operationOptions) => {
      assertRef(ref)
      return callRead(() =>
        getAxonHubChannel(
          config,
          ref.resourceId,
          requestOptions(operationOptions),
        ),
      )
    },
    loadSecret: async (ref, operationOptions) => {
      assertRef(ref)
      const detail = await callRead(() =>
        getAxonHubChannel(
          config,
          ref.resourceId,
          requestOptions(operationOptions),
        ),
      )
      const credential = getAxonHubCredentialKey(detail)
      if (!isRegularAxonHubChannelType(String(detail.type)) || !credential) {
        throw createNativeFailure("unavailable")
      }
      return credential
    },
    create: async (input, desiredStatus, operationOptions) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const createStep = await runAxonHubNativeMutationStep({
        sequence,
        signal: operationOptions?.signal,
        effect: (created) =>
          channelMutationEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            created.id,
          ),
        execute: async () =>
          await createAxonHubChannel(
            config,
            input,
            requestOptions(operationOptions),
          ),
      })
      if (createStep.outcome !== "applied") {
        return finishAxonHubNativeMutation(sequence, createStep)
      }

      const created = omitAxonHubChannelCredentials({
        ...input,
        ...createStep.data,
      })
      if (desiredStatus !== AXON_HUB_CHANNEL_STATUS.ENABLED) {
        return sequence.finish({ finalState: "confirmed", data: created })
      }

      const statusStep = await runAxonHubNativeMutationStep({
        sequence,
        signal: operationOptions?.signal,
        effect: () =>
          channelMutationEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
            created.id,
          ),
        execute: async () =>
          await updateAxonHubChannelStatus(
            config,
            created.id,
            desiredStatus,
            requestOptions(operationOptions),
          ),
      })
      if (statusStep.outcome !== "applied") {
        return finishAxonHubNativeMutation(sequence, statusStep, created)
      }

      return sequence.finish({
        finalState: "confirmed",
        data: { ...created, status: desiredStatus },
      })
    },
    // AxonHub beta5 ignores status in UpdateChannel; status changes require
    // UpdateChannelStatus. Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/biz/channel.go
    update: async (detail, input, operationOptions) => {
      const { status, ...ordinaryInput } = input
      const statusChanged = status !== undefined && status !== detail.status
      const hasOrdinaryPatch = Object.keys(ordinaryInput).length > 0
      const sequence = createManagedSiteMutationSequence({ idempotent: true })
      let updated = detail

      if (hasOrdinaryPatch) {
        const updateStep = await runAxonHubNativeMutationStep({
          sequence,
          signal: operationOptions?.signal,
          effect: () =>
            channelMutationEffect(
              MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
              detail.id,
            ),
          execute: async () =>
            await updateAxonHubChannel(
              config,
              detail.id,
              ordinaryInput,
              requestOptions(operationOptions),
            ),
        })
        if (updateStep.outcome !== "applied") {
          return finishAxonHubNativeMutation(sequence, updateStep)
        }
        updated = applyAxonHubNativeChannelPatch(
          detail,
          ordinaryInput,
          updateStep.data,
        )
      }

      if (statusChanged) {
        const statusStep = await runAxonHubNativeMutationStep({
          sequence,
          signal: operationOptions?.signal,
          effect: () =>
            channelMutationEffect(
              MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
              detail.id,
            ),
          execute: async () =>
            await updateAxonHubChannelStatus(
              config,
              detail.id,
              status,
              requestOptions(operationOptions),
            ),
        })
        if (statusStep.outcome !== "applied") {
          return finishAxonHubNativeMutation(
            sequence,
            statusStep,
            hasOrdinaryPatch ? updated : undefined,
          )
        }
      }

      return sequence.finish({
        finalState: "confirmed",
        data: statusChanged ? { ...updated, status } : updated,
      })
    },
    delete: async (ref, operationOptions) => {
      assertRef(ref)
      const sequence = createManagedSiteMutationSequence({ idempotent: true })
      const deleteStep = await runAxonHubNativeMutationStep({
        sequence,
        signal: operationOptions?.signal,
        effect: () =>
          channelMutationEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
            ref.resourceId,
          ),
        execute: async () =>
          await deleteAxonHubChannel(
            config,
            ref.resourceId,
            requestOptions(operationOptions),
          ),
        rejectResponse: (deleted) => {
          if (deleted) return undefined
          const failure = createControlledNativeFailure(
            "upstream_rejected",
            "after",
          )
          return new AxonHubNativeError(failure)
        },
        convergeFailure: (failure) =>
          failure.code === "not_found" ? { data: false } : undefined,
      })
      if (deleteStep.outcome !== "applied") {
        return finishAxonHubNativeMutation(sequence, deleteStep)
      }

      return sequence.finish({ finalState: "confirmed", data: undefined })
    },
  }
}

const searchableValues = (channel: AxonHubChannel) => [
  channel.id,
  channel.name,
  String(channel.type),
  channel.baseURL ?? "",
  String(channel.status),
  ...(channel.supportedModels ?? []),
  ...(channel.manualModels ?? []),
  ...(channel.tags ?? []),
]
