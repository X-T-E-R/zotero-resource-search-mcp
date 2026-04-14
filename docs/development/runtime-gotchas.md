# Runtime gotchas

This note captures Zotero runtime behaviors that looked like plugin bugs during development but are in fact important implementation constraints.

## Collections: top-level parents can be `false`

When enumerating Zotero collections, top-level collections may expose:

- `parentID = false`
- `parentKey = false`

instead of `null` / `undefined`.

Implications:

- Tree builders that start from `null` only can silently drop the whole top-level collection tree.
- Path resolvers that compare parent IDs directly can fail to resolve valid top-level collection paths.

Current rule in this plugin:

- Normalize non-numeric `parentID` to `null`
- Normalize non-string / empty `parentKey` to `null`

See [`src/zotero/CollectionHelper.ts`](../../src/zotero/CollectionHelper.ts).

## PDF resolver success does not guarantee a stable attachment key

`Zotero.Attachments.addAvailablePDF()` may report success before the final attachment object is fully stable for downstream consumers.

Observed behavior during real MCP verification:

- The PDF is eventually attached correctly.
- The first resolver-returned attachment object can expose a key that is not the final persisted attachment key.
- A second read a few seconds later, or a second `resource_pdf` call, returns the stable attachment key.

Implications:

- Do not trust the first resolver-returned attachment key as a public contract.
- If the UI or MCP response only needs to confirm success, prefer returning `filename + message`.
- Only return an attachment key when reading an already-attached PDF from stable Zotero item state.

Current rule in this plugin:

- First successful `resource_pdf` response after a fetch confirms success but omits `itemKey`
- Subsequent `resource_pdf` calls return the stable attachment key with `message = "PDF already attached"`

See [`src/zotero/PdfFetcher.ts`](../../src/zotero/PdfFetcher.ts).

## Verification guidance

For Zotero write-path validation, prefer the following order:

1. Dry-run destructive cleanup in an external verifier such as Zotero MCP Neo
2. Execute the real write with this plugin
3. Re-read from a second tool or code path
4. Clean test data into trash after verification

This catches "success reported too early" cases that are easy to miss if you only trust the original write response.
