import { AXON_HUB_CHANNEL_FIELD_IDS } from "~/constants/axonHub"
import type { ResourceOperationOptions } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_RESOURCE_SECRET_STATES,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  axonCredentialRecords,
  canReplaceCredential,
  getCredentialState,
  isRegularAxonHubChannelType,
} from "~/services/apiAdapters/managedResources/axonHubCredentialProjection"
import {
  buildCreateCommand,
  buildUpdateCommand,
} from "~/services/apiAdapters/managedResources/axonHubEditorCommands"
import {
  type AxonHubCreateCommand,
  type AxonHubNativeChannelPatch,
} from "~/services/apiAdapters/managedResources/axonHubEditorContracts"
import {
  createFieldDescriptors,
  createInitialValues,
  editInitialValues,
} from "~/services/apiAdapters/managedResources/axonHubEditorFields"
import { validateValues } from "~/services/apiAdapters/managedResources/axonHubEditorValidation"
import { withCredentialListEditor } from "~/services/apiAdapters/managedResources/credentialListEditor"
import { type NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import type { AxonHubChannel } from "~/types/axonHub"

const createEditor =
  (): NativeResourceEditorDefinition<AxonHubCreateCommand> => ({
    fields: createFieldDescriptors(),
    initialValues: createInitialValues(),
    validate: (values) => validateValues(values, { create: true }),
    buildCommand: buildCreateCommand,
  })

const editEditor = (
  detail: AxonHubChannel,
  loadSecret?: NativeResourceEditorDefinition<AxonHubNativeChannelPatch>["loadSecret"],
): NativeResourceEditorDefinition<AxonHubNativeChannelPatch> => {
  const initialValues = editInitialValues(detail)
  return {
    fields: createFieldDescriptors(detail),
    initialValues,
    validate: (values) =>
      validateValues(values, {
        create: false,
        detail,
        baseline: initialValues,
      }),
    buildCommand: (values) => buildUpdateCommand(detail, initialValues, values),
    ...(loadSecret ? { loadSecret } : {}),
  }
}

/** Builds the complete regular-key create editor, including credential-list behavior. */
export const createAxonHubCreateProjection = () =>
  withCredentialListEditor(
    createEditor(),
    AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    [],
    false,
  )

/** Validates a managed import against the same create projection rules. */
export const validateAxonHubCreateProjection = (
  values: EditableResourceProjection,
) => validateValues(values, { create: true })

/** Builds editing and secret loading around the same sanitized detail and baseline. */
export function createAxonHubEditProjection(
  detail: AxonHubChannel,
  callbacks: {
    loadSecret(
      fieldId: string,
      options?: ResourceOperationOptions,
    ): Promise<string>
    reloadDetail(options?: ResourceOperationOptions): Promise<AxonHubChannel>
  },
) {
  const loadSecret =
    getCredentialState(detail) === MANAGED_RESOURCE_SECRET_STATES.Available &&
    canReplaceCredential(detail)
      ? callbacks.loadSecret
      : undefined
  const base = editEditor(detail, loadSecret)
  if (
    !isRegularAxonHubChannelType(String(detail.type)) ||
    detail.credentials == null
  )
    return base
  return withCredentialListEditor(
    base,
    AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    axonCredentialRecords(detail),
    true,
    async (options) =>
      axonCredentialRecords(await callbacks.reloadDetail(options)),
  )
}
