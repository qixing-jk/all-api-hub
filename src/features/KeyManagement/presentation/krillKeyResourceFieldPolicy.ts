import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { type ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import {
  RESOURCE_FIELD_TYPES,
  type ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/resourceNative"
import { krillKeyFields } from "~/services/apiAdapters/krill/keyResourceFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import { ips, issues, name } from "./nativeKeyResourceFieldPrimitives"

// Krill keys have no quota or expiry; permissions are channels, fallback and IPs.
export const buildKrillFields = (
  mode: AccountKeyResourceEditorMode,
  descriptors?: readonly ResourceFieldDescriptor[],
): AccountKeyResourceFieldConfiguration => ({
  requireFreshOptions: mode === editorModes.Edit,
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
  fields: (
    [
      name,
      {
        fieldId: krillKeyFields.Channels,
        section: "basic",
        order: 10,
        renderer: RESOURCE_FIELD_TYPES.MultiSelect,
        resolveLabel: (t: TFunction) =>
          t("keyManagement:native.editor.krill.channels"),
        resolveHelp: (t: TFunction) =>
          t("keyManagement:native.editor.krill.channelsHelp"),
        issueLabelResolvers: issues,
      },
      {
        fieldId: krillKeyFields.AllowBalanceFallback,
        section: "spending",
        order: 20,
        renderer: RESOURCE_FIELD_TYPES.Boolean,
        resolveLabel: (t) => t("keyManagement:native.editor.allowWallet"),
        resolveHelp: (t) => t("keyManagement:native.editor.allowWalletHelp"),
        issueLabelResolvers: issues,
      },
      {
        fieldId: krillKeyFields.IpWhitelistDisabled,
        section: "advanced",
        order: 0,
        renderer: RESOURCE_FIELD_TYPES.Boolean,
        resolveLabel: (t) => t("keyManagement:native.editor.krill.allowAnyIp"),
        resolveHelp: (t) =>
          t("keyManagement:native.editor.krill.allowAnyIpHelp"),
        issueLabelResolvers: issues,
      },
      ips(krillKeyFields.IpWhitelist),
    ] satisfies ResourceFieldPresentation[]
  ).filter((field) =>
    descriptors?.some(({ fieldId }) => fieldId === field.fieldId),
  ),
})
