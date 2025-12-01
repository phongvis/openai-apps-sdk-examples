import { FormEvent, useCallback, useMemo, useState } from 'react';
import TreeVisualizationComponent from './components/TreeVisualizationComponent';
import QueryHeader from './components/QueryHeader';
import {
  executeRadarLiteToolCalls,
  queryRadarLiteIntent,
} from './services/radarLite';
import { RequestStatus } from './types';
import SecurityPostureSummary, {
  RadarInputResult,
} from './components/security/SecurityPostureSummary';

type IntentApiResponse = Awaited<ReturnType<typeof queryRadarLiteIntent>>;

type IntentPayload = {
  intent?: string;
  [key: string]: unknown;
};

type AnalysisContext = {
  intent: string | null;
  scope: string | null;
  inputs: string[];
  industry: string | null;
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

const extractInputsFromPayload = (payload: IntentPayload | null): string[] => {
  if (!payload) {
    return [];
  }

  const rawInputs = (payload as { inputs?: unknown }).inputs;
  if (Array.isArray(rawInputs)) {
    return rawInputs.filter(
      (input): input is string => typeof input === 'string'
    );
  }

  if (typeof rawInputs === 'string') {
    return [rawInputs];
  }

  return [];
};

const extractScopeFromPayload = (
  payload: IntentPayload | null
): string | null => {
  if (!payload) {
    return null;
  }

  const scopeCandidate = (payload as { scope?: unknown }).scope;
  return typeof scopeCandidate === 'string' ? scopeCandidate : null;
};

const normalizeIndustryValue = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === 'unknown' || lowered === 'irrelevance') {
    return null;
  }

  return trimmed;
};

const extractIndustryFromResults = (
  toolCallResults: unknown
): string | null => {
  if (!toolCallResults || typeof toolCallResults !== 'object') {
    return null;
  }

  const candidate = toolCallResults as { inputResults?: unknown };
  const inputResults = Array.isArray(candidate.inputResults)
    ? candidate.inputResults
    : null;

  if (!inputResults) {
    return null;
  }

  for (const entry of inputResults) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const record = entry as {
      industry?: unknown;
      metadata?: { industry?: unknown };
      assessment?: { industry?: unknown };
    };

    const directIndustry = normalizeIndustryValue(record.industry);
    if (directIndustry) {
      return directIndustry;
    }

    const metadataIndustry = normalizeIndustryValue(record.metadata?.industry);
    if (metadataIndustry) {
      return metadataIndustry;
    }

    const assessmentIndustry = normalizeIndustryValue(
      record.assessment?.industry
    );
    if (assessmentIndustry) {
      return assessmentIndustry;
    }
  }

  return null;
};

