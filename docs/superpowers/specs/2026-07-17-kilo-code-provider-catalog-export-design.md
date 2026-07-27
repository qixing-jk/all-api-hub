# Kilo Code Provider Catalog Export Design

## Context

All API Hub's Kilo Code 7.x exporter currently preserves the legacy Kilo Code
5.x interaction model: each selected account runtime key becomes one provider,
and each provider contains only the single model selected for that key.

That behavior was appropriate for the legacy `providerProfiles` contract,
where each profile has one `openAiModelId`. Kilo Code 7.x has a different
contract:

- a provider has a stable machine ID and a separate user-facing `name`;
- a provider's `models` field is a model-ID map and can contain multiple models;
- the top-level `model` field selects one global default `provider/model`.

The current exporter uses the stable provider ID, including its identity hash,
as the visible provider label because it omits the provider `name`. It also
underuses model inventories that the dialogs already fetch. This change aligns
the exported payload and UI with the Kilo Code 7.x model without changing the
legacy format.

## Goals

- Keep one exported provider per selected account runtime key so each provider
  owns exactly one `baseURL + apiKey` credential pair.
- Add a concise, human-readable provider `name` while retaining the current
  stable, collision-resistant provider ID.
- Export every normalized model ID successfully discovered for each Kilo Code
  7.x provider.
- Let the user choose one explicit global default provider/model.
- Preserve a manual model-ID recovery path when discovery fails or returns no
  models.
- Keep the Kilo Code 5.x / Roo Code legacy output and its per-profile single
  model behavior unchanged.
- Reuse the model inventories already loaded by the dialogs without additional
  requests when switching export targets.
- Let each Kilo Code 7.x provider choose its AI SDK protocol package: OpenAI
  Compatible (default), OpenAI Responses, or Anthropic Messages.
- Keep the existing model discovery path for every protocol,
  including Anthropic, so protocol selection never removes models from the
  exported catalog.

## Non-goals

- Combining multiple API keys into one provider.
- Filtering or ranking models by inferred chat, image, embedding, reasoning,
  context-window, or pricing capabilities.
- Adding per-model metadata that All API Hub cannot verify reliably.
- Adding a per-provider model multi-select or an exhaustive model-management
  interface to the export dialog.
- Writing credentials to Kilo Code's `auth.json` or changing Kilo Code's import
  behavior.
- Changing the legacy `providerProfiles` schema or its filenames.
- Refactoring unrelated account runtime key, token provisioning, or model
  discovery services.
- Adding protocol-specific discovery fallbacks, `/models` requests, headers, or
  model metadata that the existing adapters do not already provide.

## Verified Kilo Code Contract

The design remains pinned to the Kilo Code source used by the original 7.x
export and was rechecked against current upstream behavior:

- `ProviderConfig` supports a provider `name` and a `models` record:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/opencode/src/config/provider.ts>
- The OpenAI-compatible provider documentation configures multiple models and
  separately selects a default `provider/model`:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-docs/pages/ai-providers/openai-compatible.md>
- The custom-provider editor displays the provider name, loads every entry in
  `models`, and supports adding multiple models:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-vscode/webview-ui/src/components/settings/CustomProviderDialog.tsx>
- Settings import preserves the complete top-level `provider` value rather than
  reducing providers to one model:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-vscode/webview-ui/src/components/settings/settings-io.ts>

The existing protocol-source comment near the exporter must be expanded to
record the provider-name, model-map, and top-level-default contracts.

## User Experience

### Provider names

The Kilo Code provider ID remains an implementation identity, not display copy.
The exported provider object gains a `name`:

- account runtime key: `<site display name> - <key display name>`;
- API credential profile: the profile's display name;
- blank account/key names use the existing URL and `Token <id>` fallbacks;
- duplicate names are disambiguated deterministically with the existing domain
  and ordinal rules.

Provider names may contain Unicode and spaces. Provider IDs retain the current
settings-safe slug plus stable digest so repeated exports keep the same IDs and
secret rotation does not change identity.

The provider-ID algorithm remains byte-for-byte compatible with the current
exporter: the readable slug and digest continue to use the current site/key
inputs. Identical identity/display inputs and secret rotation therefore keep the
same ID. Renaming the site or key, or changing locale-derived legacy inputs, may
still change the ID; making IDs rename- or locale-stable is a separate migration
decision and is not part of this change. The new `providerName` display field
does not independently participate in ID generation.

### Kilo Code 7.x model workflow

For Kilo Code 7.x, every selected provider exports its complete successfully
loaded model inventory. Model IDs are normalized by trimming blanks, removing
duplicates, and sorting deterministically. All API Hub does not claim that every
listed model supports every Kilo Code workflow; it exports the upstream model
catalog as reported for that credential.

The multi-account dialog exposes two explicit controls:

