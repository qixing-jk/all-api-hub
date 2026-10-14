import { expect, it } from "vitest"

import { makeMagpieProcessEnv } from "~~/scripts/suites/magpie/backend.mjs"

it("isolates the CLI home as well as XDG directories without modifying the parent environment", () => {
  const parent = {
    USERPROFILE: "real-home",
    XDG_CONFIG_HOME: "real-config",
    KEEP: "value",
    MAGPIE_WEB_KEY: "operator-key",
    CODEX_HOME: "operator-codex-home",
    CLAUDE_CONFIG_DIR: "operator-claude-home",
  }
  const child = makeMagpieProcessEnv(parent, "fixture-root", "disposable-key")
  expect(child.USERPROFILE).toBe("fixture-root")
  expect(child.XDG_CONFIG_HOME).not.toBe(parent.XDG_CONFIG_HOME)
  expect(child.XDG_DATA_HOME).toContain("fixture-root")
  expect(child.XDG_CACHE_HOME).toContain("fixture-root")
  expect(child.MAGPIE_WEB_KEY).toBe("disposable-key")
  expect(child.KEEP).toBe("value")
  expect(child).not.toHaveProperty("CODEX_HOME")
  expect(child).not.toHaveProperty("CLAUDE_CONFIG_DIR")
  expect(parent.CODEX_HOME).toBe("operator-codex-home")
  expect(parent.CLAUDE_CONFIG_DIR).toBe("operator-claude-home")
  expect(parent.USERPROFILE).toBe("real-home")
})
