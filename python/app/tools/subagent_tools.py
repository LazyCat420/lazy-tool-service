import os
import httpx
import json
import logging
from lazycat.tool_registry import registry, PermissionLevel

logger = logging.getLogger(__name__)

@registry.register(
    name="spawn_subagent",
    description="Spawn a sub-agent to solve a subtask synchronously and retrieve its final answer.",
    parameters={
        "type": "object",
        "properties": {
            "agent": {"type": "string", "description": "The name/type of the subagent to run (e.g. CUSTOM_QUANT_RESEARCH_AGENT)."},
            "prompt": {"type": "string", "description": "Instructions and description of the task for the subagent."},
            "parent_conversation_id": {"type": "string", "description": "The ID of the parent agent's conversation."}
        },
        "required": ["agent", "prompt", "parent_conversation_id"]
    },
    permission=PermissionLevel.WRITE
)
async def spawn_subagent(
    agent: str,
    prompt: str,
    parent_conversation_id: str
) -> dict:
    """Spawns a sub-agent to solve a subtask.
    
    Args:
        agent: The name/type of the subagent to run (e.g. CUSTOM_QUANT_RESEARCH_AGENT).
        prompt: Instructions and description of the task for the subagent.
        parent_conversation_id: The ID of the parent agent's conversation.
    """
    port = os.getenv("LAZY_TOOL_SERVICE_PORT", "8037")
    host = os.getenv("LAZY_TOOL_SERVICE_HOST", "127.0.0.1")
    url = f"http://{host}:{port}/agent"
    
    import uuid
    subagent_id = f"subagent-{agent}-{uuid.uuid4().hex[:8]}"
    
    payload = {
        "role": agent,
        "content": prompt,
        "conversationId": subagent_id,
        "parentAgentConversationId": parent_conversation_id,
        "isSubAgent": True
    }
    
    logger.info(f"[SubagentTool] Spawning subagent {agent} with conversationId {subagent_id}")
    
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            r = await client.post(url, json=payload)
            if r.status_code == 200:
                return r.json()
            else:
                return {"error": f"Failed to spawn subagent: status {r.status_code}, response: {r.text}"}
        except Exception as e:
            logger.error(f"[SubagentTool] Failed to communicate with agent service: {e}")
            return {"error": f"Failed to contact local agent service at {url}: {str(e)}"}

@registry.register(
    name="execute_agent",
    description="Synchronously execute an agent's main processing flow and return its output.",
    parameters={
        "type": "object",
        "properties": {
            "agent": {"type": "string", "description": "The name/type of the agent to run."},
            "prompt": {"type": "string", "description": "Instructions and context for the execution."},
            "conversation_id": {"type": "string", "description": "The conversation ID for tracking."}
        },
        "required": ["agent", "prompt", "conversation_id"]
    },
    permission=PermissionLevel.WRITE
)
async def execute_agent(
    agent: str,
    prompt: str,
    conversation_id: str
) -> dict:
    """Executes a target agent synchronously.
    
    Args:
        agent: The name/type of the agent to run.
        prompt: Instructions and context for the execution.
        conversation_id: The conversation ID for tracking.
    """
    port = os.getenv("LAZY_TOOL_SERVICE_PORT", "8037")
    host = os.getenv("LAZY_TOOL_SERVICE_HOST", "127.0.0.1")
    url = f"http://{host}:{port}/agent"
    
    payload = {
        "role": agent,
        "content": prompt,
        "conversationId": conversation_id,
        "isSubAgent": False
    }
    
    logger.info(f"[SubagentTool] Executing agent {agent} for conversationId {conversation_id}")
    
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            r = await client.post(url, json=payload)
            if r.status_code == 200:
                return r.json()
            else:
                return {"error": f"Failed to execute agent: status {r.status_code}, response: {r.text}"}
        except Exception as e:
            logger.error(f"[SubagentTool] Failed to execute agent: {e}")
            return {"error": f"Failed to execute agent at {url}: {str(e)}"}
