export function isNotEmptyArray<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0
}

/**
 * Checks if two arrays are equal by comparing the frequency of each element.
 * @template T
 * @param {T[]} arr1 The first array to compare.
 * @param {T[]} arr2 The second array to compare.
 * @returns {boolean} If the two arrays are equal.
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
