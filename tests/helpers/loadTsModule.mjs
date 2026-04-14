import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const tempRoot = path.join(process.cwd(), ".tmp-tests");

export async function loadTsModule(entryRelativePath) {
  const entryPath = path.join(process.cwd(), entryRelativePath);
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

  await fs.promises.mkdir(tempRoot, { recursive: true });
  const tempPath = path.join(
    tempRoot,
    `${path.basename(entryRelativePath, path.extname(entryRelativePath))}-${Date.now()}.mjs`,
  );
  await fs.promises.writeFile(tempPath, output, "utf8");
  try {
    return await import(pathToFileURL(tempPath).href);
  } finally {
    await fs.promises.rm(tempPath, { force: true });
  }
}
