import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const contractsDir = join(
  process.cwd(),
  "src",
  "services",
  "apiAdapters",
  "contracts",
)

const readContractSources = () =>
  readdirSync(contractsDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({
      file,
      source: readFileSync(join(contractsDir, file), "utf8"),
    }))

describe("api adapter import guardrails", () => {
  it("keeps adapter contracts off legacy common type ownership", () => {
    for (const { file, source } of readContractSources()) {
      expect(source, file).not.toContain("~/services/apiService/common/type")
    }
  })
})
