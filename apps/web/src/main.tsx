import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles/global.css";

// Installable PWA: register the generated service worker. registerType is
// "autoUpdate": when a new build's SW activates (isUpdate/isExternal), the
// register client calls window.location.reload() — a forced full-page
// reload, including tabs where the update was detected by another tab.
// No update prompt/UI for v1.
registerSW({ immediate: true });

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

if (!CLERK_PUBLISHABLE_KEY) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env.local");
if (!CONVEX_URL) throw new Error("Missing VITE_CONVEX_URL in .env.local");

const convex = new ConvexReactClient(CONVEX_URL);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
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
  </StrictMode>,
);
