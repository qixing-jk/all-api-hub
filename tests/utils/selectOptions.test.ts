import { describe, expect, it } from "vitest"

import {
  mergeUniqueOptions,
  toSelectOptions,
} from "~/components/dialogs/ChannelDialog/utils/selectOptions"
import type { CompactMultiSelectOption } from "~/components/ui"

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

  describe("mergeUniqueOptions", () => {
    it("merges multiple option lists", () => {
      const list1: CompactMultiSelectOption[] = [
        { label: "A", value: "1" },
        { label: "B", value: "2" },
      ]
      const list2: CompactMultiSelectOption[] = [
        { label: "C", value: "3" },
        { label: "D", value: "4" },
      ]
      const result = mergeUniqueOptions(list1, list2)
      expect(result).toHaveLength(4)
    })

    it("removes duplicates by value", () => {
      const list1: CompactMultiSelectOption[] = [{ label: "A", value: "1" }]
      const list2: CompactMultiSelectOption[] = [
        { label: "A Duplicate", value: "1" },
      ]
      const result = mergeUniqueOptions(list1, list2)
      expect(result).toHaveLength(1)
      expect(result[0].label).toBe("A")
    })

    it("handles empty lists", () => {
      expect(mergeUniqueOptions([], [])).toEqual([])
    })

    it("handles single list", () => {
      const list: CompactMultiSelectOption[] = [{ label: "A", value: "1" }]
      expect(mergeUniqueOptions(list)).toEqual(list)
    })
  })
})
