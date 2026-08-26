import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isProject = location.pathname.startsWith("/projects/");

  // The project route is an app surface, not a document: it is capped to the
  // viewport so the top bar and every panel header stay put and each pane owns
  // its own scrollport. Document-shaped routes (home, settings, systems) keep
  // page scrolling.
  return (
    <div
      className={cn(
        "bg-background text-foreground flex flex-col",
        isProject ? "h-dvh overflow-hidden" : "min-h-screen",
      )}
    >
      {!isHome && !isProject && <TopBar />}
      <div
        className={cn(
          "flex min-h-0 flex-1 max-[900px]:flex-col",
          isProject ? "overflow-hidden" : "max-[900px]:overflow-y-auto",
        )}
      >
        {isHome && <Sidebar />}
        <main
          className={cn(
            "min-w-0 flex-1 max-[900px]:order-1 flex flex-col",
            isProject && "min-h-0 overflow-hidden",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
