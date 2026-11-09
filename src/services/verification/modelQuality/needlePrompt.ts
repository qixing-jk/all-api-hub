import { MAX_CONTEXT_PROMPT_BYTES } from "./contextLimits"
import type { ContextTokens } from "./contextTokens"

// Original synthetic reference text, distributed under this repository's license.
// Versioned together with NEEDLE_DEFAULTS.version; no downloaded corpus is needed.
const notes = [
  "The field team recorded the water level before returning to the station.",
  "A librarian moved the maps to a dry room beside the main reading hall.",
  "The morning train carried supplies for the repair work at the bridge.",
  "Observers compared the soil samples collected from three nearby gardens.",
  "The workshop opened after the inspection of the lamps and ventilation.",
  "A delivery schedule was revised when rain closed the northern road.",
  "The survey described a walking route through the valley and forest.",
  "New shelves were assembled to hold the collection of historical journals.",
  "The weather report predicted clear skies for the evening observation.",
  "Residents discussed the opening hours of the community exhibition.",
  "The repair crew checked each section before restoring the power supply.",
  "The archive received a collection of sketches from the coastal expedition.",
] as const

/** Rebuild the same corpus and target across depths; only placement changes. */
export async function prepareNeedlePrompt(
  counter: ContextTokens,
  target: number,
  depth: number,
  seed: number,
  signal: AbortSignal,
) {
  let state = (seed ^ 0x9e3779b9) >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
  const hex = () => random().toString(16).padStart(8, "0")
  const code = () => hex() + hex() + hex() + hex()
  const key = `archive-${hex()}`
  const expected = code()
  const line = (record: string, value: string) =>
    `Record "${record}" has archive code "${value}". ${notes[random() % notes.length]}\n`
  const needle = line(key, expected)
  const prefix =
    "Read these archive notes and look up the requested record. Use only the supplied notes.\n<notes>\n"
  const suffix = `</notes>\nQuestion: Return only the archive code for record "${key}". Do not list other codes or explain your answer.`
  const remaining = target - counter.countTokens(prefix + needle + suffix) - 8
  if (remaining < 100)
    throw new Error("Input length is too small for the needle test")
  const parts: string[] = []
  const sizes: number[] = []
  let tokens = 0
  let bytes = prefix.length + needle.length + suffix.length
  while (tokens < remaining) {
    const record = `archive-${hex()}`
    const value = code()
    if (record === key || value === expected) continue
    const text = line(record, value)
    const size = counter.countTokens(text)
    if (tokens + size > remaining) break
    bytes += text.length
    if (bytes > MAX_CONTEXT_PROMPT_BYTES)
      throw new Error("Test input exceeds the 32 MiB request limit")
    parts.push(text)
    sizes.push(size)
    tokens += size
    if (parts.length % 64 === 0) await counter.yieldToCaller(signal)
  }
  signal.throwIfAborted()
  let index = 0
  let before = 0
  while (
    index < parts.length &&
    before + sizes[index]! / 2 < (tokens * depth) / 100
  )
    before += sizes[index++]!
  const preceding = parts.slice(0, index).join("")
  const background = parts.join("")
  const prompt =
    prefix + preceding + needle + parts.slice(index).join("") + suffix
  const localInputTokens = await counter.countAsync(prompt, signal)
  if (localInputTokens > target)
    throw new Error("Generated input exceeds its token plan")
  const backgroundTokens = await counter.countAsync(background, signal)
  const actualDepth = backgroundTokens
    ? ((await counter.countAsync(preceding, signal)) / backgroundTokens) * 100
    : 0
  return { prompt, expected, localInputTokens, actualDepth }
}
