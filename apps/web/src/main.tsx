import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import * as Sentry from "@sentry/react";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { reportException } from "./lib/observability";
import "./styles/global.css";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const APP_VERSION = (import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_COMMIT_SHA) as string | undefined;
const SENTRY_SENSITIVE_KEY = /message|image|nutrition|health|payload|body|content|data|prompt|response|food|meal|workout/i;
const SENTRY_MAX_STRING_LENGTH = 200;

function scrubSentryValue(value: unknown, key?: string): unknown {
  if (key && SENTRY_SENSITIVE_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") return value.length > SENTRY_MAX_STRING_LENGTH ? "[redacted large string]" : value;
  if (Array.isArray(value)) return value.map((item) => scrubSentryValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, scrubSentryValue(childValue, childKey)]));
  }
  return value;
}

function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const scrubbed = scrubSentryValue(event) as Sentry.ErrorEvent;
  if (scrubbed.request) {
    scrubbed.request.data = "[redacted]";
    (scrubbed.request as Sentry.RequestEventData & { body?: unknown }).body = "[redacted]";
  }
  return scrubbed;
}

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: APP_VERSION,
    initialScope: {
      tags: {
        environment: import.meta.env.MODE,
        ...(APP_VERSION ? { release: APP_VERSION } : {}),
      },
    },
    beforeSend: scrubSentryEvent,
  });
}

window.addEventListener("error", (event) => {
  reportException(event.error ?? new Error(event.message || "Unhandled window error"), "window_error");
});
window.addEventListener("unhandledrejection", (event) => {
  reportException(event.reason, "unhandled_rejection");
});

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

if (!CLERK_PUBLISHABLE_KEY) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env.local");
if (!CONVEX_URL) throw new Error("Missing VITE_CONVEX_URL in .env.local");

const convex = new ConvexReactClient(CONVEX_URL);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <ClerkProvider
          publishableKey={CLERK_PUBLISHABLE_KEY}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <App />
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
