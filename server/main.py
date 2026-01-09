"""Radar Lite MCP server implemented with the Python FastMCP helper.

The server exposes the Radar Lite security analysis widget and returns the
widget HTML alongside structured content. 

Architecture:
- radar-lite: Called by ChatGPT. Fetches intent + scores from radar-lite API,
              returns widget with data in structuredContent.
- generate_summary: Called by widget. Returns AI summary (sample for now).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

def log(msg: str) -> None:
    """Simple print to stderr."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", file=sys.stderr, flush=True)

from copy import deepcopy
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import mcp.types as types
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
import inspect
from pydantic import BaseModel, ConfigDict, Field, ValidationError

# Radar Lite API configuration
RADAR_LITE_HOST = "https://radar-lite.redsift.cloud/web"

WIDGET_RESPONSE_TEXT = "The widget is still running. Once its done, the analysis result will be displayed there. The model MUST NOT make any responses to the user to avoid confusion or redundant information."

async def fetch_radar_lite_intent(query: str) -> Dict[str, Any]:
    """Call the radar-lite intent API."""
    log(f"📡 Calling radar-lite intent API: {query}")
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{RADAR_LITE_HOST}/api/radar-lite/query",
            json={"query": query},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        response.raise_for_status()
        data = response.json()
        log(f"📥 Intent response: {json.dumps(data, indent=2)[:500]}...")
        return data


async def fetch_radar_lite_scores(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Call the radar-lite tool-calls API to get security scores."""
    log(f"📡 Calling radar-lite tool-calls API")
    log(f"📤 Payload: {json.dumps(payload, indent=2)[:500]}...")
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{RADAR_LITE_HOST}/api/radar-lite/tool-calls",
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        response.raise_for_status()
        data = response.json()
        log(f"📥 Scores response received (truncated)")
        return data


# Sample summary text for demo
SAMPLE_SUMMARY_TEXT = """The email security posture for this domain is generally strong, with key protections such as DMARC, SPF, MTA-STS, TLS Reporting, and BIMI properly implemented, enhancing deliverability and defense against phishing and spoofing attacks.

DMARC is configured with a strict "reject" policy at 100%, covering both main and subdomains. This ensures unauthorized emails are blocked, which significantly mitigates phishing risk. However, some DMARC tags like 'pct', 'ri', and 'rf' are marked for removal in upcoming DMARC RFC updates, so the policy should be reviewed and updated accordingly to maintain compliance.

SPF is present but with a "softfail" (~all) at the end, meaning non-authorized sources are flagged but not outright rejected. While the SPF record includes multiple nested includes covering authorized mail sources (including Google Workspace and Salesforce), the "~all" qualifier is less strict than "-all" and may allow some spoofed mail to pass SPF checks, potentially weakening protection.

MTA-STS is enforced, securing SMTP connections and preventing downgrade attacks. TLS Reporting is also configured, helping to monitor and respond to TLS failures.

BIMI is implemented with a validated Verified Mark Certificate, enhancing brand visibility and trust in email communications.

Overall, the strongest concern is the SPF policy's use of a softfail, which could be hardened for tighter security. Additionally, reviewing DMARC to align with evolving standards will sustain long-term protection."""


@dataclass(frozen=True)
class WidgetDefinition:
    identifier: str
    title: str
    template_uri: str
    invoking: str
    invoked: str
    html: str
    response_text: str


ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"


@lru_cache(maxsize=None)
def _load_widget_html(component_name: str) -> str:
    html_path = ASSETS_DIR / f"{component_name}.html"
    if html_path.exists():
        return html_path.read_text(encoding="utf8")

    fallback_candidates = sorted(ASSETS_DIR.glob(f"{component_name}-*.html"))
    if fallback_candidates:
        return fallback_candidates[-1].read_text(encoding="utf8")

    raise FileNotFoundError(
        f'Widget HTML for "{component_name}" not found in {ASSETS_DIR}. '
        "Run `pnpm run build` to generate the assets before starting the server."
    )


widgets: List[WidgetDefinition] = [
    WidgetDefinition(
        identifier="radar-lite",
        title="Analyze Domain Security",
        template_uri="ui://widget/radar-lite.html",
        invoking="Analyzing domain security",
        invoked="Analysis complete",
        html=_load_widget_html("radar-lite"),
        response_text=WIDGET_RESPONSE_TEXT,
    ),
]

# Tool description - more explicit for ChatGPT
RADAR_TOOL_DESCRIPTION = """Analyze email and domain security posture. Use this tool when the user asks about:
- Email security (DMARC, SPF, DKIM, MTA-STS, BIMI)
- Domain security analysis
- Security posture comparisons between domains
- DNS security configurations

The tool accepts the user's full question and returns a visual security analysis widget."""


MIME_TYPE = "text/html+skybridge"


WIDGETS_BY_ID: Dict[str, WidgetDefinition] = {
    widget.identifier: widget for widget in widgets
}
WIDGETS_BY_URI: Dict[str, WidgetDefinition] = {
    widget.template_uri: widget for widget in widgets
}


class RadarLiteInput(BaseModel):
    """Schema for radar-lite tool."""

    query: str = Field(
        ...,
        description="Security query or domain to analyze.",
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class GenerateSummaryInput(BaseModel):
    """Schema for generate_summary tool - called by widget."""

    query: str = Field(
        ...,
        description="The original security query.",
    )
    intent: Optional[str] = Field(
        default=None,
        description="The detected intent (EMAIL, DNS, WEB, ANY, INVALID).",
    )
    scope: Optional[str] = Field(
        default=None,
        description="The scope (SINGLE, MULTI, COMPARE, NONE).",
    )
    inputs: Optional[List[str]] = Field(
        default=None,
        description="List of domains/inputs to analyze.",
    )
    tool_results: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Results from the tool calls.",
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


mcp = FastMCP(
    name="radar-lite-python",
    stateless_http=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
    )
)


RADAR_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The user's security-related question or domain name to analyze. Pass the full user message as-is. Examples: 'Check email security for example.com', 'Is redsift.com secure?', 'Compare DMARC of foo.com and bar.com'",
        }
    },
    "required": ["query"],
    "additionalProperties": False,
}

