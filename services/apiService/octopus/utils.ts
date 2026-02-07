/**
 * Octopus API 工具函数
 */

/**
 * 构建 Octopus 认证头
 */
export function buildOctopusAuthHeaders(
  jwtToken: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${jwtToken}`,
    "Content-Type": "application/json",
  }
}

/**
 * 规范化 Base URL（移除尾部斜杠）
 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "")
}

/**
 * 解析逗号分隔的字符串为数组
 */
export function parseCommaSeparated(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 将数组转换为逗号分隔的字符串
 */
export function toCommaSeparated(values: string[]): string {
  return values.filter(Boolean).join(",")
}
