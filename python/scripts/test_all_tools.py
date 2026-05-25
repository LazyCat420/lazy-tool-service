import os
import sys
import json
import asyncio

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
shared_code = os.path.abspath(os.path.join(project_root, "..", "..", "trading-client"))

if shared_code not in sys.path:
    sys.path.append(shared_code)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Flag that this is a short-lived tool process
os.environ["IS_TOOL_PROCESS"] = "true"

from app.tools import registry

async def test_tools():
    schemas_path = os.path.join(project_root, "..", "tool_schemas.json")
    with open(schemas_path) as f:
        schemas = json.load(f)

    working = []
    failed = []

    # Mock arguments for common parameter names to avoid validation errors
    mock_args_pool = {
        "ticker": "AAPL",
        "ticker_symbol": "AAPL",
        "query": "artificial intelligence",
        "q": "artificial intelligence",
        "limit": 5,
        "days": 7,
        "cash_available": 100000.0,
        "risk_percent": 0.02,
        "entry_price": 150.0,
        "stop_loss_price": 140.0,
        "target_price": 180.0,
        "atr": 5.0,
        "total_portfolio_value": 100000.0,
        "current_positions": 2,
        "max_positions": 10,
        "text": "Hello world",
        "note": "Test note",
        "content": "Test content",
        "title": "Test title",
        "key": "test_key",
        "value": "test_value",
        "hours": 24,
        "multiplier": 2.0,
        "max_position_pct": 0.10,
        "equation": "x + y",
        "variables": {"x": 1, "y": 2},
        "url": "https://example.com",
        "channel_handle": "test_channel",
        "metric_name": "test_metric",
        "amendment_text": "test amendment",
        "section_id": "test_section",
        "schedule_name": "test_schedule",
        "cron_expression": "0 0 * * *",
        "task_name": "test_task",
        "action": "test_action",
        "trigger_id": "test_trigger",
        "condition": "test_condition",
        "message": "test message",
        "recipient": "test_recipient",
        "subject": "test_subject"
    }

    for tool in schemas:
        name = tool["name"]
        
        # Build arguments based on tool parameters
        args = {}
        properties = tool.get("parameters", {}).get("properties", {})
        required = tool.get("parameters", {}).get("required", [])
        
        for param in required:
            if param in mock_args_pool:
                args[param] = mock_args_pool[param]
            else:
                # Default fallback based on type
                param_type = properties.get(param, {}).get("type", "string")
                if param_type == "number" or param_type == "integer":
                    args[param] = 1
                elif param_type == "boolean":
                    args[param] = True
                elif param_type == "array":
                    args[param] = []
                elif param_type == "object":
                    args[param] = {}
                else:
                    args[param] = "test"

        print(f"Testing {name} with args: {args}...", end="", flush=True)
        
        tool_call = {
            "id": "test_call",
            "type": "function",
            "function": {
                "name": name,
                "arguments": json.dumps(args)
            }
        }
        
        try:
            # We don't skip permission check to simulate real call, but wait, permission check returns dict
            result = await registry.execute_tool_call(tool_call, skip_permission_check=True)
            content = result.get("content", "")
            
            # Check if content has "error"
            try:
                content_json = json.loads(content)
                if isinstance(content_json, dict) and "error" in content_json:
                    err_msg = content_json["error"]
                    print(f" FAILED (returned error: {err_msg})")
                    failed.append((name, f"Returned error: {err_msg}"))
                else:
                    print(" OK")
                    working.append(name)
            except Exception:
                # Not JSON or not a dict with 'error'
                if "error" in content.lower() or "failed" in content.lower() or "exception" in content.lower():
                    print(f" FAILED (output contains error text: {content[:100]})")
                    failed.append((name, content[:100]))
                else:
                    print(" OK")
                    working.append(name)
        except Exception as e:
            print(f" FAILED (threw exception: {e})")
            failed.append((name, str(e)))

    print("\n=== SUMMARY ===")
    print(f"Total: {len(schemas)}")
    print(f"Working ({len(working)}): {working}")
    print(f"Failed ({len(failed)}): {[f[0] for f in failed]}")

if __name__ == "__main__":
    asyncio.run(test_tools())