GENERATE_SUMMARY_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The original security query.",
        },
        "intent": {
            "type": "string",
            "description": "The detected intent (EMAIL, DNS, WEB, ANY, INVALID).",
        },
        "scope": {
            "type": "string",
            "description": "The scope (SINGLE, MULTI, COMPARE, NONE).",
        },
        "inputs": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of domains/inputs to analyze.",
        },
        "tool_results": {
            "type": "object",
            "description": "Results from the tool calls.",
        },
    },
    "required": ["query"],
    "additionalProperties": False,
}

FETCH_INTENT_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The security query to analyze.",
        },
    },
    "required": ["query"],
    "additionalProperties": False,
}

FETCH_SCORES_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "intent_data": {
            "type": "object",
            "description": "The intent data from the fetch_intent call.",
        },
    },
    "required": ["intent_data"],
    "additionalProperties": False,
}


def _resource_description(widget: WidgetDefinition) -> str:
    return f"{widget.title} widget markup"


def _tool_meta(widget: WidgetDefinition) -> Dict[str, Any]:
    return {
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
    }


def _embedded_widget_resource(widget: WidgetDefinition) -> types.EmbeddedResource:
    return types.EmbeddedResource(
        type="resource",
        resource=types.TextResourceContents(
            uri=widget.template_uri,
            mimeType=MIME_TYPE,
            text=widget.html,
            title=widget.title,
        ),
    )


