/**
 * Generates SKILL.md text for Agent export (port from current settings).
 */

import { renderSkillMarkdown } from "../mcp/helpCatalog";

export function generateSkillMd(port: number): string {
  return renderSkillMarkdown(port);
}
