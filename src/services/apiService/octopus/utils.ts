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