@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    # Main widget tools
    widget_tools = [
        types.Tool(
            name=widget.identifier,
            title=widget.title,
            description=RADAR_TOOL_DESCRIPTION,
            inputSchema=deepcopy(RADAR_TOOL_INPUT_SCHEMA),
            _meta=_tool_meta(widget),
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        )
        for widget in widgets
    ]

    # Widget-accessible tools (called by widget, hidden from model)
    chained_tools = [
        types.Tool(
            name="fetch_intent",
            title="Fetch Intent",
            description="Fetches intent from radar-lite API. Called by widget.",
            inputSchema=deepcopy(FETCH_INTENT_INPUT_SCHEMA),
            _meta={
                "openai/widgetAccessible": True,
                "openai/visibility": "private",
                "openai/toolInvocation/invoking": "Fetching intent...",
                "openai/toolInvocation/invoked": "Intent received",
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="fetch_scores",
            title="Fetch Scores",
            description="Fetches security scores from radar-lite API. Called by widget.",
            inputSchema=deepcopy(FETCH_SCORES_INPUT_SCHEMA),
            _meta={
                "openai/widgetAccessible": True,
                "openai/visibility": "private",
                "openai/toolInvocation/invoking": "Fetching security scores...",
                "openai/toolInvocation/invoked": "Scores received",
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="generate_summary",
            title="Generate Security Summary",
            description="Generates AI summary of security analysis. Called by widget.",
            inputSchema=deepcopy(GENERATE_SUMMARY_INPUT_SCHEMA),
            _meta={
                "openai/widgetAccessible": True,
                "openai/visibility": "private",
                "openai/toolInvocation/invoking": "Generating analysis summary...",
                "openai/toolInvocation/invoked": "Summary ready",
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
    ]

    return widget_tools + chained_tools


@mcp._mcp_server.list_resources()
async def _list_resources() -> List[types.Resource]:
    return [
        types.Resource(
            name=widget.title,
            title=widget.title,
            uri=widget.template_uri,
            description=_resource_description(widget),
            mimeType=MIME_TYPE,
            _meta=_tool_meta(widget),
        )
        for widget in widgets
    ]


@mcp._mcp_server.list_resource_templates()
async def _list_resource_templates() -> List[types.ResourceTemplate]:
    return [
        types.ResourceTemplate(
            name=widget.title,
            title=widget.title,
            uriTemplate=widget.template_uri,
            description=_resource_description(widget),
            mimeType=MIME_TYPE,
            _meta=_tool_meta(widget),
        )
        for widget in widgets
    ]


async def _handle_read_resource(req: types.ReadResourceRequest) -> types.ServerResult:
    widget = WIDGETS_BY_URI.get(str(req.params.uri))
    if widget is None:
        return types.ServerResult(
            types.ReadResourceResult(
                contents=[],
                _meta={"error": f"Unknown resource: {req.params.uri}"},
            )
        )

    contents = [
        types.TextResourceContents(
            uri=widget.template_uri,
            mimeType=MIME_TYPE,
            text=widget.html,
            _meta=_tool_meta(widget),
        )
    ]

    return types.ServerResult(types.ReadResourceResult(contents=contents))


# ============================================================================
# Tool Handlers
# ============================================================================

async def _handle_fetch_intent(arguments: Dict[str, Any]) -> types.ServerResult:
    """Fetch intent from radar-lite API. Called by widget."""
    log("═" * 60)
    log("🔧 TOOL CALL: fetch_intent")
    log("═" * 60)
    log("📥 RECEIVED ARGUMENTS:")
    log(json.dumps(arguments, indent=2, default=str))
    
    query = arguments.get("query", "")
    if not query:
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text="Missing query parameter")],
                isError=True,
            )
        )
    
    try:
        intent_data = await fetch_radar_lite_intent(query)
        log("✅ Intent fetched successfully")
        
        structured_content = {
            "status": "success",
            "intent_data": intent_data.get("data", intent_data),
        }
        
        log("📤 RETURNING intent_data")
        log("═" * 60)
        
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text="Intent fetched")],
                structuredContent=structured_content,
            )
        )
    except Exception as exc:
        log(f"❌ Error fetching intent: {exc}")
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Error: {exc}")],
                isError=True,
            )
        )


async def _handle_fetch_scores(arguments: Dict[str, Any]) -> types.ServerResult:
    """Fetch scores from radar-lite API. Called by widget."""
    log("═" * 60)
    log("🔧 TOOL CALL: fetch_scores")
    log("═" * 60)
    log("📥 RECEIVED ARGUMENTS:")
    log(json.dumps(arguments, indent=2, default=str)[:500] + "...")
    
    intent_data = arguments.get("intent_data")
    if not intent_data:
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text="Missing intent_data parameter")],
                isError=True,
            )
        )
    
    try:
        scores_data = await fetch_radar_lite_scores(intent_data)
        log("✅ Scores fetched successfully")
        
        structured_content = {
            "status": "success",
            "scores_data": scores_data.get("data", scores_data),
        }
        
        log("📤 RETURNING scores_data")
        log("═" * 60)
        
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text="Scores fetched")],
                structuredContent=structured_content,
            )
        )
    except Exception as exc:
        log(f"❌ Error fetching scores: {exc}")
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Error: {exc}")],
                isError=True,
            )
        )


async def _handle_generate_summary(arguments: Dict[str, Any]) -> types.ServerResult:
    """
    Returns a sample security summary.
    Called by widget via window.openai.callTool().
    
    In production, this would call an AI API to generate a real summary.
    For now, it returns the sample text.
    """
    log("═" * 60)
    log("🔧 TOOL CALL: generate_summary")
    log("═" * 60)
    log("📥 RECEIVED ARGUMENTS:")
    log(json.dumps(arguments, indent=2, default=str))
    
    try:
        payload = GenerateSummaryInput.model_validate(arguments)
        log("✅ Payload validated successfully")
    except ValidationError as exc:
        log(f"❌ Validation error: {exc.errors()}")
        return types.ServerResult(
            types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Validation error: {exc.errors()}")],
                isError=True,
            )
        )

    intent = payload.intent or "ANY"
    scope = payload.scope or "SINGLE"
    inputs = payload.inputs or []
    
    log(f"📊 Parsed values: intent={intent}, scope={scope}, inputs={inputs}")

    # Return sample summary
    # ChatGPT will see structuredContent and use the summary for its narration
    structured_content = {
        "status": "complete",
        "intent": intent,
        "scope": scope,
        "inputs": inputs,
        "summary": SAMPLE_SUMMARY_TEXT,
    }
    
    log("📤 RETURNING:")
    log(f"   status: complete")
    log(f"   intent: {intent}")
    log(f"   scope: {scope}")
    log(f"   inputs: {inputs}")
    log(f"   summary: {SAMPLE_SUMMARY_TEXT[:100]}...")
    log("═" * 60)

    return types.ServerResult(
        types.CallToolResult(
            content=[types.TextContent(type="text", text=SAMPLE_SUMMARY_TEXT)],
            structuredContent=structured_content,
        )
    )


