import type { TFunction } from "i18next"

import type { ResourceEditorFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import type {
  EditableResourceProjection,
  ResourceFailure,
  ResourceFieldDescriptor,
  ResourceFieldOption,
} from "~/services/apiAdapters/contracts/accountKeyResource"

/** Provider-owned presentation rules consumed by the shared editor shell. */
export type AccountKeyResourceEditorPresentation = {
  policy: ResourceEditorFieldPolicy
  sectionOrder: Readonly<Record<string, number>>
  sectionLabelResolvers: Readonly<Record<string, (t: TFunction) => string>>
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
