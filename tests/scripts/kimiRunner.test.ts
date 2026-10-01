import { describe, expect, it } from "vitest"

import { parseArgs } from "~~/scripts/test-kimi-e2e-live.mjs"

describe("Kimi runner arguments", () => {
  it("honors the documented --site option", () => {
    expect(parseArgs(["--site=cn", "--suite=probe"])).toMatchObject({
      siteUrl: "https://platform.kimi.com",
      siteType: "kimi",
      suite: "probe",
    })
  })
  it.each(["--site=unknown", "--suite=unknown"])(
    "rejects invalid selection %s",
    (arg) => {
      expect(() => parseArgs([arg])).toThrow()
    },
  )
})
