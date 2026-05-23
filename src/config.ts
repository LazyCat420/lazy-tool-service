// ─── Configuration ──────────────────────────────────────────

interface LazyToolServiceConfig {
  LAZY_TOOL_SERVICE_PORT: number;
  LAZY_TOOL_SERVICE_URL: string;
  MONGODB_URI: string | undefined;
  PYTHON_INTERPRETER: string;
  PYTHON_EXEC_SCRIPT: string;
}

const CONFIG: LazyToolServiceConfig = {
  LAZY_TOOL_SERVICE_PORT: Number(process.env.LAZY_TOOL_SERVICE_PORT || "5591"),
  LAZY_TOOL_SERVICE_URL: process.env.LAZY_TOOL_SERVICE_URL || "http://localhost:5591",
  MONGODB_URI: process.env.MONGO_URI || process.env.MONGODB_URI,
  PYTHON_INTERPRETER: process.env.PYTHON_INTERPRETER || "/home/lazycat/github/rods-project/sun/trading-client/.venv/bin/python",
  PYTHON_EXEC_SCRIPT: process.env.PYTHON_EXEC_SCRIPT || "/home/lazycat/github/rods-project/sun/lazy-tool-service/python/scripts/execute_tool.py",
};

export default CONFIG;
