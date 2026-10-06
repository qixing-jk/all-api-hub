import type { TFunction } from "i18next"

import { type ManagedSiteType } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_KINDS,
  type ManagedResourceKind,
} from "~/services/accountSiteDefinitions/contracts"

import {
  createManagedResourceFieldPolicyRegistry,
  getFieldValuePresentationFromDefinition,
  getManagedResourceFieldOptionLabel,
  MANAGED_RESOURCE_CHANNEL_FIELD_ROLES,
  MANAGED_RESOURCE_EDITOR_MODES,
  resolveUnsupportedResourceType,
  type ManagedResourceEditorMode,
} from "./managedResourceFieldPresentation"
import { managedSitePresentationDefinitions } from "./managedSitePresentationRegistry"

export {
  MANAGED_RESOURCE_CHANNEL_FIELD_ROLES,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_SECTIONS,
  MANAGED_RESOURCE_SECTION_ORDER,
  type ManagedResourceChannelFieldRole,
  type ManagedResourceEditorFieldPolicy,
  type ManagedResourceEditorMode,
  type ManagedResourceFieldPresentation,
  type ManagedResourceSection,
  type ManagedResourceTextResolver,
  adaptManagedCredentialPolicy,
  createManagedResourceFieldPolicyRegistry,
  defineManagedResourceFieldPolicy,
  getManagedResourceFieldOptionLabel,
} from "./managedResourceFieldPresentation"

const managedResourceFieldPolicyRegistry =
  createManagedResourceFieldPolicyRegistry(
    managedSitePresentationDefinitions.flatMap(
      (definition) => definition.fieldPolicies,
    ),
  )

export const getManagedResourceFieldPolicy = (
  siteType: ManagedSiteType,
  kind: ManagedResourceKind,
  mode: ManagedResourceEditorMode,
) => managedResourceFieldPolicyRegistry.get(siteType, kind, mode)

/** Reuses the registered field vocabulary in non-editor presentation. */
export const getManagedResourceFieldValuePresentation = (
  siteType: ManagedSiteType,
  kind: ManagedResourceKind,
  fieldId: string,
) =>
  getFieldValuePresentationFromDefinition(
    managedResourceFieldPolicyRegistry.getDefinition(siteType, kind),
    fieldId,
  )

/** Uses the editor vocabulary to label native resource types. */
export function getManagedResourceTypeLabel(
  siteType: ManagedSiteType,
  value: string | number,
  t: TFunction,
): string {
  const field = getManagedResourceFieldPolicy(
    siteType,
    MANAGED_RESOURCE_KINDS.Channel,
    MANAGED_RESOURCE_EDITOR_MODES.Create,
  )?.fields.find(
    (candidate) =>
      candidate.resourceType ||
      candidate.channelFieldRole === MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type,
  )
  if (!field || (typeof value === "number" && !field.optionLabelResolvers)) {
    return resolveUnsupportedResourceType(t)
  }
  return getManagedResourceFieldOptionLabel(field, String(value).trim(), t)
}
