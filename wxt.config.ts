import { defineConfig } from "wxt"

import { reactDevToolsAuto } from "./plugins/react-devtools-auto"

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "__MSG_manifest_name__",
    description: "__MSG_manifest_description__",
    default_locale: "zh_CN",
    permissions: ["tabs", "storage", "sidePanel"],
    host_permissions: ["https://*/*"],
    browser_specific_settings: {
      gecko: {
        id: "{bc73541a-133d-4b50-b261-36ea20df0d24}"
      }
    },
    commands: {
      _execute_sidebar_action: {
        description: "__MSG_manifest_commands_sidebar_action__"
      },
      _execute_browser_action: {
        description: "__MSG_manifest_commands_browser_action__"
      }
    }
  },
  vite: (env) => {
    console.log("当前构建模式:", env.mode)
    return {
      plugins: [reactDevToolsAuto()],
      content_security_policy: {
        extension_pages: {
          "script-src": ["'self'", "http://localhost:8097"]
        }
      },
      build: {
        sourcemap: env.mode === "development" ? "inline" : false,
        minify: env.mode !== "development"
      }
    }
  }
})
