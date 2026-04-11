/**
 * 字符串处理工具函数
 */

/**
 * Trim a maybe-string value and collapse blank inputs to `null`.
 * @param value - The raw value to normalize.
 * @returns The trimmed string, or `null` when the value is not a non-empty string.
 */
export function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * 解析逗号分隔的字符串为数组
 * @param value - 逗号分隔的字符串
 * @returns 去除空白后的字符串数组
 */
export function parseDelimitedList(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[,]/)
    .map((item) => trimToNull(item) ?? "")
    .filter(Boolean)
}

/**
 * 规范化字符串数组（去重、去空、trim）
 * @param values - 字符串数组
 * @returns 规范化后的数组
 */
export function normalizeList(values: string[] = []): string[] {
  return Array.from(
    new Set(values.map((item) => trimToNull(item) ?? "").filter(Boolean)),
  )
}
