import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "@fontsource-variable/dm-sans";
import "@fontsource/libre-bodoni/400.css";
import "@fontsource/libre-bodoni/600.css";
import App from "./App";
import "./theme.css";
import "./styles.css";
import { analyticsEvents } from "./lib/analytics";

// Boot-time analytics pageview (no-op when VITE_POSTHOG_KEY is unset).
analyticsEvents.pageView(typeof window !== "undefined" ? window.location.pathname : "/");

// Optional Sentry error tracking — set VITE_SENTRY_DSN to enable.
// @sentry/react is intentionally not listed in package.json; it's loaded at
// runtime only when the DSN env var is present, keeping the default bundle clean.
if (import.meta.env.VITE_SENTRY_DSN) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  ;(new Function("m", "return import(m)"))("@sentry/react")
    .then((sentry: { init: (o: object) => void; browserTracingIntegration: () => unknown }) => {
      sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN as string,
        integrations: [sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        environment: import.meta.env.MODE,
      });
    }).catch(() => { /* Sentry unavailable — no-op */ });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
