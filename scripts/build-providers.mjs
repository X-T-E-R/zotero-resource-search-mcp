/**
 * Academic providers are now maintained in the external resource-search-providers repository.
 * Keep addon/providers as an empty placeholder so packaging remains stable and old built-in
 * bundles do not leak into the XPI.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const addonProviders = path.join(root, "addon", "providers");

fs.rmSync(addonProviders, { recursive: true, force: true });
fs.mkdirSync(addonProviders, { recursive: true });
const indexPath = path.join(addonProviders, "index.json");
fs.writeFileSync(indexPath, JSON.stringify({ providers: [] }, null, 2) + "\n", "utf8");
console.log("[build-providers] wrote empty addon/providers/index.json");
