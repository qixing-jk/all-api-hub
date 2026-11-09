/** Runtime tokenizer identifiers shared by counting and persisted evidence validation. */
export const CONTEXT_TOKEN_ENCODINGS = {
  Cl100k: "cl100k_base",
  O200k: "o200k_base",
} as const

/** Yield after this much tokenization work so cancellation remains responsive. */
export const CONTEXT_TOKEN_BATCH_SIZE = 8192
