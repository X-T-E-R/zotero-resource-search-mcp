import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("buildLookupKeys keeps stable patent identifiers in priority order", async () => {
  const mod = await loadTsModule("src/zotero/PatentDetailBridge.ts");

  const keys = mod.buildLookupKeys({
    itemType: "patent",
    title: "一种测试专利",
    sourceId: "ANE-123",
    applicationNumber: "CN202500000001.0",
    patentNumber: "CN123456789A",
  });

  assert.deepEqual(keys, [
    "ane-123",
    "cn202500000001.0",
    "cn123456789a",
    "一种测试专利",
  ]);
});

test("buildTextHtml preserves line breaks inside patent detail text", async () => {
  const mod = await loadTsModule("src/zotero/PatentDetailBridge.ts");

  const html = mod.buildTextHtml("第一段第一行\n第一段第二行\n\n第二段");

  assert.match(html, /<p>第一段第一行<br \/>第一段第二行<\/p>/);
  assert.match(html, /<p>第二段<\/p>/);
});

test("buildSummaryNoteHtml renders section headings and pdf links in one note", async () => {
  const mod = await loadTsModule("src/zotero/PatentDetailBridge.ts");

  const html = mod.buildSummaryNoteHtml("summary", [
    { title: "权利要求", html: "<p>claim</p>" },
    {
      title: "PDF 链接",
      html: '<ul><li><a href="https://example.com/test.pdf">https://example.com/test.pdf</a></li></ul>',
    },
  ]);

  assert.match(html, /<h1>专利详情<\/h1>/);
  assert.match(html, /<h2>权利要求<\/h2>/);
  assert.match(html, /<h2>PDF 链接<\/h2>/);
  assert.match(html, /https:\/\/example\.com\/test\.pdf/);
});
