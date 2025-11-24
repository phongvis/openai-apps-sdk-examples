import { FormEvent, useState } from 'react';
import TreeVisualizationComponent from './components/TreeVisualizationComponent';
import {
  executeRadarLiteToolCalls,
  queryRadarLiteIntent,
} from './services/radarLite';
import { RequestStatus } from './types';

type IntentApiResponse = Awaited<ReturnType<typeof queryRadarLiteIntent>>;

type IntentPayload = {
  intent?: string;
  [key: string]: unknown;
};

type SummaryRequestPayload = {
  query: string;
  toolCalls: unknown;
  userIntent: {
    intent: string;
    inputs: string[];
    scope: string;
  };
};

const extractIntentPayload = (
  response: IntentApiResponse | null
): IntentPayload | null => {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const { data } = response as { data?: unknown };

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as IntentPayload;
  }

  return response as IntentPayload;
};

const extractToolCallResults = (response: unknown): unknown => {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const candidate = response as { data?: unknown; results?: unknown };

  if (
    candidate.data &&
    typeof candidate.data === 'object' &&
    !Array.isArray(candidate.data)
  ) {
    const nested = candidate.data as { results?: unknown };
    if (
      nested.results &&
      typeof nested.results === 'object' &&
      !Array.isArray(nested.results)
    ) {
      return nested.results;
    }
    return nested;
  }

  if (
    candidate.results &&
    typeof candidate.results === 'object' &&
    !Array.isArray(candidate.results)
  ) {
    return candidate.results;
  }

  return response;
};

const safeReadJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('Failed to parse JSON response', error);
    return null;
  }
};

const buildSummaryRequest = (
  toolCallResults: unknown,
  payload: IntentPayload,
  query: string
): SummaryRequestPayload | null => {
  if (!toolCallResults || typeof toolCallResults !== 'object') {
    return null;
  }

  const rawInputs = (payload as { inputs?: unknown }).inputs;
  const inputs: string[] = Array.isArray(rawInputs)
    ? rawInputs.filter((item): item is string => typeof item === 'string')
    : typeof rawInputs === 'string'
    ? [rawInputs]
    : [];

  const scopeValue =
    typeof (payload as { scope?: unknown }).scope === 'string'
      ? ((payload as { scope?: string }).scope as string)
      : 'NONE';

  const intentValue =
    typeof payload.intent === 'string'
      ? payload.intent.toUpperCase()
      : 'INVALID';

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
  const [request, setRequest] = useState('');
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [intent, setIntent] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<RequestStatus>('idle');
  const [summaryStatus, setSummaryStatus] = useState<RequestStatus>('idle');
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const shouldShowTree =
    status === 'success' &&
    (toolStatus === 'loading' || summaryStatus === 'loading');
  const showCheckingBox =
    status === 'loading' ||
    toolStatus === 'loading' ||
    summaryStatus === 'loading';
  const shouldRenderResultCard = status !== 'idle';

  const getTreePhase = (): 'idle' | 'checking' | 'error' => {
    if (
      status === 'error' ||
      toolStatus === 'error' ||
      summaryStatus === 'error'
    ) {
      return 'error';
    }

    if (
      status === 'loading' ||
      toolStatus === 'loading' ||
      summaryStatus === 'loading'
    ) {
      return 'checking';
    }

    return 'idle';
  };

  const runToolCalls = async (
    payload: IntentPayload | null,
    originalQuery: string
  ) => {
    if (!payload) {
      setToolStatus('error');
      setSummaryStatus('idle');
      setSummaryError('Tool-call payload missing from intent response.');
      return;
    }

    const normalizedIntent =
      typeof payload.intent === 'string' ? payload.intent.toUpperCase() : null;

    if (normalizedIntent === 'INVALID') {
      setToolStatus('success');
      setSummaryStatus('idle');
      setSummaryText(null);
      setSummaryError(null);
      return;
    }

    setToolStatus('loading');
    setSummaryError(null);
    setSummaryStatus('idle');
    setSummaryText(null);

    try {
      const toolResponse = await executeRadarLiteToolCalls(payload);
      const extractedResults = extractToolCallResults(toolResponse);
      setToolStatus('success');

      if (payload && originalQuery && extractedResults) {
        void summarizeToolCalls(payload, originalQuery, extractedResults);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to run tool calls.';
      setToolStatus('error');
      setSummaryStatus('idle');
      setSummaryError(message);
    }
  };

  const summarizeToolCalls = async (
    payload: IntentPayload,
    query: string,
    toolCalls: unknown
  ) => {
    setSummaryStatus('loading');
    setSummaryError(null);
    setSummaryText(null);

    const summaryPayload = buildSummaryRequest(toolCalls, payload, query);

    if (!summaryPayload) {
      setSummaryStatus('error');
      setSummaryError('Summary payload was incomplete.');
      return;
    }

    try {
      const response = await fetch('/api/local-summarise', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(summaryPayload),
      });

      if (!response.ok) {
        const details = await safeReadJson(response);
        const message =
          (details as { error?: string })?.error ??
          `Summary request failed with ${response.status}`;
        throw new Error(message);
      }

      const json = (await safeReadJson(response)) as { message?: string };

      if (json?.message) {
        setSummaryText(json.message);
        setSummaryStatus('success');
        return;
      }

      throw new Error('Summary response was empty.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate summary.';
      setSummaryError(message);
      setSummaryStatus('error');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The input is a free-form user request that will be parsed for intent.
    const trimmed = request.trim();

    if (!trimmed) {
      setErrorMessage('Please enter a request.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);
    setIntent(null);
    setToolStatus('idle');
    setSummaryStatus('idle');
    setSummaryText(null);
    setSummaryError(null);

    try {
      const response = await queryRadarLiteIntent(trimmed);
      const normalizedResponse = response as Record<string, any>;
      const detectedIntent =
        normalizedResponse?.data?.intent ??
        normalizedResponse?.data?.results?.intent ??
        normalizedResponse?.intent ??
        normalizedResponse?.results?.intent ??
        null;

      setIntent(
        typeof detectedIntent === 'string'
          ? detectedIntent
          : Array.isArray(detectedIntent)
          ? detectedIntent.join(', ')
          : null
      );
      setStatus('success');

      const payloadForToolCalls = extractIntentPayload(response);
      void runToolCalls(payloadForToolCalls, trimmed);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      setErrorMessage(message);
      setStatus('error');
    }
  };

  return (
    <main>
      <section className="card">
        <header>
          <h1>Radar Lite</h1>
        </header>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Ask me about your domain security..."
            autoComplete="off"
            aria-label="Ask Radar Lite about your domain security"
          />
        </form>

        {status === 'error' && errorMessage && (
          <div className="status error">{errorMessage}</div>
        )}

        {shouldRenderResultCard && (
          <div className="result">
            {showCheckingBox && (
              <div>
                <h2>Evaluating security...</h2>
              </div>
            )}
            {shouldShowTree && (
              <div className="tree-inline">
                <TreeVisualizationComponent
                  intent={intent}
                  analysisPhase={getTreePhase()}
                />
              </div>
            )}
            {status === 'success' &&
              summaryStatus === 'success' &&
              summaryText && (
                <div>
                  <h2>Summary</h2>
                  <p>{summaryText}</p>
                </div>
              )}
            {summaryStatus === 'error' && summaryError && (
              <div className="status error">{summaryError}</div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
