// ────────────────────────────────────────────────────────────
// MCP Adapter — Bridges lazy-tools-api REST endpoints to MCP
// ────────────────────────────────────────────────────────────

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getToolSchemas,
  type ToolSchema,
  type ToolEndpoint,
} from "./ToolSchemaService.js";
import CONFIG from "../config.js";
import logger from "../logger.js";
import type { Request, Response, Application } from "express";

const SELF_BASE_URL = CONFIG.LAZY_TOOL_SERVICE_URL;

async function executeTool(toolName: string, endpoint: ToolEndpoint, toolArguments: Record<string, unknown> = {}): Promise<unknown> {
  try {
    const url = `${SELF_BASE_URL}${endpoint.path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toolArguments),
    });
    if (!response.ok) {
      return { error: `API returned ${response.status}: ${response.statusText}` };
    }
    return await response.json();
  } catch (error: unknown) {
    return { error: `Tool execution failed: ${(error as Error).message}` };
  }
}

function createMcpServer() {
  const server = new Server(
    { name: "lazy-tools", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  const fullSchemas = getToolSchemas();
  const toolMap = new Map<string, ToolSchema>();
  for (const schema of fullSchemas) {
    toolMap.set(schema.name, schema);
  }

  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => {
      const currentSchemas = getToolSchemas();
      return {
        tools: currentSchemas.map((toolSchema: ToolSchema) => ({
          name: toolSchema.name,
          description: toolSchema.description || "",
          inputSchema: toolSchema.parameters || { type: "object", properties: {} },
          _meta: {
            domain: toolSchema.domain,
            labels: toolSchema.labels,
          },
        })),
      };
    },
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
      const { name, arguments: toolArguments = {} } = request.params;
      const schema = toolMap.get(name);

      if (!schema || !schema.endpoint) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true,
        };
      }

      try {
        const result = await executeTool(name, schema.endpoint, toolArguments);
        // Note: result here is the object from execute_tool.py which has a "content" field
        const text = (result as { content?: string })?.content || JSON.stringify(result);
        return {
          content: [{ type: "text", text }],
          isError: !!(result as { error?: unknown })?.error,
        };
      } catch (error: unknown) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
          isError: true,
        };
      }
    },
  );

  return server;
}

export function mountMcpRoutes(application: Application) {
  const sessions = new Map<string, { server: Server; transport: SSEServerTransport }>();

  // 1. Standard SSE transport routes
  application.get("/mcp/sse", async (request: Request, response: Response) => {
    const transport = new SSEServerTransport("/mcp/messages", response);
    const server = createMcpServer();

    sessions.set(transport.sessionId, { server, transport });

    response.on("close", () => {
      sessions.delete(transport.sessionId);
      server.close().catch(() => {});
    });

    await server.connect(transport);
  });

  application.post("/mcp/messages", async (request: Request, response: Response) => {
    const sessionId = request.query.sessionId as string;
    const session = sessions.get(sessionId);

    if (!session) {
      response.status(400).json({ error: "Invalid or expired session" });
      return;
    }

    await session.transport.handlePostMessage(request, response, request.body);
  });

  logger.info("   🔌 MCP SSE adapter mounted at /mcp/sse");

  // 2. Streamable HTTP transport routes (used by Prism)
  const streamableSessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();

  application.all("/mcp", async (request: Request, response: Response) => {
    try {
      const sessionId = request.headers["mcp-session-id"] as string;
      let session = sessionId ? streamableSessions.get(sessionId) : null;

      if (!session) {
        let generatedSessionId: string | undefined;
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => {
            generatedSessionId = randomUUID();
            return generatedSessionId;
          },
          onsessionclosed: (sessionIdentifier) => {
            streamableSessions.delete(sessionIdentifier);
            server.close().catch(() => {});
          }
        });

        const server = createMcpServer();
        await server.connect(transport);

        transport.onclose = () => {
          if (generatedSessionId) {
            streamableSessions.delete(generatedSessionId);
          }
          server.close().catch(() => {});
        };

        session = { server, transport };

        // Handle the initial request
        await transport.handleRequest(request, response, request.body);

        // Store the session if one was generated
        if (generatedSessionId) {
          streamableSessions.set(generatedSessionId, session);
        }
      } else {
        await session.transport.handleRequest(request, response, request.body);
      }
    } catch (error: unknown) {
      logger.error(`[MCP-Streamable] Error handling request: ${(error as Error).message}`);
      if (!response.headersSent) {
        response.status(500).json({ error: (error as Error).message || "Internal server error" });
      }
    }
  });

  logger.info("   🔌 MCP Streamable HTTP adapter mounted at /mcp");
}
