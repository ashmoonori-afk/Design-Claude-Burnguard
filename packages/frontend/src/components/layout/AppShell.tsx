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
      <div className="flex-1 flex min-h-0">
        {isHome && <Sidebar />}
        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      </div>
    </div>
  );
}
