import { FormEvent, useCallback, useState } from 'react';
import TreeVisualizationComponent from './components/TreeVisualizationComponent';
import QueryHeader from './components/QueryHeader';
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

type AnalysisContext = {
  intent: string | null;
  scope: string | null;
  inputs: string[];
  industry: string | null;
};

const SAMPLE_SUMMARY_TEXT = `Below is a sample response for redsift.com

The email security posture for redsift.com is generally strong, with key protections such as DMARC, SPF, MTA-STS, TLS Reporting, and BIMI properly implemented, enhancing deliverability and defense against phishing and spoofing attacks.

DMARC for redsift.com is configured with a strict “reject” policy at 100%, covering both main and subdomains. This ensures unauthorized emails are blocked, which significantly mitigates phishing risk. However, some DMARC tags like ‘pct’, ‘ri’, and ‘rf’ are marked for removal in upcoming DMARC RFC updates, so the policy should be reviewed and updated accordingly to maintain compliance.

SPF is present but with a “softfail” (~all) at the end, meaning non-authorized sources are flagged but not outright rejected. While the SPF record includes multiple nested includes covering authorized mail sources (including Google Workspace and Salesforce), the “~all” qualifier is less strict than “-all” and may allow some spoofed mail to pass SPF checks, potentially weakening protection.

MTA-STS is enforced, securing SMTP connections and preventing downgrade attacks. TLS Reporting is also configured, helping to monitor and respond to TLS failures.

BIMI is implemented with a validated Verified Mark Certificate, enhancing brand visibility and trust in email communications.

Overall, the strongest concern is the SPF policy’s use of a softfail, which could be hardened for tighter security. Additionally, reviewing DMARC to align with evolving standards will sustain long-term protection.`;

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
  const shouldRenderResultCard =
    shouldShowTree || hasSummaryText || hasSummaryError;

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

      setSummaryText(SAMPLE_SUMMARY_TEXT);
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
              <div>
                <h2>Summary</h2>
                <p style={{ whiteSpace: 'pre-line' }}>{summaryText}</p>
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
