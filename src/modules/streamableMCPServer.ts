import { getTools } from "../mcp/tools";
import { handleToolCall } from "../mcp/handleToolCall";

declare let ztoolkit: any;

export interface MCPRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class StreamableMCPServer {
  private isInitialized: boolean = false;
  private serverInfo = {
    name: "zotero-resource-search-mcp",
    version: "0.1.0",
  };

  async handleMCPRequest(
    requestBody: string,
  ): Promise<{ status: number; statusText: string; headers: any; body: string }> {
    let parsedRequest: unknown;

    try {
      parsedRequest = JSON.parse(requestBody);
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Parse error: ${error}`);
      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      };
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(errorResponse),
      };
    }

    try {
      if (Array.isArray(parsedRequest)) {
        const err = this.createError(null, -32600, "Batch requests are not supported");
        return {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(err),
        };
      }

      if (!parsedRequest || typeof parsedRequest !== "object") {
        const err = this.createError(null, -32600, "Invalid Request");
        return {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(err),
        };
      }

      const request = parsedRequest as MCPRequest;
      if (typeof request.method !== "string" || !request.method.trim()) {
        const err = this.createError(null, -32600, "Invalid Request: method is required");
        return {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(err),
        };
      }

      ztoolkit.log(`[StreamableMCP] Received: ${request.method}`);

      const response = await this.processRequest(request);

      if (response === null) {
        return {
          status: 202,
          statusText: "Accepted",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: "",
        };
      }

      const status = response.error
        ? response.error.code === -32600 || response.error.code === -32700
          ? 400
          : 200
        : 200;

      return {
        status,
        statusText: status === 400 ? "Bad Request" : "OK",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(response),
      };
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Error handling request: ${error}`);
      const errorResponse: MCPResponse = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal error" },
      };
      return {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(errorResponse),
      };
    }
  }

  private async processRequest(request: MCPRequest): Promise<MCPResponse | null> {
    const isNotification =
      !Object.prototype.hasOwnProperty.call(request, "id") ||
      request.id === null ||
      request.id === undefined;

    if (isNotification) {
      if (request.method === "initialized" || request.method === "notifications/initialized") {
        this.isInitialized = true;
        return null;
      }
      if (request.method.startsWith("notifications/")) {
        return null;
      }
      return this.createError(
        null,
        -32600,
        `Invalid Request: id is required for method ${request.method}`,
      );
    }

    try {
      switch (request.method) {
        case "initialize":
          return this.handleInitialize(request);

        case "initialized":
        case "notifications/initialized":
          this.isInitialized = true;
          return this.createResponse(request.id ?? null, { success: true });

        case "tools/list":
          return this.handleToolsList(request);

        case "tools/call":
          return await this.handleToolCallRequest(request);

        case "resources/list":
          return this.createResponse(request.id ?? null, { resources: [] });

        case "prompts/list":
          return this.createResponse(request.id ?? null, { prompts: [] });

        case "ping":
          return this.createResponse(request.id ?? null, {});

        default:
          return this.createError(
            request.id ?? null,
            -32601,
            `Method not found: ${request.method}`,
          );
      }
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Error processing ${request.method}: ${error}`);
      return this.createError(request.id ?? null, -32603, "Internal error");
    }
  }

  private handleInitialize(request: MCPRequest): MCPResponse {
    return this.createResponse(request.id ?? null, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: true },
        logging: {},
        prompts: {},
        resources: {},
      },
      serverInfo: this.serverInfo,
    });
  }

  private handleToolsList(request: MCPRequest): MCPResponse {
    return this.createResponse(request.id ?? null, { tools: getTools() });
  }

  private async handleToolCallRequest(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args);
      return this.createResponse(request.id ?? null, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (error) {
      ztoolkit.log(`[StreamableMCP] Tool call error for ${name}: ${error}`);
      return this.createError(
        request.id ?? null,
        -32603,
        `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private createResponse(id: string | number | null, result: any): MCPResponse {
    return { jsonrpc: "2.0", id, result };
  }

  private createError(
    id: string | number | null,
    code: number,
    message: string,
    data?: any,
  ): MCPResponse {
    return { jsonrpc: "2.0", id, error: { code, message, data } };
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      serverInfo: this.serverInfo,
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
      availableTools: ["resource_search", "resource_lookup", "resource_add", "platform_status"],
      transport: {
        type: "streamable-http",
        keepAliveSupported: false,
      },
    };
  }
}
