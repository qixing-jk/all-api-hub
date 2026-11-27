# Session assessment and reuse

## Default for authenticated desktop extension tests

Use the independent CDP development browser for extension controls. Assess its session first; if unauthenticated, prefer transferring an authorized live website session from the daily browser before starting a new login. The daily browser's extension bridge supplies website observations and supported session reads, while CDP controls the extension under test. A bridge restriction on another extension's URL does not make the website session unavailable.

Verify the site's actual authentication mechanism before copying: a refresh credential may live in localStorage even when marker Cookies are present. Transfer only the required origin-scoped state, snapshot affected target state, and compare source/target identity after the website completes its normal authentication. Keep credentials out of tool output and Git, and remove temporary credential-transfer files after consumption. Record this as test setup; then use the extension's ordinary detection and credential workflow without injecting account records or detected values. If the starting condition itself is under test, apply the preservation rules below instead.

Diagnose an unavailable CDP endpoint, wrong profile/build or failed transfer before falling back. If no applicable authorized path remains, tell the user the specific blocker and the remaining alternatives; consider computer use at that point and follow its foreground-control requirements.

## Preserve initial session conditions

When testing first-contact WAF, expired credentials, or recovery without an open
site page, the initial session state is part of the reproduction. Import the
saved-account configuration directly and let the application perform the first
provider request and any page creation. Website navigation, automatic account
detection, identity probes, and session/Cookie transfer during test setup can
clear a challenge or renew authentication before the behavior under test runs.

Establish the required state through browser metadata: the selected profile,
provider tabs, cookies and site storage. Use independent fresh profiles for
scenarios requiring no previous visit. Record zero provider requests before the
trigger, and distinguish application-created pages from tester navigation. A
failed setup can reuse a profile only with evidence that no provider request
occurred; otherwise recreate the intended initial conditions before rerunning.
Report a missing first-document capture separately from successful operation:
success alone does not prove that no transient challenge appeared.

## Read-only preflight

Use `scripts/cdp/session-preflight.mjs` in live runners. `probePageSession(page, { endpoint, readIdentity })` makes a bounded, same-origin GET with the page's credentials and projects only a stable account ID. Keep provider response parsing in the site runner. An explicit 401 means unauthenticated; a 403, redirect, challenge, malformed identity or transport failure is an error requiring investigation.

`preflightSession({ probeTarget, expectedIdentity, sources, sourceDiscoveryComplete })` checks the target first and only inspects sources when the target is unauthenticated. Its callbacks are read-only: assessment does not synchronize state or create accounts.

| Result | Next action |
| --- | --- |
| `ready` | Reuse the verified target session. |
| `source-check-required` | Inspect missing source or transfer evidence; do not request login yet. |
| `sync-available` | Use the verified source's applicable transfer method, then compare source and target identities. This result alone does not mean synchronization has happened. |
| `probe-failed` | Diagnose connection, challenge, endpoint or source access. |
| `identity-mismatch` | Resolve the intended account before changing credentials or testing mutations. |
| `manual-login-required` | No usable session remains after all authorized sources and transfer methods have been assessed. Request interactive login. |

Each optional source supplies `name`, `probe()` and `checkTransfer()`. The probe returns `{ status: "authenticated", identity }`, `{ status: "unauthenticated" }` or `{ status: "error", reason }`; use non-secret reason codes. `checkTransfer()` returns `available`, `unavailable` or `unchecked`. Mark a method available only when its required access and the site's actual authentication mechanism are verified. Bridge attachment or unrelated cookies alone are insufficient. A missing callback or thrown capability check stays `unchecked`.

Leave `sourceDiscoveryComplete` false while any authorized source remains uninspected. Set it true only when the candidate set is exhausted. `unavailable` means all applicable transfer methods for that source have been ruled out; one failed database-copy or bridge call does not establish this.

Cubence has a concrete read-only entrypoint:

```bash
pnpm e2e:cdp:cubence -- --isolate --preflight-only
```

It uses the shared environment loader, checks `CUBENCE_USER_ID` when configured, reports JSON and detaches without running account/key flows. `connectDevBrowser` verifies the selected profile without requiring an active extension worker. The Node runner exits 0 when ready, 2 when further session assessment is needed, and 1 for setup/connection failures; package managers may wrap nonzero codes as lifecycle failures. It does not automatically attach to the daily Edge bridge, so an unauthenticated target remains `source-check-required`. Runners with authorized source access can supply source callbacks to the shared helper. Other runners should use the same helper with their own identity parser.

## Choosing a reuse method

Extension account records and website login sessions are separate. `browser:sync --list` discovers extension-storage candidates; a candidate is not proof of a currently authenticated website session.

| Observed state | Applicable path |
| --- | --- |
| Target already authenticated as the intended user | Reuse it; no synchronization. |
| Source is authenticated and an authorized live bridge supports the site's session mechanism | Transfer only that site's session material to the verified dev context. |
| Source and target browsers are already closed and a complete profile seed is appropriate | Use guarded offline database sync before relaunching. |
| Sources or capabilities have not been inspected, or a probe failed | Continue assessment/diagnosis. |
| No reusable authorized session or applicable transfer method remains | Interactive login. |

### Live Cookie transfer

For a Cookie-authenticated site, verify the live source account, then call `sourceContext.cookies()` with the actual website and authentication endpoint URLs. Cookie URL filtering includes the path: a root URL omits a refresh Cookie scoped to `/api/user/auth`, even when the dashboard is logged in. Use observed login/refresh paths before concluding that only marker Cookies exist or that transfer is unavailable. An empty unscoped result also does not establish that a scoped call is unavailable. Privileged CDP attachment through an extension bridge is a separate capability and is not required for a supported Cookie call.

Before `targetContext.addCookies`, verify the target dev profile, validate the transferred Cookie domains against the requested host, and snapshot affected target cookies for recovery. Keep session material in memory where practical; any necessary transfer artifact must be in ignored local evidence, with no Cookie/token values in console output or Git. After transfer, query the target identity again with the source account ID as the expected identity. Stop on mismatch or failed verification and recover the affected target state; do not declare success or immediately replace another account.

Copying a rotating refresh Cookie shares one server session; it does not create independent logins. Serialize source/target refreshes, stop task-owned target pages when finished, and verify the daily source still authenticates. If target use rotated the credential, restore the latest origin/path-scoped session to the source through a supported page or Cookie mechanism and verify the same identity before detaching. Establish a viable restoration path before exercising a session that rotates; if none exists, use a separate website login for the test. Preserve only non-secret evidence of the handoff.

If the site uses localStorage or another session mechanism, Cookie access alone does not establish transfer availability. Inspect the applicable mechanism within the task's scope.

### Offline profile synchronization

`scripts/sync-extension-profile.mjs` copies whole profile databases. Its open-browser guard must remain enabled. Do not close the daily browser merely to seed a test. Preserve other worktrees' profiles and use matching `--isolate`/profile settings on sync, launch and test commands.

```bash
# Read-only discovery; safe while browsers are running.
pnpm browser:sync -- --list

# Only when browsers are already closed and this complete seed is appropriate.
pnpm browser:sync:isolate -- --source-profile "Profile 2" --source-ext <observed-id> --cookies
```

Discovery scans Edge, Chrome and Brave profiles and ranks All API Hub extension data by size. Pin the observed source when multiple candidates exist. Without `--cookies`, the default copies extension account storage only. `--cookies` also copies Cookie databases, encryption metadata and Local Storage; it is not an origin-scoped operation. Backups and database consistency guards do not prove the copied website session is still valid. Launch the target and verify the expected live account identity afterward.
