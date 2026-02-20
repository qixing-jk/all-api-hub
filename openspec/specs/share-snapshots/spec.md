# share-snapshots Specification

## Purpose

Provide fast, one-click generation of localized social share snapshots (image + caption) for (1) an aggregate overview across enabled accounts and (2) a selected enabled account, while ensuring secrets are never included in exported content.

## Requirements

### Requirement: Snapshot export entry points exist in popup and account menus
The system MUST provide UI entry points to export share snapshots:

- An **overview snapshot** action in the popup overview header, on the same row as the accounts/bookmarks switcher.
- An **account snapshot** action in each account’s “more” menu in the account list.

#### Scenario: User exports an overview snapshot from the popup
- **WHEN** the user opens the popup overview and activates the overview snapshot export action
- **THEN** the system MUST generate the overview snapshot (image + caption) from currently available data without performing network requests

#### Scenario: User exports an account snapshot from an account menu
- **WHEN** the user opens an enabled account’s “more” menu and activates the account snapshot export action
- **THEN** the system MUST generate the account snapshot (image + caption) for that account without performing network requests

### Requirement: Overview snapshot is aggregated and does not reveal specific accounts
The overview snapshot MUST be an aggregate across enabled accounts only and MUST NOT reveal any specific account identity.

The overview snapshot MUST NOT include any of the following:
- per-account site name
- per-account URL
- per-account tags or notes
- any list of accounts

The overview snapshot MUST include at minimum:
- enabled account count
- total balance/quota in the current currency

The overview snapshot MUST NOT include detailed usage data (tokens, requests, logs).

#### Scenario: Disabled accounts are excluded from overview aggregates and counts
- **WHEN** the user exports an overview snapshot with a mix of enabled and disabled accounts in storage
- **THEN** the system MUST compute totals and “account count” using enabled accounts only

#### Scenario: Overview snapshot does not include per-account identifiers
- **WHEN** the user exports an overview snapshot
- **THEN** the generated image and caption MUST NOT include any per-account site name or URL

### Requirement: Account snapshot uses origin-only URL and omits personal metadata by default
The account snapshot MUST be generated for enabled accounts only.

The account snapshot MAY display public information including:
- the site name, and
- the site URL as **origin only**

Personal metadata such as tags and notes MUST NOT be included.

#### Scenario: Disabled account cannot be exported
- **WHEN** the user attempts to export an account snapshot for a disabled account
- **THEN** the system MUST prevent export and MUST explain that the account is disabled

#### Scenario: URL is origin-only
- **WHEN** the user exports an account snapshot for an account whose configured URL includes a path, query, or fragment
- **THEN** the generated snapshot MUST include only the origin (scheme + host + optional port) and MUST NOT include the path, query, or fragment

#### Scenario: Tags and notes are not included
- **WHEN** the user exports an account snapshot
- **THEN** the generated image and caption MUST NOT include tags or notes

### Requirement: Share snapshots must never include secrets
The system MUST ensure exported snapshots never include secrets, including (but not limited to):
- access tokens / API keys
- refresh tokens
- cookies or session identifiers
- Authorization header values
- backup/export file contents

#### Scenario: Export pipeline is allowlist-based
- **WHEN** a snapshot is generated
- **THEN** the renderer MUST consume an allowlisted snapshot payload that excludes secret-bearing account fields by construction

### Requirement: showTodayCashflow controls whether today cashflow appears in snapshots
When `showTodayCashflow = false`, the system MUST NOT include numeric today cashflow values (today income, today outcome/consumption, today net) in snapshots.

- Captions MUST omit the today cashflow line.
- The snapshot image MUST render today cashflow values as placeholders (e.g., `—`) and MUST NOT render a today net subline.

When `showTodayCashflow = true`, the system MUST be allowed to include today cashflow totals in snapshots.

#### Scenario: Today cashflow is omitted when disabled
- **WHEN** `showTodayCashflow = false` and the user exports a snapshot
- **THEN** the snapshot MUST NOT include numeric today income, today outcome/consumption, or today net cashflow

#### Scenario: Today cashflow may be included when enabled
- **WHEN** `showTodayCashflow = true` and the user exports a snapshot
- **THEN** the snapshot MAY include today income, today outcome/consumption, and today net cashflow

### Requirement: Snapshots use the current currency only
Snapshots MUST render monetary values using the current currency preference only (e.g., USD or CNY), and MUST NOT display both currencies simultaneously.

#### Scenario: Currency preference is respected
- **WHEN** the user switches the UI currency preference and exports a snapshot
- **THEN** the snapshot MUST display monetary values in the selected currency only

### Requirement: Snapshot output is numbers-only (no charts)
The snapshot image MUST be numbers-only and MUST NOT include balance history charts or other time-series visualizations.

#### Scenario: No chart elements are rendered
- **WHEN** the user exports a snapshot
- **THEN** the exported image MUST NOT include charts or graph visualizations

### Requirement: Snapshot image defaults follow social share best practices
The exported image MUST be a PNG at a default size consistent with common social share previews.

The default image size MUST be `1200x1200`.

#### Scenario: Default image size is 1200x1200 PNG
- **WHEN** the user exports a snapshot image
- **THEN** the system MUST generate a `image/png` output with dimensions `1200x1200`

### Requirement: Snapshots include app watermark and an “as of” timestamp
Snapshot images MUST include an app watermark/label identifying All API Hub.

Snapshots MUST include an “as of” timestamp.
- For an overview snapshot, it MUST be derived from the latest `last_sync_time` among enabled accounts when available.
- For an account snapshot, it MUST be derived from that account’s `last_sync_time` when available.
- If the relevant `last_sync_time` is missing/zero, the system MUST fall back to the export time.

#### Scenario: Watermark is always present
- **WHEN** the user exports a snapshot
- **THEN** the snapshot image MUST include an All API Hub watermark/label

#### Scenario: “As of” timestamp is always present
- **WHEN** the user exports a snapshot
- **THEN** the snapshot MUST include an “as of” timestamp in both the image and caption

### Requirement: Built-in mesh gradient background generator is available
The system MUST provide built-in mesh gradient backgrounds or a generator for snapshot images.

The snapshot payload MUST include a `backgroundSeed` used to generate a deterministic mesh gradient background.

When a `backgroundSeed` is not provided by the caller, the system MUST generate one during snapshot payload building.

#### Scenario: Background can be shuffled
- **GIVEN** the same snapshot payload data except `backgroundSeed`
- **WHEN** the snapshot is rendered with two different seeds
- **THEN** the exported images SHOULD differ in background appearance while preserving the same numeric content

### Requirement: One-click export copies or downloads with graceful fallback
The default user action MUST perform a one-click export that attempts to provide both the image and caption to the user.

If clipboard image copy is supported, the system MUST copy the image to the clipboard.

If clipboard image copy is not supported or fails, the system MUST provide a download fallback for the PNG.

#### Scenario: Clipboard image copy succeeds
- **WHEN** the user exports a snapshot in an environment that supports clipboard image write
- **THEN** the system MUST copy the generated PNG to the clipboard and MUST provide the localized caption to the user

#### Scenario: Clipboard image copy falls back to download
- **WHEN** the user exports a snapshot and clipboard image write is unsupported or fails
- **THEN** the system MUST download the PNG and MUST provide the localized caption to the user

### Requirement: Captions and UI strings are localized
The system MUST generate captions using localized templates and MUST localize user-facing labels for snapshot export actions.

#### Scenario: Caption uses the active UI locale
- **WHEN** the user changes the extension UI language and exports a snapshot
- **THEN** the generated caption MUST be localized to the active UI language
