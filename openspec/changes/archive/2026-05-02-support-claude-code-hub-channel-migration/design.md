## Context

All API Hub already has a create-only managed-site channel migration workflow centered on `prepareManagedSiteChannelMigrationPreview(...)` and `executeManagedSiteChannelMigration(...)` in `src/services/managedSites/channelMigration.ts`. The workflow already owns target selection, preview warnings, row-level blockers, source-key resolution, execution through `ManagedSiteService`, and per-channel result reporting.

Claude Code Hub is already implemented as a managed site through `src/services/managedSites/providers/claudeCodeHub.ts` and `src/services/apiService/claudeCodeHub/`. Its inventory object is a provider rather than a New API channel, and provider creation uses `/api/actions/providers/addProvider` with string provider types, URL, key, allowed model rules, enablement, weight, priority, and group tag. Existing provider rows normalize into the shared `ManagedSiteChannel` shape, but current migration gating explicitly excludes Claude Code Hub.

Nearest existing reuse points:

- Reuse `src/features/ManagedSiteChannels/ManagedSiteChannels.tsx` migration entry-point gating instead of creating a Claude Code Hub-specific migration page.
- Extend `src/services/managedSites/utils/managedSite.ts#getManagedSiteTargetOptions(...)` so configured Claude Code Hub targets are eligible through the same target enumeration path.
- Extend `src/services/managedSites/channelMigration.ts` for Claude Code Hub source/target type mapping, draft defaults, warnings, and source-key handling.
- Reuse `src/services/managedSites/managedSiteService.ts#getManagedSiteServiceForType(...)` so execution still calls the target service's `buildChannelPayload(...)` and `createChannel(...)`.
- Reuse `src/services/managedSites/providers/claudeCodeHub.ts#buildChannelPayload(...)` and `createChannel(...)` so final creation continues to use Claude Code Hub provider action endpoints and existing validation.
- Reuse existing migration warning and blocked-reason types in `src/types/managedSiteMigration.ts` where they describe the same loss or safety condition; add narrow codes only if Claude Code Hub introduces a distinct user-facing reason.

## Goals / Non-Goals

**Goals:**

- Allow Claude Code Hub to be selected as a migration source when it is the active managed-site type and at least one other eligible target is configured.
- Allow Claude Code Hub to be selected as a migration target when complete Claude Code Hub admin credentials are configured and Claude Code Hub is not the active source.
- Convert Claude Code Hub provider rows into shared migration drafts for non-Claude-Code-Hub targets when usable key material is available.
- Convert non-Claude-Code-Hub source channels into Claude Code Hub provider drafts using Claude Code Hub-compatible provider types and defaults.
- Preserve the existing create-only migration contract: no source mutation, no target sync or overwrite, no rollback, and per-channel execution results.
- Keep secret handling strict by blocking rows whose only available provider key is masked or missing.
- Add focused tests for target eligibility, source/target preview drafts, warning/blocker behavior, Claude Code Hub create payloads, and unchanged behavior for existing migration-capable managed sites.

**Non-Goals:**

- Revealing full Claude Code Hub provider keys when upstream only exposes masked keys.
- Syncing, updating, merging, deduplicating, or deleting existing target providers.
- Migrating unsupported Claude Code Hub provider internals beyond fields represented by the shared channel form.
- Adding model sync, model redirect, full key reveal, or provider-key rotation for Claude Code Hub.
- Adding a background/resumable migration job for large provider inventories.

## Decisions

### 1. Reuse the existing managed-site migration workflow

**Decision:** Extend the existing migration UI, target option helper, preview builder, and execution path rather than adding a Claude Code Hub-specific migration workflow.

**Rationale:** Claude Code Hub needs provider-specific field mapping, not a different user flow. The current workflow already provides the safety properties this change needs: explicit target choice, preview before execution, row-level blocking, create-only semantics, and per-channel results.

**Alternative considered:** Add a separate Claude Code Hub provider migration page. Rejected because it would duplicate migration safeguards and create inconsistent behavior for a managed site that already fits the shared `ManagedSiteService` abstraction.

### 2. Treat migration eligibility as a managed-site capability, not a New API-only capability

**Decision:** Remove the categorical Claude Code Hub exclusion from migration entry-point gating and target enumeration. Keep Claude Code Hub excluded from unrelated unsupported actions such as model sync, model redirect, base-URL lookup, and full key reveal.

**Rationale:** The existing code has separate concepts for migration and New API-only channel actions. Claude Code Hub can support create-only migration without implying support for every managed-site control.

**Alternative considered:** Keep Claude Code Hub target-only support and disallow Claude Code Hub sources. Rejected because provider rows already normalize to `ManagedSiteChannel`; the preview can safely block rows with masked or missing keys instead of disabling the whole source type.

### 3. Map provider types at the migration boundary

**Decision:** Add explicit Claude Code Hub source-to-shared and shared-to-Claude-Code-Hub type maps in `channelMigration.ts`, near the existing AxonHub and Octopus mappings.

Expected source mapping:

- `openai-compatible` and `codex` -> `ChannelType.OpenAI`
- `claude` -> `ChannelType.Anthropic`
- `gemini` -> `ChannelType.Gemini`
- Unknown or unrecognized Claude Code Hub provider types -> `ChannelType.OpenAI` with a remapping warning

Expected target mapping:

- OpenAI-compatible, custom, Azure-like, OpenRouter-like, DeepSeek-like, SiliconFlow-like, XAI-like, Ollama-like, and other unmapped shared types -> `openai-compatible`
- `ChannelType.Anthropic` -> `claude`
- `ChannelType.Gemini` and `ChannelType.VertexAi` -> `gemini`

