# Versioning

## Single source of truth

The plugin is a **single npm package**. The authoritative version is [`package.json`](../../package.json) `"version"`. It must stay aligned with:

- The built XPI / `manifest.json` version
- Git tags for releases (`v` + semver, e.g. `v0.1.0`)
- Root [`update.json`](../../update.json) / [`update-beta.json`](../../update-beta.json) produced by `npm run prepare-release`

## Bump version

```bash
node -p "require('./package.json').version"
npm version patch   # or minor / major
npm run prepare-release
```

## When to bump

| Change                            | Bump  |
| --------------------------------- | ----- |
| Bugfix, docs, small UI            | patch |
| New features, compatible API      | minor |
| Breaking MCP or manifest contract | major |

## CI / releases

| Trigger                                | Workflow                                                             |
| -------------------------------------- | -------------------------------------------------------------------- |
| Push / PR to `main` or `master`        | `.github/workflows/ci.yml` — `npm ci` + `npm run build`              |
| Tag `v*.*.*`                           | `.github/workflows/release.yml` — XPI + `update.json`                |
| Tag `v*.*.*-beta.*` or manual dispatch | `.github/workflows/beta-release.yml` — beta XPI + `update-beta.json` |

Publish: commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Zotero auto-update

The built add-on sets `update_url` to the GitHub Release asset `update.json`. Users use **Add-ons → Check for Updates**; no custom polling in the plugin.
