// Preserve the existing shortcut while sharing discovery and development setup.
process.argv.splice(2, 0, "dev", "--browser", "firefox")
await import("./mobile-browser.mjs")
