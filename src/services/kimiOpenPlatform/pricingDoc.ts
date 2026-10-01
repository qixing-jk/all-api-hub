/**
 * Kimi publishes its model prices as a documentation page that is also served
 * as raw Markdown (`/docs/pricing.md`), on the console origin of each
 * deployment. The page carries Mintlify `<DocTable>` blocks whose `columns`
 * name each column and whose `rows` hold the values, so a model id and its
 * prices arrive in the same record — there is no separate id mapping to guess.
 *
 * The two deployments render the same table differently: the English page wraps
 * every numeric cell in JSX (`<>{"$"}3.00</>`), while the Chinese page writes a
 * plain string (`"¥20.00"`), and their column titles are translated. This parser
 * therefore resolves columns by title meaning rather than position, and reports
 * only what it can read: an unrecognised table yields no rows instead of
 * guessed prices.
 */

import type { CurrencyType } from "~/types"

/** One priced model as published by the platform, in the document's currency. */
export type KimiPricingDocEntry = {
  modelId: string
  /** Currency the published prices are written in, such as `USD` or `CNY`. */
  currency: CurrencyType
  inputPrice: number
  outputPrice: number
  cacheReadPrice?: number
  cacheWritePrice?: number
  cacheWrite1hPrice?: number
  contextLength?: number
}

/** Column meanings we can attach confidently, matched against their titles. */
const COLUMN_MATCHERS = {
  model: /^(?:model|模型)$/i,
  unit: /^(?:unit|计费单位)$/i,
  input: /^(?:input price|输入价格)$/i,
  inputCacheMiss: /^(?:input price \(cache miss\)|输入价格（缓存未命中）)$/i,
  inputCacheHit: /^(?:input price \(cache hit\)|输入价格（缓存命中）)$/i,
  cachedInput: /^(?:cached input price|缓存输入价格)$/i,
  cacheWrite5m:
    /^(?:cache write price \(ttl ?5 ?min\)|缓存写入（TTL ?5 ?min）)$/i,
  cacheWrite1h: /^(?:cache write price \(ttl ?1 ?h\)|缓存写入（TTL ?1 ?h）)$/i,
  output: /^(?:output price|输出价格)$/i,
  context: /^(?:context window|上下文窗口)$/i,
} as const

type ColumnMeaning = keyof typeof COLUMN_MATCHERS

const DOC_TABLE_PATTERN = /<DocTable\b([\s\S]*?)(?<!<)\/>/g
const ROWS_PATTERN = /rows=\{(\[[\s\S]*?\])\}/
const ROW_PATTERN = /\[([^\]]*)\]/g
/**
 * A cell is either a JSX wrapper (`<>{"$"}3.00</>`) or a plain quoted string
 * (`"¥20.00"`). The wrapper alternative comes first so the quotes inside it are
 * not mistaken for a string cell, and the closing fragment is matched with a
 * lookbehind so a `</>` cell never ends the surrounding block.
 */
