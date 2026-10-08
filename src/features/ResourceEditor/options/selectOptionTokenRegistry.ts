export type SelectOptionTokenRegistry = {
  nextToken: number
  nullToken: string
  tokenByResourceValue: Map<string, string>
  resourceValueByToken: Map<string, string>
}

export const createSelectOptionTokenRegistry =
  (): SelectOptionTokenRegistry => ({
    nextToken: 0,
    nullToken: "resource-editor-select-null",
    tokenByResourceValue: new Map(),
    resourceValueByToken: new Map(),
  })

/** Keeps opaque select tokens alive only for values the current render can select. */
export const reconcileSelectOptionTokenRegistry = (
  registry: SelectOptionTokenRegistry,
  activeResourceValues: readonly string[],
) => {
  const activeValues = new Set(activeResourceValues)
  for (const [resourceValue, token] of registry.tokenByResourceValue) {
    if (activeValues.has(resourceValue)) continue
    registry.tokenByResourceValue.delete(resourceValue)
    registry.resourceValueByToken.delete(token)
  }
  for (const [token, resourceValue] of registry.resourceValueByToken) {
    if (
      activeValues.has(resourceValue) &&
      registry.tokenByResourceValue.get(resourceValue) === token
    )
      continue
    registry.resourceValueByToken.delete(token)
  }
}

const cloneSelectOptionTokenRegistry = (
  registry: SelectOptionTokenRegistry | undefined,
  nextToken = 0,
): SelectOptionTokenRegistry =>
  registry
    ? {
        nextToken: registry.nextToken,
        nullToken: registry.nullToken,
        tokenByResourceValue: new Map(registry.tokenByResourceValue),
        resourceValueByToken: new Map(registry.resourceValueByToken),
      }
    : { ...createSelectOptionTokenRegistry(), nextToken }

/** Issues opaque select tokens without retaining values outside the active snapshot. */
export const createSelectOptionTokenSnapshot = (
  registry: SelectOptionTokenRegistry | undefined,
  resourceValues: readonly string[],
  nextToken?: number,
) => {
  const next = cloneSelectOptionTokenRegistry(registry, nextToken)
  reconcileSelectOptionTokenRegistry(next, resourceValues)
  for (const resourceValue of resourceValues) {
    if (next.tokenByResourceValue.has(resourceValue)) continue
    const token = `resource-editor-select-option-${next.nextToken++}`
    next.tokenByResourceValue.set(resourceValue, token)
    next.resourceValueByToken.set(token, resourceValue)
  }
  return next
}
