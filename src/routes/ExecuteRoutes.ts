import { Router, Request, Response, RequestHandler } from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import CONFIG from "../config.js";
import logger from "../logger.js";

const router = Router();

// Cache structure
interface CacheEntry {
  result: any;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

// Ensure data directory exists for DLQ
const dataDir = path.resolve("data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const executeTool = async (toolName: string, args: Record<string, any>): Promise<any> => {
  const argsJson = JSON.stringify(args);
  const cacheKey = crypto.createHash("sha256").update(toolName + argsJson).digest("hex");

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info(JSON.stringify({ event: "cache_hit", toolName, args }));
    return cached.result;
  }

  return new Promise((resolve, reject) => {
    // Set up environment
    const env = {
      ...process.env,
      PYTHONPATH: CONFIG.PYTHONPATH,
      SKIP_TOOL_USAGE_LOG: "true",
      USE_LAZY_TOOL_SERVICE: "false"
    };

    const child = spawn(
      CONFIG.PYTHON_INTERPRETER,
      [CONFIG.PYTHON_EXEC_SCRIPT, toolName, argsJson],
      {
        cwd: CONFIG.PYTHON_CWD,
        env
      }
    );

    let stdout = "";
    let stderr = "";
    let isTimeout = false;

    const timeoutId = setTimeout(() => {
      isTimeout = true;
      child.kill("SIGKILL");
      reject(new Error(`Execution timed out after ${CONFIG.EXECUTION_TIMEOUT_MS}ms`));
    }, CONFIG.EXECUTION_TIMEOUT_MS);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      if (isTimeout) return; // already rejected

      if (code !== 0) {
        reject(new Error(`Tool execution failed (exit code ${code}): ${stderr || stdout}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        // Save to cache
        cache.set(cacheKey, { result: parsed, expiresAt: Date.now() + CONFIG.CACHE_TTL_MS });
        resolve(parsed);
      } catch (err: any) {
        reject(new Error(`Invalid JSON output from tool: ${stdout}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      if (!isTimeout) reject(err);
    });
  });
};

const handleExecuteRoute: RequestHandler = async (req, res) => {
  const { toolName } = req.params;
  const args = req.body || {};
  const startTime = Date.now();

  try {
    logger.info(JSON.stringify({ event: "tool_start", toolName, args }));
    const result = await executeTool(toolName as string, args);
    const durationMs = Date.now() - startTime;
    logger.info(JSON.stringify({ event: "tool_success", toolName, durationMs }));
    res.json(result);
  } catch (error: any) {
    const errorMsg = (error as Error).message;
    const durationMs = Date.now() - startTime;
    logger.error(JSON.stringify({ event: "tool_failure", toolName, error: errorMsg, durationMs }));
    
    // Append to DLQ
    try {
      const dlqEntry = JSON.stringify({ timestamp: new Date().toISOString(), toolName, args, error: errorMsg, durationMs }) + "\n";
      fs.promises.appendFile(path.join(dataDir, "dlq.jsonl"), dlqEntry).catch(() => {});
    } catch (fsErr) {
      // Ignore DLQ append errors silently to not crash the request
    }
    
    res.status(500).json({ error: errorMsg, code: 500 });
  }
};

router.post("/:toolName", handleExecuteRoute);

export default router;
export { handleExecuteRoute };
