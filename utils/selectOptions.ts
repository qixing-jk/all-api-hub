import type { MultiSelectOption } from "~/components/ui/MultiSelect"
import type { ChannelGroup, ChannelModel } from "~/types/newapi"

export interface SelectOption {
  label: string
  value: string
}

export function toSelectOptions(values: string[]): SelectOption[] {
  return values.map((value) => ({ label: value, value }))
}

export function groupsToOptions(groups: ChannelGroup[]): MultiSelectOption[] {
  return groups.map((group) => ({ label: group.name, value: group.id }))
}

export function modelsToOptions(models: ChannelModel[]): MultiSelectOption[] {
  return models.map((model) => ({ label: model.name, value: model.id }))
}

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
