# Kilo Code 7.x Export Design

## Context

All API Hub currently exports Kilo Code and Roo Code settings using the legacy
Kilo Code 5.x `providerProfiles` format. Kilo Code 7.x uses a different settings
contract backed by its CLI configuration, but its Settings UI supports importing
a portable `kilo-settings.json` file.

The existing legacy export remains useful for Roo Code and Kilo Code 5.x. This
change must add the current Kilo Code format without breaking that contract.

## Goals

- Make Kilo Code 7.x the default export target.
- Generate a standards-compliant `kilo-settings.json` that Kilo Code 7.x can
  import from About Kilo Code -> Import.
- Retain the existing Roo Code / Kilo Code 5.x legacy export as an explicit
  alternative.
- Keep API keys, base URLs, models, and provider identities correctly paired
  when exporting multiple account runtime keys.
- Keep format-specific behavior testable outside the dialogs.

## Non-goals

- Removing or changing the legacy `providerProfiles` contract.
- Writing directly to Kilo Code storage, `auth.json`, or its local backend.
- Adding a CLI integration, deep link, or browser-to-IDE bridge.
- Inventing model context or output limits that All API Hub cannot verify.
- Refactoring the complete Kilo Code export dialog or its token/model loading
  workflow.

## Verified Kilo Code 7.x Contract

The implementation must follow Kilo Code's current documented and implemented
settings contract, pinned to upstream commit
`3cb82a0907f888749435c1d208e56d8365747df2` during design:

- Settings import/export and `kilo-settings.json` behavior:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-docs/pages/getting-started/settings/index.md>
- Import/export envelope and recognized top-level fields:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-vscode/webview-ui/src/components/settings/settings-io.ts>
- OpenAI-compatible provider schema:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-docs/pages/ai-providers/openai-compatible.md>
- Settings import UI:
  <https://github.com/Kilo-Org/kilocode/blob/3cb82a0907f888749435c1d208e56d8365747df2/packages/kilo-vscode/webview-ui/src/components/settings/AboutKiloCodeTab.tsx>

The builder must include a concise source comment near the protocol-specific
shape so future format changes can be reconciled against the upstream contract.

## User Experience

Both existing Kilo export dialogs gain an export-target selector:

1. `Kilo Code 7.x`, selected by default.
2. `Roo Code / Kilo Code 5.x (legacy)`.

Switching targets reuses already loaded account runtime keys and model data. It
must not repeat network requests or secret resolution.

For Kilo Code 7.x:

- Download saves `kilo-settings.json`.
- Copy copies the generated top-level `provider` object as a mergeable config
  fragment.
- Help text directs users to About Kilo Code -> Import, where the imported draft
  can be reviewed before saving.

For legacy:

- Download continues to save `kilo-code-settings.json` with the unchanged
  `providerProfiles` payload.
- Copy continues to copy `providerProfiles.apiConfigs`.
- Help text explicitly identifies Roo Code and Kilo Code 5.x compatibility and
  does not imply that the file is native Kilo Code 7.x settings.

Both targets continue to warn that exported data contains plaintext API keys.

## Architecture

### Export targets

Define a runtime export-target constant and derive its TypeScript type from that
constant. The targets are `kilo-v7` and `legacy`.

The current legacy builders remain behaviorally unchanged. A separate pure Kilo
7.x builder owns the new schema. Shared low-level naming and base-URL
normalization may be reused, but the two output contracts must not be merged
into a hybrid payload.

### Output policy

Add a small shared output policy used by both dialogs. Given the selected target
and normalized selections, it determines:

- builder and output payload;
- filename;
- copy payload;
- target-specific labels and help content;
- validation requirements;
- analytics target value.

The policy keeps format branching out of the large dialog components. Existing
key resolution, token creation, model loading, and selection orchestration stay
in place.

### Kilo Code 7.x payload

The generated file has this shape:

