export type WorkspaceStatusKind = "disabled" | "missing" | "configured" | "verified";

export interface WorkspaceSourceStatus {
  kind: WorkspaceStatusKind;
  text: string;
  tone: string;
}

export function resolveWorkspaceSourceStatus(
  lang: "zh" | "en",
  enabled: boolean,
  configured: boolean,
  verified: boolean,
): WorkspaceSourceStatus {
  if (!enabled) {
    return {
      kind: "disabled",
      text: lang === "zh" ? "已禁用" : "Disabled",
      tone: "background:#f3f4f6;color:#555;border:1px solid #dadde3",
    };
  }
  if (!configured) {
    return {
      kind: "missing",
      text: lang === "zh" ? "缺少配置" : "Needs config",
      tone: "background:#fff4e5;color:#a35a00;border:1px solid #f1d2a5",
    };
  }
  if (verified) {
    return {
      kind: "verified",
      text: lang === "zh" ? "确认可用" : "Verified",
      tone: "background:#e8f7ee;color:#0f6b3d;border:1px solid #b7e2c4",
    };
  }
  return {
    kind: "configured",
    text: lang === "zh" ? "已配置" : "Configured",
    tone: "background:#eef4ff;color:#285ea8;border:1px solid #c9dafc",
  };
}
