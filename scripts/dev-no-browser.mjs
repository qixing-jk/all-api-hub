// Run WXT in this process so CLI arguments and signals behave as usual.
process.env.WXT_OPEN_BROWSER = "0"
await import("../node_modules/wxt/bin/wxt.mjs")
