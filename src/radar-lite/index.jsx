import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ButtonLink } from "@openai/apps-sdk-ui/components/Button";
import { ArrowUpRight } from "@openai/apps-sdk-ui/components/Icon";
import { useOpenAiGlobal } from "../use-openai-global";
import { useWidgetProps } from "../use-widget-props";
import { SET_GLOBALS_EVENT_TYPE } from "../types";
import TreeVisualizationComponent from "./TreeVisualizationComponent";
import QueryHeader from "./QueryHeader";
import SecurityPostureSummary from "./security/SecurityPostureSummary";
// Direct API calls - used for local mock in dev mode
import { queryRadarLiteIntent, executeRadarLiteToolCalls } from "./radarLite";
import "./radar-lite.css";

// Early startup logging
console.log("%c════════════════════════════════════════════════════════════", "color: #9C27B0; font-weight: bold");
console.log("%c🚀 RADAR-LITE WIDGET LOADING", "color: #9C27B0; font-weight: bold; font-size: 16px");
console.log("%c════════════════════════════════════════════════════════════", "color: #9C27B0; font-weight: bold");
console.log("%c📍 Location:", "color: #673AB7", window.location.href);
console.log("%c🌐 window.openai:", "color: #673AB7", window.openai);
console.log("%c🔧 window.openai?.callTool:", "color: #673AB7", typeof window.openai?.callTool);
console.log("%c📦 window.openai?.toolOutput:", "color: #673AB7", window.openai?.toolOutput);

// Sample summary for dev mode mock
const DEV_SAMPLE_SUMMARY = `The email security posture for this domain is generally strong, with key protections such as DMARC, SPF, MTA-STS, TLS Reporting, and BIMI properly implemented.

DMARC is configured with a strict "reject" policy at 100%. SPF is present but uses a "softfail" (~all) qualifier. MTA-STS is enforced, and BIMI is implemented with a validated certificate.

Overall, the strongest concern is the SPF policy's use of a softfail, which could be hardened for tighter security.`;

/**
 * Local mock for tool calls in dev mode.
 * Simulates the server responses using direct API calls.
 */
