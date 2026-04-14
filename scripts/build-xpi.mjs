import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const packageName = packageJson.name || "zotero-resource-search-mcp";
const version = packageJson.version || "0.0.0";
const sourceXpiPath = path.join(root, ".scaffold", "build", `${packageName}.xpi`);
const distDir = path.join(root, "dist");
const outputXpiPath = path.join(distDir, `${packageName}-v${version}.xpi`);
const npmCliPath = process.env.npm_execpath;

if (npmCliPath) {
  execFileSync(process.execPath, [npmCliPath, "run", "build"], {
    cwd: root,
    stdio: "inherit",
  });
} else {
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

if (!fs.existsSync(sourceXpiPath)) {
  throw new Error(`Missing built XPI: ${sourceXpiPath}`);
}

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(sourceXpiPath, outputXpiPath);

console.log(`XPI ready: ${outputXpiPath}`);
