import type { ManagedSiteType } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_KINDS,
  type ManagedResourceKind,
} from "~/services/accountSiteDefinitions/contracts"
import type {
  ManagedChannelImportCreateSeed,
  ManagedResourceRef,
  ResourceDisplayFacts,
  ResourceEditor,
  ResourceOperationOptions,
  ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations/contracts"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { type ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"

interface NativeManagedChannelImportEditor {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  editor: ResourceEditor
}

interface NativeManagedChannelImportSession {
  append?(
    ref: ManagedResourceRef,
    draft: ManagedSiteChannelDraft,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ResourceDisplayFacts>>
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  reconcile(options?: ResourceOperationOptions): Promise<void>
  openEditor(
    draft: ManagedSiteChannelDraft,
    options?: ResourceOperationOptions,
  ): Promise<NativeManagedChannelImportEditor>
  submit(
    draft: ManagedSiteChannelDraft,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ResourceDisplayFacts>>
}

/** Whether the native backend can add import keys without replacing channel settings. */
export function supportsNativeManagedChannelExistingImport(
  siteType: ManagedSiteType,
): boolean {
  return (
    getManagedResourceRegistration(siteType, MANAGED_RESOURCE_KINDS.Channel)
      ?.canAppendImportCredentials === true
  )
}

const createManagedChannelImportSeed = (
  draft: ManagedSiteChannelDraft,
): ManagedChannelImportCreateSeed => ({
  kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
  name: draft.name,
  channelType: String(draft.type),
  credential: draft.key,
  ...(draft.credentials ? { credentials: [...draft.credentials] } : {}),
  baseUrl: draft.base_url,
  enabled: draft.enabled,
  models: [...draft.models],
  notes: draft.notes ?? "",
})

/** Native registration decides supported resource types; scheduling stays upstream. */
export function supportsNativeManagedChannelMultiKeyImport(
  siteType: ManagedSiteType,
  draft: ManagedSiteChannelDraft,
): boolean {
  return (
    getManagedResourceRegistration(
      siteType,
      MANAGED_RESOURCE_KINDS.Channel,
    )?.supportsMultipleImportCredentials?.(
      createManagedChannelImportSeed(draft),
    ) === true
  )
}

/** Reject unsupported grouped imports before a workspace can dispatch writes. */
function assertMultipleCredentialSupport(
  siteType: ManagedSiteType,
  draft: ManagedSiteChannelDraft,
) {
  if (
    (draft.credentials?.length ?? 0) > 1 &&
    !supportsNativeManagedChannelMultiKeyImport(siteType, draft)
  ) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }
}

/** Uses native create rules to validate an import without opening a workspace. */
export function validateNativeManagedChannelImportDraft(
  siteType: ManagedSiteType,
  draft: ManagedSiteChannelDraft,
): ResourceValidationResult {
  if (
    draft.credentials &&
    (!draft.credentials.length ||
      draft.credentials.some(
        (key) => !hasUsableManagedSiteChannelKey(key) || /[\r\n]/.test(key),
      ))
  ) {
    return {
      valid: false,
      issues: [{ fieldId: "credential", code: "invalid_value" }],
    }
  }
  assertMultipleCredentialSupport(siteType, draft)
  const registration = getManagedResourceRegistration(
    siteType,
    MANAGED_RESOURCE_KINDS.Channel,
  )
  if (!registration?.validateCreateSeed) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }
  return registration.validateCreateSeed(createManagedChannelImportSeed(draft))
}

/** Opens a provider-native create editor when that provider owns import binding. */
export async function openNativeManagedChannelImportEditor(
  siteType: ManagedSiteType,
  draft: ManagedSiteChannelDraft,
  options?: ResourceOperationOptions,
): Promise<NativeManagedChannelImportEditor> {
  assertMultipleCredentialSupport(siteType, draft)
  const session = await openNativeManagedChannelImportSession(siteType, options)
  return await session.openEditor(draft, options)
}

/** Opens one reusable native import session for interactive or batch creates. */
export async function openNativeManagedChannelImportSession(
  siteType: ManagedSiteType,
  options?: ResourceOperationOptions,
): Promise<NativeManagedChannelImportSession> {
  const kind = MANAGED_RESOURCE_KINDS.Channel
  const registration = getManagedResourceRegistration(siteType, kind)
  if (
    !registration?.createSeedKinds?.includes(
      MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
    )
  ) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }

  const workspace = await registration.open(options)
  const openEditor = async (
    draft: ManagedSiteChannelDraft,
    editorOptions?: ResourceOperationOptions,
  ) => {
    assertMultipleCredentialSupport(siteType, draft)
    const editor = await workspace.openCreateEditor({
      ...editorOptions,
      seed: createManagedChannelImportSeed(draft),
    })
    return {
      siteType,
      kind,
      editor,
    }
  }

  return {
    siteType,
    kind,
    openEditor,
    ...(workspace.appendImportCredentials
      ? {
          append: (
            ref: ManagedResourceRef,
            draft: ManagedSiteChannelDraft,
            appendOptions?: ResourceOperationOptions,
          ) => {
            assertMultipleCredentialSupport(siteType, draft)
            return workspace.appendImportCredentials!(
              ref,
              createManagedChannelImportSeed(draft),
              appendOptions,
            )
          },
        }
      : {}),
    reconcile: async (reconcileOptions) => {
      await workspace.list(undefined, reconcileOptions)
    },
    submit: async (draft, submitOptions) => {
      const prepared = await openEditor(draft, submitOptions)
      return await prepared.editor.submit(
        prepared.editor.initialValues,
        submitOptions,
      )
    },
  }
}
