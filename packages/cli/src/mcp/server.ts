import { createInterface } from "node:readline";
import { createAgentInstructions } from "../agent/instructions";
import { isJsonObject, type JsonObject } from "../utils/json";
import { callStatePilotTool, STATEPILOT_MCP_TOOLS } from "./tools";
import type { JsonRpcRequest, ToolCallResult } from "./types";

export async function serveMcp(): Promise<void> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  readline.on("line", (line) => {
    void handleLine(line);
  });

  await new Promise<void>((resolve) => {
    readline.on("close", resolve);
  });
}

async function handleLine(line: string): Promise<void> {
  if (!line.trim()) {
    return;
  }

  let id: string | number | null = null;
  try {
    const request = parseRequest(line);
    id = request.id ?? null;
    const result = await handleRequest(request);
    if (request.id !== undefined) {
      writeResponse({ jsonrpc: "2.0", id: request.id, result });
    }
  } catch (error) {
    writeResponse({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "statepilot",
          version: "0.1.0"
        },
        instructions: createAgentInstructions()
      };
    case "tools/list":
      return { tools: STATEPILOT_MCP_TOOLS };
    case "tools/call":
      return callTool(request.params);
    case "ping":
      return {};
    default:
      throw new Error(`Unsupported MCP method: ${request.method}`);
  }
}

async function callTool(params: JsonObject | undefined): Promise<ToolCallResult> {
  const name = typeof params?.name === "string" ? params.name : undefined;
  if (!name) {
    throw new Error("tools/call requires params.name");
  }

  const argumentsObject = isJsonObject(params?.arguments) ? params.arguments : {};
  const result = await callStatePilotTool(name, argumentsObject);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

function parseRequest(line: string): JsonRpcRequest {
  const parsed = JSON.parse(line) as unknown;
  if (!isJsonObject(parsed) || parsed.jsonrpc !== "2.0" || typeof parsed.method !== "string") {
    throw new Error("Invalid JSON-RPC request");
  }

  return parsed as unknown as JsonRpcRequest;
}

function writeResponse(response: unknown): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
