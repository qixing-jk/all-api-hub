import {
  MANAGED_RESOURCE_FAILURE_CODES,
  type ManagedResourceRef,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  toPrivateManagedSiteMutationOutput,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import type { collectManagedResourceSecrets } from "~/services/managedSites/utils/managedSite"

import {
  MANAGED_RESOURCE_EDITOR_MODES,
  type ManagedResourceEditorMode,
} from "../presentation/managedResourceFieldPolicy"

const resourceFailureCodes = new Set<string>(
  Object.values(MANAGED_RESOURCE_FAILURE_CODES),
)

export const projectManagedResourceMutationFailure = (
  result: ManagedSiteMutationResult<unknown>,
  secretCollection: ReturnType<typeof collectManagedResourceSecrets>,
  fallbackCode: ResourceFailure["code"],
): ResourceFailure => {
  if (!secretCollection.complete) return { code: fallbackCode }

  const output = toPrivateManagedSiteMutationOutput(result, {
    knownSecrets: secretCollection.knownSecrets,
  })
  const controlledCode =
    typeof output.code === "string" && resourceFailureCodes.has(output.code)
      ? (output.code as ResourceFailure["code"])
      : fallbackCode
  const trimmedMessage = output.message?.trim()
  const projectedMessage =
    trimmedMessage && !resourceFailureCodes.has(trimmedMessage)
      ? trimmedMessage
      : undefined
  return {
    code: controlledCode,
    ...(projectedMessage === undefined ? {} : { message: projectedMessage }),
    ...(typeof output.code === "string" &&
    !resourceFailureCodes.has(output.code)
      ? { upstreamCode: output.code }
      : {}),
  }
}

const effectMatchesRef = (
  effect: ManagedSiteMutationConfirmedEffect,
  ref: ManagedResourceRef,
) =>
  effect.resourceKind === ref.kind &&
  effect.resourceId !== undefined &&
  String(effect.resourceId) === ref.resourceId

const locallyAcceptedEffectKinds = {
  [MANAGED_RESOURCE_EDITOR_MODES.Create]: new Set<
    ManagedSiteMutationConfirmedEffect["kind"]
  >([
    MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
    MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
  ]),
  [MANAGED_RESOURCE_EDITOR_MODES.Edit]: new Set<
    ManagedSiteMutationConfirmedEffect["kind"]
  >([
    MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
    MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
    MANAGED_SITE_MUTATION_EFFECT_KINDS.ModelsUpdated,
    MANAGED_SITE_MUTATION_EFFECT_KINDS.ModelMappingUpdated,
  ]),
} as const

export const canAcceptMutationEffectsLocally = (
  mode: ManagedResourceEditorMode,
  ref: ManagedResourceRef,
  effects: readonly ManagedSiteMutationConfirmedEffect[],
) => {
  if (effects.length === 0) return false
  const allowedKinds = locallyAcceptedEffectKinds[mode]
  return (
    effects.every(
      (effect) =>
        allowedKinds.has(effect.kind) && effectMatchesRef(effect, ref),
    ) &&
    (mode !== MANAGED_RESOURCE_EDITOR_MODES.Create ||
      effects.some(
        ({ kind }) =>
          kind === MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
      ))
  )
}

export const canAcceptDeleteEffectsLocally = (
  ref: ManagedResourceRef,
  effects: readonly ManagedSiteMutationConfirmedEffect[],
) =>
  effects.length > 0 &&
  effects.every(
    (effect) =>
      effect.kind === MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted &&
      effectMatchesRef(effect, ref),
  )
