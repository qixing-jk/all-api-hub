import "~/utils/browser/browserEnvironment"

import { runBrowserAsyncApi } from "~/utils/browser/browserAsyncApi"

/**
 * Checks whether the context menus API is available.
 */
export function hasContextMenusAPI(): boolean {
  const contextMenus = (globalThis as any).browser?.contextMenus
  return (
    typeof contextMenus?.create === "function" &&
    typeof contextMenus?.remove === "function" &&
    typeof contextMenus?.onClicked?.addListener === "function" &&
    typeof contextMenus?.onClicked?.removeListener === "function"
  )
}

/**
 * Subscribes to context menu click events when supported.
 */
export function onContextMenuClicked(
  callback: (
    info: browser.contextMenus.OnClickData,
    tab?: browser.tabs.Tab,
  ) => void | Promise<void>,
): () => void {
  const onClicked = (globalThis as any).browser?.contextMenus?.onClicked as
    | {
        addListener?: (listener: typeof callback) => void
        removeListener?: (listener: typeof callback) => void
      }
    | undefined

  if (
    typeof onClicked?.addListener !== "function" ||
    typeof onClicked?.removeListener !== "function"
  ) {
    return () => {}
  }

  onClicked.addListener(callback)
  return () => {
    onClicked.removeListener?.(callback)
  }
}

/**
 * Creates a context menu item.
 */
export function createContextMenu(
  createProperties: browser.contextMenus._CreateCreateProperties,
): number | string | undefined {
  const create = (globalThis as any).browser?.contextMenus?.create as
    | ((
        properties: browser.contextMenus._CreateCreateProperties,
      ) => number | string | undefined)
    | undefined

  if (typeof create !== "function") {
    return undefined
  }

  return create(createProperties)
}

/**
 * Removes a context menu item.
 */
export async function removeContextMenu(
  menuItemId: number | string,
): Promise<void> {
  const contextMenus = (globalThis as any).browser?.contextMenus
  const remove = contextMenus?.remove as
    | ((id: number | string, callback?: () => void) => Promise<void> | void)
    | undefined

  if (typeof remove !== "function") {
    return
  }

  await runBrowserAsyncApi(
    () => Promise.resolve(remove.call(contextMenus, menuItemId)),
    (callback) => remove.call(contextMenus, menuItemId, callback),
  )
}
