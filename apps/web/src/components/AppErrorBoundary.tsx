import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportException } from "@/lib/observability";

type Props = { children: ReactNode };
type State = { hasError: boolean };

// Catches render errors anywhere in the app, reports them, and offers a reload.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportException(error, "react_error_boundary");
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-ink">
        <section role="alert" className="w-full max-w-md rounded-card bg-card p-8 text-center shadow-card">
          <p className="type-card-title">Something went wrong — reload</p>
          <p className="mt-2 type-callout text-ink2">Stride hit an unexpected problem. Reload the page to try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-pill bg-polo px-5 type-button text-on-polo transition hover:brightness-105"
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}
