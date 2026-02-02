import type { CompactMultiSelectOption } from "~/components/ui"
import type { ChannelGroup, ChannelModel } from "~/types/managedSite"

export interface SelectOption {
  label: string
  value: string
}

/**
 * Converts raw string values into select option objects with label/value pairs.
 * @param values Raw option values.
 * @returns Options consumable by select and compact multi-select components.
 */
export function toSelectOptions(values: string[]): SelectOption[] {
  return values.map((value) => ({ label: value, value }))
}

/**
 * Maps channel group models to multi-select options.
 * @param groups Available channel groups.
 * @returns Options for multi-select inputs.
 */
export function groupsToOptions(
  groups: ChannelGroup[],
): CompactMultiSelectOption[] {
  return groups.map((group) => ({ label: group.name, value: group.id }))
}

/**
 * Maps channel model metadata to multi-select options.
 * @param models Channel models from upstream.
 * @returns Options for model selection.
 */
export function modelsToOptions(models: ChannelModel[]): CompactMultiSelectOption[] {
  return models.map((model) => ({ label: model.name, value: model.id }))
}

/**
 * Merge multiple option lists while keeping unique values (by value field).
 * Later lists do not override earlier ones.
 */
export function mergeUniqueOptions(
  ...lists: Array<CompactMultiSelectOption[]>
): CompactMultiSelectOption[] {
  const map = new Map<string, CompactMultiSelectOption>()
  for (const list of lists) {
    for (const option of list) {
      if (!map.has(option.value)) {
        map.set(option.value, option)
      }
    }
  }
  return Array.from(map.values())
}
