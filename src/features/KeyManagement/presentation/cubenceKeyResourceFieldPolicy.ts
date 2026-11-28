import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  group,
  groupNamePolicy,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

export const buildCubenceFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  requireFreshOptions: true,
  automaticName: groupNamePolicy(
    "group",
    true,
    DEFAULT_AUTO_PROVISION_KEY_NAME,
  ),
  fields: [
    ...(mode === editorModes.Edit ? [] : [name]),
    group("group", false, false, false),
    ...quota("quota", "unlimited", true),
    ...(mode === editorModes.Edit
      ? [{ ...enabled("enabled"), section: "basic", order: 30 }]
      : []),
  ],
})
