const DEFAULT_HOST = "https://radar-lite.redsift.cloud/web";

const host =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_RADAR_LITE_HOST
    ? import.meta.env.VITE_RADAR_LITE_HOST
    : DEFAULT_HOST;

/**
 * Calls the Radar Lite intent endpoint with the provided domain.
 */
export async function queryRadarLiteIntent(domain) {
  const payload = { query: domain };

  const response = await fetch(`${host}/api/radar-lite/query`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message);
  }

  return await response.json();
}

/**
 * Executes the follow-up tool-calls pipeline once an intent payload is available.
 */
export async function executeRadarLiteToolCalls(payload) {
  const response = await fetch(`${host}/api/radar-lite/tool-calls`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message);
  }

  return await response.json();
}

/**
 * Hits the summarise endpoint so we can show a conversational recap in the UI.
 */
export async function summarizeRadarLiteResults(
  toolResults,
  query,
  userIntent
) {
  const sanitizedResults = sanitizeInputResults(toolResults);

  const payload = {
    content: { results: sanitizedResults },
    userIntent: userIntent ?? {},
    query,
    toolCalls: toolResults,
  };

  const localEndpoint = "/api/local-summarise";
  try {
    return await postSummary(localEndpoint, payload);
  } catch (error) {
    console.warn("Local summarise endpoint failed, falling back to host", error);
  }

  return await postSummary(`${host}/api/radar-lite/summarise`, payload);
}

async function postSummary(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message);
  }

  return await response.json();
}

function sanitizeInputResults(toolResults) {
  if (!toolResults || typeof toolResults !== "object") {
    return [];
  }

  const candidate = toolResults?.inputResults;
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.map((result) => {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return result;
    }

    const clone = { ...result };
    if (
      clone.assessment &&
      typeof clone.assessment === "object" &&
      !Array.isArray(clone.assessment)
    ) {
      const { all_tests: _ignoredAll, good_tests: _ignoredGood, ...rest } =
        clone.assessment;
      clone.assessment = { ...rest };
    }

    return clone;
  });
}

async function safeReadError(response) {
  const fallback = `Request failed with status ${response.status}`;

  try {
    const data = await response.json();
    if (typeof data === "object" && data !== null) {
      const message = data.message;
      if (message) {
        return message;
      }
    }
  } catch (error) {
    console.warn("Failed to parse error response", error);
  }

  return fallback;
}
