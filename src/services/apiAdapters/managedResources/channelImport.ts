import type { ManagedSiteType } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_KINDS,
  type ManagedResourceKind,
} from "~/services/accountSiteDefinitions/contracts"
import type {
  ManagedChannelImportCreateSeed,
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
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations"
import { type ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"

interface NativeManagedChannelImportEditor {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  editor: ResourceEditor
}

interface NativeManagedChannelImportSession {
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

const createManagedChannelImportSeed = (
  draft: ManagedSiteChannelDraft,
): ManagedChannelImportCreateSeed => ({
  kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
  name: draft.name,
  channelType: String(draft.type),
  credential: draft.key,
  baseUrl: draft.base_url,
  enabled: draft.enabled,
  models: [...draft.models],
  orderingWeight: draft.weight,
  priority: draft.priority,
  notes: draft.notes ?? "",
})

/** Uses native create rules to validate an import without opening a workspace. */
export function validateNativeManagedChannelImportDraft(
  siteType: ManagedSiteType,
  draft: ManagedSiteChannelDraft,
): ResourceValidationResult {
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
