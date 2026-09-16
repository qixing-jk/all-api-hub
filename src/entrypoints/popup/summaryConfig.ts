/** Count-up timings for the popup's account and bookmark summaries, in seconds. */
export const SUMMARY_ANIMATION_DURATION = {
  INITIAL: 1.5,
  UPDATE: 0.8,
} as const

/** Re-render relative timestamps without fetching account or bookmark data. */
export const RELATIVE_TIME_REFRESH_INTERVAL_MS = 30_000
