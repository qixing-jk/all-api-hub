/** Runtime tokenizer identifiers shared by counting and persisted evidence validation. */
export const CONTEXT_TOKEN_ENCODINGS = {
  Cl100k: "cl100k_base",
  O200k: "o200k_base",
} as const

/** Packaged data shared by background, content scripts and extension pages. */
export const CONTEXT_TOKEN_VOCABULARY_DIR = "tokenizers"
export const CONTEXT_TOKEN_VOCABULARY_GLOB = `${CONTEXT_TOKEN_VOCABULARY_DIR}/*.json`

/** Yield after this much tokenization work so cancellation remains responsive. */
export const CONTEXT_TOKEN_BATCH_SIZE = 8192
