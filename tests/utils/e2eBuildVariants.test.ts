import { describe, expect, it } from "vitest"

import {
  E2E_BUILD_VARIANT_ENV,
  E2E_BUILD_VARIANTS,
  getE2eExtensionDirName,
  getE2eRequiredChromiumPermissions,
  readE2eBuildVariant,
} from "~~/e2e/utils/e2eBuildVariants"

describe("E2E build variants", () => {
  it("uses the default variant when the env value is missing", () => {
    expect(readE2eBuildVariant({})).toBe(E2E_BUILD_VARIANTS.Default)
  })

  it("uses a configured env variant", () => {
    expect(
      readE2eBuildVariant({
        [E2E_BUILD_VARIANT_ENV]: E2E_BUILD_VARIANTS.DnrRequired,
      }),
    ).toBe(E2E_BUILD_VARIANTS.DnrRequired)
  })

  it("rejects unsupported env variants", () => {
    expect(() =>
      readE2eBuildVariant({
        [E2E_BUILD_VARIANT_ENV]: "unknown",
      }),
    ).toThrow("Unsupported AAH_E2E_BUILD_VARIANT 'unknown'")
  })

  it("resolves variant-specific extension directories and permissions", () => {
    expect(getE2eExtensionDirName(E2E_BUILD_VARIANTS.DnrRequired)).toBe(
      "chrome-mv3-test-dnr-required",
    )
    expect(
      getE2eRequiredChromiumPermissions(E2E_BUILD_VARIANTS.DnrRequired),
    ).toEqual(["cookies", "declarativeNetRequestWithHostAccess"])
  })
})
