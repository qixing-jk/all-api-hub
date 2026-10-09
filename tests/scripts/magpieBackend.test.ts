import { expect, it } from "vitest"

import { makeMagpieProcessEnv } from "~~/scripts/suites/magpie/backend.mjs"

it("isolates the CLI home as well as XDG directories without modifying the parent environment", () => {
  const parent = {
    USERPROFILE: "real-home",
    XDG_CONFIG_HOME: "real-config",
    KEEP: "value",
    MAGPIE_WEB_KEY: "operator-key",
  }
  const child = makeMagpieProcessEnv(parent, "fixture-root", "disposable-key")
  expect(child.USERPROFILE).toBe("fixture-root")
  expect(child.XDG_CONFIG_HOME).not.toBe(parent.XDG_CONFIG_HOME)
  expect(child.XDG_DATA_HOME).toContain("fixture-root")
  expect(child.XDG_CACHE_HOME).toContain("fixture-root")
  expect(child.MAGPIE_WEB_KEY).toBe("disposable-key")
  expect(child.KEEP).toBe("value")
  expect(parent.USERPROFILE).toBe("real-home")
})
