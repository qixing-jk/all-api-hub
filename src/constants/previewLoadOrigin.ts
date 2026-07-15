export const PREVIEW_LOAD_ORIGINS = {
  AUTOMATIC: "automatic",
  MANUAL: "manual",
} as const

export type PreviewLoadOrigin =
  | (typeof PREVIEW_LOAD_ORIGINS)[keyof typeof PREVIEW_LOAD_ORIGINS]
  | null
