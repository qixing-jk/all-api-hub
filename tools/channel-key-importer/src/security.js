const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"])

export function normalizeTargetUrl(value, { allowInsecureHttp = false } = {}) {
  let url
  try {
    url = new URL(String(value || "").trim())
  } catch {
    throw new Error("请输入完整的 New API 地址")
  }

  if (url.username || url.password) {
    throw new Error("目标地址不能包含用户名或密码")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("目标地址只支持 HTTPS")
  }
  // Legacy self-hosted New API deployments may expose only HTTP. Permit this
  // only after an explicit per-target opt-in from the local UI.
  if (
    url.protocol === "http:" &&
    !LOOPBACK_HOSTS.has(url.hostname) &&
    !allowInsecureHttp
  ) {
    throw new Error("公网 New API 必须使用 HTTPS；HTTP 仅允许本机地址")
  }
  if (url.search || url.hash) {
    throw new Error("目标地址不能包含查询参数或锚点")
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/"
  return url.toString().replace(/\/$/, "")
}

export function validateUserId(value) {
  const userId = String(value || "").trim()
  if (!/^\d+$/.test(userId) || Number(userId) <= 0) {
    throw new Error("请输入有效的管理员用户 ID")
  }
  return userId
}

export function isAllowedHostHeader(hostHeader, port) {
  if (!hostHeader) return false
  const allowed = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ])
  return allowed.has(hostHeader.toLowerCase())
}

export function isAllowedOrigin(origin, port) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return (
      url.protocol === "http:" &&
      LOOPBACK_HOSTS.has(url.hostname) &&
      url.port === String(port)
    )
  } catch {
    return false
  }
}

export function isAllowedApiRequestOrigin(method, origin, port) {
  const readOnly = method === "GET" || method === "HEAD"
  if (readOnly && !origin) return true
  return isAllowedOrigin(origin, port)
}

export function maskTargetUrl(value) {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}`
  } catch {
    return ""
  }
}
