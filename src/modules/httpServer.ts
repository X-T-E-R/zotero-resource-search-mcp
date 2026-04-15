import { StreamableMCPServer } from "./streamableMCPServer";
import { createHelpSnapshot } from "../mcp/helpCatalog";

declare let ztoolkit: ZToolkit;

function getByteLength(str: string): number {
  try {
    return new TextEncoder().encode(str).length;
  } catch {
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode < 0x80) bytes += 1;
      else if (charCode < 0x800) bytes += 2;
      else if (charCode < 0xd800 || charCode >= 0xe000) bytes += 3;
      else {
        i++;
        bytes += 4;
      }
    }
    return bytes;
  }
}

function writeStringToStream(output: any, str: string): void {
  const converterStream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
    Ci.nsIConverterOutputStream,
  );
  (converterStream as any).init(output, "UTF-8", 0, 0);
  converterStream.writeString(str);
  converterStream.flush();
}

async function readFullRequest(input: any): Promise<string> {
  const converterStream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(
    Ci.nsIConverterInputStream,
  );
  converterStream.init(input, "UTF-8", 0, 0);

  let requestText = "";
  let totalBytesRead = 0;
  const maxRequestSize = 1024 * 1024;
  let waitAttempts = 0;
  const maxWaitAttempts = 50;
  let headersComplete = false;
  let contentLength = 0;
  let bodyStartIndex = -1;

  while (totalBytesRead < maxRequestSize && !headersComplete) {
    const available = input.available();
    if (available === 0) {
      waitAttempts++;
      if (waitAttempts > maxWaitAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
      continue;
    }
    const bytesToRead = Math.min(4096, maxRequestSize - totalBytesRead, available);
    const str: { value?: string } = {};
    const bytesRead = converterStream.readString(bytesToRead, str);
    if (bytesRead === 0) break;
    requestText += str.value || "";
    totalBytesRead += bytesRead;

    bodyStartIndex = requestText.indexOf("\r\n\r\n");
    if (bodyStartIndex !== -1) {
      headersComplete = true;
      const headersSection = requestText.substring(0, bodyStartIndex);
      const clMatch = headersSection.match(/Content-Length:\s*(\d+)/i);
      if (clMatch) contentLength = parseInt(clMatch[1], 10);
    }
  }

  if (headersComplete && contentLength > 0) {
    const bodyStart = bodyStartIndex + 4;
    const bodyBytesInBuffer = totalBytesRead - getByteLength(requestText.substring(0, bodyStart));
    let bodyBytesRead = bodyBytesInBuffer;
    waitAttempts = 0;
    while (bodyBytesRead < contentLength) {
      const available = input.available();
      if (available === 0) {
        waitAttempts++;
        if (waitAttempts > maxWaitAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }
      const bytesToRead = Math.min(8192, contentLength - bodyBytesRead, available);
      const str: { value?: string } = {};
      const bytesRead = converterStream.readString(bytesToRead, str);
      if (bytesRead === 0) break;
      requestText += str.value || "";
      bodyBytesRead += bytesRead;
      totalBytesRead += bytesRead;
    }
  }

  try {
    converterStream.close();
  } catch {
    // ignore
  }

  return requestText;
}

function parseRequest(raw: string): {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
} {
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headerSection = headerEnd !== -1 ? raw.substring(0, headerEnd) : raw;
  const lines = headerSection.split("\r\n");

  const requestLine = lines[0] || "";
  const parts = requestLine.split(" ");
  const method = parts[0] || "";
  const rawPath = parts[1] || "/";

  let path: string;
  let query: Record<string, string> = {};
  try {
    const parsed = new URL(rawPath, "http://127.0.0.1");
    path = parsed.pathname;
    query = Object.fromEntries(parsed.searchParams.entries());
  } catch {
    path = rawPath;
  }

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(":");
    if (colonIdx > 0) {
      const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
      const value = lines[i].substring(colonIdx + 1).trim();
      headers[key] = value;
    }
  }

  let body = "";
  if (headerEnd !== -1) {
    const rawBody = raw.substring(headerEnd + 4);
    const contentLength = parseInt(headers["content-length"] || "0", 10);
    body = contentLength > 0 ? rawBody.substring(0, contentLength) : rawBody;
  }

  return { method, path, query, headers, body };
}

interface RouteResponse {
  status: number;
  statusText: string;
  contentType: string;
  body: string;
}

function sendResponse(output: any, res: RouteResponse): void {
  const byteLength = getByteLength(res.body);
  const header =
    `HTTP/1.1 ${res.status} ${res.statusText}\r\n` +
    `Content-Type: ${res.contentType}\r\n` +
    `Connection: close\r\n` +
    `Content-Length: ${byteLength}\r\n` +
    `\r\n`;

  output.write(header, header.length);
  if (byteLength > 0) {
    writeStringToStream(output, res.body);
  }
  try {
    output.flush();
  } catch {
    // ignore
  }
}

type RouteHandler = (body: string, query: Record<string, string>) => Promise<RouteResponse>;
type RouteTable = Record<string, Record<string, RouteHandler>>;

export class HttpServer {
  private serverSocket: any;
  private isRunning: boolean = false;
  private mcpServer: StreamableMCPServer | null = null;
  private port: number = 23121;
  private activeTransports: Set<any> = new Set();

  public isServerRunning(): boolean {
    return this.isRunning;
  }

  public start(port: number) {
    if (this.isRunning) {
      return;
    }

    if (!port || isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port number: ${port}`);
    }

    try {
      this.port = port;

      this.serverSocket = Cc["@mozilla.org/network/server-socket;1"].createInstance(
        Ci.nsIServerSocket,
      );
      this.serverSocket.init(port, true, -1);
      this.serverSocket.asyncListen(this.listener);
      this.isRunning = true;

      this.mcpServer = new StreamableMCPServer();
      ztoolkit.log(`[HttpServer] Started on port ${port}`);
    } catch (e) {
      this.stop();
      throw new Error(`Failed to start server on port ${port}: ${e}`);
    }
  }

  public stop() {
    if (!this.isRunning || !this.serverSocket) {
      return;
    }

    for (const transport of this.activeTransports) {
      try {
        transport.close(0);
      } catch {
        // ignore
      }
    }
    this.activeTransports.clear();

    try {
      this.serverSocket.close();
      this.isRunning = false;
    } catch (e) {
      ztoolkit.log(`[HttpServer] Error closing socket: ${e}`, "error");
      this.isRunning = false;
    }

    this.mcpServer = null;
    ztoolkit.log("[HttpServer] Stopped");
  }

  private buildRoutes(): RouteTable {
    return {
      "/mcp": {
        POST: async (body) => {
          if (this.mcpServer) {
            const result = await this.mcpServer.handleMCPRequest(body);
            return {
              status: result.status,
              statusText: result.statusText,
              contentType: result.headers?.["Content-Type"] || "application/json; charset=utf-8",
              body: result.body,
            };
          }
          return {
            status: 503,
            statusText: "Service Unavailable",
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ error: "MCP server not initialized" }),
          };
        },
        GET: async () => ({
          status: 200,
          statusText: "OK",
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({
            endpoint: "/mcp",
            helpEndpoint: "/mcp/help",
            statusEndpoint: "/mcp/status",
            protocol: "MCP (Model Context Protocol)",
            transport: "Streamable HTTP",
            version: "2024-11-05",
            description: "POST MCP JSON-RPC 2.0 requests to this endpoint",
            status: this.mcpServer ? "available" : "disabled",
          }),
        }),
      },
      "/ping": {
        GET: async () => ({
          status: 200,
          statusText: "OK",
          contentType: "text/plain; charset=utf-8",
          body: "pong",
        }),
      },
      "/mcp/status": {
        GET: async () => {
          if (this.mcpServer) {
            return {
              status: 200,
              statusText: "OK",
              contentType: "application/json; charset=utf-8",
              body: JSON.stringify(this.mcpServer.getStatus()),
            };
          }
          return {
            status: 503,
            statusText: "Service Unavailable",
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ error: "MCP server not initialized", enabled: false }),
          };
        },
      },
      "/mcp/help": {
        GET: async (_body, query) => ({
          status: 200,
          statusText: "OK",
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify(
            createHelpSnapshot({
              topic: query.topic,
              tool: query.tool,
              provider: query.provider,
              locale: query.locale,
            }),
          ),
        }),
      },
    };
  }

  private listener = {
    onSocketAccepted: async (_socket: any, transport: any) => {
      let input: any = null;
      let output: any = null;

      this.activeTransports.add(transport);

      try {
        input = transport.openInputStream(0, 0, 0);
        output = transport.openOutputStream(0, 0, 0);

        const raw = await readFullRequest(input);
        if (!raw) return;

        const requestLine = raw.split("\r\n")[0];
        if (!requestLine || !requestLine.includes("HTTP/")) {
          sendResponse(output, {
            status: 400,
            statusText: "Bad Request",
            contentType: "text/plain; charset=utf-8",
            body: "Bad Request",
          });
          return;
        }

        const req = parseRequest(raw);
        const routes = this.buildRoutes();
        const routeMethods = routes[req.path];

        if (!routeMethods) {
          sendResponse(output, {
            status: 404,
            statusText: "Not Found",
            contentType: "text/plain; charset=utf-8",
            body: "Not Found",
          });
          return;
        }

        const handler = routeMethods[req.method];
        if (!handler) {
          sendResponse(output, {
            status: 405,
            statusText: "Method Not Allowed",
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({
              error: `Method ${req.method} not allowed. Use ${Object.keys(routeMethods).join(" or ")}.`,
            }),
          });
          return;
        }

        const result = await handler(req.body, req.query);
        sendResponse(output, result);
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        ztoolkit.log(`[HttpServer] Error handling request: ${error.message}`, "error");
        try {
          if (!output) {
            output = transport.openOutputStream(0, 0, 0);
          }
          sendResponse(output, {
            status: 500,
            statusText: "Internal Server Error",
            contentType: "text/plain; charset=utf-8",
            body: "Internal Server Error",
          });
        } catch {
          // ignore
        }
      } finally {
        this.activeTransports.delete(transport);
        try {
          output?.close();
        } catch {
          // ignore
        }
        try {
          input?.close();
        } catch {
          // ignore
        }
      }
    },
    onStopListening: (_socket: any, _status: any) => {
      this.isRunning = false;
    },
  };
}

export const httpServer = new HttpServer();
