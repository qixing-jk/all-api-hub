import { afterEach, expect, it, vi } from "vitest"

import { resolveMagpieManagedSiteConfig } from "~~/e2e/utils/realSite/managedSiteConfig"

afterEach(() => vi.unstubAllEnvs())

it("requires a Web key independently of any inference key", () => {
  vi.stubEnv("AAH_E2E_MAGPIE_BASE_URL", "http://gateway.test:3430")
  vi.stubEnv("AAH_E2E_MAGPIE_WEB_KEY", "")
  vi.stubEnv("AAH_E2E_MAGPIE_API_KEY", "inference-key")
  expect(resolveMagpieManagedSiteConfig()).toEqual({
    config: null,
    missingEnvKeys: ["AAH_E2E_MAGPIE_WEB_KEY"],
  })
})

it("preserves HTTP and reverse-proxy prefixes while trimming configuration", () => {
  vi.stubEnv("AAH_E2E_MAGPIE_BASE_URL", " http://gateway.test:3430/proxy ")
  vi.stubEnv("AAH_E2E_MAGPIE_WEB_KEY", " web-key ")
  expect(resolveMagpieManagedSiteConfig()).toEqual({
    config: { baseUrl: "http://gateway.test:3430/proxy", webKey: "web-key" },
    missingEnvKeys: [],
  })
})
