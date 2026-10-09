/** Inference credentials shared by managed-gateway tests, independent of accounts. */
export function resolveRealSiteUpstream(env = process.env) {
  const keys = ["AAH_E2E_UPSTREAM_BASE_URL", "AAH_E2E_UPSTREAM_API_KEY"]
  const missingEnvKeys = keys.filter((key) => !env[key]?.trim())
  if (missingEnvKeys.length) return { config: null, missingEnvKeys }

  const baseUrl = env.AAH_E2E_UPSTREAM_BASE_URL.trim().replace(/\/+$/, "")
  const parsed = URL.parse(baseUrl)
  if (
    !parsed ||
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      "AAH_E2E_UPSTREAM_BASE_URL must be an HTTP(S) URL without embedded credentials",
    )
  }
  return {
    config: { baseUrl, apiKey: env.AAH_E2E_UPSTREAM_API_KEY.trim() },
    missingEnvKeys,
  }
}