async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    """Main tool request handler - routes to appropriate handler."""
    tool_name = req.params.name
    arguments = req.params.arguments or {}
    
    log("")
    log("▓" * 60)
    log(f"🚀 INCOMING TOOL REQUEST: {tool_name}")
    log(f"⏰ Timestamp: {datetime.now().isoformat()}")
    log("▓" * 60)

    # Handle widget-accessible tools (called by widget)
    if tool_name == "fetch_intent":
        log("➡️  Routing to: _handle_fetch_intent")
        return await _handle_fetch_intent(arguments)
    
    if tool_name == "fetch_scores":
        log("➡️  Routing to: _handle_fetch_scores")
        return await _handle_fetch_scores(arguments)
    
    if tool_name == "generate_summary":
        log("➡️  Routing to: _handle_generate_summary")
        return await _handle_generate_summary(arguments)

    # Handle main widget tool
    widget = WIDGETS_BY_ID.get(tool_name)
    if widget is None:
        log(f"❌ Unknown tool: {tool_name}")
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Unknown tool: {tool_name}",
                    )
                ],
                isError=True,
            )
        )
    
    log(f"➡️  Routing to: widget handler for '{tool_name}'")
    log("═" * 60)
    log("🔧 TOOL CALL: radar-lite (main widget)")
    log("═" * 60)
    log("📥 RECEIVED ARGUMENTS:")
    log(json.dumps(arguments, indent=2, default=str))

    # Validate input schema
    try:
        payload = RadarLiteInput.model_validate(arguments)
        log(f"✅ Payload validated: query='{payload.query}'")
    except ValidationError as exc:
        log(f"❌ Validation error: {exc.errors()}")
        # Return user-friendly error - NO widget HTML, ask for more info
        error_details = exc.errors()
        missing_fields = [e.get("loc", ["unknown"])[0] for e in error_details if e.get("type") == "missing"]
        
        if missing_fields:
            error_msg = f"Please provide a domain or security question to analyze. Missing: {', '.join(str(f) for f in missing_fields)}"
        else:
            error_msg = "Please provide a valid security query. For example: 'Check email security for example.com' or 'Is redsift.com secure?'"
        
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=error_msg,
                    )
                ],
                isError=True,
            )
        )

    # Check for empty query
    if not payload.query or not payload.query.strip():
        log("❌ Empty query provided")
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text="Please provide a domain or security question to analyze. For example: 'Check email security for example.com' or 'Compare DMARC of foo.com and bar.com'",
                    )
                ],
                isError=True,
            )
        )

    # Return widget HTML with query - widget will call fetch_intent, fetch_scores, generate_summary
    widget_resource = _embedded_widget_resource(widget)

    # Widget will read query from toolOutput and call tools to fetch data
    structured_content = {
        "query": payload.query,
        "aiHint": WIDGET_RESPONSE_TEXT
    }
    
    log("📤 RETURNING structuredContent (this becomes toolOutput in widget):")
    log(json.dumps(structured_content, indent=2, default=str))
    log(f"   Widget HTML size: {len(widget.html)} bytes")
    log("═" * 60)

    return types.ServerResult(
        types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"Starting security analysis for: {payload.query}"
                ),
                widget_resource,
            ],
            structuredContent=structured_content,
            _meta=_tool_meta(widget),
        )
    )


mcp._mcp_server.request_handlers[types.CallToolRequest] = _call_tool_request
mcp._mcp_server.request_handlers[types.ReadResourceRequest] = _handle_read_resource


streamable_kwargs: Dict[str, Any] = {}
try:
    sig = inspect.signature(mcp.streamable_http_app)
    if "allowed_hosts" in sig.parameters:
        streamable_kwargs["allowed_hosts"] = ["*"]
    if "trusted_hosts" in sig.parameters:
        streamable_kwargs["trusted_hosts"] = ["*"]
    if "allow_all_hosts" in sig.parameters:
        streamable_kwargs["allow_all_hosts"] = True
    if "allow_all_hostnames" in sig.parameters:
        streamable_kwargs["allow_all_hostnames"] = True
except Exception:
    streamable_kwargs = {}

app = mcp.streamable_http_app(**streamable_kwargs)
if streamable_kwargs:
    log(f"🔓 streamable_http_app kwargs={streamable_kwargs}")

# Log on startup
log("=" * 60)
log("🚀 RADAR-LITE MCP SERVER STARTING")
log("=" * 60)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
