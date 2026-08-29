# Automated Releases (semantic-release)

Version bumps, `CHANGELOG.md`, git tags, GitHub releases and npm publishing are
fully automated by [semantic-release](https://semantic-release.gitbook.io/).
There is **no manual version management** — do not hand-edit `version` fields,
`packages/sdk/src/version.ts`, or the generated section of `CHANGELOG.md`.

## How it works

On every push to `main` or `next`, `.github/workflows/release.yml` runs
`npx semantic-release`, which:

1. **`@semantic-release/commit-analyzer`** — reads Conventional Commits since the
   last tag and decides the bump (`major` / `minor` / `patch` / none).
2. **`@semantic-release/release-notes-generator`** — builds release notes.
3. **`@semantic-release/changelog`** — writes them into `CHANGELOG.md`.
4. **`@semantic-release/exec`** — runs `node scripts/set-version.mjs <version>`
   to sync the version into every workspace `package.json` and regenerate
   `packages/sdk/src/version.ts`.
5. **`@semantic-release/npm`** — publishes `packages/sdk` to npm (`pkgRoot`).
6. **`@semantic-release/github`** — creates the GitHub release + tag.
7. **`@semantic-release/git`** — commits the changelog / version files back with
   `chore(release): <version> [skip ci]`.

## Branches

| Branch | Channel | Result |
|--------|---------|--------|
| `main` | latest | Stable releases (`1.4.0`) |
| `next` | next | Pre-releases (`1.5.0-next.1`) |

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/). The type prefix
drives the release:

| Prefix | Release | Notes section |
|--------|---------|---------------|
| `feat:` | minor | Features |
| `fix:` | patch | Bug Fixes |
| `perf:` | patch | Performance Improvements |
| `refactor:` | patch | Refactoring |
| `docs:` | patch | Documentation |
| `chore:` | none | hidden |
| `test:` | none | hidden |

A `BREAKING CHANGE:` footer (or `feat!:` / `fix!:`) forces a **major** bump.

## Required repository secrets

| Secret | Used for |
|--------|----------|
| `NPM_TOKEN` | `npm publish` (automation token with publish rights) |
| `GITHUB_TOKEN` | Provided automatically by Actions — needs `contents: write`, `issues: write`, `pull-requests: write` (already set in the workflow). |

## Local dry-run

```bash
npm run release:dry-run
```

Shows the next version and release notes without publishing or pushing.
