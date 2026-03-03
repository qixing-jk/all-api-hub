/**
 * 字符串处理工具函数
 */

/**
 * 解析逗号分隔的字符串为数组
 * @param value - 逗号分隔的字符串
 * @returns 去除空白后的字符串数组
 */
export function parseDelimitedList(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 规范化字符串数组（去重、去空、trim）
 * @param values - 字符串数组
 * @returns 规范化后的数组
 */
export function normalizeList(values: string[] = []): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))
}
