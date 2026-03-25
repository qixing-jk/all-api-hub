## ADDED Requirements

### Requirement: Account-backed model loading can fall back to a selected account key

When Model Management is focused on a single selected account and the direct account-backed model load fails with a retryable error, the system SHALL make an account-key fallback flow available for that same account without switching away from the selected account source.

The fallback flow MUST load that account's token inventory on demand after the retryable account failure is shown. The system MAY start loading the key inventory automatically as part of the recovery UI, but it MUST NOT load the fallback catalog automatically.

If exactly one selectable key exists, the system MAY preselect it. If multiple selectable keys exist, the system MUST require the user to choose which key to use before loading the fallback catalog.

After the user confirms a key, the system MUST resolve the selected key secret and request model ids using that key as credential input against the account's base URL. The system MUST normalize and de-duplicate the returned model ids into the same minimal model-catalog shape used for stored API credential profiles.

The system MUST NOT trigger this fallback automatically in the `all accounts` aggregate view or for profile-backed sources.

#### Scenario: Single-account load failure offers key-backed fallback
- **WHEN** a single selected account fails to load models through the direct account-backed request
- **THEN** Model Management loads or begins loading that account's fallback key inventory in the recovery UI
- **AND** the user can choose one of that account's keys for fallback loading without a separate "start fallback" click

#### Scenario: Multiple available keys require explicit user choice
- **WHEN** the selected account has more than one available key for fallback loading
- **THEN** the system shows those keys in a chooser
- **AND** the fallback catalog does not load until the user explicitly selects which key to use

#### Scenario: Selected key loads a normalized fallback catalog
- **WHEN** the user confirms a valid account key for fallback loading
- **THEN** the system resolves the key secret and requests model ids with that key
- **AND** the rendered model list uses normalized, de-duplicated model ids in the minimal catalog shape already used for profile-backed sources

### Requirement: Key-backed fallback catalogs stay capability-limited, retryable, and secret-safe

When Model Management is rendering a catalog loaded through an account-key fallback, the system MUST keep the owning account as the active selected source while treating the rendered data as catalog-only rather than pricing-authoritative.

While fallback data is active, the system MUST NOT present pricing, ratio, group-filtering, or account-summary affordances as if they were authoritative for that catalog. The system MUST also avoid rendering per-row account-pricing or group-availability placeholders that would imply the fallback catalog knows relay metadata it does not have. The system MUST keep a direct-account retry path available, and a later successful direct account load MUST replace the fallback catalog and restore the normal account-backed capability set.

If the fallback request fails, the user-facing error state MUST remain retryable, MUST allow choosing a different key, and MUST NOT reveal the raw selected key in displayed errors or emitted logs.

#### Scenario: Fallback catalog hides account-only pricing affordances
- **WHEN** Model Management is showing models loaded through an account-key fallback
- **THEN** the page does not show pricing notes, price/ratio toggles, group filtering, or account summary UI for that fallback catalog
- **AND** the fallback model rows do not show synthetic account price, ratio, or group-availability warnings derived from placeholder catalog values

#### Scenario: Fallback failure remains actionable without leaking secrets
- **WHEN** the selected account key fails to load a fallback model catalog
- **THEN** the system shows a retryable error state
- **AND** the user can retry the fallback request or choose a different key
- **AND** the displayed error and emitted logs do not contain the raw selected key

#### Scenario: Successful direct retry clears the fallback catalog
- **GIVEN** Model Management is currently showing an account-key fallback catalog for a selected account
- **WHEN** the user retries the direct account-backed load and that load succeeds
- **THEN** the system clears the fallback catalog state
- **AND** the page returns to the normal account-backed pricing view for that account
