# Git Hooks

Run `pnpm install` to set up Husky. Hook entrypoints and `package.json` define the commands. The selectors below determine when conditional checks run.

## Trigger ownership

- `commit-msg` runs `commitlint` against `commitlint.config.mjs`. Pull request titles follow the same Conventional Commits rules because a squash merge can use the title as the commit message.
- `pre-commit` runs `validate:staged`. The `lint-staged` configuration formats/lints applicable staged files and runs only staged `tests/**/*.test.{ts,tsx}` files in Vitest. Related behavior tests remain part of development validation.
- `scripts/run-i18n-check-if-staged.mjs` selects extraction inputs, locale resources, and relevant configuration, including deleted paths and both sides of renames. It then runs extraction integrity and completeness checks against the checkout. Inspect unrelated local edits if they cause a failure; preserve the user's work and index.
- `scripts/run-permission-warning-check.mjs --staged` requires the native browser permission-warning check when manifest configuration, entrypoints, plugins, dependencies, or the check itself change. It includes deletions and both sides of renames, and rejects unstaged manifest-input changes that would make the result describe a different candidate. The check uses a fresh default E2E build and fails if the browser is missing or reports new warnings; install the browser with `pnpm e2e:install`.
- `pre-push` runs `validate:push:changed`. `scripts/run-push-check-if-needed.mjs` reads Git's stdin ref updates and compares each remote/local object pair, including deletions and both sides of file renames. Only known prose paths can skip `compile` and `knip`; source Markdown and docs tooling still trigger them. Missing input, new refs, or unavailable objects retain the full gate. Checks run in the current checkout, so keep it aligned with the code being pushed. Documentation rendering and link checks remain separate, risk-based validation.

## Manual checks and troubleshooting

Use the complete gates when their hook will not run or to diagnose a failure:

```bash
pnpm run validate:staged
pnpm run validate:push
pnpm e2e:permissions
```

`validate:push` is unconditional. The conditional selector is normally invoked by Git with its ref-update input, not with paths supplied manually. Let an imminent hook run its gate on unchanged relevant state. `pnpm lint-staged` runs only part of the pre-commit gate.

`e2e:permissions` is also unconditional. See [permission warning validation](../e2e/README.md#permission-warning-validation) for its baseline, evidence, and distinction from a complete packed-extension upgrade.

After a hook fails, inspect the error and any formatter/index changes, fix task-owned issues, and retry. Bypassing a required gate needs an explicit authorized exception. Disclose the skipped validation and remaining risk.

If hooks are missing after cloning, `pnpm install` runs the `prepare` script that installs Husky. Check `git config --get core.hooksPath` and the actual hook before changing configuration. On systems requiring executable permissions:

```bash
chmod +x .husky/pre-commit .husky/commit-msg .husky/pre-push
```
