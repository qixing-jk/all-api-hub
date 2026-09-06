# Git Hooks

See [CONTRIBUTING.md](../CONTRIBUTING.md#git-hooks) for the development and validation workflow. Hook entrypoints and `package.json` own the commands; the selectors below own conditional execution.

## Trigger ownership

- `pre-commit` runs `validate:staged`. The `lint-staged` configuration formats/lints applicable staged files and runs only staged `tests/**/*.test.{ts,tsx}` files in Vitest. Related behavior tests remain part of development validation.
- `scripts/run-i18n-check-if-staged.mjs` selects extraction inputs, locale resources, and relevant configuration, including deleted paths and both sides of renames. It then runs extraction integrity and completeness checks against the checkout. Inspect unrelated local edits if they cause a failure; preserve the user's work and index.
- `pre-push` runs `validate:push:changed`. `scripts/run-push-check-if-needed.mjs` reads Git's stdin ref updates and compares each remote/local object pair, including deletions and both sides of file renames. Only known prose paths can skip `compile` and `knip`; source Markdown and docs tooling still trigger them. Missing input, new refs, or unavailable objects retain the full gate. Documentation rendering and link checks remain separate, risk-based validation.

## Manual checks and troubleshooting

Use the complete gates when their hook will not run or to diagnose a failure:

```bash
pnpm run validate:staged
pnpm run validate:push
```

`validate:push` is unconditional. The conditional selector is normally invoked by Git with its ref-update input, not with paths supplied manually. Avoid repeating an imminent hook's gate on unchanged relevant state.

After a hook fails, inspect the error and any formatter/index changes, fix task-owned issues, and retry. Follow [the authorized-exception policy](../CONTRIBUTING.md#skipping-hooks-not-recommended) if bypassing a required gate is necessary.

If hooks are missing after cloning, `pnpm install` runs the `prepare` script that installs Husky. Check `git config --get core.hooksPath` and the actual hook before changing configuration. On systems requiring executable permissions:

```bash
chmod +x .husky/pre-commit .husky/pre-push
```
