# Browser and extension testing

Start with Chromium. For changes with a browser-specific compatibility risk, exercise the affected behavior in the relevant browser. For provider workflows, see the [real-site guide](realSite/README.md).

## Chromium E2E

Use Playwright when behavior depends on the extension runtime or browser interactions.

```bash
# Install the Chromium test browser
pnpm e2e:install

# Run a focused extension workflow
pnpm e2e e2e/your-workflow.spec.ts --project=chromium

# Open the Playwright test UI
pnpm e2e:ui
```

Use the [local environment configuration](../docs/development/setup.md#local-tooling-environment-configuration) for credentials and browser paths.

The density suites (`densitySettings.spec.ts` and `densityCoverage.spec.ts`) run their behavior and geometry assertions on every test run. Review screenshots use the existing opt-in `captureVisualViews` checkpoints. Run `pnpm visual:capture --spec e2e/densitySettings.spec.ts --fixture density-settings-v1` for the settings suite, or select `e2e/densityCoverage.spec.ts` with its own fixture label. See [local screenshot comparison](../docs/development/visual-evidence.md#local-screenshot-comparison) for filtering, metadata and baseline comparison.

## Firefox extension smoke tests

Run `pnpm e2e:firefox` for desktop Firefox extension UI and browser API checks. The Playwright suite builds `.output/firefox-mv2-test` and installs it in a temporary Firefox profile. Selenium and geckodriver control native browser UI, and the shared Firefox RDP adapter inspects extension documents. Pass a spec path or `--grep` to focus on one workflow.

Install Firefox first. Selenium Manager resolves geckodriver automatically and may download it on the first run. Set `AAH_E2E_FIREFOX_EXECUTABLE_PATH` or `AAH_E2E_GECKODRIVER_PATH` to use specific local binaries. The runner loads these through the shared [local environment configuration](../docs/development/setup.md#local-tooling-environment-configuration). `AAH_SKIP_E2E_BUILD=1` explicitly reuses the existing Firefox test artifact; leave it unset for a fresh build.

The smoke profile runs headlessly, fixes desktop pointer capabilities independently of host touch hardware, prevents popup auto-hide during inspection, and disables external networking. It uses bundled resources and synthetic data, without real accounts or credentials. Screenshots of the actual extension browsing contexts are saved under `test-results/firefox/` and retained by the E2E workflow on success and failure. Geometry and behavior assertions are automated; these screenshots are review evidence, not pixel comparison baselines.

The suite covers popup bounds, tabs, dialogs, dropdowns and scrolling; native sidebar opening and form survival after popup closure; missing/rejected sidebar API fallback to account creation in Options; and retry after both navigation destinations fail. Installing a temporary sidebar extension can open its sidebar, so the fixture closes it before testing user-initiated handoff. Gesture-sensitive actions use native WebDriver pointer input rather than scripted DOM clicks.

Browser API checks exercise Firefox's actual optional clipboard permission prompt (deny, retry, grant and revoke), credential copying, clipboard failure recovery and Turnstile notifications after native permission grant. Successful copies are read back from Firefox's headless, in-memory clipboard. Failure scenarios inject errors only at browser API boundaries; account data and keys are synthetic. The suite does not access the desktop clipboard.

Extend `e2e/firefox/` incrementally when a feature depends on browser layout or extension APIs, and add regressions for Firefox-specific failures. Account persistence, downloads, other permissions and background lifecycle still need coverage as those areas change. Passing these checks does not establish Android Firefox, every sidebar workflow, or all-feature compatibility.

## Safari smoke tests

Use the [macOS Safari smoke workflow](safari/README.md) to exercise the installed extension in Safari. The [native Cookie validation guide](safariNativeCookie/README.md) covers the native host and local trial procedures.

## Reusable CDP UI checks

Reuse a running current-worktree browser and select the task to inspect instead of rerunning a whole provider suite:

```bash
pnpm e2e:cdp -- --list
pnpm e2e:cdp -- --isolate --scenario=options
pnpm e2e:cdp -- --isolate --scenario=all --account-id=<saved-account-id> --field="Token Name"
pnpm e2e:cdp -- --isolate --scenario=account --account-id=<saved-account-id>
pnpm e2e:cdp -- --isolate --scenario=key-editor --account-id=<saved-account-id> --field="Token Name" --field="Monthly limit (USD)"
```

The default build is `.output/chrome-mv3-dev`; add `--prod` when the browser mounts `.output/chrome-mv3`. Use the same `--isolate` choice as the launcher. `--scenario` is repeatable (`options`, `account`, `models`, `key-editor`); the default is `options`. `--scenario=all` selects every registered read-only check and requires the account and native-field prerequisites; missing prerequisites remain incomplete. Account IDs belong to the selected extension's saved accounts. Expected field labels must match the current UI language. The key-editor scenario opens the native create form and checks the requested fields, then closes its own page without saving; it does not validate create/edit writes. The models scenario checks catalog rendering, not pricing correctness. A selected subset is a focused check rather than full site acceptance.

The command prints the path to a unique local temporary directory containing screenshots and `report.json`. The report includes the worktree/revision, dirty state, exact build path/extension ID, per-scenario coverage and duration, and passed/failed/blocked/not-selected/not-run outcomes. Exit codes are `0` when selected scenarios pass, `1` on failure, and `2` when prerequisites block completion. Raw local evidence stays outside Git.

For maintained provider suites, reuse `scripts/cdp/ui-scenarios.mjs` for selection/results, `connectWorktreeExtension` for exact-build attachment, and `scripts/flows/native-key-editor.mjs` for opening/readiness and single-dispatch submission. Select an actual native field by label or locator; a field intentionally absent in create mode cannot be its readiness condition. `waitForClose: false` only dispatches the save so a suite can record the upstream resource ID or sample in-flight failure feedback; the caller must still assert completion/readback. Keep native values, permissions, field preservation and owned-resource cleanup in the site suite. The OpenRouter lifecycle E2E and live runners share these UI helpers.

Multi-suite live commands use `runLiveSuites` from `scripts/cdp/live-suites.mjs` over the same scenario executor. Register independent suites with `id`, `covers`, optional `prerequisite`, and `run`; `all` derives its selection from that registration. Throw or return `{ ok: false }` on failure; return `{ skipped: true, reason }` when required checks remain unexecuted. A failed assertion takes precedence over skipped checks. Each callback must finish its owned-resource cleanup before returning or throwing; use `runScenarioWithCleanup` from `e2e/utils/scenarioErrors.ts` to preserve both execution and cleanup failures. Shared prerequisites belong in `prerequisite`; dependent steps remain together inside one suite. Independent suites continue after failure, while the generic UI executor retains its default stop-on-failure behavior.

The aggregator prints and saves a unique temporary `report.json` on every valid run, including incomplete runs. It records timestamps, selected/unselected suite IDs, coverage labels, durations, failure/block reasons and the runner-supplied target/CDP/extension metadata; incomplete selected coverage throws and the CLI exits nonzero. `allSelected` means all registered suites were selected, not that every product behavior was tested. Partial runs retain omitted suites and cannot establish complete acceptance. Do not pass credentials or raw API payloads as evidence: the aggregator intentionally does not persist callback return data. Keep exact build/revision evidence, native readback, screenshots and detailed scenario evidence in the owning runner. Read-only modes and explicit write flags still define operation scope; expected business rejection asserted by a test is distinct from a test skipped for missing access.

Use `createUiCapture` from `scripts/cdp/ui-driver.mjs` for ordinary screenshots; pass the actual page/locator, existing masks, and any deliberate page fallback. It records the filename actually written and uses a locator's owning page for fallback. Keep protocol-specific capture, fault-injection checkpoints and CDP-only screenshot requirements explicit. `testAccountCardFlow` requires the saved account ID and uses the existing account search route so same-name accounts cannot satisfy its assertion. Managed-site suites share `deleteManagedSiteChannelRow` in `scripts/suites/managed-site/ui.mjs`; pass exactly one run-owned row from a workspace without an existing selection and verify deletion against the gateway afterward. Extend the closest existing flow rather than copying controls or inventing a generic provider protocol. Use deterministic extension E2E for unavailable roles and failure variants, and keep the live-coverage gap explicit.

Use `configureExtensionPage(page, { language, viewport, dismissUpdateLog })` before navigation to share page preparation while preserving each suite's configuration choices. `openExtensionPage` accepts those options and closes its newly created page if setup or navigation fails. The targeted update-log handler only closes that notice; it does not suppress account or key dialogs.

For account onboarding, `scripts/flows/auto-detect.mjs` shares `openAccountAddDialog` and `detectAccountSiteType`; `testAutoDetectFlow` combines them and closes the unsaved draft. Pass the expected machine site type, not a display-name substring. Detection clicks the actual action once, checks `data-site-type`, and waits for the busy state to end (the button can disappear on completion). This proves site identification, not credential completeness, balance semantics or account persistence. The real detection action can acquire credentials or perform provider-specific operations; reuse it only where that action is intended, and retain the suite's field and financial assertions.

For integration acceptance rules, use the project skill's [detection outcome acceptance](../.agents/skills/add-site-integration/references/integration-acceptance.md#accept-the-intended-detection-outcome). `optionsAccountDetectionExistingTab.spec.ts` includes a scoped-token manual-completion example. The shared `detectAccountSiteType` helper requires no error/guidance message; use explicit intermediate-state assertions when guidance is expected.

`assertAccountDetectionOutcome({ page, expectedType, fields, saveState, guidance, timeoutMs })` checks a current draft without clicking or saving. `fields` maps account field names such as `userIdInput`, `usernameInput`, `siteUrlInput` and `accessTokenInput` to expected values (including explicit empty strings). `saveState` is `absent`, `disabled` or `enabled`; `guidance` optionally selects expected text or a regular expression. Without guidance it requires the error/guidance message to be hidden. Provider-specific next actions and persistence checks remain in the caller.

`closeAccountDraft` closes an owned draft through its application control. For actual local account saves, `withUiCreatedAccount(worker, create, work, { timeoutMs })` supplies a unique site name to `create`, observes the new saved account and passes it to `work`; cleanup uses confirmed new IDs even after rename. It checks uncertain save results without replaying the action. `withStoredValue` retains its default full restoration behavior; temporary preference overrides can opt into `{ restorePatchedKeysOnly: true }` as the fifth argument for locked patch/restore of the task's fields while retaining other preference edits. Kimi's runner uses an isolated target with no pre-existing same-identity saved account for its UI-save validation.

For model catalogs, `readModelCatalog` in `scripts/flows/model-catalog.mjs` checks the current route's account source, page readiness and rendered names, returning the display locator and mounted names. `testModelCatalogFlow` adds navigation. Names count mounted rows in a virtualized list, not the full catalog. Prices are required by default; set `requirePrices: false` for explicit catalog-only or native-credit checks, retaining provider-specific unit and access assertions. A currency-shaped value establishes price rendering, not correct rates; retain native model/rate comparisons. The RelayFor parity E2E reuses this helper alongside allowance, access and routing assertions; Requesty semantics E2E checks monetary balance, monthly ceiling versus spend, and different create/edit controls.

## Shell hosted-site CDP checks

`pnpm e2e:cdp:shell` checks APIYI and LaoZhang using the current worktree's exact
production extension path. Launch it with `pnpm browser:cdp -- --prod` first.
Use `--site=apiyi` or `--site=laozhang` to select one site, `--isolate` for the
matching isolated browser, or `--extension-path=.output/chrome-mv3-dev` for an
already mounted development build.

The runner uses the shared [local env loader](../docs/development/setup.md#local-tooling-environment-configuration),
including `--env-file=<path>`. Put these Node-only credentials in the primary
checkout's untracked `.env.local`; do not send passwords as command arguments:

```dotenv
APIYI_USERNAME=""
APIYI_PASSWORD=""
LAOZHANG_USERNAME=""
LAOZHANG_PASSWORD=""
```

Existing native sessions are reused. Otherwise the runner fills the website's
login form and submits once. CAPTCHA, MFA or rejected credentials remain a
visible failed/blocked prerequisite. Optional `APIYI_USER_ID` / `LAOZHANG_USER_ID`
assert the observed native identity. Optional `APIYI_BASE_URL` /
`LAOZHANG_BASE_URL` must be official console origins for that provider.

Detection always runs through the extension UI. The runner then uses an
automatically acquired System Token, or explicitly selects the Cookie alternative.
Optional `APIYI_ACCESS_TOKEN` / `LAOZHANG_ACCESS_TOKEN` fill the normal token field
after identity detection and are labelled as existing credentials; they do not
prove automatic token acquisition or replace native login. It does not rotate
System Tokens. This new runner does not consume the legacy LaoZhang runner's
`LAOZHANG_ACCESS_TOKEN_FILE` option.

Separate report rows cover native login, detection, save/refresh/reopen, rendered
models/prices, key inventory, invite copy feedback, and cleanup. A run creates and
removes only its uniquely named local extension account. It does not modify
provider keys or consume credit. A selected site is not a two-site result, and
the report lists excluded cases such as key writes, native price parity, usage
history, announcement parity and expired-session recovery. Screenshots and
reports go into a unique ignored directory; missing credentials produce a nonzero
exit and blocked rows instead of a success claim. `e2e:cdp:laozhang` remains the
separate older protocol/native-editor diagnostic runner.

## Extension-led check-in acceptance

```bash
pnpm browser:cdp -- --isolate --dev
pnpm e2e:cdp:checkin-ui -- --isolate --check-in --site=all
```

This runner starts fresh Add Account dialogs for Xingya and Runanytime, uses the default authentication and automatic site/account detection, follows native token/security UI when required, detects the check-in method, and saves, refreshes and reopens the account. It then follows the offered account login guidance, saves and reopens that configuration, invokes the account's row check-in action and repeats it. Expected site types and check-in methods are assertions; they are never assigned to the draft. The runner does not seed accounts, edit storage/Cookies, send runtime commands or call provider APIs. Native website requests are observed passively. Existing authenticated browser sessions are reused; use English or Chinese UI. Shared `.env.local` inputs `XINGYA_USERNAME`/`XINGYA_PASSWORD` fill the normal account login controls and website verification. Optional `XINGYA_USER_ID` and `RUNANYTIME_USERNAME`/`RUNANYTIME_USER_ID` assert detected identity; they do not populate it. Identity correctness is compared with env expectations and/or a passively observed normal `/api/user/self` response; lacking an independent identity leaves the stage blocked. Runanytime configures the offered Linux DO login and uses its existing browser session, with no password input required.

`--site=xingya` or `--site=runanytime` narrows the site coverage; `--runanytime` remains an alias. `--prod` selects the installed production output. `--check-in` authorizes real account setup and a possible daily grant. Each run uses a unique display label and removes only its own account and newly created scoped token through UI; `--keep-account` intentionally retains them for follow-up. Pre-existing accounts, credentials and tabs are preserved. Reports and screenshots go into a unique `extension-ui-*` directory below `.scratch/xingya-checkin/evidence/` (override the parent with `--evidence-dir`). Errors and blocked/unselected coverage are retained. Exit codes are `0` for required passing checks, `1` for assertion/setup/cleanup failure, and `2` for incomplete coverage such as an already-checked account blocking the first-grant/PoW case. Cold login, expired-session recovery and real CAPTCHA remain explicit unverified variants unless separately exercised. Automatic token acquisition does not count as exercising the native token-guidance branch; that branch is reported unverified when not reached.

The New API E2E and CDP runner share `scripts/flows/new-api-token-ui.mjs` for native credential controls. E2E-only direct-API cleanup stays in the E2E caller. `e2e:cdp:xingya-session` is a compatibility alias for the UI runner; `scripts/test-checkin-login-guidance-cdp.mjs` still uses synthetic saved accounts and is only a configuration-layout check.

## Turnstile verification scenarios

Start the official Turnstile test server with `pnpm dev:turnstile`, then open Settings → Refresh → Website verification assistance in a **development** extension. The existing development trigger includes four Turnstile presets: automatic success, manual verification, verification failure, and a three-site queue. Selecting one prefills `http://127.0.0.1:8787/`; the existing delay lets you switch away before verification starts. The trigger is unavailable in release builds.

The server uses [Cloudflare's official test component and dummy keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) and validates dummy tokens through Siteverify. It needs network access to Cloudflare, but no account, login, production key, or daily check-in allowance. It does not perform real account mutations. Failure stays pending until the existing token-wait timeout expires.

The two independent reminder channels are **In-page reminders** (on by default) and **Browser notifications** (off by default). Either, both, or neither can be enabled. In-page reminders use the focused extension page or current web page. Browser notifications require permission: enabling the channel without permission opens an explanation dialog with an explicit authorization button. Refusing or cancelling leaves the channel off. A blocked browser shows settings guidance. Delivery failures never enable a disabled channel or bring verification forward; click **Open verification window** or a browser notification to focus verification. For the three-site scenario, open and complete each request using its reminder. The server listens only on loopback ports 8787–8789. Set `AAH_TURNSTILE_PORT` to change the first port and update the trigger URL accordingly. Stop it with Ctrl+C. These local reminders do not use remote push providers. Closing or finishing a request clears its reminder. OS quiet mode can still hide an accepted system notification.

To automate official automatic success, reminders on extension/web pages, and the three-site interactive queue, stop the standalone test server, launch `pnpm browser:cdp:isolate`, then run `pnpm e2e:cdp:turnstile -- --isolate`. This runner starts its own local servers, restores preferences after the run, and saves screenshots under `.scratch/turnstile-channels/live-<timestamp>/`.

## Permission warning validation

Run `pnpm e2e:permissions` when changing required/optional permissions, host access, or other manifest inputs. The pre-commit hook selects this check for manifest configuration, entrypoints, plugins, dependencies, and its own tooling. The independent `Permission warnings` PR workflow uses the existing cached build producer and does not honor `skip-e2e` or `e2e-optional`; only a verified release-only diff skips it, like every other pull-request workflow. The test also runs in the default E2E suite and existing browser compatibility matrix. The command checks build freshness and uses the default manifest, without extra permissions from test-only build variants.

`e2e/extensionPermissionWarnings.spec.ts` asks the actual browser's `management.getPermissionWarningsByManifest` API for warnings from the built candidate and `e2e/fixtures/permission-warnings-baseline.json`. The baseline records the approved version 4.3.0 permission surface before DNR became required, including content-script match patterns. Compare both manifests in the same browser so changes to localized warning text do not require maintaining a warning-text snapshot. A control that promotes optional notifications to required must add a warning; new candidate warnings fail the check. JSON test attachments retain the browser version, manifests, warnings, and differences.

Do not regenerate the baseline merely to make a failure pass. Review the added access and resulting user impact before intentionally accepting a new baseline. If manifest ownership moves, update the hook's input selection as well.

This automates native **warning computation**, not CRX installation, upgrade-triggered disabling, re-approval, or store delivery. Reloading an unpacked extension does not test those flows. For complete upgrade verification, Chrome documents the [Extension Update Testing Tool](https://github.com/GoogleChromeLabs/extension-update-testing-tool): run its local server, upload the old package, install the signed CRX, upload a higher-version candidate using the same signing key, and use the extension management page's Update action. See the official [permission warning and update guide](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings). Report that separate outcome explicitly; a passing warning computation test is not evidence that a store upgrade was exercised.

For an isolated Windows CRX check, Chrome for Testing exposes `chrome://policy/test`. In a disposable profile, its local test provider can set `ExtensionInstallAllowlist` for the test extension ID and `ExtensionInstallSources` for the loopback update server without modifying system policies. Do not use forced installation: it can suppress the permission approval behavior being tested. This test page is browser-specific; check availability instead of assuming Edge implements it. Close the test browser and remove its temporary profile afterwards.

When automating that flow, restore native download handling with CDP `Browser.setDownloadBehavior({ behavior: "default" })`; Playwright's download interception can prevent the CRX installer from running. CDP DOM drag events alone are not evidence of a native file drop or installation. Confirm the native install dialog, verify the installed ID and version, and check both candidate and control updates. An ungranted optional permission promoted to required, such as `notifications`, should disable the control with `management.ExtensionInfo.disabledReason === "permissions_increase"` until re-approved. Retain browser versions, update requests, enabled states, and dialog evidence; distinguish reconstructed permission baselines from historical release packages.
