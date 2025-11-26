import { useCallback, useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      appearance?: string;
      callback: (token: string) => void;
      'error-callback'?: (errorCode: number) => void;
    }
  ) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const errorMessages: Record<number, string> = {
  100000: 'Initialization error – retry in a few seconds.',
  110200: 'This domain is not allowed for the current site key.',
  110500: 'Unsupported browser detected.',
  110600: 'Challenge timed out. Please try again.',
  200010: 'Turnstile resources were cached incorrectly. Clear cache and retry.',
  300000: 'Challenge failed. Please try again.',
};

const resolveErrorMessage = (code: number): string => {
  const key = Math.floor(code / 100000) * 100000;
  return errorMessages[code] || errorMessages[key] || 'Verification failed.';
};

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const TURNSTILE_APPEARANCE = 'interaction-only';

if (!TURNSTILE_SITE_KEY) {
  throw new Error(
    'VITE_TURNSTILE_SITE_KEY is not configured. Add it to your .env file to enable Turnstile verification.'
  );
}

const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const useTurnstile = () => {
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [widgetId, setWidgetId] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [attemptRender, setAttemptRender] = useState(false);

  const loadScript = useCallback(() => {
    if (typeof window === 'undefined' || scriptLoaded) {
      return;
    }

    const existingScript = document.querySelector(
      'script[data-turnstile]'
    ) as HTMLScriptElement | null;

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        setScriptLoaded(true);
        return;
      }

      existingScript.addEventListener(
        'load',
        () => {
          existingScript.dataset.loaded = 'true';
          setScriptLoaded(true);
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.turnstile = 'true';
    script.onload = () => {
      script.dataset.loaded = 'true';
      setScriptLoaded(true);
    };
    script.onerror = () =>
      setTurnstileError('Unable to load verification script.');
    document.body.appendChild(script);
  }, [scriptLoaded]);

  useEffect(() => {
    loadScript();
  }, [loadScript]);

  const renderTurnstile = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!scriptLoaded || !window.turnstile || !turnstileRef.current) {
      setAttemptRender(true);
      if (!scriptLoaded) {
        loadScript();
      }
      return;
    }

    try {
      const id = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: TURNSTILE_APPEARANCE,
        callback: (token: string) => {
          setTurnstileToken(token);
          setTurnstileError(null);
        },
        'error-callback': (errorCode: number) => {
          setTurnstileError(resolveErrorMessage(errorCode));
          setTurnstileToken(null);
        },
      });

      if (id) {
        setWidgetId(id);
      }
      setAttemptRender(false);
    } catch (error) {
      console.error('Turnstile render failed', error);
      setTurnstileError('Failed to render verification widget.');
    }
  }, [loadScript, scriptLoaded]);

  useEffect(() => {
    if (attemptRender && scriptLoaded) {
      renderTurnstile();
    }
  }, [attemptRender, renderTurnstile, scriptLoaded]);

  const resetWidget = useCallback(() => {
    if (typeof window !== 'undefined' && window.turnstile) {
      if (widgetId) {
        window.turnstile.remove?.(widgetId);
      } else {
        window.turnstile.remove?.();
      }
    }

    setWidgetId(null);
    setTurnstileToken(null);
    setTurnstileError(null);
  }, [widgetId]);

  return {
    turnstileRef,
    turnstileToken,
    turnstileError,
    renderTurnstile,
    resetWidget,
  };
};

export default useTurnstile;
