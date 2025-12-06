import type { MultiSelectOption } from "~/components/ui/MultiSelect"
import type { ChannelGroup, ChannelModel } from "~/types/newapi"

export interface SelectOption {
  label: string
  value: string
}

/**
 * Converts raw string values into select option objects with label/value pairs.
 * @param values Raw option values.
 * @returns Options consumable by Select/MultiSelect components.
 */
export function toSelectOptions(values: string[]): SelectOption[] {
  return values.map((value) => ({ label: value, value }))
}

/**
 * Maps channel group models to MultiSelect options.
 * @param groups Available channel groups.
 * @returns Options for multi-select inputs.
 */
export function groupsToOptions(groups: ChannelGroup[]): MultiSelectOption[] {
  return groups.map((group) => ({ label: group.name, value: group.id }))
}

/**
 * Maps channel model metadata to MultiSelect options.
 * @param models Channel models from upstream.
 * @returns Options for model selection.
 */
export function modelsToOptions(models: ChannelModel[]): MultiSelectOption[] {
  return models.map((model) => ({ label: model.name, value: model.id }))
}

/**
 * Merge multiple option lists while keeping unique values (by value field).
 * Later lists do not override earlier ones.
 */
export function mergeUniqueOptions(
  ...lists: Array<MultiSelectOption[]>
): MultiSelectOption[] {
  const map = new Map<string, MultiSelectOption>()
  for (const list of lists) {
    for (const option of list) {
      if (!map.has(option.value)) {
        map.set(option.value, option)
      }
    }
  }
  return Array.from(map.values())
}
