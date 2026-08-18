/**
 * Octopus API 工具函数
 */

/**
 * 构建 Octopus JSON 请求头；旧版服务端额外使用 Bearer JWT。
 */
export function buildOctopusAuthHeaders(
  jwtToken?: string,
): Record<string, string> {
  return {
    ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
    "Content-Type": "application/json",
  }
}
