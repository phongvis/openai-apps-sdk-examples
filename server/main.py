"""Pizzaz demo MCP server implemented with the Python FastMCP helper.

The server exposes the pizza map widget and returns the widget HTML alongside
structured content. Each handler returns the HTML shell via an MCP resource and
echoes the selected topping so the ChatGPT client can hydrate the widget. The
module also wires the handlers into an HTTP/SSE stack so you can run the server
with uvicorn on port 8000."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

import mcp.types as types
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, ValidationError


@dataclass(frozen=True)
class PizzazWidget:
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


widgets: List[PizzazWidget] = [
    PizzazWidget(
        identifier="pizza-map",
        title="Show Pizza Map",
        template_uri="ui://widget/pizza-map.html",
        invoking="Hand-tossing a map",
        invoked="Served a fresh map",
        html=_load_widget_html("pizzaz"),
        response_text="Rendered a pizza map!",
    ),
    PizzazWidget(
        identifier="radar-lite",
        title="Check Domain Intent",
        template_uri="ui://widget/radar-lite.html",
        invoking="Checking domain intent",
        invoked="Intent check complete",
        html=_load_widget_html("radar-lite"),
        response_text="Rendered Radar Lite widget!",
    ),
]


MIME_TYPE = "text/html+skybridge"


WIDGETS_BY_ID: Dict[str, PizzazWidget] = {
    widget.identifier: widget for widget in widgets
}
WIDGETS_BY_URI: Dict[str, PizzazWidget] = {
    widget.template_uri: widget for widget in widgets
}


class PizzaInput(BaseModel):
    """Schema for pizza tools."""

    pizza_topping: str | None = Field(
        None,
        alias="pizzaTopping",
        description="Topping to mention when rendering the widget.",
    )
    domain: str | None = Field(
        None,
        description="Domain to check intent for (radar-lite widget).",
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


mcp = FastMCP(
    name="pizzaz-python",
    stateless_http=True,
)


PIZZA_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "pizzaTopping": {
            "type": "string",
            "description": "Topping to mention when rendering the widget.",
        }
    },
    "required": ["pizzaTopping"],
    "additionalProperties": False,
}

RADAR_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "domain": {
            "type": "string",
            "description": "Domain to check intent for.",
        }
    },
    "required": ["domain"],
    "additionalProperties": False,
}


def _resource_description(widget: PizzazWidget) -> str:
    return f"{widget.title} widget markup"


def _tool_meta(widget: PizzazWidget) -> Dict[str, Any]:
    return {
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
    }


def _embedded_widget_resource(widget: PizzazWidget) -> types.EmbeddedResource:
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
    tools = []
    for widget in widgets:
        schema = (
            RADAR_TOOL_INPUT_SCHEMA
            if widget.identifier == "radar-lite"
            else PIZZA_TOOL_INPUT_SCHEMA
        )
        tools.append(
            types.Tool(
                name=widget.identifier,
                title=widget.title,
                description=widget.title,
                inputSchema=deepcopy(schema),
                _meta=_tool_meta(widget),
                # To disable the approval prompt for the tools
                annotations={
                    "destructiveHint": False,
                    "openWorldHint": False,
                    "readOnlyHint": True,
                },
            )
        )
    return tools


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


async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    widget = WIDGETS_BY_ID.get(req.params.name)
    if widget is None:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Unknown tool: {req.params.name}",
                    )
                ],
                isError=True,
            )
        )

    arguments = req.params.arguments or {}
    try:
        payload = PizzaInput.model_validate(arguments)
    except ValidationError as exc:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Input validation error: {exc.errors()}",
                    )
                ],
                isError=True,
            )
        )

    widget_resource = _embedded_widget_resource(widget)
    meta: Dict[str, Any] = {
        "openai.com/widget": widget_resource.model_dump(mode="json"),
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
    }

    if widget.identifier == "radar-lite":
        structured_content = {"domain": payload.domain or ""}
    else:
        structured_content = {"pizzaTopping": payload.pizza_topping or ""}

    return types.ServerResult(
        types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=widget.response_text,
                )
            ],
            structuredContent=structured_content,
            _meta=meta,
        )
    )


mcp._mcp_server.request_handlers[types.CallToolRequest] = _call_tool_request
mcp._mcp_server.request_handlers[types.ReadResourceRequest] = _handle_read_resource


app = mcp.streamable_http_app()

try:
    from starlette.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )
except Exception:
    pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
