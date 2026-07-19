import type {
  KiloCodeDefaultModelSelection,
  PreparedKiloCodeV7Catalog,
} from "~/services/integrations/kiloCodeV7Catalog"

/** Keep a valid default selection or repair it against the prepared catalog. */
export function reconcileKiloCodeV7DefaultSelection(
  catalog: PreparedKiloCodeV7Catalog,
  current?: KiloCodeDefaultModelSelection,
): KiloCodeDefaultModelSelection | undefined {
  const currentProvider = catalog.providers.find(
    (provider) => provider.selectionId === current?.selectionId,
  )

  if (current && currentProvider?.modelIds.includes(current.modelId)) {
    return current
  }

  const provider = currentProvider ?? catalog.providers[0]
  const modelId = provider?.modelIds[0]

  return provider && modelId
    ? { selectionId: provider.selectionId, modelId }
    : undefined
}
