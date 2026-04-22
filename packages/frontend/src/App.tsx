import { Routes, Route } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import HomeView from "@/views/HomeView";
import ProjectView from "@/views/ProjectView";
import DesignSystemView from "@/views/DesignSystemView";
import SettingsView from "@/views/SettingsView";
import SettingsModal from "@/components/settings/SettingsModal";
import ToastContainer from "@/components/errors/BackendCrashToast";

export default function App() {
  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/projects/:id" element={<ProjectView />} />
          <Route path="/systems/:id" element={<DesignSystemView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </AppShell>
      <SettingsModal />
      <ToastContainer />
    </>
  );
}
