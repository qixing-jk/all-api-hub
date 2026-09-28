import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * `wxt.config.ts` imports these modules by relative path, so they are evaluated
 * by jiti before the bundler resolves the `~/` alias. A `~/` import inside one
 * of them fails `pnpm dev` and `pnpm build` while unit tests and `tsc` stay
 * green — which is how `identifiers.ts` broke on 2026-09-28.
 *
 * Only the modules the config reaches directly are checked; a relative import
 * chain that later uses an alias is not covered here.
 */
const CONFIG_LOADED_MODULES = [
  "src/constants/branding.ts",
  "src/constants/i18n.ts",
  "src/services/accountSiteDefinitions/identifiers.ts",
] as const

const IMPORT_SPECIFIER_PATTERN =
  /^\s*(?:import|export)\b[^'"]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm

describe("modules loaded by the wxt config", () => {
  it.each(CONFIG_LOADED_MODULES)("%s resolves without aliases", (path) => {
    const source = readFileSync(
      new URL(`../../../${path}`, import.meta.url),
      "utf8",
    )
    const specifiers = [...source.matchAll(IMPORT_SPECIFIER_PATTERN)]
      .map((match) => match[1] ?? match[2])
      .filter((specifier): specifier is string => Boolean(specifier))

    expect(specifiers.filter((specifier) => specifier.startsWith("~"))).toEqual(
      [],
    )
  })
})