**Rationale:** The preview draft is the right boundary for converting a source channel into a target channel form. Keeping conversion there lets the dialog warn users about remapping before creation, while leaving the Claude Code Hub provider service focused on validating and sending provider action payloads.

**Alternative considered:** Teach `claudeCodeHub.buildChannelPayload(...)` to accept all New API numeric channel types. Rejected because payload builders do not know the source backend and cannot attach preview warnings.

### 4. Use Claude Code Hub defaults for target drafts

**Decision:** When Claude Code Hub is the target, build drafts with Claude Code Hub-safe defaults:

- `type`: mapped Claude Code Hub provider type, falling back to `openai-compatible`
- `key`: resolved usable source key
- `base_url`: trimmed source base URL
- `models`: normalized source model list
- `groups`: source group when representable, otherwise `default`
- `priority`: source priority when representable, otherwise `0`
- `weight`: source weight when representable, otherwise `1`
- `status`: enabled only when the source is enabled, otherwise disabled

**Rationale:** These defaults align with `DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS` and `buildClaudeCodeHubCreatePayloadFromFormData(...)`, while preserving the fields Claude Code Hub can safely create through the shared form.

**Alternative considered:** Preserve every shared channel field verbatim. Rejected because Claude Code Hub provider action payloads do not support every New API channel field, and blindly preserving unsupported values risks corrupt or rejected provider creates.

### 5. Block masked or missing source keys at preview time

**Decision:** Reuse `resolveSourceChannelKey(...)` and `hasUsableManagedSiteChannelKey(...)` for Claude Code Hub sources. If `_claudeCodeHubData.key` or the normalized row key contains a real usable key, the row may be ready. If only `maskedKey` is available, block only that row with the existing source-key missing or resolution-failed reason.

**Rationale:** Migration must never create a target channel using a masked display value. Blocking at preview time gives users a clear per-row explanation without mutating the source or attempting unsafe creates.

**Alternative considered:** Let users migrate Claude Code Hub sources with masked keys and ask them to fix failures later. Rejected because it would send known-invalid secrets to target backends and produce avoidable failures.

### 6. Execute through the target managed-site service

**Decision:** Keep `executeManagedSiteChannelMigration(...)` unchanged in shape: for each ready draft, call `targetService.buildChannelPayload(item.draft)` and `targetService.createChannel(...)`.

**Rationale:** This keeps Claude Code Hub target creation behind `providers/addProvider`, existing token-safe error handling, model validation, and create response normalization.

**Alternative considered:** Call Claude Code Hub API actions directly from the migration service. Rejected because it would bypass the managed-site provider abstraction and duplicate payload validation.

### 7. Reuse warning codes unless Claude Code Hub needs a distinct reason

**Decision:** Reuse existing warning codes for dropped mappings, dropped advanced settings, type remapping, default group forcing, ignored priority, ignored weight, and status simplification. Add a new warning code only if implementation needs to distinguish a Claude Code Hub-specific provider option loss that existing copy cannot describe.

**Rationale:** The warning model is intentionally backend-neutral. Reusing it avoids unnecessary i18n churn and keeps the dialog understandable.

**Alternative considered:** Add Claude Code Hub-specific warnings for every provider field. Rejected because most expected losses already match existing migration warning semantics.

## Risks / Trade-offs

- [Risk] Claude Code Hub provider lists may expose only masked keys. -> Mitigation: block affected source rows during preview and do not offer key reveal unless upstream exposes a supported action.
- [Risk] Provider type mapping may be imperfect for source backends that do not map cleanly to Claude Code Hub's four user-facing provider types. -> Mitigation: use explicit maps, warn on remapping/defaulting, and fall back conservatively to `openai-compatible`.
- [Risk] Some Claude Code Hub provider fields are not represented in the shared migration draft. -> Mitigation: migrate only supported create fields and show existing field-loss warnings where source data would be dropped or simplified.
- [Risk] Target Claude Code Hub creation may reject empty model lists, unsupported provider types, or invalid URL/key combinations. -> Mitigation: rely on `buildClaudeCodeHubCreatePayloadFromFormData(...)` validation and report failures per channel without aborting the whole run.
- [Risk] Removing the migration exclusion could accidentally expose unrelated unsupported controls. -> Mitigation: keep migration gating separate from model sync, model redirect, base-URL lookup, and full-key reveal checks.

## Migration Plan

1. Update delta specs to replace the current Claude Code Hub migration exclusion with the new guarded participation behavior.
2. Extend target option enumeration and UI migration gating so Claude Code Hub is eligible only with complete saved admin configuration and never as its own target.
3. Add Claude Code Hub mapping and draft-building branches in the migration service, with tests for source and target previews.
4. Reuse Claude Code Hub provider create execution through `ManagedSiteService`, with tests that ready drafts produce provider action-compatible payloads.
5. Add or update localized preview warning and blocker copy only where existing codes are insufficient.

Rollback is code-only for the extension: reintroduce the Claude Code Hub migration exclusion in UI gating and target enumeration. Providers already created on a remote Claude Code Hub instance remain user-owned remote data and are not automatically removed.

## Open Questions

- Does Claude Code Hub ever return a usable unmasked provider `key` to authenticated admin list/detail actions, or will Claude Code Hub source migration usually require a future key-reveal endpoint?
- Should `codex` source providers map to shared `OpenAI` for broad compatibility, or should Codex-specific providers be blocked until a target backend can represent Responses API behavior explicitly?
- Should target migration into Claude Code Hub expose `codex` as an automatic mapping for any source type, or should `codex` remain a user-selected create/import type outside automated migration?