1. **Default provider**, containing the selected provider display names.
2. **Default model**, scoped to the selected default provider and containing its
   discovered model IDs.

The model control keeps the existing custom-value behavior in both dialogs,
including when discovery succeeds. A custom default model that was not returned
by discovery is added to that provider's exported catalog. Separating provider
and model selection avoids ambiguous free-form values while keeping large
cross-provider catalogs searchable.

For example:

```text
Default provider: Example - Default Key
Default model: example-model
```

The provider control value uses a stable internal provider-selection identity;
the model control value is the selected model ID. Together they supply Kilo
Code's top-level `model` field without exposing generated provider IDs in the
dialog.

The two controls consume a shared prepared-catalog result rather than rebuilding
names or model normalization in either dialog. Provider values are opaque stable
selection IDs mapped back to prepared providers; model IDs are never combined
with provider IDs through a delimiter because valid model IDs may contain `/`.

The default provider initializes to the first provider in the existing
deterministic order. Its default model initializes to that provider's first
normalized model. Once the user changes either control, asynchronous inventory
updates preserve each selection while it remains valid. Removing the selected
provider selects the next deterministic provider. Removing a selected discovered
model selects the next model for that provider; a user-entered custom model
remains valid until the user clears it or removes the provider.

Provider rows no longer require a normal single-model choice for Kilo Code 7.x.
They show discovery status and model count. If a provider's model discovery
fails or returns an empty list, that row exposes the existing custom-value model
input as a manual recovery field plus a retry action. The entered model becomes
that provider's catalog entry and is eligible for the global default selector.
If a later retry succeeds, the manual model remains explicitly included alongside
the discovered catalog. While `manualModelId` exists, the provider row continues
to show that value with an explicit **Remove manual model** action even after
discovery succeeds. The same action is available in the single-profile dialog
and for non-default providers. Removing a manual model deletes it from the
prepared catalog; if it was the global default, the dialog selects the first
deterministic discovered model for that provider or marks the default invalid
when none remains.

The default-model popover searches the full catalog for the selected provider
but renders at most the first 100 deterministic matches. When more matches exist,
it tells the user to continue typing to narrow the list. An exact selected or
custom value always remains renderable. This feature-local bounded-result control
uses the existing command/popover primitives and avoids sending thousands of
unfiltered rows through the non-virtualized shared `SearchableSelect`.

Export is disabled until every selected provider has at least one model and a
valid global default exists. Error copy identifies the affected provider and the
next action: enter a model ID, retry discovery, or deselect the provider.

### Single-profile dialog

The API credential profile dialog has one provider, so its existing model
selector becomes the **Default model** selector. The generated provider still
contains the full discovered model inventory, with a custom entered default
included if it was not returned by discovery. The dialog exposes the same retry
and **Remove manual model** actions and preserves a manual model across a
successful retry until that explicit removal.

### Legacy target

When the target is Roo Code / Kilo Code 5.x, the dialogs retain the existing
per-key single-model selectors and validation. Switching between targets reuses
the same loaded inventories but keeps legacy model selections, V7 manual models,
and the V7 global default in separate target-local state. Switching targets
preserves those values without refetching models or resolving secrets again.

## Export Contract

### Protocol selection

Each V7 provider carries a normalized protocol choice in the dialog-owned
selection input. The default is `openai-compatible` for backward-compatible
exports. The choice maps to Kilo Code's provider package as follows:

| UI choice | Runtime value | Exported `npm` |
| --- | --- | --- |
| OpenAI Compatible | `openai-compatible` | `@ai-sdk/openai-compatible` |
| OpenAI Responses | `openai-responses` | `@ai-sdk/openai` |
| Anthropic Messages | `anthropic-messages` | `@ai-sdk/anthropic` |

The account dialog stores this value per selected runtime-key provider. The
profile dialog stores one value for its single provider. Switching between V7
and Legacy preserves the V7 choice but does not add a protocol control to the
Legacy flow. Closing and reopening a dialog starts a fresh V7 context with the
default protocol, matching the existing transient export state.

Changing the protocol does not refetch models, clear manual models, resolve
secrets, or change provider IDs. It is included in the async export action
signature so a copy/download that began under one protocol cannot complete with
another protocol's payload. The builder validates the normalized value and
serializes only the mapped `npm` field; all other provider fields remain
unchanged.

Model discovery remains independent of this choice. In particular, selecting
Anthropic Messages keeps the repository's existing loaded inventory instead of
adopting Kilo Code's UI-level rule that skips its generic OpenAI-compatible
`/models` discovery helper for Anthropic providers.

The Kilo Code 7.x payload becomes:

