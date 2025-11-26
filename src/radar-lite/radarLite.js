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
