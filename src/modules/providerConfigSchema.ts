import type { ProviderConfigFieldSchema, ProviderManifest } from "../providers/_sdk/types";

export type ProviderConfigControl = "checkbox" | "select" | "number" | "text" | "password";

export interface NormalizedProviderConfigField extends ProviderConfigFieldSchema {
  key: string;
  control: ProviderConfigControl;
  label: string;
  labelZh?: string;
  description?: string;
  advanced: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

function createDefaultSearchFields(
  sourceType: ProviderManifest["sourceType"] = "academic",
): Record<string, ProviderConfigFieldSchema> {
  const defaultSortEnum =
    sourceType === "patent" ? ["", "relevance", "date"] : ["", "relevance", "date", "citations"];

  return {
    enabled: {
      type: "boolean",
      default: true,
      label: "Enabled",
      labelZh: "启用",
    },
    defaultSort: {
      type: "string",
      default: "",
      enum: defaultSortEnum,
      label: "Default Sort",
      labelZh: "默认排序",
    },
    maxResults: {
      type: "number",
      default: 0,
      min: -1,
      max: 100,
      label: "Max Results",
      labelZh: "结果数",
      description:
        sourceType === "patent"
          ? "0 = use global default, -1 = use this source maximum, positive numbers override both."
          : "0 = use global default, -1 = use this source maximum, positive numbers override both.",
    },
    probeQuery: {
      type: "string",
      default: "",
      label: "Probe Query",
      labelZh: "测活查询",
      description: "Optional override for this source's health check search query.",
      advanced: true,
    },
  };
}

export function prettifyConfigKey(key: string): string {
  const label = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  if (!label) {
    return key;
  }
  return label
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeProviderConfigFields(
  schema?: Record<string, ProviderConfigFieldSchema>,
): NormalizedProviderConfigField[] {
  const entries = Object.entries(schema ?? {});
  return entries.map(([key, field]) => {
    const label = field.label || prettifyConfigKey(key);
    const control =
      field.type === "boolean"
        ? "checkbox"
        : field.type === "number"
          ? "number"
          : field.secret
            ? "password"
            : field.enum?.length
              ? "select"
              : "text";

    return {
      ...field,
      key,
      control,
      label,
      advanced: field.advanced === true,
      options: field.enum?.map((value) => ({
        value,
        label: value ? prettifyConfigKey(value) : "(global)",
      })),
    };
  });
}

export function createAcademicConfigSchema(
  manifest: Pick<ProviderManifest, "configSchema" | "sourceType">,
): Record<string, ProviderConfigFieldSchema> {
  return {
    ...createDefaultSearchFields(manifest.sourceType ?? "academic"),
    ...(manifest.configSchema ?? {}),
  };
}
