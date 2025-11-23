import React, { FormEvent, useState } from "react";
import { createRoot } from "react-dom/client";
import { useOpenAiGlobal } from "../use-openai-global";
import { useWidgetProps } from "../use-widget-props";
import { queryRadarLiteIntent } from "./radarLite";
import "./radar-lite.css";

export default function App() {
  const [domain, setDomain] = useState(null);
  const [status, setStatus] = useState("idle");
  const [intent, setIntent] = useState(null);
  const [rawResponse, setRawResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const displayMode = useOpenAiGlobal("displayMode");
  const toolOutput = useWidgetProps();

  // Initialize with tool output if provided
  React.useEffect(() => {
    if (toolOutput?.domain && toolOutput.domain !== domain) {
      setDomain(toolOutput.domain);
      handleCheck(toolOutput.domain);
    }
  }, [toolOutput?.domain]);

  const handleCheck = async (domainToCheck) => {
    const trimmed = domainToCheck.trim();

    if (!trimmed) {
      setErrorMessage("Please enter a domain.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    setIntent(null);
    setRawResponse(null);

    try {
      const response = await queryRadarLiteIntent(trimmed);
      const detectedIntent =
        response?.data?.intent ??
        response?.data?.results?.intent ??
        response?.intent ??
        null;

      setIntent(
        typeof detectedIntent === "string"
          ? detectedIntent
          : Array.isArray(detectedIntent)
          ? detectedIntent.join(", ")
          : null
      );
      setRawResponse(response);
      setStatus("success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      setErrorMessage(message);
      setStatus("error");
    }
  };

  const handleSubmit = (event) => {
    console.log("Form submitted");
    console.log(window.openai);


    event.preventDefault();
    handleCheck(domain);
  };

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
          <h1>Radar Lite Intent Demo</h1>
          <p>Enter a domain to call the Radar Lite intent API.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            autoComplete="off"
            aria-label="Domain to inspect"
          />
          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Checking…" : "Check intent"}
          </button>
        </form>

        {status === "loading" && (
          <div className="radar-lite-status radar-lite-loading">
            Requesting intent…
          </div>
        )}

        {status === "error" && errorMessage && (
          <div className="radar-lite-status radar-lite-error">
            {errorMessage}
          </div>
        )}

        {status === "success" && (
          <div className="radar-lite-result">
            <div>
              <h2>Detected intent</h2>
              <p>{intent ?? "No intent returned."}</p>
            </div>
            <div>
              <h2>Raw response</h2>
              <pre>{JSON.stringify(rawResponse, null, 2)}</pre>
            </div>
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
