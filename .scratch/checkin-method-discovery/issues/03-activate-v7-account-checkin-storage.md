# Activate Canonical V7 Account Check-in Storage

Status: resolved

Blocked by: 02

## Objective

Cut every account persistence and runtime consumer over to one canonical V7 check-in shape while preserving whether every legacy account participates in auto check-in.

## Scope

- Bump the account config version and activate the V6-to-V7 migration at every account read, write, import, restore, and WebDAV application entrance.
- Change account defaults and new-account writes to emit V7 only.
- Route filters, sorting, display projections, and AccountDialog reads through the Module's V7 `inspect` projection instead of legacy fields.
- Provide compatibility implementations of `refreshSelectedStatus` and `executeSelected` that resolve the migrated selected registration and delegate to the existing provider behavior. These are the only scheduler/refresh entrance during activation; Tickets 04 and 05 deepen their internal behavior without changing callers.
- Inside that compatibility Seam, either call an extracted provider operation that no longer owns eligibility or construct a non-persisted legacy execution view from the V7 selection, evidence, intent, and Status. Never require deleted fields in canonical storage and never expose the view outside the Module.
- Remove `enableDetection`, `autoCheckInEnabled`, and `siteStatus` from the canonical runtime account and from ordinary consumers and writers. They may appear only in the V6 migration decoder or in the Module-private, non-persisted compatibility view described above.
- Preserve `customCheckIn` structurally and behaviorally as an independent URL/bookmark flow.
- Preserve current new-account behavior during the cutover by translating an existing provider's current support result into `compatibility_registration` evidence and an automatic selection. This bridge is limited to pre-existing registrations and is replaced by strict Detection where available.
- Own the product default here: new accounts with a registered candidate method start with account-level automatic execution on, while discovery and method readiness gate execution and every migrated account's prior intent remains unchanged.
- Make AccountDialog saves ownership-aware: inside the account storage lock, re-read the latest account and patch only user-edited intent, explicit selection changes, and custom check-in fields. Never write a stale whole `checkIn` draft over system-owned knowledge.
- Bump the backup/WebDAV envelope to V4. V7 readers accept V1 through V4 and reject later explicit versions.
- Document that V6/V7 clients concurrently writing the same WebDAV file are unsupported. V4 provides best-effort fail-closed behavior for the immediately preceding V3 reader; older tolerant readers are not guaranteed safe.

## Release Boundary

This ticket may use several reviewable commits, but it is one release-level activation boundary. Do not release a state in which V7 is written while any runtime consumer can only interpret V6.

## Acceptance Criteria

- For identical accounts, credentials, preferences, and global scheduler settings, `preMigrationRunnable === postMigrationRunnable` for every existing provider.
- A missing legacy registration fails a contract test rather than silently removing an account from the scheduler.
- Migrated legacy evidence executes without requiring a full V7 discovery first.
- Explicitly disabled automatic execution remains disabled; the new-account default does not overwrite migrated intent.
- AccountDialog stale drafts cannot overwrite background method knowledge or automatic selection changes they do not own.
- V7 normalization is idempotent and removes legacy runtime fields.
- V1/V2/V3 backups containing V6 accounts import as V7; V4 round-trips V7 without loss.
- V4 is emitted by manual export and WebDAV upload, and V5 is rejected.
- Whole-account WebDAV last-writer-wins behavior is described accurately; no field-level merge is implied.
- Scheduler and refresh callers use only the Module Interface even though the compatibility implementation still delegates to legacy providers.
- All five compatibility methods receive eligibility and authentication inputs equivalent to the V6 provider path even though canonical V7 does not persist legacy fields.

## Tests

- Add a migration parity matrix for all providers and relevant intent/disabled/credential combinations.
- Extend account defaults, account storage, import/export, WebDAV auto-sync, and selective-sync tests.
- Cover remote-newer V6 winning account arbitration and being migrated before persistence, plus local-newer V7 retaining its data.
- Add the AccountDialog race regression: background method status changes after the form opens, then an unrelated user edit is saved.
- Prove compatibility refresh does not depend on a deleted V7 field to decide whether to read selected status.
- Prove all `customCheckIn` owned fields round-trip unchanged.

## Validation

- Run Vitest related to every changed TypeScript file.
- Run `pnpm compile` and the repository i18n extraction check if any UI copy or translation usage changes.
- Inspect exported fixtures for V4 and absence of V6 runtime fields.

## Rollback

Do not roll back to a pre-V7 writer after V7 data is emitted. Use a V7-aware build with the new behavior disabled or ship a forward fix. Do not retain dual runtime fields as a downgrade mechanism.

## Comments
