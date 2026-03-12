## 1. Core Display-Name Logic

- [x] 1.1 Add a shared helper to normalize a base account name and compute the global set of same-name duplicates.
- [x] 1.2 Add a formatter that produces the disambiguated label `<base name> · <username>` using a single separator constant.
- [x] 1.3 Add unit tests for the helper covering: global duplicates, case/whitespace normalization, full-width normalization, username-empty behavior, and unique accounts.

## 2. DisplaySiteData Projection

- [x] 2.1 Update `accountStorage.convertToDisplayData(SiteAccount[])` to compute duplicates once per call and set `DisplaySiteData.name` to the disambiguated label only when needed.
- [x] 2.2 Ensure the single-account `convertToDisplayData(SiteAccount)` overload remains backward compatible (no global duplicate context required).
- [x] 2.3 Add unit tests verifying `convertToDisplayData` produces correct `DisplaySiteData.name` for duplicate vs unique accounts, including username-empty cases.

## 3. UI Audit And Adoption

- [x] 3.1 Audit Account Management surfaces to ensure they consistently render `DisplaySiteData.name` (and do not directly render `site_name` for user-facing labels).
- [x] 3.2 Verify Key Management account selector options use the disambiguated label and that searching by appended username works when duplicates exist.
- [x] 3.3 Verify Model List surfaces that render account names use `DisplaySiteData.name` and are no longer ambiguous for same-name duplicates.
- [x] 3.4 Replace remaining user-facing ad-hoc account labels built from `site_name`/`username` (for example auto check-in results and usage analytics filters) with the unified display-name strategy or an `accountId` → `DisplaySiteData` mapping.

## 4. Search And Sorting Semantics

- [x] 4.1 Confirm account search behavior matches both base name and username for disambiguated entries; adjust any view that is label-only so it still matches the appended username.
- [x] 4.2 Confirm “sort by name” behavior is deterministic and effectively base-name then username (case-insensitive); adjust comparator logic if needed.

## 5. Validation

- [x] 5.1 Run targeted unit tests for the new helper and the `convertToDisplayData` behavior.
- [x] 5.2 Run `pnpm -s compile` to ensure TypeScript passes.
