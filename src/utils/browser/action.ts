import "~/utils/browser/browserEnvironment"

type ActionClickListener = (tab: browser.tabs.Tab, info?: any) => void

type ActionAPI = {
  setPopup: (details: { popup?: string }) => Promise<void> | void
  setBadgeText?: (details: { text: string }) => Promise<void> | void
  setBadgeBackgroundColor?: (details: {
    color: string | [number, number, number, number]
  }) => Promise<void> | void
  setTitle?: (details: { title: string }) => Promise<void> | void
  onClicked: {
    addListener: (listener: ActionClickListener) => void
    removeListener: (listener: ActionClickListener) => void
    hasListener: (listener: ActionClickListener) => boolean
  }
}

/**
 * 返回跨 MV2/MV3 的 action API 引用。
 * 优先使用 browser.action (MV3)，回退到 browser.browserAction (MV2)。
 */
export function getActionApi(): ActionAPI {
  const action = (browser as any).action || (browser as any).browserAction
  if (!action) {
    throw new Error("Action API is not available in this environment")
  }
  return action as ActionAPI
}

/**
 * 设置工具栏按钮的 popup，兼容 MV2 与 MV3。
 * @param popup 要显示的 popup 页面路径，传空字符串可清除。
 */
export async function setActionPopup(popup: string): Promise<void> {
  const action = getActionApi()
  await Promise.resolve(action.setPopup({ popup }))
}

/**
 * 为工具栏按钮添加点击监听（兼容 MV2/MV3）。
 * 返回用于移除的清理函数。
 */
export function addActionClickListener(
  listener: ActionClickListener,
): () => void {
  const action = getActionApi()
  if (!action.onClicked.hasListener(listener)) {
    action.onClicked.addListener(listener)
  }
  return () => {
    if (action.onClicked.hasListener(listener)) {
      action.onClicked.removeListener(listener)
    }
  }
}
