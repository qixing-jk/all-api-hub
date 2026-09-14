import { vi } from "vitest"

import { SYSTEM_DARK_MODE_QUERY } from "~/constants/theme"

type MatchMediaListener = (event: MediaQueryListEvent) => void

/** Model system theme changes through the listeners actually registered by the UI. */
export function createMatchMediaController(initialMatches = false) {
  let matches = initialMatches
  const listeners = new Set<MatchMediaListener>()

  return {
    queryList: {
      get matches() {
        return matches
      },
      media: SYSTEM_DARK_MODE_QUERY,
      onchange: null,
      addEventListener: vi.fn(
        (_event: string, listener: MatchMediaListener) => {
          listeners.add(listener)
        },
      ),
      removeEventListener: vi.fn(
        (_event: string, listener: MatchMediaListener) => {
          listeners.delete(listener)
        },
      ),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    },
    emit(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches: nextMatches } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
  }
}
