import { describe, expect, it } from "vitest"

import type { MultiSelectOption } from "~/components/ui/MultiSelect"
import type { ChannelGroup, ChannelModel } from "~/types/newapi"
import {
  groupsToOptions,
  mergeUniqueOptions,
  modelsToOptions,
  toSelectOptions,
} from "~/utils/selectOptions"

describe("selectOptions", () => {
  describe("toSelectOptions", () => {
    it("converts string array to select options", () => {
      const result = toSelectOptions(["a", "b", "c"])
      expect(result).toEqual([
        { label: "a", value: "a" },
        { label: "b", value: "b" },
        { label: "c", value: "c" },
      ])
    })

    it("handles empty array", () => {
      expect(toSelectOptions([])).toEqual([])
    })
  })

  describe("groupsToOptions", () => {
    it("converts channel groups to options", () => {
      const groups: ChannelGroup[] = [
        { id: "1", name: "Group A" },
        { id: "2", name: "Group B" },
      ]
      const result = groupsToOptions(groups)
      expect(result).toEqual([
        { label: "Group A", value: "1" },
        { label: "Group B", value: "2" },
      ])
    })

    it("handles empty groups", () => {
      expect(groupsToOptions([])).toEqual([])
    })
  })

  describe("modelsToOptions", () => {
    it("converts channel models to options", () => {
      const models: ChannelModel[] = [
        { id: "m1", name: "Model 1" },
        { id: "m2", name: "Model 2" },
      ]
      const result = modelsToOptions(models)
      expect(result).toEqual([
        { label: "Model 1", value: "m1" },
        { label: "Model 2", value: "m2" },
      ])
    })

    it("handles empty models", () => {
      expect(modelsToOptions([])).toEqual([])
    })
  })

  describe("mergeUniqueOptions", () => {
    it("merges multiple option lists", () => {
      const list1: MultiSelectOption[] = [
        { label: "A", value: "1" },
        { label: "B", value: "2" },
      ]
      const list2: MultiSelectOption[] = [
        { label: "C", value: "3" },
        { label: "D", value: "4" },
      ]
      const result = mergeUniqueOptions(list1, list2)
      expect(result).toHaveLength(4)
    })

    it("removes duplicates by value", () => {
      const list1: MultiSelectOption[] = [{ label: "A", value: "1" }]
      const list2: MultiSelectOption[] = [{ label: "A Duplicate", value: "1" }]
      const result = mergeUniqueOptions(list1, list2)
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("A")
    })

    it("handles empty lists", () => {
      expect(mergeUniqueOptions([], [])).toEqual([])
    })

    it("handles single list", () => {
      const list: MultiSelectOption[] = [{ label: "A", value: "1" }]
      expect(mergeUniqueOptions(list)).toEqual(list)
    })
  })
})
