import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportException } from "@/lib/observability";

type Props = { children: ReactNode };
type State = { hasError: boolean };

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
      <main className="min-h-dvh flex items-center justify-center bg-bg px-6 text-text">
        <section role="alert" className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-elev)]">
          <p className="text-h2">Something went wrong — reload</p>
          <p className="mt-2 text-body-default text-text-muted">Stry hit an unexpected problem. Reload the page to try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-text-on-ink transition-opacity hover:opacity-90"
          >
            Reload
          </button>
        </section>
      </main>
    );
  }
}
