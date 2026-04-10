/**
 * Bundle each pluggable provider under src/providers/packages/<id>/index.ts
 * into addon/providers/<id>/provider.js and copy manifest.json.
 * Writes addon/providers/index.json listing all ids.
 */
import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const packagesDir = path.join(root, "src", "providers", "packages");
const addonProviders = path.join(root, "addon", "providers");

if (!fs.existsSync(packagesDir)) {
  fs.mkdirSync(packagesDir, { recursive: true });
}

const ids = fs.existsSync(packagesDir)
  ? fs.readdirSync(packagesDir).filter((d) => {
      const full = path.join(packagesDir, d);
      return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "index.ts"));
    })
  : [];

for (const id of ids) {
  const entry = path.join(packagesDir, id, "index.ts");
  const manifestSrc = path.join(packagesDir, id, "manifest.json");
  const outDir = path.join(addonProviders, id);
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(manifestSrc)) {
    console.warn(`[build-providers] skip ${id}: missing manifest.json`);
    continue;
  }

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "browser",
    target: "firefox115",
    format: "iife",
    globalName: "__zrs_exports",
    outfile: path.join(outDir, "provider.js"),
    logLevel: "warning",
    legalComments: "none",
  });

  fs.copyFileSync(manifestSrc, path.join(outDir, "manifest.json"));
  console.log(`[build-providers] built ${id}`);
}

fs.mkdirSync(addonProviders, { recursive: true });
const indexPath = path.join(addonProviders, "index.json");
fs.writeFileSync(indexPath, JSON.stringify({ providers: ids }, null, 2), "utf8");
console.log(`[build-providers] wrote index.json (${ids.length} providers)`);
