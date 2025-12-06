import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { ContentScriptContext } from "wxt/utils/content-script-context"
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root"

import { REDEMPTION_TOAST_HOST_TAG } from "~/entrypoints/content/redemptionAssist"
import { ContentReactRoot } from "~/entrypoints/content/redemptionAssist/components/ContentReactRoot"

let ctxRef: ContentScriptContext | null = null
let redemptionToastRoot: Root | null = null
let mountingPromise: Promise<void> | null = null

/**
 * Stores the WXT ContentScriptContext so other helpers can mount UI later.
 * @param ctx Context provided by defineContentScript main().
 */
export function setContentScriptContext(ctx: ContentScriptContext) {
  ctxRef = ctx
}

/**
 * Ensures the redemption toast shadow-root UI is mounted once.
 * Creates the shadow host, renders React root, and guards concurrent mounts.
 */
export async function ensureRedemptionToastUi(): Promise<void> {
  if (redemptionToastRoot) return
  if (!ctxRef) {
    console.warn(
      "[RedemptionAssist][Content] ContentScriptContext not set, cannot mount UI.",
    )
    return
  }

  if (mountingPromise) {
    return mountingPromise
  }

  mountingPromise = (async () => {
    const ui = await createShadowRootUi(ctxRef as ContentScriptContext, {
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
      },
    })

    ui.mount()
  })()

  try {
    await mountingPromise
  } finally {
    mountingPromise = null
  }
}
