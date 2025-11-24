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

type RadarLiteToolCallsPayload = Record<string, unknown>;

type RadarLiteToolCallsResponse = {
  data?: {
    results?: unknown;
    [key: string]: unknown;
  };
  results?: unknown;
  [key: string]: unknown;
};

type RadarLiteSummaryResponse = {
  message?: string;
  uniqueId?: string;
  data?: {
    message?: string;
    uniqueId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const DEFAULT_HOST = 'https://radar-lite.redsift.cloud/web';

const host =
  (import.meta.env?.VITE_RADAR_LITE_HOST as string | undefined) ?? DEFAULT_HOST;

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
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message);
  }

  return (await response.json()) as RadarLiteIntentResponse;
}

/**
 * Runs the Radar Lite tool-call pipeline using the intent response payload.
 */
export async function executeRadarLiteToolCalls(
  payload: RadarLiteToolCallsPayload
): Promise<RadarLiteToolCallsResponse> {
  const response = await fetch(`${host}/api/radar-lite/tool-calls`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message);
  }

  return (await response.json()) as RadarLiteToolCallsResponse;
}

/**
 * Generates a concise AI summary for the completed tool-call results.
 */
export async function summarizeRadarLiteResults(
  toolResults: unknown,
  query: string,
  userIntent: Record<string, unknown> | null,
  turnstileToken?: string
): Promise<RadarLiteSummaryResponse> {
  const sanitizedResults = sanitizeInputResults(toolResults);

  const response = await fetch(`${host}/api/radar-lite/summarise`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: { results: sanitizedResults },
      userIntent: userIntent ?? {},
      query,
      toolCalls: toolResults,
      token: turnstileToken,
    }),
  });

  if (!response.ok) {
    const message = await safeReadError(response);
    throw new Error(message);
  }

  return (await response.json()) as RadarLiteSummaryResponse;
}

function sanitizeInputResults(toolResults: unknown): unknown[] {
  if (!toolResults || typeof toolResults !== 'object') {
    return [];
  }

  const candidate = toolResults as { inputResults?: unknown };
  if (!Array.isArray(candidate.inputResults)) {
    return [];
  }

  return candidate.inputResults.map((result) => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return result;
    }

    const resultObject = result as Record<string, unknown>;
    if (
      resultObject.assessment &&
      typeof resultObject.assessment === 'object' &&
      !Array.isArray(resultObject.assessment)
    ) {
      const assessment = resultObject.assessment as Record<string, unknown>;
      const {
        all_tests: ignoredAllTests,
        good_tests: ignoredGoodTests,
        ...rest
      } = assessment;

      // Explicitly acknowledge the discarded fields to satisfy linting rules.
      void ignoredAllTests;
      void ignoredGoodTests;
      return {
        ...resultObject,
        assessment: { ...rest },
      };
    }

    return { ...resultObject };
  });
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
