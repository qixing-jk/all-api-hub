import {
  mapAccountKeyResourceUncertainFailure,
  mapAccountKeyResourceFailure as mapFailure,
} from "~/services/apiAdapters/accountKeyResources/failure"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  mergeResourceEdits,
  resourceValuesEqual,
} from "~/services/apiAdapters/nativeResources/editableChanges"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import {
  collectValidatedInventoryTokens,
  readEditableToken,
  requestWithOptions,
} from "~/services/apiAdapters/newApi/accountKeyInventory"
import { type NewApiAccountTokenDefinition } from "~/services/apiAdapters/newApi/accountKeyResourceConfig"
import {
  toNewApiTokenWrite,
  type NewApiKeyEditCommand,
  type NewApiTokenWriteBody,
} from "~/services/apiAdapters/newApi/keyResourceEditor"
import { type NewApiKeyVariant } from "~/services/apiAdapters/newApi/keyVariant"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"

/** Confirm the editable command, allowing absent fork fields to retain their defaults. */
const matchesNewApiTokenWrite = (
  variant: NewApiKeyVariant,
  token: NewApiToken,
  command: NewApiTokenWriteBody,
  allowQuotaConsumption = false,
) => {
  const actual = toNewApiTokenWrite(token, variant)
  return (Object.keys(command) as (keyof NewApiTokenWriteBody)[]).every(
    (key) =>
      resourceValuesEqual(actual[key], command[key]) ||
      (key === "remain_quota" &&
        allowQuotaConsumption &&
        (actual.remain_quota as number) < (command.remain_quota as number)),
  )
}

export const createNewApiAccountToken: NewApiAccountTokenDefinition["create"] =
  async (config, _scope, command: NewApiKeyEditCommand, options) => {
    const before = await collectValidatedInventoryTokens(config, options)
    const beforeIds = new Set(before.map((token) => token.id))
    const result = await runNativeResourceMutation({
      request: requestWithOptions(config, options),
      execute: (request) =>
        config.transport.createApiToken(request, command.values),
      mapFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (result.certainty === "not-applied") return result
    if (result.certainty === "applied" && result.value === false) {
      return {
        certainty: "not-applied" as const,
        failure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        },
      }
    }
    try {
      const after = await collectValidatedInventoryTokens(config, options)
      const candidates = await Promise.all(
        after
          .filter(
            (token) =>
              !beforeIds.has(token.id) && token.name === command.values.name,
          )
          .map((token) => readEditableToken(config, token, options)),
      )
      const created = candidates.filter((token) =>
        matchesNewApiTokenWrite(config.variant, token, command.values),
      )
      const [createdToken] = created
      if (created.length === 1 && createdToken)
        return {
          certainty: "applied" as const,
          value: { detail: createdToken },
        }
    } catch (error) {
      return {
        certainty: "possibly-applied" as const,
        failure: mapAccountKeyResourceUncertainFailure(error),
      }
    }
    return {
      certainty: "possibly-applied" as const,
      failure: mapAccountKeyResourceUncertainFailure(),
    }
  }

export const updateNewApiAccountToken: NewApiAccountTokenDefinition["update"] =
  async (config, _scope, detail, command: NewApiKeyEditCommand, options) => {
    const latest = toNewApiTokenWrite(detail, config.variant)
    const values = mergeResourceEdits(command.baseline, command.values, latest)
    if (!values)
      return {
        certainty: "not-applied" as const,
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ResourceChanged },
      }
    if (latest.group === "auto" && values.group !== "auto") {
      if (values.cross_group_retry !== undefined)
        values.cross_group_retry = false
      if (values.auto_groups !== undefined) values.auto_groups = null
    }
    if (resourceValuesEqual(values, latest))
      return { certainty: "applied" as const, value: detail }
    const updateResult = await runNativeResourceMutation({
      request: requestWithOptions(config, options),
      execute: async (request) =>
        await config.transport.updateApiToken(request, detail.id, values),
      mapFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (updateResult.certainty === "not-applied") return updateResult
    if (updateResult.certainty === "applied" && updateResult.value === false) {
      return {
        certainty: "not-applied" as const,
        failure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        },
      }
    }
    try {
      const listed = (
        await collectValidatedInventoryTokens(config, options)
      ).find((token) => token.id === detail.id)
      const updated = listed
        ? await readEditableToken(config, listed, options)
        : undefined
      // Quota can decrease between the write and this read. A lost response
      // still requires exact evidence when the user changed the quota itself.
      const allowQuotaConsumption =
        updateResult.certainty === "applied" ||
        values.remain_quota === latest.remain_quota
      return updated &&
        matchesNewApiTokenWrite(
          config.variant,
          updated,
          values,
          allowQuotaConsumption,
        )
        ? { certainty: "applied" as const, value: updated }
        : {
            certainty: "possibly-applied" as const,
            failure: mapAccountKeyResourceUncertainFailure(
              updateResult.certainty === "possibly-applied"
                ? updateResult.failure
                : undefined,
            ),
          }
    } catch (error) {
      return {
        certainty: "possibly-applied" as const,
        failure: mapAccountKeyResourceUncertainFailure(
          updateResult.certainty === "possibly-applied"
            ? updateResult.failure
            : error,
        ),
      }
    }
  }

export const deleteNewApiAccountToken: NewApiAccountTokenDefinition["delete"] =
  async (config, _scope, tokenId, options) => {
    const result = await runNativeResourceMutation({
      request: requestWithOptions(config, options),
      execute: async (request) =>
        await config.transport.deleteApiToken(request, tokenId),
      mapFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    return result.certainty === "applied"
      ? result.value === false
        ? {
            certainty: "not-applied" as const,
            failure: {
              code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
            },
          }
        : { certainty: "applied" as const, value: undefined }
      : result
  }
