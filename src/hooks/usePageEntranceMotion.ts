import { useReducedMotion } from "framer-motion"

export const PAGE_MOTION_OFFSET = 14

/** Shared timing for the main content of Options pages. */
export function usePageEntranceMotion() {
  return { shouldReduceMotion: useReducedMotion() }
}
