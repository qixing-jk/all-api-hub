import {
  ManagedResourceError,
  type ManagedResourceKeyCleanup,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"

/** Scalar native editors preserve their remaining fields through their own command builder. */
export async function scalarKeyCleanup<T>(
  editor: NativeResourceEditorDefinition<T>,
  submit: (
    command: T,
    options?: ResourceOperationOptions,
  ) => Promise<ManagedSiteMutationResult<unknown>>,
  options?: ResourceOperationOptions,
  delimited = false,
  fields = { key: "key", baseUrl: "baseURL" },
  detailSecret?: string,
): Promise<ManagedResourceKeyCleanup> {
  const secret = editor.fields.find(
    (field) => field.fieldId === fields.key && field.type === "secret",
  )
  if (!secret || !editor.loadSecret)
    throw new ManagedResourceError({ code: "unavailable" })
  const value = hasUsableManagedSiteChannelKey(detailSecret)
    ? detailSecret!
    : await editor.loadSecret(fields.key, options)
  const keys = delimited
    ? value
        .split("\n")
        .map((key) => key.trim())
        .filter(Boolean)
    : [value.trim()]
  if (!keys.length || keys.some((key) => !hasUsableManagedSiteChannelKey(key)))
    throw new ManagedResourceError({ code: "unavailable" })
  return {
    baseUrls: [String(editor.initialValues[fields.baseUrl] ?? "")],
    keys,
    remove: async (indices, operationOptions) => {
      if (secret.type !== "secret" || !secret.canReplace)
        throw new ManagedResourceError({ code: "validation_failed" })
      const remaining = keys.filter((_, index) => !indices.includes(index))
      if (!remaining.length)
        throw new ManagedResourceError({ code: "validation_failed" })
      const values = {
        ...editor.initialValues,
        [fields.key]: { kind: "replace" as const, value: remaining.join("\n") },
      }
      const validation = editor.validate(values)
      if (!validation.valid)
        throw new ManagedResourceError({
          code: "validation_failed",
          fieldIssues: validation.issues,
        })
      return submit(editor.buildCommand(values), operationOptions)
    },
  }
}
