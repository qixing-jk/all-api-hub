import type { TFunction } from "i18next"
import { type ReactNode } from "react"

import {
  type resolveResourceFieldPolicy,
  type ResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
} from "~/features/ResourceEditor/resourceFieldPolicy"
import {
  type ResourceEditorControlledOptionState,
  type useLoadedResourceOptions,
} from "~/features/ResourceEditor/useLoadedResourceOptions"
import type { ResourceOptionLoadState } from "~/features/ResourceEditor/useLoadedResourceOptions"
import { type useResourceSelectFieldState } from "~/features/ResourceEditor/useResourceSelectFieldState"
import type {
  EditableResourceProjection,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldOption,
  ResourceFieldValue,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/resourceNative"

export type ResourceFieldRenderOverride<TSection extends string = string> =
  (field: {
    descriptor: ResourceFieldDescriptor
    presentation: ResourceFieldPresentation<TSection>
    label: string
    errorMessage?: string
    describedBy?: string
    disabled: boolean
    options?: readonly ResourceFieldOption[]
    optionControl?: ReactNode
  }) => ReactNode | undefined

export type ResourceEditorSectionRenderOverride<TSection extends string> = (
  section: TSection,
  label: string,
  children: ReactNode,
) => ReactNode | undefined

export type NativeResourceEditorBodyProps<TSection extends string> = {
  t: TFunction
  descriptors: readonly ResourceFieldDescriptor[]
  policy: ResourceEditorFieldPolicy<TSection>
  sectionOrder: Readonly<Record<TSection, number>>
  sectionLabelResolvers: Readonly<Record<TSection, (t: TFunction) => string>>
  values: EditableResourceProjection
  fieldIssues?: readonly ResourceFieldIssue[]
  disabled?: boolean
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
  onLoadSecret?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
  onLoadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
  controlledOptionStates?: Readonly<
    Record<string, ResourceEditorControlledOptionState | undefined>
  >
  onRetryControlledOptions?: (fieldId: string) => void
  renderFieldOverride?: ResourceFieldRenderOverride<TSection>
  renderSectionOverride?: ResourceEditorSectionRenderOverride<TSection>
}

/** Resolved field policy shared by the field container and native controls. */
export type NativeResourceResolvedField<TSection extends string> = ReturnType<
  typeof resolveResourceFieldPolicy<TSection>
>["fields"][number]
/** The editor owns option loading and selection; field renderers consume its snapshot. */
export type NativeResourceFieldContext<TSection extends string> = Pick<
  NativeResourceEditorBodyProps<TSection>,
  | "t"
  | "values"
  | "onValueChange"
  | "onLoadSecret"
  | "onLoadOptions"
  | "controlledOptionStates"
  | "onRetryControlledOptions"
  | "renderFieldOverride"
> & {
  disabled: boolean
  issuesByFieldId: ReadonlyMap<string, ResourceFieldIssue["code"]>
  optionLoading: ReturnType<typeof useLoadedResourceOptions>
  selection: ReturnType<typeof useResourceSelectFieldState>
}
/** Accessible labels and option feedback derived once by the field container. */
export type NativeResourceFieldDecoration = {
  id: string
  label: string
  describedBy?: string
  fieldDisabled: boolean
  errorMessage?: string
  help: ReactNode
  error: ReactNode
  optionControl?: ReactNode
  isManualOptionLoader: boolean
  optionState?: ResourceOptionLoadState | ResourceEditorControlledOptionState
  controlledOptionState?: ResourceEditorControlledOptionState
  resolvedOptions?: readonly ResourceFieldOption[]
}
