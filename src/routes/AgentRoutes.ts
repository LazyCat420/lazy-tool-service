import { Router, Request, Response } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import CONFIG from "../config.js";
import logger from "../logger.js";

const router = Router();

const activeProcesses = new Map<string, any>();
const frameBuffers = new Map<string, string[]>();

const pausesDir = path.resolve("data", "pauses");
if (!fs.existsSync(pausesDir)) {
  fs.mkdirSync(pausesDir, { recursive: true });
}

export const executeAgent = async (requestPayload: Record<string, unknown>, conversationId: string): Promise<unknown> => {
  const payloadJson = JSON.stringify(requestPayload);

  return new Promise((resolve, reject) => {
    const env: Record<string, string> = {};
    for (const key of Object.keys(process.env)) {
      const val = process.env[key];
      if (val !== undefined && val !== "") {
        env[key] = val;
      }
    }
    env.PYTHONPATH = CONFIG.PYTHONPATH;

    const agentScriptPath = path.join(CONFIG.PYTHON_CWD, "scripts", "run_agent.py");

    const child = spawn(
      CONFIG.PYTHON_INTERPRETER,
      [agentScriptPath, payloadJson],
      {
        cwd: CONFIG.PYTHON_CWD,
        env
      }
    );

    activeProcesses.set(conversationId, child);

    let stdout = "";
    let stderr = "";
    let isTimeout = false;

    // Use a long timeout for agents (e.g. 10 minutes)
    const agentTimeoutMs = 600000;
    const timeoutId = setTimeout(() => {
      isTimeout = true;
      child.kill("SIGKILL");
      activeProcesses.delete(conversationId);
      reject(new Error(`Agent execution timed out after ${agentTimeoutMs}ms`));
    }, agentTimeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      activeProcesses.delete(conversationId);
      if (isTimeout) return; 

      if (code !== 0) {
        reject(new Error(`Agent execution failed (exit code ${code}): ${stderr || stdout}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (error: unknown) {
        reject(new Error(`Invalid JSON output from agent: ${stdout}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      activeProcesses.delete(conversationId);
      if (!isTimeout) reject(err);
    });
  });
};

router.post("/approve", (req: Request, res: Response) => {
  const { conversationId, approved, approveAll } = req.body;
  if (!conversationId) {
    return res.status(400).json({ error: "Missing conversationId" });
  }
  const filePath = path.join(pausesDir, `${conversationId}.json`);
  const data = {
    type: "approve",
    approved: approved !== false,
    approveAll: approveAll === true,
    timestamp: Date.now()
  };
  fs.writeFileSync(filePath, JSON.stringify(data));
  logger.info(`[agent/approve] Saved approval for conversation ${conversationId}`);
  res.json({ ok: true, approved: approved !== false });
});

router.post("/answer", (req: Request, res: Response) => {
  const { conversationId, answer, answers } = req.body;
  if (!conversationId) {
    return res.status(400).json({ error: "Missing conversationId" });
  }
  const filePath = path.join(pausesDir, `${conversationId}.json`);
  const data = {
    type: "answer",
    answer,
    answers,
    timestamp: Date.now()
  };
  fs.writeFileSync(filePath, JSON.stringify(data));
  logger.info(`[agent/answer] Saved answer for conversation ${conversationId}`);
  res.json({ ok: true });
});

router.post("/stop", (req: Request, res: Response) => {
  const { conversationId } = req.body;
  if (!conversationId) {
    return res.status(400).json({ error: "Missing conversationId" });
  }
  const child = activeProcesses.get(conversationId);
  if (!child) {
    return res.status(404).json({ error: "No active session for this conversation", conversationId });
  }
  logger.info(`[agent/stop] Explicitly killing session for conversation ${conversationId}`);
  child.kill("SIGKILL");
  activeProcesses.delete(conversationId);
  res.json({ ok: true, stopped: true });
});

router.post("/conversation/:conversationId/frame", (req: Request, res: Response) => {
  const conversationId = req.params.conversationId as string;
  const { frameDataUrl } = req.body;
  if (!conversationId) {
    return res.status(400).json({ error: "Missing conversationId" });
  }
  if (!frameDataUrl) {
    return res.status(400).json({ error: "Missing frameDataUrl" });
  }
  const frames = frameBuffers.get(conversationId) || [];
  frames.push(frameDataUrl);
  if (frames.length > 10) {
    frames.shift();
  }
  frameBuffers.set(conversationId, frames);
  res.json({ ok: true });
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const requestPayload = req.body;
    const isStream = req.query.stream === "true";
    const conversationId = (requestPayload.conversationId || req.headers["x-conversation-id"] || req.body.session_id || `session-${Date.now()}`) as string;
    
    logger.info(`Received agent request for role: ${requestPayload.role} (stream=${isStream}, conversationId=${conversationId})`);

    // Ensure Python script has the conversationId
    requestPayload.session_id = conversationId;
    requestPayload.stream = isStream;
    const payloadJson = JSON.stringify(requestPayload);

    const env: Record<string, string> = {};
    for (const key of Object.keys(process.env)) {
      const val = process.env[key];
      if (val !== undefined && val !== "") {
        env[key] = val;
      }
    }
    env.PYTHONPATH = CONFIG.PYTHONPATH;

    const agentScriptPath = path.join(CONFIG.PYTHON_CWD, "scripts", "run_agent.py");

    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (res.socket) res.socket.setNoDelay(true);

      const child = spawn(
        CONFIG.PYTHON_INTERPRETER,
        [agentScriptPath, payloadJson],
        {
          cwd: CONFIG.PYTHON_CWD,
          env
        }
      );

      activeProcesses.set(conversationId, child);

      let buffer = "";
      child.stdout.on("data", (data) => {
        buffer += data.toString();
        while (buffer.includes("\n")) {
          const idx = buffer.indexOf("\n");
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;

          if (line.startsWith("data: ")) {
            res.write(`${line}\n\n`);
          } else {
            try {
              const parsed = JSON.parse(line);
              if (parsed.status === "success") {
                const doneEvent = {
                  type: "done",
                  text: parsed.artifact,
                  metrics: parsed.metrics
                };
                res.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
              }
            } catch {
              logger.debug(`[Agent Log] ${line}`);
            }
          }
        }
      });

      let stderr = "";
      child.stderr.on("data", (data) => {
        stderr += data.toString();
        logger.error(`[Agent Stderr] ${data.toString().trim()}`);
      });

      child.on("close", (code) => {
        activeProcesses.delete(conversationId);
        if (code !== 0) {
          logger.error(`Agent child exited with code ${code}: ${stderr}`);
          res.write(`data: ${JSON.stringify({ type: "error", message: `Agent failed with code ${code}` })}\n\n`);
        }
        res.end();
      });

      child.on("error", (err) => {
        activeProcesses.delete(conversationId);
        logger.error(`Agent child spawn error: ${err.message}`);
        res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
        res.end();
      });

      req.on("close", () => {
        logger.info(`Client closed connection for conversation ${conversationId}, killing agent process`);
        child.kill("SIGKILL");
        activeProcesses.delete(conversationId);
      });
      
    } else {
      const result = await executeAgent(requestPayload, conversationId);
      res.json(result);
    }
  } catch (error: any) {
    logger.error(`Agent endpoint error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
