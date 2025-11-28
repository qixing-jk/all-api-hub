import {
  REDEMPTION_TOAST_HOST_TAG,
  setupRedemptionAssistContent
} from "~/entrypoints/content/redemptionAssist"

import { setupContentMessageHandlers } from "./contentMessages"

import "~/styles/style.css"

import * as React from "react"
import { createRoot, type Root } from "react-dom/client"

import { ContentReactRoot } from "./redemptionAssist/components/ContentReactRoot.tsx"

let redemptionToastRoot: Root | null = null

async function mountRedemptionToastUi(ctx: any) {
  if (redemptionToastRoot) {
    return
  }

  const ui = await createShadowRootUi(ctx, {
    name: REDEMPTION_TOAST_HOST_TAG,
    position: "overlay",
    anchor: "body",
    onMount(container) {
      const root = createRoot(container)
      root.render(React.createElement(ContentReactRoot))
      redemptionToastRoot = root
      return root
    },
    onRemove(root: Root | undefined) {
      if (root) {
        root.unmount()
      }
      if (redemptionToastRoot === root) {
        redemptionToastRoot = null
      }
    }
  })

  ui.mount()
}

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main(ctx) {
    await mountRedemptionToastUi(ctx)
    main()
  }
})

function main() {
  console.log("Hello content script!", { id: browser.runtime.id })

  setupContentMessageHandlers()
  setupRedemptionAssistContent()
}
