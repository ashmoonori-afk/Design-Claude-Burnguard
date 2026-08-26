import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isProject = location.pathname.startsWith("/projects/");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!isHome && !isProject && <TopBar />}
      <div className="flex min-h-0 flex-1 max-[900px]:flex-col max-[900px]:overflow-y-auto">
        {isHome && <Sidebar />}
        <main className="min-w-0 flex-1 max-[900px]:order-1 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
