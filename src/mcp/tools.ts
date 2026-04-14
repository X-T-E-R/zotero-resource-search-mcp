import { providerRegistry } from "../providers/registry";
import { cloneToolSchemas, type ToolSchema } from "./toolCatalog";

export function getTools(): ToolSchema[] {
  const tools = cloneToolSchemas();
  const searchTool = tools.find((t) => t.name === "academic_search");
  if (searchTool) {
    const platformProp = searchTool.inputSchema.properties.platform;
    platformProp.enum = ["all", ...providerRegistry.getIdsByType("academic")];
  }
  return tools;
}