```json
{
  "_meta": {
    "version": 1,
    "exportedAt": "2026-07-17T00:00:00.000Z"
  },
  "provider": {
    "example-default-2f8a7c1d": {
      "name": "Example - Default",
      "npm": "@ai-sdk/openai-compatible",
      "models": {
        "example-model": { "name": "example-model" },
        "example-model-mini": { "name": "example-model-mini" }
      },
      "options": {
        "apiKey": "example-key",
        "baseURL": "https://example.invalid/v1"
      }
    }
  },
  "model": "example-default-2f8a7c1d/example-model"
}
```

Each provider has one credential pair and one or more models. Only the top-level
`model` is a default; it does not limit the provider's model catalog.

For Kilo Code 7.x, **Copy configuration** changes from copying only the
`provider` value to copying a mergeable top-level fragment containing both
`provider` and `model`. This preserves the user's explicit global default. The
button label, help copy, tests, and documentation must describe pasting both
top-level fields. Legacy copy behavior remains `providerProfiles.apiConfigs`.

## Data and Ownership Boundaries

### Dialog-owned selection input

Runtime-key identity, display facts, URL, and resolved secret live in a shared
base. Target-specific inputs do not overload the legacy single model:

```ts
interface KiloCodeRuntimeKeyExportInput {
  accountId: string
  siteName: string
  baseUrl: string
  tokenId: number
  tokenName: string
  tokenKey: string
}

interface KiloCodeLegacySelection extends KiloCodeRuntimeKeyExportInput {
  legacyModelId: string
}

interface KiloCodeV7ProviderSelection extends KiloCodeRuntimeKeyExportInput {
  selectionId: string
  providerName?: string
  discoveredModelIds: string[]
  manualModelId?: string
}

interface KiloCodeDefaultModelSelection {
  selectionId: string
  modelId: string
}
```

- `providerName` is the caller-selected display fact. The preparation boundary
  applies a deterministic fallback and disambiguation when it is blank or
  duplicated.
- `legacyModelId` is isolated to the legacy target.
- `discoveredModelIds` is the V7 inventory loaded for that credential.
- `manualModelId` is explicit V7 state and is unioned with discovered models
  until the user clears it.
- `selectionId` is an opaque, stable dialog identity. It is not exported and
  does not contain secrets.
- `KiloCodeDefaultModelSelection` identifies the one top-level default without
  coupling callers to generated provider IDs.

### Shared V7 preparation boundary

A pure `prepareKiloCodeV7Catalog` boundary owns everything the UI and builder
must agree on:

- provider-name fallback and collision disambiguation;
- stable provider-ID generation;
- normalized, deduplicated, deterministically sorted model IDs;
- opaque selection-ID lookup;
- provider/default option facts used by the dialogs;
- provider and model counts used by analytics.

It returns prepared providers containing the final display name, generated ID,
selection ID, normalized model list, and credential options. Both dialogs use
this result for selector labels and validation. The V7 schema builder consumes
the same prepared result, so normalization and naming cannot drift or be
duplicated across UI consumers.

Provider order remains the existing deterministic selection order. Model order
uses code-point lexical ordering after trimming and deduplication rather than
locale-sensitive `localeCompare`, so output is stable across runtime locale and
ICU versions. Tests include mixed-case and Unicode model IDs, model IDs containing
`/`, identical model IDs across providers, and duplicate provider display names.

### Pure V7 builder

The V7 builder owns:

- validation of the prepared catalog and non-empty provider models;
- resolution of the requested default selection to the generated provider ID;
- validation that the default model exists in that provider's model map;
- schema construction.

The dialogs own model fetching, loading/error/retry UI, target-local selections,
and translation. The output policy accepts a discriminated target input so
legacy selections cannot leak into V7 catalogs. It dispatches target-specific
inputs and describes filenames/copy payloads.

### Legacy isolation

The legacy builder continues to consume only `KiloCodeLegacySelection`. It never
receives V7 provider names, catalogs, manual models, or global-default inputs.
Legacy unit tests must prove byte-for-byte-equivalent object shapes for
representative fixtures.

## Validation and Failure Paths

The V7 builder rejects:

- no selected providers;
- blank runtime keys;
- invalid HTTP/HTTPS base URLs;
- providers with no normalized models;
- blank or duplicate final provider IDs;
- missing default selection;
- a default selection that does not match an exported provider/model.

The UI covers:

- model discovery loading, empty, and failure states per provider;
- manual recovery model IDs;
- removal of the current global default;
- duplicate provider display names;
- payload generation errors with local translated fallback copy;
- Kilo Code's 1 MiB settings-import limit.

Before download, the actual pretty-printed Kilo Code 7.x JSON string is measured
as UTF-8. Exactly `1_048_576` bytes is accepted; larger files are blocked to
match Kilo Code's pinned `MAX_IMPORT_SIZE`. The shared limit constant records
the upstream source.

