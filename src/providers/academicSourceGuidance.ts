export type AcademicSourceGuidanceAction = "none" | "set-registry-url" | "check-registry";
export type AcademicSourceGuidanceLocale = "zh" | "en";

export interface AcademicSourceGuidanceInput {
  locale: AcademicSourceGuidanceLocale;
  academicProviderCount: number;
  registryUrl?: string | null;
}

export interface AcademicSourceGuidance {
  needsAttention: boolean;
  action: AcademicSourceGuidanceAction;
  title: string;
  details: string[];
}

export function getAcademicSourceGuidance(
  input: AcademicSourceGuidanceInput,
): AcademicSourceGuidance {
  if (input.academicProviderCount > 0) {
    return {
      needsAttention: false,
      action: "none",
      title: input.locale === "zh" ? "已检测到学术源" : "Academic sources detected",
      details: [],
    };
  }

  const hasRegistryUrl = !!input.registryUrl?.trim();
  if (input.locale === "zh") {
    return hasRegistryUrl
      ? {
          needsAttention: true,
          action: "check-registry",
          title: "未配置任何学术源",
          details: [
            "当前插件未加载任何 academic provider。",
            "你已经填写了源仓库 URL，请到 Manage 页点击“检查仓库更新”拉取 provider 包。",
          ],
        }
      : {
          needsAttention: true,
          action: "set-registry-url",
          title: "未配置任何学术源",
          details: [
            "当前插件未加载任何 academic provider。",
            "请到 Manage 页填写源仓库 URL，然后点击“检查仓库更新”或导入 provider zip。",
          ],
        };
  }

  return hasRegistryUrl
    ? {
        needsAttention: true,
        action: "check-registry",
        title: "No academic sources configured",
        details: [
          "The plugin did not load any academic providers.",
          'A provider repository URL is already set. Open the Manage tab and click "Check registry" to install provider packages.',
        ],
      }
    : {
        needsAttention: true,
        action: "set-registry-url",
        title: "No academic sources configured",
        details: [
          "The plugin did not load any academic providers.",
          'Open the Manage tab, set a provider repository URL, then click "Check registry" or import a provider zip package.',
        ],
      };
}
