import { MAGPIE_ENDPOINT_FIELDS } from "~/constants/magpie"
import {
  ManagedResourceError,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/editor"
import {
  magpieEditor,
  validateMagpieConnectionValues,
  type MagpieProviderCommand,
} from "~/services/apiAdapters/managedResources/magpie/editorProjection"
import { magpieKeyFingerprint } from "~/services/apiService/magpie/keyIdentity"
import {
  discoverMagpieModels,
  readMagpieProviderKey,
  type MagpieProvider,
} from "~/services/apiService/magpie/providers"
import { buildMagpieProviderSavePayload } from "~/services/apiService/magpie/providerUpdate"
import type { MagpieConfig } from "~/types/magpieConfig"

/** Bind explicit model discovery and secret reads to this editor's deployment. */
export function magpieNativeEditor(
  config: MagpieConfig,
  detail?: MagpieProvider,
): NativeResourceEditorDefinition<MagpieProviderCommand> {
  return {
    ...magpieEditor(detail),
    ...(detail
      ? {
          loadSecret: async (
            fieldId: string,
            options?: ResourceOperationOptions,
          ) => {
            const primary = detail.keyList?.find((key) => key.active)
            if (
              fieldId !== "key" &&
              (!primary || fieldId !== `keyPool:${primary.id}`)
            )
              throw new ManagedResourceError({ code: "validation_failed" })
            const secret = await readMagpieProviderKey(
              config,
              detail.id,
              options,
            )
            if (
              fieldId !== "key" &&
              (await magpieKeyFingerprint(secret)) !== primary?.id
            )
              throw new ManagedResourceError({ code: "resource_changed" })
            return secret
          },
        }
      : {}),
    loadOptions: async (fieldId, values, options) => {
      if (
        fieldId !== "supportedModels" ||
        !validateMagpieConnectionValues(values, detail).valid
      )
        throw new ManagedResourceError({ code: "validation_failed" })
      const intent = values.key
      const key =
        intent &&
        typeof intent === "object" &&
        "kind" in intent &&
        intent.kind === "replace" &&
        "value" in intent
          ? String(intent.value).trim()
          : detail?.key.set
            ? await readMagpieProviderKey(config, detail.id, options)
            : ""
      const fields = {
        ...Object.fromEntries(
          [...MAGPIE_ENDPOINT_FIELDS, "proxy"].map((field) => [
            field,
            String(values[field] ?? "").trim(),
          ]),
        ),
        key,
        headers: JSON.parse(String(values.headers ?? "").trim() || "{}"),
        ...(!detail?.preset
          ? {
              modelsURL: String(values.modelsURL ?? "").trim(),
              catalog: String(values.catalog ?? "").trim(),
            }
          : {}),
      }
      // /list reads models without the pruning performed by /models. Preserve
      // native catalog/preset settings, and use unsaved connection edits.
      const payload = detail
        ? buildMagpieProviderSavePayload(detail, fields)
        : fields
      return (await discoverMagpieModels(config, payload, options)).map(
        (value) => ({ value }),
      )
    },
  }
}
