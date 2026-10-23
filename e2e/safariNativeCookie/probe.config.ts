import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { alias: { "~": path.resolve("src"), "~~": process.cwd() } },
  define: {
    __AAH_DEV_IDENTITY__: "null",
    "import.meta.env.WXT_SAFARI_TRIAL_NONCE": JSON.stringify(
      fs.existsSync(".scratch/safari-native-cookie/real-nonce")
        ? fs
            .readFileSync(".scratch/safari-native-cookie/real-nonce", "utf8")
            .trim()
        : "",
    ),
    "import.meta.env.BROWSER": JSON.stringify("safari"),
  },
  build: {
    outDir: ".scratch/safari-native-cookie/bundle",
    lib: {
      entry: "e2e/safariNativeCookie/probe.ts",
      name: "SafariNativeCookieTrial",
      formats: ["iife"],
      fileName: () => "native-probe.js",
    },
    minify: false,
  },
})
