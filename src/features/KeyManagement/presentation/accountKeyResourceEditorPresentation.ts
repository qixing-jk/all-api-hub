import type { TFunction } from "i18next"

import type { ResourceFieldRenderOverride } from "~/features/ResourceEditor/model/nativeResourceEditorContracts"
import type { ResourceEditorFieldPolicy } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import type {
  EditableResourceProjection,
  ResourceFailure,
  ResourceFieldDescriptor,
  ResourceFieldOption,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ResourceFieldValue } from "~/services/apiAdapters/contracts/resourceNative"

/** Provider-owned presentation rules consumed by the shared editor shell. */
export type AccountKeyResourceEditorPresentation = {
  policy: ResourceEditorFieldPolicy
  sectionOrder: Readonly<Record<string, number>>
  sectionLabelResolvers: Readonly<Record<string, (t: TFunction) => string>>
  title?: (t: TFunction, values: EditableResourceProjection) => string
  submitLabel?: (t: TFunction, values: EditableResourceProjection) => string
  canSubmit?: (values: EditableResourceProjection) => boolean
  renderField?: (
    field: Parameters<ResourceFieldRenderOverride>[0],
    context: {
      values: EditableResourceProjection
      initialValues: EditableResourceProjection
      onValueChange: (fieldId: string, value: ResourceFieldValue) => void
      onSubmit: () => void
    },
  ) => ReturnType<ResourceFieldRenderOverride>
  getAutomaticName?: (
    values: EditableResourceProjection,
    optionsByField?: Readonly<Record<string, readonly ResourceFieldOption[]>>,
  ) => string | undefined
  /** Some providers must validate even unchanged selections against fresh options. */
  requireFreshOptions?: boolean
  getOptionFeedback?: (
    descriptor: ResourceFieldDescriptor,
    options: readonly ResourceFieldOption[] | undefined,
    failure: ResourceFailure | undefined,
    t: TFunction,
  ) => { ignoreFailure?: boolean; emptyMessage?: string }
  summary?: {
    title: (t: TFunction) => string
    describe: (
      values: EditableResourceProjection,
      t: TFunction,
      language: string,
    ) => string
  }
  collapsibleSection?: {
    id: string
    initiallyOpen: (values: EditableResourceProjection) => boolean
  }
}
