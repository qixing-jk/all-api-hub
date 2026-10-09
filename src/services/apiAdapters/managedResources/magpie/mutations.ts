import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { MagpieProviderCommand } from "~/services/apiAdapters/managedResources/magpie/editorProjection"
import {
  applyMagpieKeyPool,
  prepareMagpieKeyPool,
} from "~/services/apiAdapters/managedResources/magpie/keyPoolMutations"
import {
  getMagpieProvider,
  requireMagpieApiProvider,
} from "~/services/apiAdapters/managedResources/magpie/nativeRuntime"
import { magpieKeyFingerprint } from "~/services/apiService/magpie/keyIdentity"
import {
  deleteMagpieProvider,
  saveMagpieProvider,
  setMagpieProviderEnabled,
  type MagpieProvider,
} from "~/services/apiService/magpie/providers"
import { buildMagpieProviderSavePayload } from "~/services/apiService/magpie/providerUpdate"
import {
  MagpieApiError,
  type MagpieRequestOptions,
} from "~/services/apiService/magpie/request"
import type { ManagedSiteMutationConfirmedEffect } from "~/services/managedSites/mutations/contracts"
import { createManagedSiteMutationSequence } from "~/services/managedSites/mutations/execution"
import type { MagpieConfig } from "~/types/magpieConfig"

/** Retain confirmed steps when a later native action fails or loses its response. */
async function mutate<T>(
  run: (
    step: <V>(
      effect: ManagedSiteMutationConfirmedEffect,
      execute: () => Promise<V>,
    ) => Promise<V>,
  ) => Promise<T>,
) {
  const sequence = createManagedSiteMutationSequence({ idempotent: false })
  try {
    const data = await run(async (effect, execute) => {
      const attempt = sequence.beginStep()
      try {
        const value = await execute()
        attempt.markPossiblyDispatched()
        attempt.markResponseReceived()
        attempt.confirmEffect(effect)
        return value
      } catch (error) {
        if (error instanceof MagpieApiError) {
          if (error.dispatched) attempt.markPossiblyDispatched()
          if (error.dispatched && error.status !== undefined)
            attempt.markResponseReceived()
          if (error.dispatched && error.confirmedNonApplication)
            attempt.confirmNonApplication()
        }
        throw error
      } finally {
        attempt.complete()
      }
    })
    return sequence.finish({ finalState: "confirmed", data })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return sequence.finish({
        finalState: "unconfirmed",
        diagnostic: { message: "Magpie operation aborted before dispatch" },
      })
    }
    if (!(error instanceof MagpieApiError)) throw error
    return sequence.finish({
      finalState: "unconfirmed",
      diagnostic: {
        message: error.message,
        ...(error.status === undefined ? {} : { statusCode: error.status }),
      },
    })
  }
}

const effect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId: string,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: "channel",
  resourceId,
})
const saved = (items: MagpieProvider[], id: string, enabled?: boolean) => {
  const provider = items.find((item) => item.id === id)
  if (!provider || (enabled !== undefined && provider.off === enabled))
    throw new MagpieApiError(
      "Magpie write could not be confirmed",
      200,
      true,
      false,
    )
  return provider
}

/** Create a unique provider, apply its key pool, then set its requested status. */
export async function createMagpieResource(
  config: MagpieConfig,
  command: MagpieProviderCommand,
  options?: MagpieRequestOptions,
) {
  const id = `aah-${crypto.randomUUID()}`
  if (command.keyPool?.update.length || command.keyPool?.remove.length)
    throw new ManagedResourceError({ code: "validation_failed" })
  const operations = command.keyPool
    ? await prepareMagpieKeyPool(
        {
          id,
          keyList: [
            {
              id: await magpieKeyFingerprint(String(command.fields.key ?? "")),
              masked: "",
              active: true,
              on: true,
            },
          ],
        },
        command.keyPool,
      )
    : []
  return mutate(async (step) => {
    let provider = await step(effect("resource-created", id), async () =>
      saved(
        await saveMagpieProvider(
          config,
          { ...command.fields, id, new: true },
          options,
        ),
        id,
      ),
    )
    provider = await applyMagpieKeyPool(
      config,
      provider,
      operations,
      (run) => step(effect("resource-updated", id), run),
      options,
    )
    if (command.enabled === false)
      provider = await step(effect("status-updated", id), async () =>
        saved(
          await setMagpieProviderEnabled(config, id, false, options),
          id,
          false,
        ),
      )
    return provider
  })
}

/** Read fresh before replacement-like saves, preserving fields outside this edit. */
export async function updateMagpieResource(
  config: MagpieConfig,
  detail: MagpieProvider,
  command: MagpieProviderCommand,
  options?: MagpieRequestOptions,
) {
  const current = requireMagpieApiProvider(
    await getMagpieProvider(config, detail.id, options),
  )
  if (
    command.primaryKeyRef &&
    current.keyList?.find((key) => key.active)?.id !== command.primaryKeyRef
  )
    throw new ManagedResourceError({ code: "resource_changed" })
  const replacement =
    typeof command.fields.key === "string"
      ? await magpieKeyFingerprint(command.fields.key)
      : undefined
  if (
    replacement &&
    current.keyList?.some((key) => key.id === replacement && !key.active)
  )
    throw new ManagedResourceError({ code: "validation_failed" })
  const operations = await prepareMagpieKeyPool(
    current,
    command.keyPool,
    replacement,
  )
  if (
    !Object.keys(command.fields).length &&
    !operations.length &&
    (command.enabled === undefined || command.enabled !== current.off)
  )
    return createManagedSiteMutationSequence({ idempotent: true }).finish({
      finalState: "confirmed",
      data: current,
    })
  return mutate(async (step) => {
    let provider = current
    if (Object.keys(command.fields).length)
      provider = await step(effect("resource-updated", current.id), async () =>
        saved(
          await saveMagpieProvider(
            config,
            buildMagpieProviderSavePayload(current, command.fields),
            options,
          ),
          current.id,
        ),
      )
    provider = await applyMagpieKeyPool(
      config,
      provider,
      operations,
      (run) => step(effect("resource-updated", current.id), run),
      options,
    )
    if (command.enabled !== undefined && command.enabled === provider.off)
      provider = await step(effect("status-updated", current.id), async () =>
        saved(
          await setMagpieProviderEnabled(
            config,
            current.id,
            command.enabled!,
            options,
          ),
          current.id,
          command.enabled,
        ),
      )
    return provider
  })
}

/** Confirm disappearance; never remove resources merely related to the selected id. */
export async function deleteMagpieResource(
  config: MagpieConfig,
  id: string,
  options?: MagpieRequestOptions,
) {
  requireMagpieApiProvider(await getMagpieProvider(config, id, options))
  return mutate(async (step) =>
    step(effect("resource-deleted", id), async () => {
      const remaining = await deleteMagpieProvider(config, id, options)
      if (remaining.some((item) => item.id === id))
        throw new MagpieApiError(
          "Magpie deletion could not be confirmed",
          200,
          true,
          false,
        )
    }),
  )
}
