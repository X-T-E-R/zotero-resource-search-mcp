import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

async function loadTsModule(entryRelativePath) {
  const entryPath = path.join(root, entryRelativePath);
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    sourcemap: false,
    target: "node18",
    logLevel: "silent",
  });

  const output = result.outputFiles?.[0]?.text;
  if (!output) {
    throw new Error(`Unable to bundle ${entryRelativePath}`);
  }

  const tempPath = path.join(root, ".tmp-smoke-" + path.basename(entryRelativePath) + ".mjs");
  await fs.promises.writeFile(tempPath, output, "utf8");
  try {
    return await import(pathToFileURL(tempPath).href + `?t=${Date.now()}`);
  } finally {
    await fs.promises.rm(tempPath, { force: true });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const xpiPath = path.join(root, ".scaffold", "build", "zotero-resource-search-mcp.xpi");
  assert(
    fs.existsSync(xpiPath),
    "Missing built XPI at .scaffold/build/zotero-resource-search-mcp.xpi",
  );
  assert(
    fs.existsSync(path.join(root, "addon", "providers", "index.json")),
    "Generated addon/providers/index.json is missing",
  );
  const providerIndex = JSON.parse(
    fs.readFileSync(path.join(root, "addon", "providers", "index.json"), "utf8"),
  );
  assert(
    Array.isArray(providerIndex.providers) && providerIndex.providers.length === 0,
    "Built-in academic providers should no longer be bundled into addon/providers",
  );

  const toolCatalog = await loadTsModule("src/mcp/toolCatalog.ts");
  const statusCatalog = await loadTsModule("src/mcp/statusCatalog.ts");
  const providerConfig = await loadTsModule("src/modules/providerConfigSchema.ts");
  const collectionHelper = await loadTsModule("src/zotero/CollectionHelper.ts");

  const toolNames = toolCatalog.getCanonicalToolNames();
  assert(Array.isArray(toolNames), "getCanonicalToolNames() must return an array");
  assert(toolNames.length === 10, `Expected 10 canonical tools, got ${toolNames.length}`);
  assert(toolNames.includes("academic_search"), "Canonical tools must include academic_search");
  assert(toolNames.includes("patent_search"), "Canonical tools must include patent_search");
  assert(toolNames.includes("patent_detail"), "Canonical tools must include patent_detail");
  assert(toolNames.includes("platform_status"), "Canonical tools must include platform_status");

  const status = statusCatalog.createStatusSnapshot({
    isInitialized: false,
    serverInfo: { name: "test", version: "0.0.0" },
  });
  assert(
    JSON.stringify(status.availableTools) === JSON.stringify(toolNames),
    "Status availableTools must match canonical tool names",
  );

  const normalized = providerConfig.normalizeProviderConfigFields({
    enabled: { type: "boolean", default: true },
    maxResults: { type: "number", default: 25, min: 1, max: 100 },
    sortOrder: {
      type: "string",
      default: "descending",
      enum: ["ascending", "descending"],
      advanced: true,
    },
    apiToken: {
      type: "string",
      secret: true,
      placeholder: "token",
    },
  });

  assert(normalized.length === 4, `Expected 4 normalized fields, got ${normalized.length}`);
  assert(
    normalized[0].key === "enabled" && normalized[0].control === "checkbox",
    "enabled should render as checkbox",
  );
  assert(
    normalized.some(
      (field) => field.key === "sortOrder" && field.control === "select" && field.advanced,
    ),
    "string enum field should render as advanced select",
  );
  assert(
    normalized.some((field) => field.key === "apiToken" && field.control === "password"),
    "secret string field should render as password input",
  );
  assert(
    providerConfig.prettifyConfigKey("maxResults") === "Max Results",
    "prettifyConfigKey should humanize camelCase labels",
  );
  const academicSchema = providerConfig.createAcademicConfigSchema({
    sourceType: "academic",
    configSchema: {},
  });
  const patentSchema = providerConfig.createAcademicConfigSchema({
    sourceType: "patent",
    configSchema: {},
  });
  assert(
    academicSchema.defaultSort.enum.includes("citations"),
    "Academic default sort options should still include citations",
  );
  assert(
    !patentSchema.defaultSort.enum.includes("citations"),
    "Patent default sort options should not include citations",
  );

  assert(
    collectionHelper.normalizeCollectionParentID(false) === null,
    "false parentID should normalize to null for top-level collections",
  );
  assert(
    collectionHelper.normalizeCollectionParentID(12) === 12,
    "numeric parentID should be preserved",
  );
  assert(
    collectionHelper.normalizeCollectionParentKey(false) === null,
    "false parentKey should normalize to null for top-level collections",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
