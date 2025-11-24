import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useOpenAiGlobal } from "../use-openai-global";
import { useWidgetProps } from "../use-widget-props";
import TreeVisualizationComponent from "./TreeVisualizationComponent";
import {
  executeRadarLiteToolCalls,
  queryRadarLiteIntent,
  summarizeRadarLiteResults,
} from "./radarLite";
import "./radar-lite.css";

const extractIntentPayload = (response) => {
  if (!response || typeof response !== "object") {
    return null;
  }

  const { data } = response;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data;
  }

  return response;
};

const extractToolCallResults = (response) => {
  if (!response || typeof response !== "object") {
    return response;
  }

  const candidate = response;

  if (
    candidate.data &&
    typeof candidate.data === "object" &&
    !Array.isArray(candidate.data)
  ) {
    const nested = candidate.data;
    if (nested.results && typeof nested.results === "object") {
      return nested.results;
    }
    return nested;
  }

  if (candidate.results && typeof candidate.results === "object") {
    return candidate.results;
  }

  return response;
};

const buildSummaryRequest = (toolCallResults, payload, query) => {
  if (!toolCallResults || typeof toolCallResults !== "object") {
    return null;
  }

  const rawInputs = payload?.inputs;
  const inputs = Array.isArray(rawInputs)
    ? rawInputs.filter((item) => typeof item === "string")
    : typeof rawInputs === "string"
    ? [rawInputs]
    : [];

  const scopeValue =
    typeof payload?.scope === "string" ? payload.scope : "NONE";

  const intentValue =
    typeof payload?.intent === "string"
      ? payload.intent.toUpperCase()
      : "INVALID";

  return {
    query,
    toolCalls: toolCallResults,
    userIntent: {
      intent: intentValue,
      inputs,
      scope: scopeValue,
    },
  };
};

