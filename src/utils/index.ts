import { isArray, mergeWith } from "lodash"

import { DeepPartial } from "~/types/utils"

/**
 * Type guard that verifies an array is defined and contains at least one item.
 * Useful before rendering list components that require non-empty data.
 */
export function isNotEmptyArray<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0
}

/**
 * Checks if two arrays are equal by comparing the frequency of each element.
 * @template T
 * @param arr1 The first array to compare.
 * @param arr2 The second array to compare.
 * @returns If the two arrays are equal.
 */
export function isArraysEqual<T>(arr1: T[], arr2: T[]) {
  if (arr1.length !== arr2.length) return false

  const count = new Map()

  // 统计 arr1 中每个元素出现的次数
  for (const item of arr1) {
    count.set(item, (count.get(item) || 0) + 1)
  }

  // 减去 arr2 中每个元素的次数
  for (const item of arr2) {
    if (!count.has(item)) return false
    count.set(item, count.get(item) - 1)
    if (count.get(item) < 0) return false
  }

  return true
}

/**
 * Compares two sets of strings for equality.
 * @param a First set to compare.
 * @param b Second set to compare.
 * @returns True if both sets contain the same elements.
 */
export function isSameStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

/**
 * Deeply merges configuration objects but replaces arrays instead of merging them.
 * @param target Base configuration object.
 * @param sources Additional overrides preserving nested object merges.
 * @returns Consolidated object with deterministic array semantics.
 */
export function deepOverride<T extends Record<string, any>>(
  target: T,
  ...sources: Array<DeepPartial<T> | null | undefined>
): T {
  return mergeWith({}, target, ...sources, (_objValue: any, srcValue: any) => {
    // 数组：完全替换
    if (isArray(srcValue)) {
      return srcValue
    }
    // 对象：继续深度合并（默认行为）
    // 基本类型：替换（默认行为）
  })
}