const extractInputResults = (rawResults: unknown): RadarInputResult[] => {
  const normalizeList = (value: unknown): RadarInputResult[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is RadarInputResult => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }

      const candidate = entry as RadarInputResult;
      const scores = candidate.assessment?.scores;
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

  if (typeof rawResults === 'object') {
    const candidate = rawResults as {
      inputResults?: unknown;
      results?: unknown;
    };

    const direct = normalizeList(candidate.inputResults);
    if (direct.length > 0) {
      return direct;
    }

    if (
      candidate.results &&
      typeof candidate.results === 'object' &&
      !Array.isArray(candidate.results)
    ) {
      const nested = candidate.results as { inputResults?: unknown };
      const nestedList = normalizeList(nested.inputResults);
      if (nestedList.length > 0) {
        return nestedList;
      }
    }
  }

  return [];
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
  const [analysisContext, setAnalysisContext] =
    useState<AnalysisContext | null>(null);
  const [rawResults, setRawResults] = useState<unknown>(null);
  const securityInputResults = useMemo(
    () => extractInputResults(rawResults),
    [rawResults]
  );

  const shouldShowTree =
    status === 'success' &&
    (toolStatus === 'loading' || summaryStatus === 'loading');
  const hasSummaryText = summaryStatus === 'success' && Boolean(summaryText);
  const hasSummaryError = summaryStatus === 'error' && Boolean(summaryError);
  const trimmedRequest = request.trim();
  const fallbackHeaderContext: AnalysisContext | null =
    status !== 'idle'
      ? {
          intent: null,
          scope: null,
          inputs: trimmedRequest ? [trimmedRequest] : [],
          industry: null,
        }
      : null;
  const headerContext = analysisContext ?? fallbackHeaderContext;
  const securityInputs = headerContext?.inputs ?? [];
  const shouldRenderResultCard =
    shouldShowTree || hasSummaryText || hasSummaryError;
  const shouldShowSecuritySummary = securityInputResults.length > 0;
  const derivedIndustry = analysisContext?.industry ?? null;

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

  const summarizeToolCalls = useCallback(
    async (payload: IntentPayload, query: string, toolCalls: unknown) => {
      void payload;
      void query;
      void toolCalls;
      setSummaryStatus('loading');
      setSummaryError(null);
      setSummaryText(null);
      setRawResults(null);

      // Placeholder summary while the remote summarise API is unavailable.
      setSummaryText('Unable to call summary API, showing raw results.');
      setRawResults(toolCalls);
      setSummaryStatus('success');
    },
    []
  );

  const runToolCalls = useCallback(
    async (payload: IntentPayload | null, originalQuery: string) => {
      if (!payload) {
        setToolStatus('error');
        setSummaryStatus('idle');
        setSummaryError('Tool-call payload missing from intent response.');
        return;
      }

      const normalizedIntent =
        typeof payload.intent === 'string'
          ? payload.intent.toUpperCase()
          : null;

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
      setRawResults(null);

      try {
        const toolResponse = await executeRadarLiteToolCalls(payload);
        const extractedResults = extractToolCallResults(toolResponse);
        setRawResults(extractedResults);
        setToolStatus('success');

        const derivedIndustry = extractIndustryFromResults(extractedResults);
        if (derivedIndustry) {
          setAnalysisContext((previous) => {
            if (previous) {
              return { ...previous, industry: derivedIndustry };
            }

            return {
              intent:
                typeof payload.intent === 'string' ? payload.intent : null,
              scope: extractScopeFromPayload(payload),
              inputs: extractInputsFromPayload(payload),
              industry: derivedIndustry,
            };
          });
        }

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
    },
    [summarizeToolCalls]
  );

  const runAnalysis = useCallback(
    async (query: string) => {
      const trimmed = query.trim();

      if (!trimmed) {
        setErrorMessage('Please enter a request.');
        setStatus('error');
        return;
      }

      setStatus('loading');
      setErrorMessage(null);
      setIntent(null);
      setAnalysisContext(null);
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
        if (payloadForToolCalls) {
          const derivedInputs = extractInputsFromPayload(payloadForToolCalls);
          const derivedScope = extractScopeFromPayload(payloadForToolCalls);
          const derivedIntentValue =
            typeof payloadForToolCalls.intent === 'string'
              ? payloadForToolCalls.intent
              : typeof detectedIntent === 'string'
              ? detectedIntent
              : null;

          setAnalysisContext({
            intent: derivedIntentValue,
            scope: derivedScope,
            inputs: derivedInputs,
            industry: null,
          });
        }

        void runToolCalls(payloadForToolCalls, trimmed);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred';
        setErrorMessage(message);
        setStatus('error');
      }
    },
    [runToolCalls]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = request.trim();

    if (!trimmed) {
      setErrorMessage('Please enter a request.');
      setStatus('error');
      return;
    }

    setErrorMessage(null);
    void runAnalysis(trimmed);
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

        {headerContext && (
          <QueryHeader
            intent={headerContext.intent}
            scope={headerContext.scope}
            inputs={headerContext.inputs}
            industry={headerContext.industry}
          />
        )}

        {shouldRenderResultCard && (
          <div className="result">
            {shouldShowTree && (
              <div className="tree-inline">
                <TreeVisualizationComponent
                  intent={intent}
                  analysisPhase={getTreePhase()}
                />
              </div>
            )}
            {hasSummaryText && (
              <div className="summary-section">
                <h2>Summary</h2>
                <div
                  className={
                    shouldShowSecuritySummary
                      ? 'summary-grid summary-grid--with-chart'
                      : 'summary-grid'
                  }
                >
                  <div className="summary-grid__text">
                    <p>{summaryText}</p>
                    {rawResults ? (
                      <details>
                        <summary>Raw results</summary>
                        <pre>
                          {(() => {
                            try {
                              return JSON.stringify(rawResults, null, 2);
                            } catch (error) {
                              console.warn(
                                'Failed to stringify raw results',
                                error
                              );
                              return 'Unable to display raw results.';
                            }
                          })()}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                  {shouldShowSecuritySummary && (
                    <div className="summary-grid__chart">
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
            {!hasSummaryText && shouldShowSecuritySummary && (
              <SecurityPostureSummary
                inputs={securityInputs}
                inputResults={securityInputResults}
                fallbackIndustry={derivedIndustry}
              />
            )}
            {hasSummaryError && (
              <div className="status error">{summaryError}</div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
