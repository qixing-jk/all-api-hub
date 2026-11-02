# Check-in recovery audit

Status: completed

## Scope and decisions

Audit prompted by #1798 and #1769. Both reports describe New API on 4.6.0,
manual method selection, unknown/invalid_response detection, and a pre-request
method_not_matched skip. These reports do not establish a current-version live
failure. No issue comments or remote publication are part of this task.

Selection mode and execution trigger are independent. Both selection modes use
the same selected-method confirmation and execution pipeline. Automatic
selection may choose another verified method; manual selection preserves the
chosen method. Background preparation reserves a persistent 24-hour cooldown;
explicit execution may reconfirm immediately. No recovery probe submits a POST.

Selection authority is owned by `resolveCheckInSelectionPolicy` in the domain
module. Its outputs are the allowed discovery method IDs and permission to
reselect. Recovery orchestration, discovery-result acceptance and draft merge
consume these outputs instead of interpreting manual/automatic mode themselves.
Explicit selection transitions and storage serialization retain the mode values.

Policy extraction validation: 315 tests passed across domain, discovery and
selected-method execution. Policy tests were run failing before implementation.

## Audit and acceptance matrix

| Situation | Decision and owner | Evidence |
| --- | --- | --- |
| Saved unknown manual detection | Reconfirm selected method during daily preparation; preserve selection | automaticDiscovery.test.ts, uncertain manual recovery |
| Previously unsupported manual method | Reconfirm after cooldown so upstream restoration can recover | automaticDiscovery.test.ts, unsupported manual recovery |
| Imported selected method without detection | Prepare before daily readiness filtering in both modes | automaticDiscovery.test.ts; checkInDomain.test.ts |
| Explicit execution of unknown/unsupported selected method | Shared confirmation for both modes; persist newer matched evidence before admission | checkInMethods.test.ts, six selection/evidence combinations |
| Repeated or overlapping background preparation | Existing atomic cooldown claim and current snapshot checks retained | automaticDiscovery.test.ts, overlapping runs and worker reload |
| Account, credential, selection or intent changes during recovery | Reject stale recovery; check current identity, readiness and global switch before POST | automaticDiscovery.test.ts; checkInMethods.test.ts; checkInMutationAdmission.test.ts |
| Storage failure during preparation or admission | Fail closed without mutation | automaticDiscovery.test.ts; checkInMethods.test.ts |
| Old checked/disabled status | Existing fresh status read can resolve cached skip | checkInMethods.test.ts |
| Network/timeout/temporary upstream failure | Existing reason catalog and bounded same-day retry queue retained | resultPolicy.test.ts; retryRuns.test.ts; retryBatch.test.ts |
| Submission outcome uncertain | Existing readback reconciles checked state; retry requires authoritative status when available; non-repeat-safe methods remain excluded | checkInMethods.test.ts; resultPolicy.test.ts |
| Authentication recovery | Provider-specific recovery remains behind current-account mutation admission | checkInMethods.test.ts, recovered POST admission |
| Stale retry alarm or previous-day queue | Existing day guard prevents replay | scheduling and retry tests |
| Renamed endpoint | Existing bounded structural path discovery remains an explicit redetection action; invalid_response alone also covers auth/protection/malformed payloads and does not prove a new path | routeDiscovery.test.ts; accountDiscoveryRoute.test.ts |
| Native-page fallback or manual verification | Provider-specific policy retained; rate limit/auth failures do not become generic native clicks | providers/newApi.ts and provider tests |

## Validation

New behavior tests were run failing before each implementation slice. Final
module regression: `pnpm exec vitest run tests/services/autoCheckin`, 64 files,
1,303 tests passed. The earlier full run exposed an outdated permanent-skip
expectation; it was updated to explicitly verify background admission, and the
complete module run above passed afterward. TypeScript and staged-hook results
are recorded in the final task handoff.

Live reporter environment, real credentials, browser rendering, and real-site
endpoint changes were not reproduced. No UI or locale changes are included.
Regression tests are the durable owner; no general agent rules need updating.
