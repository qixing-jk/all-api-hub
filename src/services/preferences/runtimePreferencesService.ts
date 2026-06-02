import { applyActionClickBehavior } from "~/entrypoints/background/actionClickBehavior"
import { setupContextMenus } from "~/entrypoints/background/contextMenus"
import {
  onPreferencesMessage,
  PreferencesMessageTypes,
  type PreferencesUpdateActionClickBehaviorRequest,
} from "~/services/preferences/messaging"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import { getErrorMessage } from "~/utils/core/error"

let preferencesMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for preference side-effect messages.
 */
export function setupPreferencesMessagingListeners() {
  if (preferencesMessagingCleanup) {
    return
  }

  preferencesMessagingCleanup = [
    onPreferencesMessage(
      PreferencesMessageTypes.UpdateActionClickBehavior,
      ({ data }) => resolvePreferencesUpdateActionClickBehaviorMessage(data),
    ),
    onPreferencesMessage(PreferencesMessageTypes.RefreshContextMenus, () =>
      resolvePreferencesRefreshContextMenusMessage(),
    ),
  ]
}

/**
 * Resolve a typed request to apply the browser action click behavior.
 */
async function resolvePreferencesUpdateActionClickBehaviorMessage(
  request: PreferencesUpdateActionClickBehaviorRequest,
): Promise<RuntimeMessageResponse<undefined>> {
  try {
    applyActionClickBehavior(request.behavior)
    return { success: true, data: undefined }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to rebuild extension context menus.
 */
async function resolvePreferencesRefreshContextMenusMessage(): Promise<
  RuntimeMessageResponse<undefined>
> {
  try {
    await setupContextMenus()
    return { success: true, data: undefined }
  } catch (error) {
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
