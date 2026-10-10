export interface RealSiteUpstream {
  baseUrl: string
  apiKey: string
}

export function resolveRealSiteUpstream(
  env?: Record<string, string | undefined>,
): {
  config: RealSiteUpstream | null
  missingEnvKeys: string[]
}
