import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { resolveManagedSiteModelRedirectCapabilities } from "~/services/models/modelRedirect/capabilities"

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))

describe("resolveManagedSiteModelRedirectCapabilities", () => {
  beforeEach(() => {
    vi.mocked(getSiteTypeCapabilities).mockReset()
  })

  it("returns the registered channel methods when both required operations exist", () => {
    const list = vi.fn()
    const updateModelMapping = vi.fn()
    vi.mocked(getSiteTypeCapabilities).mockReturnValue({
      managedSites: { channels: { list, updateModelMapping } },
    } as any)

    expect(
      resolveManagedSiteModelRedirectCapabilities(SITE_TYPES.NEW_API),
    ).toEqual({ supported: true, capabilities: { list, updateModelMapping } })
  })

  it.each([{ list: vi.fn() }, { updateModelMapping: vi.fn() }, {}])(
    "is unsupported when a required operation is absent",
    (channels) => {
      vi.mocked(getSiteTypeCapabilities).mockReturnValue({
        managedSites: { channels },
      } as any)

      expect(
        resolveManagedSiteModelRedirectCapabilities(SITE_TYPES.NEW_API),
      ).toEqual({ supported: false })
    },
  )
})
