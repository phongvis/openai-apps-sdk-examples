import { FormEvent, useState } from 'react';
import { queryRadarLiteIntent } from './services/radarLite';

export default function App() {
  const [domain, setDomain] = useState('redsift.com');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  );
  const [intent, setIntent] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const host = import.meta.env.VITE_RADAR_LITE_HOST ?? 'https://radar-lite.redsift.cloud/web';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = domain.trim();

    if (!trimmed) {
      setErrorMessage('Please enter a domain.');
      setStatus('error');
      return;
    }

    setStatus('loading');
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
        typeof detectedIntent === 'string'
          ? detectedIntent
          : Array.isArray(detectedIntent)
          ? detectedIntent.join(', ')
          : null
      );
      setRawResponse(response);
      setStatus('success');
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
          <h1>Radar Lite Intent Demo</h1>
          <p>
            Enter a domain to call the Radar Lite intent API. Requests are sent to
            <code> {host}</code>.
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            autoComplete="off"
            aria-label="Domain to inspect"
          />
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Checking…' : 'Check intent'}
          </button>
        </form>

        {status === 'loading' && (
          <div className="status loading">Requesting intent…</div>
        )}

        {status === 'error' && errorMessage && (
          <div className="status error">{errorMessage}</div>
        )}

        {status === 'success' && (
          <div className="result">
            <div>
              <h2>Detected intent</h2>
              <p>{intent ?? 'No intent returned.'}</p>
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
