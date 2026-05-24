// ─── Configuration ──────────────────────────────────────────

import fs from "node:fs";

interface LazyToolServiceConfig {
  LAZY_TOOL_SERVICE_PORT: number;
  LAZY_TOOL_SERVICE_URL: string;
  MONGODB_URI: string | undefined;
  PYTHON_INTERPRETER: string;
  PYTHON_EXEC_SCRIPT: string;
  PYTHON_CWD: string;
  PYTHONPATH: string;
}

// Detect if we are inside the Docker container
const isDocker = fs.existsSync("/.dockerenv") || fs.existsSync("/opt/venv/bin/python");

const defaultInterpreter = isDocker
  ? "/opt/venv/bin/python"
  : "/home/lazycat/github/rods-project/sun/trading-service/.venv/bin/python";

const defaultExecScript = isDocker
  ? "/app/python/scripts/execute_tool.py"
  : "/home/lazycat/github/rods-project/sun/trading-service/scripts/execute_tool.py";

const defaultCwd = isDocker
  ? "/app/python"
  : "/home/lazycat/github/rods-project/sun/trading-service";

const defaultPythonPath = isDocker
  ? "/app/python"
  : [
      "/home/lazycat/github/rods-project/sun/trading-service",
      "/home/lazycat/github/rods-project/sun/trading-client"
    ].join(process.platform === "win32" ? ";" : ":");

const CONFIG: LazyToolServiceConfig = {
  LAZY_TOOL_SERVICE_PORT: Number(process.env.LAZY_TOOL_SERVICE_PORT || "5591"),
  LAZY_TOOL_SERVICE_URL: process.env.LAZY_TOOL_SERVICE_URL || "http://localhost:5591",
  MONGODB_URI: process.env.MONGO_URI || process.env.MONGODB_URI,
  PYTHON_INTERPRETER: process.env.PYTHON_INTERPRETER || defaultInterpreter,
  PYTHON_EXEC_SCRIPT: process.env.PYTHON_EXEC_SCRIPT || defaultExecScript,
  PYTHON_CWD: process.env.PYTHON_CWD || defaultCwd,
  PYTHONPATH: process.env.PYTHONPATH || defaultPythonPath,
};

export default CONFIG;