```json
{
  "_meta": {
    "version": 1,
    "exportedAt": "2026-07-13T00:00:00.000Z"
  },
  "provider": {
    "example-default-2f8a7c1d": {
      "npm": "@ai-sdk/openai-compatible",
      "models": {
        "example-model": {
          "name": "example-model"
        }
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

Each selected account runtime key becomes one provider. The first provider in
the existing deterministic selection order supplies the top-level default
`model` reference.

The builder accepts a clock dependency for deterministic tests. Production uses
the current time for `_meta.exportedAt`.

### Provider identity

Provider IDs must be readable, stable across repeated exports, legal as config
keys, and unique within one export.

Build each ID from:

- a sanitized slug derived from the human-readable profile name; and
- a deterministic short digest derived from stable runtime-key identity fields,
  including account/profile identity, base URL, and source key identity.

The API key is never included in the digest input. The builder checks final IDs
for uniqueness and fails explicitly rather than overwriting a provider.

### Models and URLs

Kilo 7.x output requires a non-empty model ID for every selected provider. Each
provider initially exports the model confirmed in the dialog as both the model
map key and display name.

Model limits are omitted because All API Hub does not have a reliable source for
them. Kilo Code accepts omitted limits.

Base URLs use the existing normalization boundary and end in `/v1`. Builders do
not duplicate URL fallback logic in the dialogs.

## Validation and Error Handling

The Kilo 7.x builder rejects:

- no selections;
- missing or blank runtime keys;
- missing or blank model IDs;
- invalid or empty base URLs;
- duplicate final provider IDs.

User-facing failures use local translated messages and retain the current dialog
state. They do not depend on backend messages. Switching export targets does not
trigger new requests.

## Telemetry

Reuse the existing copy/download analytics actions and add a controlled
`exportTarget` value of `kilo-v7` or `legacy`. Continue recording only controlled
values and counts. Do not record provider IDs, model IDs, URLs, hostnames, API
keys, profile names, or error bodies.

Settings search and deep-link registries do not change because the target
selector is transient dialog state, not a persisted setting.

## Localization and Documentation

Update every app locale with the same target labels, action labels, help text,
validation messages, and import guidance. Preserve locale shape consistency and
run the repository extraction check.

Update Chinese source documentation that currently describes Kilo export as a
single legacy flow. Generated English and Japanese documentation remain under
the repository translation workflow rather than being edited manually.

## Testing

### Unit tests

Add behavior-level tests for:

- the exact Kilo 7.x top-level and provider schema;
- deterministic `_meta` through the injected clock;
- default-model references;
- stable and unique provider IDs, including duplicate display names;
- `/v1` URL normalization;
- missing selection, key, model, and URL failures;
- duplicate-ID protection;
- unchanged legacy output.

### Component tests

Cover both export dialogs:

- Kilo 7.x is selected by default;
- switching to legacy changes filename, copy payload, and guidance;
- switching does not repeat data loading;
- missing models and builder failures keep actions safe and show useful errors;
- copy and download analytics include the controlled target.

### Browser-level test

Retain a representative legacy download assertion and make the primary Kilo
flow download a Kilo 7.x file. Verify the relationships among `provider`, each
provider's `options` and `models`, and the top-level `model` reference. Do not use
E2E to exhaustively cover target-state combinations.

### Validation ladder

Run related Vitest coverage first, followed by `pnpm run i18n:extract:ci` and the
repository's staged validation. Because the change affects shared TypeScript
contracts and analytics payloads, run `pnpm run validate:push` before remote
handoff.

## Runtime Verification

Automated tests verify the published schema but cannot fully replace an actual
Kilo Code import. Before declaring runtime compatibility verified, import a
generated file through a real Kilo Code 7.x About Kilo Code -> Import flow,
review and save the draft, then exercise one exported OpenAI-compatible model.

If that environment is unavailable, handoff must identify this as a remaining
manual verification step and must not claim end-to-end Kilo runtime validation.

## Maintainability Decision

Reuse the existing account runtime key collection, base-URL normalization,
legacy builders, dialogs, and analytics actions. Extract only the target
constant, Kilo 7.x pure builder, stable provider-ID helper, and shared output
policy needed to prevent target behavior from drifting between dialogs.

Do not undertake a broad dialog refactor. The existing dialog size is a known
constraint, but restructuring unrelated token/model orchestration would exceed
this feature's scope.
