import type { JsonObject, JsonValue } from "../utils/json";

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: JsonObject;
}

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

export interface ToolCallResult {
  readonly content: readonly {
    readonly type: "text";
    readonly text: string;
  }[];
  readonly isError?: boolean;
}

export type ToolHandler = (input: JsonObject) => Promise<JsonValue>;
