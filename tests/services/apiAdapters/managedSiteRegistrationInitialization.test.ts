import { describe, expect, it, vi } from "vitest"

import { MANAGED_SITE_TYPES } from "~/constants/siteType"

const providerEntries = [
  {
    name: "AxonHub",
    load: () => import("~/services/apiAdapters/managedSites/axonHub"),
  },
  {
    name: "Sub2API",
    load: () => import("~/services/apiAdapters/managedSites/sub2api"),
  },
  {
    name: "Claude Code Hub",
    load: () => import("~/services/apiAdapters/managedSites/claudeCodeHub"),
  },
  {
    name: "New API",
    load: () => import("~/services/apiAdapters/managedSites/newApi"),
  },
  {
    name: "DoneHub",
    load: () => import("~/services/apiAdapters/managedSites/doneHub"),
  },
  {
    name: "Veloera",
    load: () => import("~/services/apiAdapters/managedSites/veloera"),
  },
  {
    name: "Octopus",
    load: () => import("~/services/apiAdapters/managedSites/octopus"),
  },
]

describe("managed-site registration initialization", () => {
  it.each(providerEntries)(
    "retains every registration when $name is imported first",
    async ({ load }) => {
      vi.resetModules()
      await load()
      const { getManagedSiteCapabilities, getSiteTypeCapabilities } =
        await import("~/services/apiAdapters/registry")
      for (const siteType of MANAGED_SITE_TYPES) {
        const capabilities = getManagedSiteCapabilities(siteType)
        expect(capabilities.siteType).toBe(siteType)
        expect(capabilities.matching?.search).toBeTypeOf("function")
        expect(getSiteTypeCapabilities(siteType).managedSites).toBe(
          capabilities,
        )
      }
    },
  )
})
