import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import logger from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemasPath = path.resolve(__dirname, "../../tool_schemas.json");

interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, any>;
  tier?: number;
  source?: string;
  permission?: string;
  fallback_only?: boolean;
  concurrency_safe?: boolean;
  max_result_chars?: number;
  tags?: string[];
  endpoint?: {
    path: string;
    method: string;
  };
}

let schemas: ToolSchema[] = [];

try {
  if (fs.existsSync(schemasPath)) {
    const rawData = fs.readFileSync(schemasPath, "utf-8");
    const list = JSON.parse(rawData);
    schemas = list.map((item: any) => ({
      ...item,
      // Map every tool to a post execution endpoint in lazy-tool-service
      endpoint: {
        path: `/execute/${item.name}`,
        method: "POST"
      }
    }));
    logger.success(`Loaded ${schemas.length} tool schemas from tool_schemas.json`);
  } else {
    logger.warn(`tool_schemas.json not found at ${schemasPath}. Run export_tool_schemas.py first.`);
  }
} catch (error: any) {
  logger.error(`Error loading tool schemas: ${(error as Error).message}`);
}

export function getToolSchemas(): ToolSchema[] {
  return schemas;
}

export function getToolSchemasForAI() {
  return schemas.map((s) => ({
    name: s.name,
    description: s.description,
    parameters: s.parameters,
  }));
}