const CELL_PATTERN =
  /<>\{\s*"((?:[^"\\]|\\.)*)"\s*\}([^<]*)<\/>|"((?:[^"\\]|\\.)*)"/g

/** Reads the column titles of one `<DocTable>` block, in order. */
function readColumnTitles(block: string): string[] {
  const columnsBlock = /columns=\{(\[[\s\S]*?\])\}/.exec(block)?.[1] ?? ""
  return [...columnsBlock.matchAll(/title:\s*"((?:[^"\\]|\\.)*)"/g)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1]]),
  )
}

/** Maps each column meaning onto the index that carries it, when present. */
function resolveColumnIndexes(
  titles: readonly string[],
): Partial<Record<ColumnMeaning, number>> | null {
  const indexes: Partial<Record<ColumnMeaning, number>> = {}
  let ambiguous = false
  titles.forEach((title, index) => {
    const trimmed = title.trim()
    for (const [meaning, matcher] of Object.entries(COLUMN_MATCHERS) as [
      ColumnMeaning,
      RegExp,
    ][]) {
      if (matcher.test(trimmed)) {
        if (indexes[meaning] !== undefined) ambiguous = true
        indexes[meaning] = index
      }
    }
  })
  return ambiguous ? null : indexes
}

/** Reads one cell's text, unwrapping the JSX form when it is used. */
function readCellText(match: RegExpMatchArray): string {
  return match[1] === undefined
    ? match[3] ?? ""
    : `${match[1]}${match[2] ?? ""}`
}

/** Splits the `rows={[...]}` array into its cell texts, without interpreting them. */
function readRowCells(block: string): string[][] {
  const rowsBlock = ROWS_PATTERN.exec(block)?.[1]
  if (!rowsBlock) return []
  const rows: string[][] = []
  // Unknown expressions must invalidate a row rather than shift price columns.
  const cellPattern = new RegExp(CELL_PATTERN.source, "y")
  const inner = rowsBlock.slice(1, -1)
  let consumed = 0
  for (const match of inner.matchAll(ROW_PATTERN)) {
    if (!/^[\s,]*$/.test(inner.slice(consumed, match.index))) return []
    consumed = match.index + match[0].length
    const row = match[1] ?? ""
    const cells: string[] = []
    let offset = 0
    while (offset < row.length) {
      offset += /^\s*/.exec(row.slice(offset))?.[0].length ?? 0
      if (offset === row.length) break
      cellPattern.lastIndex = offset
      const cell = cellPattern.exec(row)
      if (!cell) {
        cells.length = 0
        break
      }
      cells.push(readCellText(cell))
      offset = cellPattern.lastIndex
      offset += /^\s*/.exec(row.slice(offset))?.[0].length ?? 0
      if (offset < row.length) {
        if (row[offset] !== ",") {
          cells.length = 0
          break
        }
        offset++
      }
    }
    if (cells.length) rows.push(cells)
  }
  return /^[\s,]*$/.test(inner.slice(consumed)) ? rows : []
}

/**
 * The document writes amounts with a currency symbol rather than a code, and
 * both yuan glyphs mean CNY. This is the only place that reads the symbol, so
 * nothing downstream has to interpret one.
 */
const CURRENCY_BY_SYMBOL: Record<string, CurrencyType> = {
  $: "USD",
  "¥": "CNY",
  "￥": "CNY",
}

/**
 * Reads a published number, keeping the currency it was written in.
 * Thousands separators are dropped so context windows read as plain integers.
 */
function readPriceCell(
  value: string | undefined,
): { amount: number; currency: CurrencyType } | null {
  if (value === undefined) return null
  const match =
    /^\s*([$¥￥])\s*(\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*$/.exec(
      value,
    )
  if (!match) return null
  const currency = CURRENCY_BY_SYMBOL[match[1] ?? ""]
  const amount = Number((match[2] ?? "").replace(/,/g, ""))
  if (!currency || !Number.isFinite(amount) || amount < 0) return null
  return { amount, currency }
}

/** Reads an integer cell, ignoring a trailing unit such as `262,144 tokens`. */
function readWholeCell(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const match = /^\s*([\d,]+)/.exec(value)
  if (!match) return undefined
  const parsed = Number((match[1] ?? "").replace(/,/g, ""))
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

/**
 * Parses the published price tables.
 *
 * A block contributes rows only when the model, input, and output columns are
 * all identifiable and every row names a model id with finite prices.
 */
export function parseKimiPricingDoc(markdown: string): KimiPricingDocEntry[] {
  const entries: KimiPricingDocEntry[] = []

  for (const blockMatch of markdown.matchAll(DOC_TABLE_PATTERN)) {
    const block = blockMatch[1] ?? ""
    if (!block) continue
    const titles = readColumnTitles(block)
    const indexes = resolveColumnIndexes(titles)
    if (!indexes) continue
    const modelIndex = indexes.model
    const inputIndex = indexes.input ?? indexes.inputCacheMiss
    const outputIndex = indexes.output
    if (
      modelIndex === undefined ||
      indexes.unit === undefined ||
      inputIndex === undefined ||
      outputIndex === undefined
    ) {
      continue
    }

    for (const cells of readRowCells(block)) {
      if (
        cells.length !== titles.length ||
        !/^1M tokens$/i.test(cells[indexes.unit] ?? "")
      )
        continue
      const modelId = cells[modelIndex]?.trim()
      const input = readPriceCell(cells[inputIndex])
      const output = readPriceCell(cells[outputIndex])
      // API ids are literal lower-case slugs, not the homepage's marketing names.
      if (
        !modelId ||
        !/^[a-z][a-z0-9]*(?:-[a-z0-9._]+)+$/.test(modelId) ||
        !input ||
        !output
      )
        continue
      if (input.currency !== output.currency) continue

      const cacheReadIndex = indexes.cachedInput ?? indexes.inputCacheHit
      const cacheRead =
        cacheReadIndex === undefined
          ? null
          : readPriceCell(cells[cacheReadIndex])
      const cacheWrite =
        indexes.cacheWrite5m === undefined
          ? null
          : readPriceCell(cells[indexes.cacheWrite5m])
      const contextLength =
        indexes.context === undefined
          ? undefined
          : readWholeCell(cells[indexes.context])
      const cacheWrite1h =
        indexes.cacheWrite1h === undefined
          ? null
          : readPriceCell(cells[indexes.cacheWrite1h])
      // A row whose cached prices are written in another currency is not a row
      // this parser trusts; both yuan glyphs remain one currency.
      if (
        [cacheRead, cacheWrite, cacheWrite1h].some(
          (price) => price && price.currency !== input.currency,
        )
      )
        continue
      if (
        (cacheReadIndex !== undefined && !cacheRead) ||
        (indexes.cacheWrite5m !== undefined && !cacheWrite) ||
        (indexes.cacheWrite1h !== undefined && !cacheWrite1h)
      )
        continue

      entries.push({
        modelId,
        currency: input.currency,
        inputPrice: input.amount,
        outputPrice: output.amount,
        ...(cacheRead ? { cacheReadPrice: cacheRead.amount } : {}),
        ...(cacheWrite ? { cacheWritePrice: cacheWrite.amount } : {}),
        ...(cacheWrite1h ? { cacheWrite1hPrice: cacheWrite1h.amount } : {}),
        ...(contextLength === undefined ? {} : { contextLength }),
      })
    }
  }

  // Repeated model ids may represent an unsupported price tier.
  const counts = new Map<string, number>()
  for (const entry of entries)
    counts.set(entry.modelId, (counts.get(entry.modelId) ?? 0) + 1)
  return entries.filter((entry) => counts.get(entry.modelId) === 1)
}
