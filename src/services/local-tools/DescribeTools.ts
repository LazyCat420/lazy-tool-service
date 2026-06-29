import logger from "../../utils/logger.ts";
import ToolOrchestratorService from "../ToolOrchestratorService.ts";
import { InternalToolContext } from "./InternalToolRegistry.ts";

export default {
  name: "describe_tools",

  schema: {
    name: "describe_tools",
    emoji: ["🔍", "🛠️"],
    description:
      "Fetch the full detailed JSON schemas (including parameter structures) " +
      "for one or more tools. Call this tool when you need to know what arguments " +
      "a specific tool expects before you invoke it.",
    parameters: {
      type: "object",
      properties: {
        tool_names: {
          type: "array",
          items: { type: "string" },
          description: "List of tool names to retrieve detailed schemas for.",
        },
      },
      required: ["tool_names"],
    },
  },

  labels: ["coding"],

  async execute(toolArguments: Record<string, unknown>, context: InternalToolContext) {
    const toolNames = Array.isArray(toolArguments.tool_names)
      ? toolArguments.tool_names.filter((name) => typeof name === "string")
      : [];

    if (toolNames.length === 0) {
      return { error: "No tool names specified." };
    }

    const schemas = ToolOrchestratorService.getClientToolSchemas() || [];
    const matched = schemas.filter((schema: { name: string }) => toolNames.includes(schema.name));

    logger.info(`[describe_tools] Described ${matched.length}/${toolNames.length} requested tool(s)`);

    return {
      schemas: matched,
    };
  },
};
