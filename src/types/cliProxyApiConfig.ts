/** Connection to a CLIProxyAPI management deployment. */
export interface CliProxyApiConfig {
  baseUrl: string
  adminToken: string
}

export const DEFAULT_CLI_PROXY_API_CONFIG: CliProxyApiConfig = {
  baseUrl: "",
  adminToken: "",
}

/** Normalize a management API URL to the deployment root used by managed-site navigation. */
export function normalizeCliProxyApiDeploymentUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return value.trim()
    url.pathname = url.pathname
      .replace(/\/+$/, "")
      .replace(/\/v0\/management$/, "")
      .replace(/\/management\.html$/, "")
    url.search = ""
    url.hash = ""
    return url.href.replace(/\/+$/, "")
  } catch {
    return value.trim()
  }
}
