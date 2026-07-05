import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { DesktopSidebar } from "@/components/layout/DesktopSidebar";
import { RightPanel } from "@/components/layout/RightPanel";

type AppLayoutProps = {
  children: ReactNode;
  onAskStride?: () => void;
};

export function AppLayout({ children, onAskStride }: AppLayoutProps) {
  const { pathname } = useLocation();
  const showDayRail = pathname === "/" || pathname.startsWith("/nutrition") || pathname.startsWith("/workouts");
  const chatLike = pathname === "/" || pathname.startsWith("/coach");

  return (
    <div className="h-dvh w-full overflow-hidden bg-bg">
      <div className="flex h-dvh">
        <div className="hidden lg:block">
          <DesktopSidebar onAskStride={onAskStride} />
        </div>

        <main
          className="
            flex-1 min-w-0 overflow-x-hidden lg:overflow-x-hidden
            p-0
            lg:px-10 lg:py-10 lg:pb-12
          "
          style={{ overflowY: chatLike ? "hidden" : "auto" }}
        >
          {children}
        </main>

        {showDayRail && (
          <div className="hidden lg:block">
            <RightPanel />
          </div>
        )}
      </div>
    </div>
  );
}
