import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { type AccountKeyScope } from "~/services/apiAdapters/contracts/accountKeyResource"
import { toDetail } from "~/services/apiAdapters/openrouter/accountKeyDisplayFacts"
import {
  assertKeyCorrelation,
  assertKeyScope,
} from "~/services/apiAdapters/openrouter/accountKeyInventory"
import { type OpenRouterAccountKeyDefinition } from "~/services/apiAdapters/openrouter/accountKeyResourceConfig"
import {
  getStructuredStatus,
  isKnownRejection,
  isUnreconciledMutationFailure,
  mutationFailure,
  read,
  requestWithOptions,
} from "~/services/apiAdapters/openrouter/accountKeyRuntime"
import {
  createOpenRouterKey,
  deleteOpenRouterKey,
  fetchOpenRouterKey,
  updateOpenRouterKey,
} from "~/services/apiService/openrouter"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { t } from "~/utils/i18n/core"

export const createOpenRouterKeyResource: OpenRouterAccountKeyDefinition["create"] =
  async (config, _scope, command, options) => {
    let created: Awaited<ReturnType<typeof createOpenRouterKey>>
    try {
      // OpenRouter only returns plaintext `key` in this POST response; do not retry a lost acknowledgement.
      created = await createOpenRouterKey(
        requestWithOptions(config, options),
        command.input,
      )
    } catch (error) {
      return mutationFailure(error, config)
    }

    const appliedScopeKey = created.key.workspace_id
    const appliedScope: AccountKeyScope =
      appliedScopeKey === command.destinationScope.scopeKey
        ? command.destinationScope
        : {
            ...command.destinationScope,
            scopeKey: appliedScopeKey,
            routeKey: appliedScopeKey,
            displayName:
              config.workspaceNames.get(appliedScopeKey) ??
              t("keyManagement:openRouter.editor.options.workspace.unknown"),
            isDefault: appliedScopeKey === config.defaultWorkspace.id,
          }
    const detail = toDetail(config, created.key, appliedScope)
    const ref = {
      accountId: config.account.id,
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: appliedScopeKey,
      resourceId: created.key.hash,
    }
    return {
      certainty: "applied" as const,
      value: {
        detail,
        scopeKey: appliedScopeKey,
        createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
          ref,
          displayName: created.key.name,
          secret: created.plaintextKey,
          credential: {
            accountName: config.account.name ?? "OpenRouter",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: OPENROUTER_API_BASE_URL,
            siteType: SITE_TYPES.OPENROUTER,
            tagIds: [],
          },
        }),
      },
    }
  }

export const updateOpenRouterKeyResource: OpenRouterAccountKeyDefinition["update"] =
  async (config, scope, detail, command, options) => {
    if (Object.keys(command.input).length === 0)
      return { certainty: "applied" as const, value: detail }
    try {
      return {
        certainty: "applied" as const,
        value: toDetail(
          config,
          assertKeyScope(
            await updateOpenRouterKey(
              requestWithOptions(config, options),
              detail.key.hash,
              command.input,
            ),
            scope,
          ),
          scope,
        ),
      }
    } catch (error) {
      if (isKnownRejection(error)) {
        return mutationFailure(error, config, [detail.key.hash])
      }
      if (isUnreconciledMutationFailure(error)) {
        return mutationFailure(error, config, [detail.key.hash])
      }
      try {
        const current = toDetail(
          config,
          assertKeyScope(
            await fetchOpenRouterKey(
              requestWithOptions(config, options),
              detail.key.hash,
            ),
            scope,
          ),
          scope,
        )
        const matches =
          (command.requested.name === undefined ||
            current.key.name === command.requested.name) &&
          (command.requested.disabled === undefined ||
            current.key.disabled === command.requested.disabled) &&
          (command.requested.limit === undefined ||
            current.key.limit === command.requested.limit) &&
          (command.requested.limitReset === undefined ||
            current.key.limit_reset === command.requested.limitReset) &&
          (command.requested.includeByokInLimit === undefined ||
            current.key.include_byok_in_limit ===
              command.requested.includeByokInLimit)
        return matches
          ? { certainty: "applied" as const, value: current }
          : mutationFailure(error, config, [detail.key.hash])
      } catch {
        return mutationFailure(error, config, [detail.key.hash])
      }
    }
  }

export const deleteOpenRouterKeyResource: OpenRouterAccountKeyDefinition["delete"] =
  async (config, scope, hash, options) => {
    await read(
      config,
      async () =>
        assertKeyCorrelation(
          await fetchOpenRouterKey(requestWithOptions(config, options), hash),
          scope,
          hash,
        ),
      [hash],
    )
    try {
      await deleteOpenRouterKey(requestWithOptions(config, options), hash)
      return { certainty: "applied" as const, value: undefined }
    } catch (error) {
      if (isKnownRejection(error)) {
        return mutationFailure(error, config, [hash])
      }
      if (isUnreconciledMutationFailure(error)) {
        return mutationFailure(error, config, [hash])
      }
      try {
        await fetchOpenRouterKey(requestWithOptions(config, options), hash)
        return mutationFailure(error, config, [hash])
      } catch (readError) {
        if (getStructuredStatus(readError) === 404)
          return { certainty: "applied" as const, value: undefined }
        return mutationFailure(error, config, [hash])
      }
    }
  }
