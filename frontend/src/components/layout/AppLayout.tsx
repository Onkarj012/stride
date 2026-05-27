import type { ReactNode } from "react";
import { DesktopSidebar } from "@/components/layout/DesktopSidebar";

type AppLayoutProps = {
  children: ReactNode;
  onAskStride?: () => void;
};

export function AppLayout({ children, onAskStride }: AppLayoutProps) {
  return (
    <div className="min-h-dvh w-full bg-bg">
      <div className="flex min-h-dvh">
        <DesktopSidebar onAskStride={onAskStride} />

        <main
          className="
            flex-1 min-w-0
            px-5 pt-[max(env(safe-area-inset-top),16px)]
            pb-[max(calc(env(safe-area-inset-bottom)+7rem),7rem)]
            lg:px-10 lg:py-10 lg:pb-12
          "
        >
          {/* No max-w cap — let pages control their own width */}
          {children}
        </main>
      </div>
    </div>
  );
}
