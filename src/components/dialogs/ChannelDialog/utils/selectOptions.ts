import type { CompactMultiSelectOption } from "~/components/ui"

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
