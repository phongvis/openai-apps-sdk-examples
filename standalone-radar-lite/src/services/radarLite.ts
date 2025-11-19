type RadarLiteIntentPayload = {
  query: string;
};

type RadarLiteIntentResponse = {
  data?: {
    intent?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const DEFAULT_HOST = 'https://radar-lite.redsift.cloud/web';

const host = (import.meta.env?.VITE_RADAR_LITE_HOST as string | undefined) ?? DEFAULT_HOST;

/**
 * Calls the Radar Lite intent endpoint with the provided domain.
 */
export async function queryRadarLiteIntent(
  domain: string
): Promise<RadarLiteIntentResponse> {
  const payload: RadarLiteIntentPayload = { query: domain };

  const response = await fetch(`${host}/api/radar-lite/query`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message);
  }

  return (await response.json()) as RadarLiteIntentResponse;
}

async function safeReadError(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}`;

  try {
    const data = await response.json();
    if (typeof data === 'object' && data !== null) {
      const message = (data as { message?: string }).message;
      if (message) {
        return message;
      }
    }
  } catch (error) {
    console.warn('Failed to parse error response', error);
  }

  return fallback;
}
