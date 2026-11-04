# Safari daily smoke

`.github/workflows/safari-smoke.yml` runs on a GitHub-hosted macOS runner every day at 19:23 UTC (03:23 Singapore time) and supports manual execution. The dedicated trial branch also triggers it on push while developing the runner. Scheduled execution becomes active after the workflow is on the repository's default branch.

The workflow runs Safari manifest, permission, distribution, native Cookie transport and tooling regressions. It builds the Safari release resources, copies them into a uniquely named instrumented trial, generates and compiles its native Xcode host and extension, and operates Safari's actual settings to enable that trial.

The loopback fixture uses synthetic accounts. The native verifier requires fresh server observations of concurrent account isolation, Cookie and Origin handling, response Cookie suppression, redirect rejection, cancellation recovery, scope limits and ordinary fetch isolation. A missing or incomplete native run fails the workflow. The fixture server is stopped by the workflow's exit trap.

The basic UI check opens the real toolbar Popup, requires its management controls, clicks Account Management and reads back the Options account-manager URL. During the final UI wait it dismisses the trial's optional public-directory permission request, activates the account-manager tab and completes the first-use guide through Not now. It requires the rendered account manager's Add Account control after that guide closes. Screenshots and accessibility snapshots accompany these checks.

The runner uses macOS accessibility APIs and Apple Events. It handles the runner's specific system request to control Safari through the actual authorization dialog. Extension setup follows the state bootstrap used by [btecu/safari-ad](https://github.com/btecu/safari-ad/blob/main/scripts/enable_in_safari.py): stop Safari before preparing its registered extension state, then restart Safari and verify activation. This runner changes only the uniquely generated trial entry and grants loopback fixture access. Developer controls and the installed extension checkbox are read back. Safari's [unsigned-extension settings](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) reset when Safari quits, so each restart restores that setting through its authorization dialog, refreshes native registration and waits for the enabled trial to appear. Before opening the Popup, the runner closes Safari Settings and selects the toolbar action by its actual title, `All API Hub`.

The CLI requires a GitHub-hosted macOS runner. It uses the image's local automatic-login credential to authenticate Safari's unsigned-extension dialog, changes Safari development settings and enables its generated trial. The credential format is defined by the [official runner image bootstrap](https://github.com/actions/runner-images/blob/main/images/macos/assets/bootstrap-provisioner/kcpassword.py). Passwords are masked in CI and omitted from accessibility snapshots. Use the separate [native validation guide](../safariNativeCookie/README.md) for deliberate local experiments.

System authorization reads only the macOS permission agents, so rendering a large Options page does not block it. The smoke denies the generated trial's optional request to access the public LDOH directory; it grants only the loopback fixture origins. Navigation locates and activates the extension's account-manager tab even if a background lookup opens another tab.

## Evidence

The `safari-smoke-<attempt>` artifact retains `test-results/safari` reports, observations, UI snapshots, screenshots and build logs, plus generated project and entitlement metadata. Derived build caches are excluded. Failed attempts retain their own evidence.

For local driver regressions:

```sh
pnpm exec vitest run tests/scripts/safariSmoke.test.ts tests/scripts/safariAuthorization.test.ts tests/scripts/safariActivation.test.ts tests/scripts/safariWorkflow.test.ts
```

The activation regressions require Python 3. Set `AAH_SAFARI_TEST_PYTHON` to an interpreter path when `python3` is unavailable or resolves to a Windows application alias.

The real native observations use the maintained verifier:

```sh
node e2e/safariNativeCookie/verify.ts test-results/safari/observations.json
```
