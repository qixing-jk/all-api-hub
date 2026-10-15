import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Public order from the 2026-10-15 upstream-star snapshot in site-integrations.md.
const architectures = [
  "New API",
  "Sub2API",
  "One API",
  "one-hub",
  "Veloera",
  "VoAPI / VoAPI v2",
  "DoneHub",
  "Super-API",
]
const gateways = [
  "OmniRoute",
  "CLIProxyAPI",
  "New API",
  "Sub2API",
  "Magpie",
  "gpt-load",
  "AxonHub",
  "Claude Code Hub",
  "Octopus",
  "Veloera",
  "DoneHub",
]
const editors = ["CC Switch", "Kilo Code", "Roo Code", "AI Toolbox", "Cursor++"]
const exports = [
  "CC Switch",
  "Cherry Studio",
  "Claude Code Router",
  "Kilo Code",
  "Roo Code",
  "Kelivo",
  "AI Toolbox",
  "Cursor++",
]
const read = (file: string) => readFileSync(resolve(file), "utf8")

/** Read rendered name cells, including names linked to integration guides. */
function tables(markdown: string): string[][] {
  return markdown
    .split(/\r?\n\s*\r?\n/)
    .filter((block) => block.startsWith("|"))
    .map((block) =>
      block
        .split(/\r?\n/)
        .slice(2)
        .map(
          (line) =>
            line
              .split("|")[1]
              ?.trim()
              .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") ?? "",
        ),
    )
}

describe.each(["", "en/", "ja/"])("public catalog order (%s)", (locale) => {
  it("ranks comparable account architectures before entries without a repository", () => {
    const table = tables(read(`docs/docs/${locale}supported-sites.md`)).find(
      (names) => names.includes("One API"),
    )
    expect(table?.slice(0, architectures.length)).toEqual(architectures)
  })

  it.each(["supported-sites.md", "supported-export-tools.md"])(
    "keeps every managed gateway in popularity order in %s",
    (page) => {
      const table = tables(read(`docs/docs/${locale}${page}`)).find((names) =>
        names.includes("OmniRoute"),
      )
      expect(table).toEqual(gateways)
    },
  )

  it("ranks editor tools before the tool without a comparable repository", () => {
    const table = tables(
      read(`docs/docs/${locale}supported-export-tools.md`),
    ).find((names) => names.includes("Kilo Code"))
    expect(table).toEqual(editors)
  })
})

it.each(["README.md", "README_CN.md", "README_JA.md"])(
  "keeps the same popularity order in %s",
  (file) => {
    const lines = read(file).split(/\r?\n/)
    for (const expected of [architectures, gateways, exports]) {
      const matching = lines.filter(
        (text) =>
          text.startsWith("- **") &&
          expected.every((name) => text.includes(name)),
      )
      expect(matching.length).toBeGreaterThan(0)
      for (const line of matching) {
        const positions = expected.map((name) => line.indexOf(name))
        expect(positions).toEqual([...positions].sort((a, b) => a - b))
      }
    }
  },
)
