import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteServiceForType } from "~/services/managedSites/managedSiteService"

describe("managed site service facade", () => {
  it("exposes managed-site query capabilities on typed services", async () => {
    const service = getManagedSiteServiceForType(SITE_TYPES.AXON_HUB)

    await expect(
      service.fetchSiteUserGroups({
        baseUrl: "https://managed.example.invalid",
        email: "admin@example.invalid",
        password: "password",
      }),
    ).resolves.toEqual([])
    await expect(
      service.fetchAccountAvailableModels({
        baseUrl: "https://managed.example.invalid",
        email: "admin@example.invalid",
        password: "password",
      }),
    ).resolves.toEqual([])
  })
})
