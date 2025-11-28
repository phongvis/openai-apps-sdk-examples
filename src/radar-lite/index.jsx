import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { useOpenAiGlobal } from "../use-openai-global";
import { useWidgetProps } from "../use-widget-props";
import { SET_GLOBALS_EVENT_TYPE } from "../types";
import TreeVisualizationComponent from "./TreeVisualizationComponent";
import QueryHeader from "./QueryHeader";
import {
  executeRadarLiteToolCalls,
  queryRadarLiteIntent,
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

const extractInputsFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const rawInputs = payload?.inputs;
  if (Array.isArray(rawInputs)) {
    return rawInputs.filter((item) => typeof item === "string");
  }

  if (typeof rawInputs === "string") {
    return [rawInputs];
  }

  return [];
};

const extractScopeFromPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return typeof payload.scope === "string" ? payload.scope : null;
};

const normalizeIndustryValue = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(unknown|irrelevance)$/i.test(trimmed)) {
    return null;
  }

  return trimmed;
};

const extractIndustryFromResults = (toolCallResults) => {
  if (!toolCallResults || typeof toolCallResults !== "object") {
    return null;
  }

  const candidate = toolCallResults.inputResults;
  const inputResults = Array.isArray(candidate) ? candidate : null;

  if (!inputResults) {
    return null;
  }

  for (const entry of inputResults) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const directIndustry = normalizeIndustryValue(entry.industry);
    if (directIndustry) {
      return directIndustry;
    }

    const metadataIndustry = normalizeIndustryValue(entry?.metadata?.industry);
    if (metadataIndustry) {
      return metadataIndustry;
    }

    const assessmentIndustry = normalizeIndustryValue(
      entry?.assessment?.industry
    );
    if (assessmentIndustry) {
      return assessmentIndustry;
    }
  }

  return null;
};

const formatRawToolResults = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.warn("Failed to stringify tool results", error);
    return "Unable to display tool results.";
  }
};

export default function App() {
  const toolOutput = useWidgetProps();
  const initialQuery = toolOutput?.query ?? toolOutput?.domain ?? "";
  const [request, setRequest] = useState(initialQuery);
  const [status, setStatus] = useState("idle");
  const [intent, setIntent] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [toolStatus, setToolStatus] = useState("idle");
  const [summaryStatus, setSummaryStatus] = useState("idle");
  const [summaryText, setSummaryText] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [analysisContext, setAnalysisContext] = useState(null);
  const [rawResults, setRawResults] = useState(null);
  const [treeIteration, setTreeIteration] = useState(0);

  const displayMode = useOpenAiGlobal("displayMode");
  const toolQuery = toolOutput?.query ?? toolOutput?.domain ?? "";
  const devQueryString = useMemo(() => {
    if (!import.meta.env.DEV) {
      return null;
    }

    if (typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const queryParam = params.get("query");
    const trimmed = queryParam?.trim();
    return trimmed ? trimmed : null;
  }, []);
  const trimmedRequest = request.trim();
  const hasSummaryText =
    status === "success" && summaryStatus === "success" && Boolean(summaryText);
  const hasSummaryError = summaryStatus === "error" && Boolean(summaryError);
  const fallbackHeaderContext =
    status !== "idle"
      ? {
          intent: null,
          scope: null,
          inputs: trimmedRequest ? [trimmedRequest] : [],
          industry: null,
        }
      : null;
  const headerContext = analysisContext ?? fallbackHeaderContext;

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    if (!devQueryString || typeof window === "undefined") {
      return;
    }

    const nextToolOutput = { query: devQueryString };

    window.openai = window.openai || {};
    window.openai.toolOutput = nextToolOutput;

    const event = new CustomEvent(SET_GLOBALS_EVENT_TYPE, {
      detail: { globals: { toolOutput: nextToolOutput } },
    });

    window.dispatchEvent(event);
  }, [devQueryString]);

  const summarizeToolCalls = useCallback(async (payload, query, toolCalls) => {
    void payload;
    void query;
    setSummaryStatus("loading");
    setSummaryError(null);
    setSummaryText(null);
    setRawResults(null);

    setSummaryText("Unable to call summary API, showing raw results.");
    setRawResults(toolCalls ?? null);
    setSummaryStatus("success");
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
      setRawResults(null);

      try {
        const toolResponse = await executeRadarLiteToolCalls(payload);
        const extractedResults = extractToolCallResults(toolResponse);
        setRawResults(extractedResults);
        setToolStatus("success");

        const derivedIndustry = extractIndustryFromResults(extractedResults);
        if (derivedIndustry) {
          setAnalysisContext((previous) => {
            if (previous) {
              return { ...previous, industry: derivedIndustry };
            }

            return {
              intent:
                typeof payload.intent === "string" ? payload.intent : null,
              scope: extractScopeFromPayload(payload),
              inputs: extractInputsFromPayload(payload),
              industry: derivedIndustry,
            };
          });
        }

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
      setAnalysisContext(null);
      setRawResults(null);
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
        if (payloadForToolCalls) {
          const derivedInputs = extractInputsFromPayload(payloadForToolCalls);
          const derivedScope = extractScopeFromPayload(payloadForToolCalls);
          const derivedIntentValue =
            typeof payloadForToolCalls.intent === "string"
              ? payloadForToolCalls.intent
              : typeof detectedIntent === "string"
              ? detectedIntent
              : null;

          setAnalysisContext({
            intent: derivedIntentValue,
            scope: derivedScope,
            inputs: derivedInputs,
            industry: null,
          });
        } else if (trimmed) {
          setAnalysisContext({
            intent:
              typeof detectedIntent === "string" ? detectedIntent : null,
            scope: null,
            inputs: [trimmed],
            industry: null,
          });
        }
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
    if (toolQuery && toolQuery !== request) {
      setRequest(toolQuery);
      void handleCheck(toolQuery);
    }
  }, [toolQuery, request, handleCheck]);

  const shouldHideTreeForSummary =
    status === "success" && summaryStatus === "success" && !!summaryText;
  const shouldShowTree =
    !shouldHideTreeForSummary &&
    status === "success" &&
    (toolStatus === "loading" ||
      toolStatus === "success" ||
      summaryStatus === "loading");
  const shouldRenderResultCard =
    shouldShowTree || hasSummaryText || hasSummaryError || toolStatus === "error";

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

        {status === "error" && errorMessage && (
          <div className="radar-lite-status radar-lite-error">
            {errorMessage}
          </div>
        )}

        {headerContext && (
          <QueryHeader
            intent={headerContext.intent}
            scope={headerContext.scope}
            inputs={headerContext.inputs}
            industry={headerContext.industry}
          />
        )}

        {shouldRenderResultCard && (
          <div className="radar-lite-result">
            {shouldShowTree && (
              <div className="radar-lite-tree-inline">
                <TreeVisualizationComponent
                  key={treeIteration}
                  intent={intent}
                  analysisPhase={treePhase}
                />
              </div>
            )}

            {hasSummaryText && (
              <div className="radar-lite-summary">
                <h2>Summary</h2>
                <p>{summaryText}</p>
                {rawResults && (
                  <details>
                    <summary>Tool-call results</summary>
                    <pre className="radar-lite-raw-results">
                      {formatRawToolResults(rawResults)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {toolStatus === "error" && (
              <div className="radar-lite-status radar-lite-error">
                Failed to complete follow-up checks.
              </div>
            )}

            {hasSummaryError && (
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