For multi-account exports, recovery copy suggests selecting fewer providers or
copying the fragment and merging it manually. For a single-profile export,
where reducing providers is impossible, recovery copy points only to copying
and manually merging the fragment. Copy remains available with an explicit
warning because clipboard fragments are not constrained by Kilo Code's file
picker, but help text must not imply that an oversized fragment can be imported
as a file.

## Telemetry

Reuse the existing Kilo copy/download actions and controlled target enum.

- `selected_count`: number of selected sites in the multi-account dialog and
  `1` in the single-profile dialog, preserving current semantics;
- `item_count`: number of exported providers/runtime keys;
- `model_count`: total number of model entries exported for Kilo Code 7.x and
  the existing selected-model count for legacy;
- result/error category: existing controlled values only.

Counts come from the prepared/output descriptor after normalization rather than
from raw inventory arrays, so blanks and duplicates are not over-counted.

Do not record provider names or IDs, model IDs, URLs, hosts, API keys, inventory
errors, or backend messages. No new passive impression event is needed.

## Localization and Documentation

Target-specific copy must distinguish:

- Kilo Code 7.x **Default model** and exported model catalog;
- legacy per-profile **Model ID**;
- model discovery failure recovery;
- oversized file recovery;
- provider display-name behavior where user guidance mentions imported names.

Update all app locales together and run `pnpm run i18n:extract:ci`. Update the
Chinese source documentation for supported export tools and Kilo export flows;
generated English and Japanese docs stay under the translation workflow.

Settings search and deep links do not change because all controls remain
transient export-dialog state.

## Testing

### Unit tests

Cover the pure builder and output policy:

- explicit provider names and deterministic duplicate-name disambiguation;
- unchanged stable provider IDs when secrets or model catalogs change;
- changing only explicit `providerName` changes display copy without changing
  the current ID;
- changing `siteName` updates the readable slug while retaining the digest;
- changing `tokenName` updates the ID under the current algorithm because it
  participates in both the slug and digest;
- multiple normalized models per provider;
- blank and duplicate model removal;
- manual recovery model inclusion;
- retry failure -> manual model -> retry success unions discovered and manual
  values until the manual value is cleared;
- explicit global-default resolution across multiple providers;
- missing/unknown default failures;
- empty-provider-model failure;
- unchanged legacy output;
- V7 copy includes both `provider` and `model` while legacy copy remains
  unchanged;
- exactly 1 MiB is accepted and 1 MiB plus one byte is blocked.

### Component tests

Cover both dialogs:

- multi-account Kilo Code 7.x renders global Default provider and Default model
  controls;
- V7 exports all loaded model IDs and the selected default;
- single-profile V7 exports its full catalog;
- discovery failure exposes manual recovery;
- successful and failed discovery both preserve custom default-model entry;
- retry success retains an explicit manual model until the user clears it;
- the visible Remove manual model action removes the entry for default and
  non-default providers and repairs or invalidates the global default;
- removing the selected default chooses the next deterministic option;
- legacy retains per-key single-model controls;
- switching targets does not refetch inventories or secrets;
- analytics counts exported models without exposing identifiers;
- duplicate display names produce disambiguated selector labels;
- model IDs containing `/` round-trip through opaque provider selection values;
- a 5,000-model catalog renders at most 100 model rows, search finds an exact
  item outside the initial 100, and the selected/custom item remains visible;
- oversized multi-account and single-profile downloads show their respective
  actionable recovery messages.

Use roles, accessible names, and stable feature-local test IDs where a workflow
control needs disambiguation. Do not assert incidental DOM structure or exact
class names.

### Browser-level test

Update the existing Kilo Code download scenario rather than adding a parallel
workflow. Verify that the downloaded file contains:

- a human-readable provider `name` separate from its stable ID;
- at least two models under one provider;
- a top-level default that references an exported provider/model;
- no change to the representative legacy download assertion.

Lower-level tests cover inventory permutations and failure matrices. The E2E
test remains one representative single-profile browser download path. It does
not cover the multi-provider default selectors; component tests own that
contract.

### Runtime verification

Import a generated file through a real Kilo Code 7.x About Kilo Code -> Import
flow. Confirm that:

- the imported provider displays the human-readable name;
- Kilo's model picker lists multiple exported models;
- switching between two exported models works with the same provider key;
- the chosen top-level default is initially selected;
- the existing inline-key/editor-display limitation remains only a known Kilo
  UX issue and does not prevent runtime use.

If the environment is unavailable, report this as a remaining manual check and
do not claim end-to-end runtime verification.

## Maintainability Decision

Reuse the current stable provider-ID algorithm, base-URL normalization, unique
profile naming rules, model inventories, target selector, output policy,
analytics actions, and legacy builders. Extend the pure V7 contract and extract
small target-specific UI helpers/hooks where needed to keep model catalog and
default-selection orchestration out of the already-large multi-account dialog.

Do not add a parallel exporter, duplicate model normalization in both dialogs,
or broaden the change into general model-management architecture.