export default function App() {
  const toolOutput = useWidgetProps();
  const initialDomain = toolOutput?.domain ?? "";
  const [request, setRequest] = useState(initialDomain);
  const [status, setStatus] = useState("idle");
  const [intent, setIntent] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [toolStatus, setToolStatus] = useState("idle");
  const [summaryStatus, setSummaryStatus] = useState("idle");
  const [summaryText, setSummaryText] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [treeIteration, setTreeIteration] = useState(0);

  const displayMode = useOpenAiGlobal("displayMode");
  const toolDomain = toolOutput?.domain ?? "";

  const summarizeToolCalls = useCallback(async (payload, query, toolCalls) => {
    setSummaryStatus("loading");
    setSummaryError(null);
    setSummaryText(null);

    const summaryPayload = buildSummaryRequest(toolCalls, payload, query);

    if (!summaryPayload) {
      setSummaryStatus("error");
      setSummaryError("Summary payload was incomplete.");
      return;
    }

    try {
      const response = await summarizeRadarLiteResults(
        toolCalls,
        summaryPayload.query,
        summaryPayload.userIntent
      );

      const summaryMessage =
        response?.message ??
        response?.data?.message ??
        response?.data?.results?.message ??
        null;

      if (summaryMessage) {
        setSummaryText(summaryMessage);
        setSummaryStatus("success");
        return;
      }

      throw new Error("Summary response was empty.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate summary.";
      setSummaryError(message);
      setSummaryStatus("error");
    }
  }, []);

  const runToolCalls = useCallback(
    async (payload, originalQuery) => {
      if (!payload) {
        setToolStatus("error");
        setSummaryStatus("idle");
        setSummaryError("Tool-call payload missing from intent response.");
        return;
      }

      const normalizedIntent =
        typeof payload.intent === "string" ? payload.intent.toUpperCase() : null;

      if (normalizedIntent === "INVALID") {
        setToolStatus("success");
        setSummaryStatus("idle");
        setSummaryText(null);
        setSummaryError(null);
        return;
      }

      setToolStatus("loading");
      setSummaryError(null);
      setSummaryStatus("idle");
      setSummaryText(null);

      try {
        const toolResponse = await executeRadarLiteToolCalls(payload);
        const extractedResults = extractToolCallResults(toolResponse);
        setToolStatus("success");

        if (payload && originalQuery && extractedResults) {
          await summarizeToolCalls(payload, originalQuery, extractedResults);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to run tool calls.";
        setToolStatus("error");
        setSummaryStatus("idle");
        setSummaryError(message);
      }
    },
    [summarizeToolCalls]
  );

  const handleCheck = useCallback(
    async (domainToCheck) => {
      const trimmed = (domainToCheck ?? "").trim();

      if (!trimmed) {
        setErrorMessage("Please enter a domain.");
        setStatus("error");
        return;
      }

      setStatus("loading");
      setErrorMessage(null);
      setIntent(null);
      setToolStatus("idle");
      setSummaryStatus("idle");
      setSummaryText(null);
      setSummaryError(null);
      setTreeIteration((count) => count + 1);

      try {
        const response = await queryRadarLiteIntent(trimmed);
        const normalizedResponse = response ?? {};
        const detectedIntent =
          normalizedResponse?.data?.intent ??
          normalizedResponse?.data?.results?.intent ??
          normalizedResponse?.intent ??
          normalizedResponse?.results?.intent ??
          null;

        setIntent(
          typeof detectedIntent === "string"
            ? detectedIntent
            : Array.isArray(detectedIntent)
            ? detectedIntent.join(", ")
            : null
        );
        setStatus("success");

        const payloadForToolCalls = extractIntentPayload(response);
        void runToolCalls(payloadForToolCalls, trimmed);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        setErrorMessage(message);
        setStatus("error");
      }
    },
    [runToolCalls]
  );

  useEffect(() => {
    if (toolDomain && toolDomain !== request) {
      setRequest(toolDomain);
      void handleCheck(toolDomain);
    }
  }, [toolDomain, request, handleCheck]);

  const handleSubmit = (event) => {
    event.preventDefault();
    void handleCheck(request);
  };

  const shouldRenderResultCard = status !== "idle";
  const showCheckingBox =
    status === "loading" ||
    toolStatus === "loading" ||
    summaryStatus === "loading";
  const shouldHideTreeForSummary =
    status === "success" && summaryStatus === "success" && !!summaryText;
  const shouldShowTree =
    !shouldHideTreeForSummary &&
    status === "success" &&
    (toolStatus === "loading" ||
      toolStatus === "success" ||
      summaryStatus === "loading");

  const treePhase = useMemo(() => {
    if (
      status === "error" ||
      toolStatus === "error" ||
      summaryStatus === "error"
    ) {
      return "error";
    }

    if (
      status === "loading" ||
      toolStatus === "loading" ||
      summaryStatus === "loading" ||
      (status === "success" && toolStatus === "success")
    ) {
      return "checking";
    }

    return "idle";
  }, [status, toolStatus, summaryStatus]);

  return (
    <main
      className={
        displayMode === "fullscreen"
          ? "radar-lite-fullscreen"
          : "radar-lite-inline"
      }
    >
      <section className="radar-lite-card">
        <header>
          <h1>Radar Lite</h1>
        </header>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            autoComplete="off"
            placeholder="Ask me about your domain security..."
            aria-label="Ask Radar Lite about your domain security"
          />
        </form>

        {status === "error" && errorMessage && (
          <div className="radar-lite-status radar-lite-error">
            {errorMessage}
          </div>
        )}

        {shouldRenderResultCard && (
          <div className="radar-lite-result">
            {showCheckingBox && (
                <h2>Evaluating security…</h2>
            )}

            {shouldShowTree && (
              <div className="radar-lite-tree-inline">
                <TreeVisualizationComponent
                  key={treeIteration}
                  intent={intent}
                  analysisPhase={treePhase}
                />
              </div>
            )}

            {status === "success" &&
              summaryStatus === "success" &&
              summaryText && (
                <div className="radar-lite-summary">
                  <h2>Summary</h2>
                  <p>{summaryText}</p>
                </div>
              )}

            {toolStatus === "error" && (
              <div className="radar-lite-status radar-lite-error">
                Failed to complete follow-up checks.
              </div>
            )}

            {summaryStatus === "error" && summaryError && (
              <div className="radar-lite-status radar-lite-error">
                {summaryError}
              </div>
            )}

          </div>
        )}
      </section>
    </main>
  );
}

const rootElement = document.getElementById("radar-lite-root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
