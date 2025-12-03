import type {
  ExecutionItemResult,
  ExecutionResult,
} from "~/types/newApiModelSync"

/**
 * Collects every model mentioned in an execution result so it can be cached and
 * reused by the UI as the allow-list options. Prefers the freshly fetched
 * models, but falls back to the previous ones when a channel failed to sync.
 */
export function collectModelsFromExecution(
  result: ExecutionResult | null,
): string[] {
  if (!result || !Array.isArray(result.items) || result.items.length === 0) {
    return []
  }

  const collected = new Set<string>()

  for (const item of result.items) {
    addModelsFromItem(item, collected)
  }

  return Array.from(collected).sort((a, b) => a.localeCompare(b))
}

function addModelsFromItem(item: ExecutionItemResult, collected: Set<string>) {
  const sourceModels = item.newModels?.length
    ? item.newModels
    : item.oldModels ?? []

  for (const model of sourceModels) {
    const trimmed = model.trim()
    if (trimmed) {
      collected.add(trimmed)
    }
  }
}
