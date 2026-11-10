import { parse } from "flatted"

const canonicalReference = /^(0|[1-9]\d*)$/

/**
 * Read coverage from the explicitly supported Vitest blob layouts.
 * 4.1 removed moduleGraph, moving coverage from index 4 to index 3; 5.0/5.1 retain it.
 * Unknown versions must not publish apparently complete coverage.
 * @param blob Decoded report.
 * @returns Coverage payload, or undefined for an unsupported layout.
 */
export function getVitestBlobCoverage(blob) {
  if (!Array.isArray(blob) || typeof blob[0] !== "string") return undefined
  if (/^4\.0\.\d+$/.test(blob[0])) return blob[4]
  if (/^(?:4\.1|5\.[01])\.\d+$/.test(blob[0])) return blob[3]
  return undefined
}

/**
 * Decode Vitest's flatted blob format without changing its report contents.
 *
 * Canonical flatted output stores objects and strings in a table; string values
 * inside each object are table indexes. Resolving those indexes after JSON.parse
 * avoids boxing every string and walking circular task graphs with a reviver.
 * See https://github.com/WebReflection/flatted#how-does-it-work.
 * Noncanonical input keeps the official parser's behavior, including its errors.
 * @param text Blob report text.
 * @returns Decoded report.
 */
export function parseVitestBlob(text) {
  const table = JSON.parse(text)
  if (!Array.isArray(table)) return parse(text)
  for (const item of table) {
    if (!item || typeof item !== "object") continue
    for (const key of Object.keys(item)) {
      const value = item[key]
      if (typeof value === "string") {
        const index = Number(value)
        if (
          !canonicalReference.test(value) ||
          index >= table.length ||
          table[index] === null
        ) {
          return parse(text)
        }
        item[key] = table[index]
      } else if (value !== null && typeof value === "object") {
        // Inline objects are not emitted by flatted.stringify.
        return parse(text)
      }
    }
  }
  return table[0]
}
