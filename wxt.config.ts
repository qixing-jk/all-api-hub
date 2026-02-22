import { defineConfig } from "wxt"

import { reactDevToolsAuto } from "./plugins/react-devtools-auto"
import { createExtensionManifest } from "./wxt.manifest"

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/auto-icons", "@wxt-dev/module-react"],
  manifest: ({ browser }) => createExtensionManifest(browser),
  vite: (env) => {
    console.log("当前构建模式:", env.mode)
    return {
      plugins: [reactDevToolsAuto()],
      content_security_policy: {
        extension_pages: {
          "script-src": ["'self'", "http://localhost:8097"],
        },
      },
      build: {
        sourcemap: env.mode === "development" ? "inline" : false,
        minify: env.mode !== "development",
      },
    }
  },
})
