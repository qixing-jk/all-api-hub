import type { ManagedSiteType } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_KINDS,
  MANAGED_RESOURCE_MODES,
  type ManagedResourceKind,
} from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import type {
  ManagedChannelImportCreateSeed,
  ResourceDisplayFacts,
  ResourceEditor,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { MANAGED_RESOURCE_CREATE_SEED_KINDS } from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations"
import { CHANNEL_STATUS, type ChannelFormData } from "~/types/managedSite"

interface NativeManagedChannelImportEditor {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  editor: ResourceEditor
}

interface NativeManagedChannelImportSession {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  openEditor(
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ): Promise<NativeManagedChannelImportEditor>
  submit(
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ResourceDisplayFacts>>
}

const createManagedChannelImportSeed = (
  draft: ChannelFormData,
): ManagedChannelImportCreateSeed => ({
  kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
  name: draft.name,
  channelType: String(draft.type),
  credential: draft.key,
  baseUrl: draft.base_url,
  enabled: draft.status === CHANNEL_STATUS.Enable,
  models: [...draft.models],
  orderingWeight: draft.weight,
  priority: draft.priority,
  notes: draft.notes ?? "",
})

/** Opens a provider-native create editor when that provider owns import binding. */
export async function openNativeManagedChannelImportEditor(
  siteType: ManagedSiteType,
  draft: ChannelFormData,
  options?: ResourceOperationOptions,
): Promise<NativeManagedChannelImportEditor | null> {
  const session = await openNativeManagedChannelImportSession(siteType, options)
  return session ? await session.openEditor(draft, options) : null
}

/** Opens one reusable native import session for interactive or batch creates. */
export async function openNativeManagedChannelImportSession(
  siteType: ManagedSiteType,
  options?: ResourceOperationOptions,
): Promise<NativeManagedChannelImportSession | null> {
  const kind = MANAGED_RESOURCE_KINDS.Channel
  const registration = getManagedResourceRegistration(siteType, kind)
  const rejectMissingNativeCapability = () => {
    const policy = getAccountSiteDefinition(siteType)?.managedResource
    if (
      policy?.mode === MANAGED_RESOURCE_MODES.NativeResource &&
      policy.primaryKind === kind
    ) {
      throw new Error("native managed channel import capability missing")
    }
  }
  if (!registration) {
    rejectMissingNativeCapability()
    return null
  }
  if (
    !registration.createSeedKinds?.includes(
      MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
    )
  ) {
    rejectMissingNativeCapability()
    return null
  }

  const workspace = await registration.open(options)
  const openEditor = async (
    draft: ChannelFormData,
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
    submit: async (draft, submitOptions) => {
      const prepared = await openEditor(draft, submitOptions)
      return await prepared.editor.submit(
        prepared.editor.initialValues,
        submitOptions,
      )
    },
  }
}
