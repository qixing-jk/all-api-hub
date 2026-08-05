import type { TFunction } from "i18next"

import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/managedResourceNative"

export type ResourceFieldTextResolver = (t: TFunction) => string

type ResourceFieldPresentationBase<TSection extends string = string> = {
  fieldId: string
  section: TSection
  order: number
  renderer: ResourceFieldDescriptor["type"]
  resolveLabel: ResourceFieldTextResolver
  resolveHelp?: ResourceFieldTextResolver
  resolvePlaceholder?: ResourceFieldTextResolver
  rows?: number
  optionLabelResolvers?: Readonly<Record<string, ResourceFieldTextResolver>>
  resolveOptionFallback?: ResourceFieldTextResolver
  optionSourceFieldIds?: readonly string[]
  customValuesMirrorFieldId?: string
  autoSelectFirstOption?: boolean
  issueLabelResolvers?: Partial<
    Record<ResourceFieldIssue["code"], ResourceFieldTextResolver>
  >
  visibleWhen?: (values: EditableResourceProjection) => boolean
}

export type ResourceFieldPresentation<TSection extends string = string> =
  | (ResourceFieldPresentationBase<TSection> & {
      renderer: "select"
      /** Frontend-owned label for clearing a nullable single-select projection. */
      resolveNullableOptionLabel?: ResourceFieldTextResolver
    })
  | (ResourceFieldPresentationBase<TSection> & {
      renderer: Exclude<ResourceFieldDescriptor["type"], "select">
      resolveNullableOptionLabel?: never
    })

export type ResourceFieldHiddenField = {
  fieldId: string
  reason: "deferred" | "read-only" | "unsupported"
}

export type ResourceEditorFieldPolicy<TSection extends string = string> = {
  fields: readonly ResourceFieldPresentation<TSection>[]
  hiddenFields: readonly ResourceFieldHiddenField[]
}

export const RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS = {
  loading: (t: TFunction) => t("common:status.loading"),
  empty: (t: TFunction) => t("ui:multiSelect.noOptions"),
  error: (t: TFunction) => t("common:status.error"),
  retry: (t: TFunction) => t("common:actions.retry"),
} as const

const rendererValues = new Set<ResourceFieldDescriptor["type"]>([
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "multi-select",
  "secret",
  "date-time",
])

const assertPolicy = <TSection extends string>(
  policy: ResourceEditorFieldPolicy<TSection>,
) => {
  const classified = new Set<string>()
  for (const field of policy.fields) {
    if (
      !field.fieldId ||
      classified.has(field.fieldId) ||
      !rendererValues.has(field.renderer) ||
      !Number.isFinite(field.order)
    ) {
      throw new Error("invalid resource field policy")
    }
    if (
      field.resolveNullableOptionLabel !== undefined &&
      field.renderer !== "select"
    ) {
      throw new Error("invalid resource field policy")
    }
    if (
      field.rows !== undefined &&
      (field.renderer !== "textarea" ||
        !Number.isInteger(field.rows) ||
        field.rows < 2 ||
        field.rows > 12)
    ) {
      throw new Error("invalid resource field policy")
    }
    if (
      field.optionSourceFieldIds !== undefined &&
      (field.renderer !== "select" ||
        field.optionSourceFieldIds.length === 0 ||
        field.optionSourceFieldIds.some((fieldId) => !fieldId) ||
        new Set(field.optionSourceFieldIds).size !==
          field.optionSourceFieldIds.length)
    ) {
      throw new Error("invalid resource field policy")
    }
    if (
      field.customValuesMirrorFieldId !== undefined &&
      (field.renderer !== "multi-select" ||
        !field.customValuesMirrorFieldId ||
        field.customValuesMirrorFieldId === field.fieldId)
    ) {
      throw new Error("invalid resource field policy")
    }
    if (
      field.autoSelectFirstOption &&
      (!field.optionSourceFieldIds || field.optionSourceFieldIds.length === 0)
    ) {
      throw new Error("invalid resource field policy")
    }
    classified.add(field.fieldId)
  }
  for (const field of policy.hiddenFields) {
    if (!field.fieldId || classified.has(field.fieldId)) {
      throw new Error("invalid resource field policy")
    }
    classified.add(field.fieldId)
  }
}

/** Defines frontend-owned presentation without accepting adapter layout metadata. */
export function defineResourceEditorFieldPolicy<
  TSection extends string,
  TPolicy extends ResourceEditorFieldPolicy<TSection>,
>(policy: TPolicy): TPolicy {
  assertPolicy(policy)
  return policy
}

/** Correlates fact-only descriptors with frontend-owned presentation metadata. */
export function resolveResourceFieldPolicy<TSection extends string>(
  descriptors: readonly ResourceFieldDescriptor[],
  policy: ResourceEditorFieldPolicy<TSection>,
  sectionOrder: Readonly<Record<TSection, number>>,
) {
  try {
    assertPolicy(policy)
  } catch {
    throw new Error("resource field policy mismatch")
  }
  const descriptorsByFieldId = new Map(
    descriptors.map((descriptor) => [descriptor.fieldId, descriptor]),
  )
  const classifiedFieldIds = new Set([
    ...policy.fields.map((field) => field.fieldId),
    ...policy.hiddenFields.map((field) => field.fieldId),
  ])
  if (
    descriptorsByFieldId.size !== descriptors.length ||
    classifiedFieldIds.size !== descriptors.length ||
    [...classifiedFieldIds].some(
      (fieldId) => !descriptorsByFieldId.has(fieldId),
    )
  ) {
    throw new Error("resource field policy mismatch")
  }

  const fields = policy.fields
    .map((presentation) => {
      const descriptor = descriptorsByFieldId.get(presentation.fieldId)
      if (
        !descriptor ||
        descriptor.type !== presentation.renderer ||
        (presentation.resolveNullableOptionLabel !== undefined &&
          !descriptor.nullable) ||
        sectionOrder[presentation.section] === undefined
      ) {
        throw new Error("resource field policy mismatch")
      }
      return { descriptor, presentation }
    })
    .sort(
      (first, second) =>
        sectionOrder[first.presentation.section] -
          sectionOrder[second.presentation.section] ||
        first.presentation.order - second.presentation.order,
    )

  return { fields, hiddenFields: policy.hiddenFields }
}

export const getResourceFieldOptionLabel = <TSection extends string>(
  presentation: ResourceFieldPresentation<TSection>,
  value: string,
  t: TFunction,
) => {
  const resolver =
    presentation.optionLabelResolvers &&
    Object.prototype.hasOwnProperty.call(
      presentation.optionLabelResolvers,
      value,
    )
      ? presentation.optionLabelResolvers[value]
      : undefined
  return resolver
    ? resolver(t)
    : presentation.resolveOptionFallback?.(t) ?? value
}
