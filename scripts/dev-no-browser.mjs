// Skip automatic opening while keeping WXT's `o + Enter`, CLI args and signals.
process.env.WXT_OPEN_BROWSER = "0"
await import("../node_modules/wxt/bin/wxt.mjs")
