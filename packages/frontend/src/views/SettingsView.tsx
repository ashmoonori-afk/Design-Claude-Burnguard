import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "@/state/uiStore";

/**
 * `/settings` is a convenience route that opens the SettingsModal then
 * returns to home. The modal lives globally in App.tsx.
 */
export default function SettingsView() {
  const navigate = useNavigate();
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  useEffect(() => {
    setSettingsOpen(true);
    navigate("/", { replace: true });
  }, [navigate, setSettingsOpen]);

  return null;
}
