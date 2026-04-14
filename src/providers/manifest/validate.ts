import type { ProviderConfigFieldSchema, ProviderManifest } from "../_sdk/types";

const ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateConfigSchema(
  schema: unknown,
): asserts schema is Record<string, ProviderConfigFieldSchema> {
  if (!isPlainObject(schema)) {
    throw new ManifestValidationError("configSchema must be an object");
  }
  for (const [key, def] of Object.entries(schema)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
      throw new ManifestValidationError(`Invalid configSchema key: ${key}`);
    }
    if (!isPlainObject(def)) {
      throw new ManifestValidationError(`configSchema.${key} must be an object`);
    }
    const t = def.type;
    if (t !== "boolean" && t !== "string" && t !== "number") {
      throw new ManifestValidationError(`configSchema.${key}.type invalid`);
    }
    if ("enum" in def && def.enum !== undefined) {
      if (!Array.isArray(def.enum) || !def.enum.every((x) => typeof x === "string")) {
        throw new ManifestValidationError(`configSchema.${key}.enum must be string[]`);
      }
    }
    if ("label" in def && def.label !== undefined && typeof def.label !== "string") {
      throw new ManifestValidationError(`configSchema.${key}.label must be a string`);
    }
    if ("labelZh" in def && def.labelZh !== undefined && typeof def.labelZh !== "string") {
      throw new ManifestValidationError(`configSchema.${key}.labelZh must be a string`);
    }
    if (
      "description" in def &&
      def.description !== undefined &&
      typeof def.description !== "string"
    ) {
      throw new ManifestValidationError(`configSchema.${key}.description must be a string`);
    }
    if ("advanced" in def && def.advanced !== undefined && typeof def.advanced !== "boolean") {
      throw new ManifestValidationError(`configSchema.${key}.advanced must be boolean`);
    }
    if (
      "placeholder" in def &&
      def.placeholder !== undefined &&
      typeof def.placeholder !== "string"
    ) {
      throw new ManifestValidationError(`configSchema.${key}.placeholder must be a string`);
    }
    if ("secret" in def && def.secret !== undefined && typeof def.secret !== "boolean") {
      throw new ManifestValidationError(`configSchema.${key}.secret must be boolean`);
    }
    if ("min" in def && def.min !== undefined && typeof def.min !== "number") {
      throw new ManifestValidationError(`configSchema.${key}.min must be a number`);
    }
    if ("max" in def && def.max !== undefined && typeof def.max !== "number") {
      throw new ManifestValidationError(`configSchema.${key}.max must be a number`);
    }
  }
}

/**
 * Parse and validate provider manifest.json content.
 */
export function parseProviderManifest(raw: string): ProviderManifest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ManifestValidationError("manifest.json is not valid JSON");
  }

  if (!isPlainObject(data)) {
    throw new ManifestValidationError("manifest root must be an object");
  }

  const id = data.id;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new ManifestValidationError("manifest.id must match /^[a-z][a-z0-9_-]{1,63}$/");
  }

  const name = data.name;
  if (typeof name !== "string" || name.length < 1 || name.length > 200) {
    throw new ManifestValidationError("manifest.name invalid");
  }

  const version = data.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new ManifestValidationError("manifest.version must be semver-like (e.g. 1.0.0)");
  }

  const sourceType = data.sourceType;
  if (sourceType !== "web" && sourceType !== "academic" && sourceType !== "patent") {
    throw new ManifestValidationError("manifest.sourceType must be web | academic | patent");
  }

  const permissions = data.permissions;
  if (!isPlainObject(permissions)) {
    throw new ManifestValidationError("manifest.permissions required");
  }
  const urls = permissions.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new ManifestValidationError("manifest.permissions.urls must be a non-empty array");
  }
  for (const u of urls) {
    if (typeof u !== "string" || u.length > 512) {
      throw new ManifestValidationError("manifest.permissions.urls entries must be strings");
    }
    if (!/^https?:\/\//i.test(u) && !/^\*:\/\//.test(u)) {
      throw new ManifestValidationError(`Invalid url pattern: ${u}`);
    }
  }

  let configSchema: Record<string, ProviderConfigFieldSchema> | undefined;
  if (data.configSchema !== undefined) {
    validateConfigSchema(data.configSchema);
    configSchema = data.configSchema as Record<string, ProviderConfigFieldSchema>;
  }

  let allowedGlobalPrefs: string[] | undefined;
  if (data.allowedGlobalPrefs !== undefined) {
    if (!Array.isArray(data.allowedGlobalPrefs)) {
      throw new ManifestValidationError("allowedGlobalPrefs must be an array");
    }
    allowedGlobalPrefs = [];
    for (const p of data.allowedGlobalPrefs) {
      if (typeof p !== "string" || !/^[a-zA-Z0-9._-]+$/.test(p)) {
        throw new ManifestValidationError(`Invalid allowedGlobalPref: ${p}`);
      }
      allowedGlobalPrefs.push(p);
    }
  }

  let rateLimitPerMinute: number | undefined;
  if (data.rateLimitPerMinute !== undefined) {
    if (
      typeof data.rateLimitPerMinute !== "number" ||
      data.rateLimitPerMinute < 1 ||
      data.rateLimitPerMinute > 10_000
    ) {
      throw new ManifestValidationError("rateLimitPerMinute must be 1..10000");
    }
    rateLimitPerMinute = data.rateLimitPerMinute;
  }

  let searchTimeoutMs: number | undefined;
  if (data.searchTimeoutMs !== undefined) {
    if (
      typeof data.searchTimeoutMs !== "number" ||
      data.searchTimeoutMs < 1000 ||
      data.searchTimeoutMs > 300_000
    ) {
      throw new ManifestValidationError("searchTimeoutMs must be 1000..300000");
    }
    searchTimeoutMs = data.searchTimeoutMs;
  }

  let integrity: { sha256?: string } | undefined;
  if (data.integrity !== undefined) {
    if (!isPlainObject(data.integrity)) {
      throw new ManifestValidationError("integrity must be an object");
    }
    const sha = data.integrity.sha256;
    if (sha !== undefined && (typeof sha !== "string" || !/^[a-f0-9]{64}$/i.test(sha))) {
      throw new ManifestValidationError("integrity.sha256 must be 64 hex chars");
    }
    integrity = { sha256: typeof sha === "string" ? sha.toLowerCase() : undefined };
  }

  const manifest: ProviderManifest = {
    id,
    name,
    version,
    sourceType,
    description: typeof data.description === "string" ? data.description : undefined,
    author: typeof data.author === "string" ? data.author : undefined,
    minPluginVersion: typeof data.minPluginVersion === "string" ? data.minPluginVersion : undefined,
    permissions: { urls: urls as string[] },
    configSchema,
    rateLimitPerMinute,
    searchTimeoutMs,
    allowedGlobalPrefs,
    integrity,
  };

  return manifest;
}
