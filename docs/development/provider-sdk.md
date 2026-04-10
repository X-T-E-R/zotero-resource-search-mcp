# Provider SDK — Custom academic search sources

This plugin treats **academic search** as a set of **packages**. Each package is:

```
<id>/
  manifest.json    # metadata + permissions + optional config schema
  provider.js      # bundled JS: export function createProvider(api) { ... }
```

Built-in sources live in the repo under [`src/providers/packages/`](../../src/providers/packages/) and are compiled into `addon/providers/<id>/` for the XPI.

## Why write a provider?

- Index a **private API** or **internal catalog**.
- Ship a **team- or org-specific** source without forking the whole plugin.
- **Override** behavior for a built-in `id` by installing a user package with the same `id`.

## manifest.json

Validated by [`parseProviderManifest`](../../src/providers/manifest/validate.ts). Important fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Match `^[a-z][a-z0-9_-]{1,63}$/`; folder name must equal `id`. |
| `name` | yes | Display name. |
| `version` | yes | Semver-like, e.g. `1.0.0`. |
| `sourceType` | yes | `academic` \| `web` \| `patent` (academic search uses `academic`). |
| `permissions.urls` | yes | URL patterns allowed for `api.http` (e.g. `https://api.example.com/*`). |
| `minPluginVersion` | no | Minimum plugin semver for load. |
| `configSchema` | no | Keys under `platform.<id>.*` in prefs (boolean / string / number). |
| `allowedGlobalPrefs` | no | Full pref keys the bundle may read via `api.getGlobalPref` (e.g. `api.wos.key`). |
| `rateLimitPerMinute` | no | Default 60. |
| `searchTimeoutMs` | no | Default 60000. |
| `integrity.sha256` | no | Optional hash of `provider.js` for remote installs. |

Example (from arXiv):

```json
{
  "id": "arxiv",
  "name": "arXiv",
  "version": "1.0.0",
  "sourceType": "academic",
  "minPluginVersion": "0.1.0",
  "permissions": {
    "urls": ["http://export.arxiv.org/*", "https://export.arxiv.org/*"]
  },
  "configSchema": {
    "enabled": { "type": "boolean", "default": true },
    "sortOrder": { "type": "string", "default": "descending", "enum": ["ascending", "descending"] }
  },
  "rateLimitPerMinute": 120
}
```

## provider.js

Must expose a factory compatible with [`ProviderFactory`](../../src/providers/_sdk/types.ts):

```ts
function createProvider(api: ProviderAPI): {
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
}
```

**ProviderAPI** (injected):

- `api.http.get` / `api.http.post` — only to URLs allowed by `permissions.urls`.
- `api.xml` — parse Atom/XML.
- `api.dom` — parse HTML.
- `api.config.getString|getNumber|getBool` — keys relative to `platform.<id>.` (from `configSchema` + prefs).
- `api.getGlobalPref*` — only keys listed in `allowedGlobalPrefs`.
- `api.log.*`
- `api.rateLimit.acquire()` — per-provider RPM from manifest.

Return [`SearchResult`](../../src/models/types.ts) with `items: ResourceItem[]`, `platform`, `query`, etc.

Authoring in TypeScript: put logic in `index.ts`, build to `provider.js` via your bundler (the project build already emits built-in packages).

## Install a user package

1. **Zip** — layout: `<id>/manifest.json` + `<id>/provider.js`, or flat `manifest.json` + `provider.js` at zip root.
2. Zotero → **Settings → Resource Search MCP → Import .zip…**
3. Or copy the folder to:

   `<ZoteroProfile>/zotero-resource-search/providers/<id>/`

4. **Reload providers** in settings (or restart Zotero).

## Remote registry

Set **Registry URL** to HTTPS JSON:

```json
{
  "providers": [
    {
      "id": "my-index",
      "version": "1.0.1",
      "downloadUrl": "https://example.com/my-index-1.0.1.zip",
      "sha256": "<hex>",
      "minPluginVersion": "0.1.0"
    }
  ]
}
```

Use **Check registry** to download and install (SHA-256 verified when provided).

## Debugging

- Enable debug logging in **Infrastructure → Log level**.
- Broken packages are skipped with errors in the Zotero debug log (`[ResourceSearch]`).
