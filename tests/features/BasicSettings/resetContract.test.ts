import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/** Every settings section must opt into the compile-time reset policy contract. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".tsx")
        ? [path]
        : []
  })
}

describe("Basic Settings reset contract", () => {
  it("does not bypass the required reset policy with the generic section", () => {
    const bypasses = sourceFiles(
      "src/features/BasicSettings/components/tabs",
    ).filter((path) =>
      readFileSync(path, "utf8").includes('from "~/components/SettingSection"'),
    )
    expect(bypasses).toEqual([])
  })
})
