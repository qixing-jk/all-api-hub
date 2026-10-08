import type { OpenRouterKeyInfo } from "~/services/apiService/openrouter"

const PAGE_SIZE = 100
const MAX_PAGES = 100
const MAX_ACTIVE_CURSORS = 32
const MAX_KEY_RESULTS = PAGE_SIZE * MAX_PAGES
const CURSOR_PREFIX = "or-key:"
type OpenRouterKeyCursorChain = {
  readonly scopeKey: string
  readonly seenHashes: Set<string>
}

type OpenRouterKeyCursorState = {
  /** Next provider offset, advanced by each batch's actual returned length. */
  readonly offset: number
  readonly bufferedKeys: readonly OpenRouterKeyInfo[]
  readonly providerExhausted: boolean
  readonly chain: OpenRouterKeyCursorChain
}

const toCursor = (sequence: number, offset: number): string =>
  `${CURSOR_PREFIX}${sequence}:${offset}`

const openCursorChain = (
  config: {
    issuedCursors: Map<string, OpenRouterKeyCursorState>
    cursorSequence: number
  },
  scopeKey: string,
  cursor: string | undefined,
): OpenRouterKeyCursorState => {
  if (!cursor) {
    return {
      offset: 0,
      bufferedKeys: [],
      providerExhausted: false,
      chain: { scopeKey, seenHashes: new Set() },
    }
  }
  if (!/^or-key:\d+:\d+$/.test(cursor)) throw new Error("invalid_cursor")
  const issued = config.issuedCursors.get(cursor)
  if (!issued) throw new Error("repeated_cursor")
  if (issued.chain.scopeKey !== scopeKey) throw new Error("invalid_cursor")
  config.issuedCursors.delete(cursor)
  if (issued.offset >= MAX_KEY_RESULTS && issued.bufferedKeys.length === 0) {
    throw new Error("key_pagination_limit")
  }
  return issued
}

const issueCursor = (
  config: {
    issuedCursors: Map<string, OpenRouterKeyCursorState>
    cursorSequence: number
  },
  state: OpenRouterKeyCursorState,
): string => {
  if (!Number.isInteger(state.offset) || state.offset <= 0) {
    throw new Error("non_progress_offset")
  }
  const cursor = toCursor(++config.cursorSequence, state.offset)
  config.issuedCursors.set(cursor, state)
  while (config.issuedCursors.size > MAX_ACTIVE_CURSORS) {
    const oldest = config.issuedCursors.keys().next().value
    if (oldest === undefined) break
    config.issuedCursors.delete(oldest)
  }
  return cursor
}

/** Owns single-use workspace cursors, provider-page draining, and buffered key results. */
export function createOpenRouterKeyPagination() {
  const state = {
    issuedCursors: new Map<string, OpenRouterKeyCursorState>(),
    cursorSequence: 0,
  }
  return {
    async list(
      query: { scopeKey: string; limit?: number; cursor?: string },
      loadProviderPage: (offset: number) => Promise<OpenRouterKeyInfo[]>,
    ) {
      const requestedLimit = query.limit ?? PAGE_SIZE
      if (
        !Number.isInteger(requestedLimit) ||
        requestedLimit <= 0 ||
        requestedLimit > PAGE_SIZE
      )
        throw new Error("invalid_limit")
      const cursorState = openCursorChain(state, query.scopeKey, query.cursor)
      const availableKeys = [...cursorState.bufferedKeys]
      let nextProviderOffset = cursorState.offset
      let providerExhausted = cursorState.providerExhausted
      let providerPages = 0
      // `/keys` exposes `offset` without a usable provider page size or total.
      // Drain by actual batch length before applying the capability's local page.
      while (!providerExhausted) {
        if (
          providerPages >= MAX_PAGES ||
          nextProviderOffset >= MAX_KEY_RESULTS
        ) {
          throw new Error("key_pagination_limit")
        }
        const providerPage = await loadProviderPage(nextProviderOffset)
        if (providerPage.length === 0) {
          providerExhausted = true
          break
        }
        if (providerPage.length > MAX_KEY_RESULTS - nextProviderOffset) {
          throw new Error("key_pagination_limit")
        }
        const pageHashes = new Set<string>()
        for (const key of providerPage) {
          if (key.workspace_id !== query.scopeKey)
            throw new Error("key_scope_mismatch")
          if (
            pageHashes.has(key.hash) ||
            cursorState.chain.seenHashes.has(key.hash)
          ) {
            throw new Error("duplicate_hash")
          }
          pageHashes.add(key.hash)
        }
        for (const hash of pageHashes) cursorState.chain.seenHashes.add(hash)
        availableKeys.push(...providerPage)
        nextProviderOffset += providerPage.length
        providerPages += 1
        if (availableKeys.length > requestedLimit) break
      }
      const itemKeys = availableKeys.slice(0, requestedLimit)
      const bufferedKeys = availableKeys.slice(itemKeys.length)
      const nextCursor =
        bufferedKeys.length > 0 && itemKeys.length > 0
          ? issueCursor(state, {
              offset: nextProviderOffset,
              bufferedKeys,
              providerExhausted,
              chain: cursorState.chain,
            })
          : undefined
      return { keys: itemKeys, ...(nextCursor ? { nextCursor } : {}) }
    },
  }
}
