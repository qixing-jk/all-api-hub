import type { TFunction } from "i18next"

import { type AccountKeyResourceEditorMode } from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { defineResourceEditorFieldPolicy } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountKeyResourceEditAction } from "~/services/apiAdapters/contracts/accountKeyResource"
import { type ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/resourceNative"

import type {
  AccountKeyResourceFieldConfiguration,
  AccountKeyResourceEditorPresentation as EditorPresentation,
} from "./accountKeyResourceEditorPresentation"
import { buildAiHubMixFields } from "./aiHubMixKeyResourceFieldPolicy"
import { buildAimlApiFields } from "./aimlApiKeyResourceFieldPolicy"
import { buildCubenceFields } from "./cubenceKeyResourceFieldPolicy"
import { getDahlKeyResourceEditorPresentation } from "./dahlKeyResourceEditorPresentation"
import { buildDayaFields } from "./dayaKeyResourceFieldPolicy"
import { buildEmRankFields } from "./emrankKeyResourceFieldPolicy"
import { buildFoxCodeFields } from "./foxCodeKeyResourceFieldPolicy"
import { buildGrsaiFields } from "./grsaiKeyResourceFieldPolicy"
import {
  KEY_RESOURCE_EDITOR_KINDS as editorKinds,
  getKeyResourcePresentationPolicy,
} from "./keyResourcePresentationPolicy"
import { buildKrillFields } from "./krillKeyResourceFieldPolicy"
import { buildNanoGptKeyFields } from "./nanoGptKeyResourceFieldPolicy"
import { name } from "./nativeKeyResourceFieldPrimitives"
import { buildNewApiFamilyFields } from "./newApiFamilyKeyResourceFieldPolicy"
import { buildNovitaFields } from "./novitaKeyResourceFieldPolicy"
import { getOpenRouterKeyResourceEditorPresentation } from "./openRouterKeyResourceFieldPolicy"
import { buildPmapiFields } from "./pmapiKeyResourceFieldPolicy"
import { buildPmplanKeyFields } from "./pmplanKeyResourceFieldPolicy"
import { buildRelayForFields } from "./relayForKeyResourceFieldPolicy"
import { buildRequestyFields } from "./requestyKeyResourceFieldPolicy"
import { buildRightCodeFields } from "./rightCodeKeyResourceFieldPolicy"
import { buildSub2ApiFields } from "./sub2ApiKeyResourceFieldPolicy"
import { buildVercelAiGatewayFields } from "./vercelAiGatewayKeyResourceFieldPolicy"
import { buildVoApiV2Fields } from "./voApiV2KeyResourceFieldPolicy"

const resolveSiteFields = (
  editor: (typeof editorKinds)[keyof typeof editorKinds],
  mode: AccountKeyResourceEditorMode,
  descriptors?: readonly ResourceFieldDescriptor[],
): AccountKeyResourceFieldConfiguration => {
  const builders: Record<
    (typeof editorKinds)[keyof typeof editorKinds],
    () => AccountKeyResourceFieldConfiguration
  > = {
    [editorKinds.Novita]: () => buildNovitaFields(mode, descriptors),
    [editorKinds.NanoGpt]: buildNanoGptKeyFields,
    [editorKinds.AimlApi]: () => buildAimlApiFields(mode),
    [editorKinds.Sub2Api]: () => buildSub2ApiFields(mode),
    [editorKinds.RelayFor]: buildRelayForFields,
    [editorKinds.Requesty]: () => buildRequestyFields(mode),
    [editorKinds.VoApiV2]: buildVoApiV2Fields,
    [editorKinds.RightCode]: () => buildRightCodeFields(mode),
    [editorKinds.NameOnly]: () => ({
      fields: [name],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
    [editorKinds.Grsai]: buildGrsaiFields,
    [editorKinds.FoxCode]: () => buildFoxCodeFields(mode),
    // Dahl's transfer editor is selected before this generic field-only builder.
    [editorKinds.Dahl]: () => ({
      fields: [],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
    [editorKinds.Emrank]: () => buildEmRankFields(mode),
    [editorKinds.VercelAiGateway]: () =>
      buildVercelAiGatewayFields(descriptors),
    [editorKinds.Krill]: () => buildKrillFields(mode, descriptors),
    [editorKinds.Daya]: () => buildDayaFields(mode),
    [editorKinds.Pmplan]: () => buildPmplanKeyFields(mode),
    [editorKinds.Pmapi]: buildPmapiFields,
    [editorKinds.Cubence]: () => buildCubenceFields(mode),
    [editorKinds.AiHubMix]: buildAiHubMixFields,
    [editorKinds.NewApi]: () => buildNewApiFamilyFields(descriptors ?? []),
    [editorKinds.Empty]: () => ({
      fields: [],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
    // The full workspace editor is handled before selecting native fields.
    [editorKinds.OpenRouter]: () => ({
      fields: [],
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    }),
  }
  return builders[editor]()
}

/** Frontend-owned field policies are selected by provider, never by upstream labels. */
export function getNativeKeyResourceEditorPresentation(
  siteType: string | undefined,
  mode: AccountKeyResourceEditorMode,
  options?: {
    readonly fields?: readonly ResourceFieldDescriptor[]
    readonly action?: AccountKeyResourceEditAction
  },
): EditorPresentation {
  const action = options?.action
  if (
    action === editActions.Rotate ||
    action === editActions.Enable ||
    action === editActions.Disable
  ) {
    const labels = {
      [editActions.Rotate]: (t: TFunction) =>
        t("keyManagement:native.actions.rotate"),
      [editActions.Enable]: (t: TFunction) =>
        t("keyManagement:native.actions.enable"),
      [editActions.Disable]: (t: TFunction) =>
        t("keyManagement:native.actions.disable"),
    }
    const descriptions = {
      [editActions.Rotate]: (t: TFunction) =>
        t("keyManagement:native.lifecycle.rotateDescription"),
      [editActions.Enable]: (t: TFunction) =>
        t("keyManagement:native.lifecycle.enableDescription"),
      [editActions.Disable]: (t: TFunction) =>
        t("keyManagement:native.lifecycle.disableDescription"),
    }
    return {
      automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
      policy: defineResourceEditorFieldPolicy({ fields: [], hiddenFields: [] }),
      sectionOrder: {},
      sectionLabelResolvers: {},
      title: labels[action],
      submitLabel: labels[action],
      summary: {
        title: labels[action],
        describe: (_values, t) => descriptions[action](t),
      },
    }
  }
  const editor = getKeyResourcePresentationPolicy(siteType).editor
  if (editor === editorKinds.Dahl) {
    return getDahlKeyResourceEditorPresentation(mode, options?.fields)
  }
  if (editor === editorKinds.OpenRouter) {
    return getOpenRouterKeyResourceEditorPresentation(mode)
  }

  const { fields, automaticName, requireFreshOptions, sections } =
    resolveSiteFields(editor, mode, options?.fields)

  return {
    automaticName,
    requireFreshOptions,
    policy: defineResourceEditorFieldPolicy({
      fields,
      hiddenFields: [],
      ...(sections ? { sections } : {}),
    }),
    sectionOrder: {
      basic: 0,
      spending: 1,
      lifecycle: 2,
      limits: 3,
      advanced: 4,
    },
    sectionLabelResolvers: {
      limits: (t) => t("keyManagement:native.editor.budgetsAndLimits"),
      basic: (t) => t("keyManagement:dialog.basicInfo"),
      spending: (t) => t("keyManagement:dialog.quotaSettings"),
      lifecycle: (t) => t("keyManagement:dialog.expiration"),
      advanced: (t) => t("keyManagement:dialog.advancedSettings"),
    },
  }
}
