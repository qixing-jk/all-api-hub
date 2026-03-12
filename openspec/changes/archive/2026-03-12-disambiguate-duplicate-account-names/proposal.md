## Why

Multiple accounts can share the same displayed name across the extension, which makes it easy to take actions against the wrong account (copying/exporting the wrong key, managing the wrong models, etc.). This change reduces ambiguity at the display layer without changing stored account names.

## What Changes

- Introduce a unified account **display name** disambiguation strategy used across UI surfaces that render account names.
- When two or more accounts share the same normalized base display name (global scope, not limited to the same site), and an account has a non-empty username field, the UI will display a disambiguated label: `<base name><separator><username>` for those colliding entries.
- When an account has no username (`null` or empty string), its display name will remain unchanged (no disambiguation suffix).
- Search behavior in account-name search inputs MUST match both the normalized base name and the appended username (when present) using the same normalization pipeline as duplicate detection.
- Sorting behavior for account lists that support sorting by name MUST be deterministic: primary key is the normalized base name, secondary key is the normalized username, and ties fall back to the rendered label plus account id.
- This change does not add a tertiary disambiguation token, so identical normalized base-name + username pairs may still share the same rendered label.
- The persisted account base name remains unchanged; this is a presentation-only normalization.

## Capabilities

### New Capabilities

- `account-display-name-disambiguation`: Define a global, presentation-only account display-name strategy that disambiguates same-name accounts by appending username when available, including clear search and sort semantics.

### Modified Capabilities

None.

## Impact

- UI: Any surface that renders account names (e.g., account list, key management aggregated view, model list, account selectors) will need to use the shared display-name function and follow the updated search/sort semantics.
- i18n: The disambiguation formatting (notably the separator) may require localized or configurable copy depending on existing UI conventions.
- Testing: Add unit/UI coverage to ensure duplicates are detected globally, username-less accounts are not modified, and search/sort behavior remains stable.
