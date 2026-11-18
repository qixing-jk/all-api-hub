# Contributing to All API Hub

## Contributor licensing

By submitting a pull request or other contribution to this repository, you agree that your contribution may be licensed under:

- GNU Affero General Public License v3.0 (AGPL-3.0), and
- commercial license terms granted by the All API Hub maintainers.

You represent that you have the right to submit the contribution and that it does not infringe any third-party rights. If you do not agree to these terms, please do not submit the contribution.

## Getting started

Install the Node.js version in [`.nvmrc`](.nvmrc), then fork and clone the repository. Install dependencies and start the extension in Chrome.

```bash
corepack enable
git clone https://github.com/YOUR_USERNAME/all-api-hub.git
cd all-api-hub
pnpm install
pnpm dev
```

`pnpm install` also sets up Git hooks. For Firefox development, run `pnpm dev:firefox`.

See [local development](docs/development/setup.md) for manual loading, environment configuration, IDE setup, and the source layout.

## Testing

Run focused tests for the behavior you changed. Start with the [test commands](docs/development/testing.md#running-tests).

- [Unit and component testing](docs/development/testing.md) covers test conventions and fixtures.
- [Browser and extension testing](e2e/README.md) covers Chromium E2E, Firefox, Safari, CDP, and permission changes.
- [Screenshots and visual evidence](docs/development/visual-evidence.md) covers refreshing documentation images and comparing UI changes.

## Code checks and Git hooks

Use `pnpm compile` for type checking and `pnpm lint` for lint checks. See [local development](docs/development/setup.md#linting-and-formatting) for focused formatting and type-checking commands.

Commit normally so the [Git hooks](.husky/README.md) can run their staged-file checks. Run the tests for the affected behavior before committing.

## Building

Use a build command for an unpacked production extension or a zip command to package it for distribution.

| Target | Build | Package |
| --- | --- | --- |
| Chrome / Chromium | `pnpm build` | `pnpm zip` |
| Firefox | `pnpm build:firefox` | `pnpm zip:firefox` |
| Safari | `pnpm build:safari` | `pnpm zip:safari` |
| All configured browsers | `pnpm build:all` | `pnpm zip:all` |

Outputs are written under `.output/`.

## Pull requests

1. Create a feature branch from `main`.
2. Add or update tests for observable behavior changes and run the focused checks. Broaden coverage if you change shared contracts, dependencies, or build wiring.
3. Stage the files that belong to your change. Use the [commit and PR title convention](.husky/README.md#trigger-ownership).
4. Describe the change and validation in the PR. Update the relevant docs when you change a user-facing workflow.

PR CI runs the full unit suite and coverage checks. See [CI and releases](docs/development/ci-and-releases.md) for workflow triggers, sharding, and release packaging.

## Getting help

- Check the [documentation](https://all-api-hub.qixing1217.top/)
- Review [existing issues](https://github.com/qixing-jk/all-api-hub/issues)
- Open a new issue with your question
