import { MANAGED_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"

const createAttributionTails = new Map<string, Promise<void>>()

const withSerializedCreateAttribution = async <T>(
  attributionKey: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const previous = createAttributionTails.get(attributionKey)
  const current = (previous ?? Promise.resolve()).then(operation, operation)
  const tail = current.then(
    () => undefined,
    () => undefined,
  )
  createAttributionTails.set(attributionKey, tail)
  try {
    return await current
  } finally {
    if (createAttributionTails.get(attributionKey) === tail) {
      createAttributionTails.delete(attributionKey)
    }
  }
}

const unresolvedCreatedIdentity = <T>(
  result: Extract<
    ManagedSiteMutationResult<unknown>,
    { outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Succeeded }
  >,
): ManagedSiteMutationResult<T> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
  confirmedEffects: result.confirmedEffects as readonly [
    (typeof result.confirmedEffects)[number],
    ...(typeof result.confirmedEffects)[number][],
  ],
  completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
  diagnostic: {
    code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    message: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
  },
})

/** Attributes one create response that omitted its new resource identity. */
export async function attributeCreatedNativeResource<T>(input: {
  attributionKey: string
  listInventory(): Promise<readonly T[]>
  create(): Promise<ManagedSiteMutationResult<unknown>>
  identity(item: T): string | number
}): Promise<ManagedSiteMutationResult<T>> {
  return await withSerializedCreateAttribution(
    input.attributionKey,
    async () => {
      const before = await input.listInventory()
      const existingIds = new Set(before.map(input.identity))
      const result = await input.create()
      if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Rejected) {
        return result
      }
      if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Uncertain) {
        return result
      }
      if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
        const { data: _data, ...withoutUnknownData } = result
        return withoutUnknownData
      }
      try {
        const after = await input.listInventory()
        const created = after.filter(
          (item) => !existingIds.has(input.identity(item)),
        )
        return created.length === 1
          ? { ...result, data: created[0] }
          : unresolvedCreatedIdentity<T>(result)
      } catch {
        return unresolvedCreatedIdentity<T>(result)
      }
    },
  )
}
