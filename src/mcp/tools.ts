import { providerRegistry } from "../providers/registry";
import { cloneToolSchemas, type ToolSchema } from "./toolCatalog";

export function getTools(): ToolSchema[] {
  const tools = cloneToolSchemas();
  const academicSearchTool = tools.find((t) => t.name === "academic_search");
  if (academicSearchTool) {
    const platformProp = academicSearchTool.inputSchema.properties.platform;
    platformProp.enum = ["all", ...providerRegistry.getIdsByType("academic")];
  }

  const patentSearchTool = tools.find((t) => t.name === "patent_search");
  if (patentSearchTool) {
    const platformProp = patentSearchTool.inputSchema.properties.platform;
    platformProp.enum = ["all", ...providerRegistry.getIdsByType("patent")];
  }

  const patentDetailTool = tools.find((t) => t.name === "patent_detail");
  if (patentDetailTool) {
    const platformProp = patentDetailTool.inputSchema.properties.platform;
    platformProp.enum = providerRegistry.getIdsByType("patent");
  }
  return tools;
}
