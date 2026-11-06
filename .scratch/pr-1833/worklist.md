# PR #1833 feedback and acceptance

Source head: `5f9525ea8af953900f8caf6be1e33dabf5053fa5`. Base checked by fetch: `b2a1d0cd1a3126a1496a1c3d2a92ad5b7c1d7918` (`main`); no refresh needed. Initial worktree/index were clean. PR scope: optional, resumable model input-capacity measurements in account, credential-profile and webpage verification.

## Findings

| Source | Code outcome | Evidence | Thread outcome |
| --- | --- | --- | --- |
| 4496538549 | Clearing matching history resets capacity and invalidates pending reads/saves; another target remains intact. | `useContextCapacity.test.tsx`, `useVerificationTools.test.tsx`, account-dialog integration | Pending pushed-head review |
| 4496538594 | Missing model/runtime key blocks the run control. | Account/profile dialog `blocks capacity` regressions | Pending pushed-head review |
| 4496538614 | Restored details include the saved rejection bound. | `ContextCapacityPanel.test.tsx` historical bracket | Pending pushed-head review |
| 4496538654 | Enabling support reloads history for an unchanged connection. | Hook regression | Pending pushed-head review |
| 4496538669 | Restore uses the effective endpoint/available secret; continuation compares the resolved request identity. Removed the obsolete pre-resolution lookup path. Opening an account dialog never fetches a hidden secret just to restore history; unverifiable history stays hidden. | Account effective-connection test, hook credential-rotation test | Pending pushed-head review |
| 4496538688 | Explicit and resumed ceilings are bounded by the fixture ceiling. Invalid continuation attempts fail before provider dispatch. | `contextCapacityRun.test.ts` | Pending pushed-head review |
| 4496538709 | Targets below the fixed wrapper fail immediately. | Counter red/green regression; obsolete synchronous generator removed | Pending pushed-head review |
| 4496538730, 4496538759 | Current-version context collections are sanitized, including strict string reasons. | Corrupt collection and invalid fact tests through history storage | Pending pushed-head review |
| 4496538774 | Observation freshness is captured before asynchronous hashing. | Reversed hash-completion regression | Pending pushed-head review |
| 4496538805 | Timeout, empty-response and interrupted feedback survive compact history. | History persistence and restored-panel tests | Pending pushed-head review |
| 4496538819 | Persist compact checkpoints before each request and after completion. Recovery distinguishes completed attempts from an unresolved request, sends no automatic provider retry, and saves recovered observations before checkpoint cleanup. | Durable checkpoint unit tests and actual Chromium worker-stop E2E | Pending pushed-head review |
| Review 5805622488: sibling-save test | Hold the real storage write lock, run both probes, release queued writes and reload both results. | Profile dialog regression | Review body only |
| Review 5805622488: unverified UI blocking | Measured synchronous default fixture preparation at about 292 ms locally. Tokenization now yields every bounded batch, checks cancellation, and reuses its measured token count. | Million-token fixture/cancellation tests | Review body only |
| CI unit-tests (2) | Replace per-character URL typing with user paste; preserve the delayed-history overwrite assertion. | Original CI timeout retained; five consecutive focused passes | Current-head CI pending |

## Coverage batch

Initial Codecov report was available despite the failed test: 87.57% patch, 25 misses and 45 partials. Queried every changed source path; JSON/type-only 404s are outside executable coverage. No hidden rows remain unenumerated. The following table accounts for every implicated file by behavior, rather than by percentage alone.

| Implicated source | Disposition |
| --- | --- |
| `ContextCapacityPanel.tsx` | Added small/million-token formatting, historical upper-bound and restored outcome tests. Removed the unreachable `stop` sub-branch behind `!emptyResponse`. Remaining missing-bound fallbacks protect malformed controller data. |
| `useContextCapacity.ts` | Added enabled-history reload, invalidated loads, stale save success/failure, current save failure and credential-rotation tests. Existing panel/web tests cover cancellation and configuration invalidation. |
| `contextHistoryInBackground.ts` | Added successful/rejected get/save bridge tests. |
| `runContextCapacityInBackground.ts` | Added disconnected-worker recovery; existing web tests cover progress, abort/unmount and redacted response failure. Missing optional backend error text uses a low-risk generic fallback. |
| `aiApiVerification/utils.ts` | Added 408/504 summary mapping checks. |
| `modelQuality/contextCapacity.ts` | Added malformed/accepted-only/rejected-only continuation, confirmation rejection/cancellation and pre-stopped tests. The contradictory-ledger guard is covered. |
| `contextCapacityRun.ts` | Added explicit/resumed ceiling, invalid configuration and awaited checkpoint-order tests. The final byte-limit fallback cannot be reached with the bounded ASCII counter contract (`no-test-warranted`); it remains defense in depth. |
| `contextCounter.ts` | Added undersized/oversized, full default fixture and cancellation tests. The final trimming fallback is defensive: the fixed ASCII fixture reserves eight tokens after the wrapper, so supported encodings do not reach it (`no-test-warranted`). |
| `verificationResultHistory/codec.ts` | Added corrupt current-version collection and invalid reason/scope/count/target storage tests. |
| `contextCapacityHistory.ts` | Added reordered hashing and compact outcome round trips. Removed the obsolete account lookup-identity branch. |
| `retention.ts` | Added connection-history preservation during unrelated owner removal. Existing storage suite exercises owner retention. |
| `verificationResultHistory/storage.ts` | Added invalid-summary rejection; account history lookup requires the effective scope. |
| `webAiApiCheck/background.ts` | Added invalid history requests, recovery-only no-dispatch, successful persistence and interrupted/completed recovery. Existing tests cover validation, progress routing and owner cancellation. |
| New `contextCapacityCheckpoint.ts` | Added same-connection exclusion, full checkpoint store, cancellation persistence and recovery. Checkpoint storage is locked, bounded, and contains neither request secrets nor long prompt/response text. |

## Validation and retained evidence

- Red/green logs and initial GitHub/Codecov snapshots are retained locally under [artifacts](artifacts/), excluded from Git by the scoped ignore file.
- Combined local coverage run: 14 files, 401 tests passed; 95.12% scoped lines. This is diagnostic scope, not the remote PR percentage. Subsequent focused tests cover the remaining bridge and checkpoint branches; commands and JSON reports are retained alongside the logs.
- The CI timeout regression passed five consecutive focused runs, approximately 0.6 seconds per test body.
- Chromium: build plus seven scenarios passed, including actual `ServiceWorker.stopWorker`, no repeated provider request, capacity bounds, explicit budget continuation, truncation, cancellation and history restoration. The final run and artifacts are recorded below when complete.
- Reviewed the actual interrupted-result panel screenshot: clear inconclusive state and charge uncertainty text, with diagnostics collapsed. This is a new state with no comparable prior screenshot. Screenshot artifacts remain local; no paid provider was called.
- Full-suite CI, exact-head Codecov, terminal CodeRabbit review, fresh thread acceptance and refreshed mergeability remain required after publication.
