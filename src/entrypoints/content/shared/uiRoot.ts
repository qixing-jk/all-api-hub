import { createRoot, type Root } from "react-dom/client"
import { ContentScriptContext } from "wxt/utils/content-script-context"
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root"

import { CONTENT_UI_HOST_TAG } from "~/entrypoints/content/shared/contentUi"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to mounting the content-script redemption assist UI root.
 */
const logger = createLogger("RedemptionAssistUiRoot")

let ctxRef: ContentScriptContext | null = null
let redemptionToastRoot: Root | null = null
let mountingPromise: Promise<void> | null = null
let contentUiModulesPromise: Promise<{
  createElement: typeof import("react").createElement
  ContentReactRoot: typeof import("~/entrypoints/content/shared/ContentReactRoot").ContentReactRoot
}> | null = null

/**
 * Load the heavy content UI tree only when the page actually needs a toast/modal.
 */
async function loadContentUiModules() {
  if (!contentUiModulesPromise) {
    contentUiModulesPromise = Promise.all([
      import("react"),
      import("~/entrypoints/content/shared/ContentReactRoot"),
    ]).then(([reactModule, contentReactRootModule]) => ({
      createElement: reactModule.createElement,
      ContentReactRoot: contentReactRootModule.ContentReactRoot,
    }))
  }

  return contentUiModulesPromise
}

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
    logger.warn("ContentScriptContext not set, cannot mount UI")
    return
  }

  if (mountingPromise) {
    return mountingPromise
  }

  mountingPromise = (async () => {
    const { createElement, ContentReactRoot } = await loadContentUiModules()

    const ui = await createShadowRootUi(ctxRef as ContentScriptContext, {
      name: CONTENT_UI_HOST_TAG,
      position: "overlay",
      zIndex: 2147483647,
      anchor: "body",
      onMount(container) {
        const root = createRoot(container)
        root.render(createElement(ContentReactRoot))
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
