import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const outputDir = resolve(process.argv[2] ?? ".output/chrome-mv3")
const pages = ["options.html", "popup.html", "sidepanel.html"]
const requiredUtilities = [".flex{", ".grid{", ".hidden{"]

for (const page of pages) {
  const html = readFileSync(resolve(outputDir, page), "utf8")
  const stylesheets = [
    ...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gu),
  ].map((match) => match[1])
  assert.ok(stylesheets.length > 0, `${page} has no stylesheet`)

  const css = stylesheets
    .map((href) =>
      readFileSync(resolve(outputDir, href.replace(/^\//u, "")), "utf8"),
    )
    .join("\n")

  for (const utility of requiredUtilities) {
    assert.ok(
      css.includes(utility),
      `${page} is missing Tailwind utility ${utility}`,
    )
  }
  assert.ok(
    !css.includes("@tailwind utilities"),
    `${page} contains unprocessed Tailwind CSS`,
  )
}

console.log("Verified Tailwind layout utilities in all extension pages")