const mockToolLocally = async (name, payload) => {
  console.log("%c🔧 [DEV MOCK] Tool call:", "color: #FF9800; font-weight: bold", name, payload);
  
  if (name === "fetch_intent") {
    const response = await queryRadarLiteIntent(payload.query);
    return {
      structuredContent: {
        status: "success",
        intent_data: response?.data ?? response,
      },
    };
  }
  
  if (name === "fetch_scores") {
    const response = await executeRadarLiteToolCalls(payload.intent_data);
    return {
      structuredContent: {
        status: "success",
        scores_data: response?.data ?? response,
      },
    };
  }
  
  if (name === "generate_summary") {
    // In dev mode, return sample summary
    return {
      structuredContent: {
        status: "complete",
        summary: DEV_SAMPLE_SUMMARY,
      },
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
};

/**
 * Universal tool caller - uses openai.callTool in ChatGPT, falls back to local mock in dev.
 * Following the todo app pattern.
 */
const callTool = async (name, payload) => {
  console.log("%c═══════════════════════════════════════════════════════════", "color: #4CAF50; font-weight: bold");
  console.log("%c🔧 CALL TOOL: " + name, "color: #4CAF50; font-weight: bold; font-size: 14px");
  console.log("%c═══════════════════════════════════════════════════════════", "color: #4CAF50; font-weight: bold");
  console.log("%c📥 Payload:", "color: #2196F3; font-weight: bold");
  console.log(payload);
  
  const startTime = performance.now();
  let response;
  
  if (window.openai?.callTool) {
    // In ChatGPT - use the real tool
    console.log("%c🌐 Using window.openai.callTool", "color: #9C27B0; font-weight: bold");
    response = await window.openai.callTool(name, payload);
  } else {
    // In dev mode - use local mock
    console.log("%c🔧 Using local mock (dev mode)", "color: #FF9800; font-weight: bold");
    response = await mockToolLocally(name, payload);
  }
  
  const elapsed = (performance.now() - startTime).toFixed(0);
  console.log("%c📤 Response (" + elapsed + "ms):", "color: #4CAF50; font-weight: bold");
  console.log(response);
  
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

const extractInputResults = (rawResults) => {
  const normalizeList = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const scores = entry.assessment?.scores;
      return Array.isArray(scores) && scores.length > 0;
    });
  };

  if (!rawResults) {
    return [];
  }

  if (Array.isArray(rawResults)) {
    const normalized = normalizeList(rawResults);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (typeof rawResults === "object") {
    const direct = normalizeList(rawResults.inputResults);
    if (direct.length > 0) {
      return direct;
    }

    if (
      rawResults.results &&
      typeof rawResults.results === "object" &&
      !Array.isArray(rawResults.results)
    ) {
      const nestedList = normalizeList(rawResults.results.inputResults);
      if (nestedList.length > 0) {
        return nestedList;
      }
    }
  }

  return [];
};

export default function App() {
  console.log("%c🎬 App component rendering", "color: #00BCD4; font-weight: bold");
  
  const toolOutput = useWidgetProps();
  console.log("%c📦 toolOutput:", "color: #E91E63; font-weight: bold; font-size: 14px", toolOutput);
  console.log("%c📦 toolOutput type:", "color: #E91E63", typeof toolOutput);
  console.log("%c📦 toolOutput keys:", "color: #E91E63", toolOutput ? Object.keys(toolOutput) : "null/undefined");
  
  const initialQuery = toolOutput?.query ?? "";
  console.log("%c📝 initialQuery:", "color: #FF5722; font-weight: bold", initialQuery || "(empty)");
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
  const toolQuery = toolOutput?.query ?? "";
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

  const hasSummaryText =
    status === "success" && summaryStatus === "success" && Boolean(summaryText);
  const hasSummaryError = summaryStatus === "error" && Boolean(summaryError);
  const headerContext = analysisContext;
  const securityInputResults = useMemo(
    () => extractInputResults(rawResults),
    [rawResults]
  );
  const securityInputsFromResults = useMemo(() => {
    return securityInputResults
      .map((r) => r.input || r.metadata?.input)
      .filter(Boolean);
  }, [securityInputResults]);
  const securityInputs = securityInputsFromResults.length > 0 
    ? securityInputsFromResults 
    : (headerContext?.inputs ?? []);
  const shouldShowSecuritySummary = securityInputResults.length > 0;
  const derivedIndustry = analysisContext?.industry ?? null;

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

  /**
   * Main analysis flow - uses callTool for every step.
   * In ChatGPT: calls server tools via window.openai.callTool
   * In dev mode: callTool mocks the responses using direct API calls
   */
  const runAnalysis = useCallback(async (query) => {
    const trimmed = (query ?? "").trim();
    if (!trimmed) {
      setErrorMessage("Please enter a security query.");
      setStatus("error");
      return;
    }

    // Reset state
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
      console.log("%c\n════════════════════════════════════════════════════════════", "color: #3F51B5; font-weight: bold");
      console.log("%c🔍 RUN ANALYSIS", "color: #3F51B5; font-weight: bold; font-size: 16px");
      console.log("%c════════════════════════════════════════════════════════════", "color: #3F51B5; font-weight: bold");
      console.log("%c📝 Query:", "color: #2196F3; font-weight: bold", trimmed);

      // Step 1: Fetch intent via callTool
      console.log("%c⏳ Step 1: fetch_intent", "color: #FF9800; font-weight: bold");
      const intentResponse = await callTool("fetch_intent", { query: trimmed });
      const intentData = intentResponse?.structuredContent?.intent_data ?? intentResponse?.intent_data;
      
      if (!intentData) {
        throw new Error("No intent data received");
      }
      
      console.log("%c✅ Intent received:", "color: #4CAF50; font-weight: bold", intentData);

      // Update UI with intent
      const detectedIntent = intentData?.intent ?? null;
      setIntent(typeof detectedIntent === "string" ? detectedIntent : null);
      setStatus("success");

      // Set analysis context
      const derivedInputs = extractInputsFromPayload(intentData);
      const derivedScope = extractScopeFromPayload(intentData);
      setAnalysisContext({
        intent: detectedIntent,
        scope: derivedScope,
        inputs: derivedInputs,
        industry: null,
      });

      // Check for invalid intent
      if (typeof detectedIntent === "string" && detectedIntent.toUpperCase() === "INVALID") {
        setToolStatus("success");
        return;
      }

      // Step 2: Fetch scores via callTool
      console.log("%c⏳ Step 2: fetch_scores", "color: #FF9800; font-weight: bold");
      setToolStatus("loading");
      const scoresResponse = await callTool("fetch_scores", { intent_data: intentData });
      const scoresData = scoresResponse?.structuredContent?.scores_data ?? scoresResponse?.scores_data;

      if (!scoresData) {
        throw new Error("No scores data received");
      }

      console.log("%c✅ Scores received:", "color: #4CAF50; font-weight: bold", scoresData);

      // Update UI with scores
      const extractedResults = extractToolCallResults(scoresData);
      setRawResults(extractedResults);
      setToolStatus("success");

      // Extract industry
      const derivedIndustry = extractIndustryFromResults(extractedResults);
      if (derivedIndustry) {
        setAnalysisContext((prev) => (prev ? { ...prev, industry: derivedIndustry } : prev));
      }

      // Step 3: Generate summary via callTool
      console.log("%c⏳ Step 3: generate_summary", "color: #FF9800; font-weight: bold");
      setSummaryStatus("loading");
      const summaryResponse = await callTool("generate_summary", {
        query: trimmed,
        intent: detectedIntent ?? "ANY",
        scope: derivedScope ?? "SINGLE",
        inputs: derivedInputs ?? [],
        tool_results: extractedResults,
      });
      const summary = summaryResponse?.structuredContent?.summary ?? summaryResponse?.summary;

      if (summary) {
        console.log("%c✅ Summary received:", "color: #4CAF50; font-weight: bold", summary.substring(0, 100) + "...");
        setSummaryText(summary);
        setSummaryStatus("success");
        
        // Update ChatGPT's context with the completed analysis
        // This allows ChatGPT to reference the summary in follow-up questions
        if (window.openai?.setWidgetState) {
          const widgetState = {
            status: "complete",
            query: trimmed,
            intent: detectedIntent,
            scope: derivedScope,
            inputs: derivedInputs,
            industry: derivedIndustry,
            summary: summary,
          };
          console.log("%c📤 Calling setWidgetState:", "color: #9C27B0; font-weight: bold", widgetState);
          window.openai.setWidgetState(widgetState);
        }
      } else {
        throw new Error("No summary received");
      }

      console.log("%c════════════════════════════════════════════════════════════\n", "color: #3F51B5; font-weight: bold");
    } catch (error) {
      console.error("%c❌ Analysis error:", "color: red; font-weight: bold", error);
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      setErrorMessage(message);
      setStatus("error");
    }
  }, []);

  // Trigger analysis when toolQuery is available
  // Use a ref to track if we've started analysis to avoid double-runs
  const hasStartedAnalysis = React.useRef(false);
  
  useEffect(() => {
    console.log("%c🔄 useEffect check:", "color: #9C27B0; font-weight: bold", {
      toolQuery,
      request,
      hasStartedAnalysis: hasStartedAnalysis.current,
    });
    
    // Run analysis if we have a query and haven't started yet
    if (toolQuery && !hasStartedAnalysis.current) {
      console.log("%c▶️ Starting analysis!", "color: #4CAF50; font-weight: bold; font-size: 14px");
      hasStartedAnalysis.current = true;
      setRequest(toolQuery);
      void runAnalysis(toolQuery);
    }
  }, [toolQuery, runAnalysis]);

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
        {status === "error" && errorMessage && (
          <div className="radar-lite-status radar-lite-error">
            {errorMessage}
          </div>
        )}

        {headerContext ? (
          <QueryHeader
            intent={headerContext.intent}
            scope={headerContext.scope}
            inputs={headerContext.inputs}
            industry={headerContext.industry}
          />
        ) : status !== "idle" ? (
          <QueryHeader
            intent={null}
            scope={null}
            inputs={[]}
            industry={null}
            placeholder="Evaluating security…"
          />
        ) : null}

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
                <div
                  className={
                    shouldShowSecuritySummary
                      ? "radar-lite-summary-grid radar-lite-summary-grid--with-chart"
                      : "radar-lite-summary-grid"
                  }
                >
                  <div className="radar-lite-summary-grid__text">
                    <h2 className="radar-lite-summary__header">
                      Summary:{" "}
                      {securityInputs.length > 0 && (
                        <span className="radar-lite-domain-badge">
                          {securityInputs[0]}
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            aria-label="Above average"
                            className="radar-lite-domain-badge__trend"
                          >
                            <circle cx="8" cy="8" r="7" fill="var(--color-green-500)" opacity={0.15} />
                            <path
                              d="M4 10 L8 6 L12 10 M8 6 L8 12"
                              fill="none"
                              stroke="var(--color-green-500)"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                    </h2>
                    <p style={{ whiteSpace: "pre-line" }}>{summaryText}</p>
                    <div className="radar-lite-summary__actions">
                      <ButtonLink
                        color="primary"
                        href="https://redsift.com/tools/radar-lite?resultId=4miuLqLtXDL5wZffEg9Xa3"
                      >
                        See detailed analysis

                        <ArrowUpRight />
                      </ButtonLink>
                    </div>
                  </div>
                  {shouldShowSecuritySummary && (
                    <div className="radar-lite-summary-grid__chart">
                      <SecurityPostureSummary
                        inputs={securityInputs}
                        inputResults={securityInputResults}
                        fallbackIndustry={derivedIndustry}
                      />
                    </div>
                  )}
                </div>
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
