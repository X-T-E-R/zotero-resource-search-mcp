import { getCanonicalToolNames } from "./toolCatalog";

export interface MCPStatusSnapshotInput {
  isInitialized: boolean;
  serverInfo: {
    name: string;
    version: string;
  };
}

export function createStatusSnapshot(input: MCPStatusSnapshotInput) {
  return {
    isInitialized: input.isInitialized,
    serverInfo: input.serverInfo,
    protocolVersion: "2024-11-05",
    supportedMethods: [
      "initialize",
      "initialized",
      "notifications/initialized",
      "tools/list",
      "tools/call",
      "resources/list",
      "prompts/list",
      "ping",
    ],
    availableTools: getCanonicalToolNames(),
    transport: {
      type: "streamable-http",
      keepAliveSupported: false,
    },
  };
}
