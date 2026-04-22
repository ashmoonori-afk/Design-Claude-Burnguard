import type {
  BackendId,
  DesignSystemStatus,
  ProjectType,
  ThemeMode,
} from "./app";

export interface ProjectSummary {
  id: string;
  name: string;
  type: ProjectType;
  design_system_id: string | null;
  design_system_name: string | null;
  thumbnail_path: string | null;
  updated_at: number;
  archived_at: number | null;
}

export interface DesignSystemSummary {
  id: string;
  name: string;
  status: DesignSystemStatus;
  is_template: boolean;
  thumbnail_path: string | null;
  updated_at: number;
}

export interface CreateProjectRequest {
  name: string;
  type: ProjectType;
  design_system_id: string | null;
  backend_id: BackendId;
  options?: {
    use_speaker_notes?: boolean;
    copy_as_is?: boolean;
  };
}

export interface CreateProjectResponse {
  id: string;
  session_id: string;
  dir_path: string;
  entrypoint: string;
}

export interface BackendDetection {
  id: BackendId;
  found: boolean;
  version?: string;
  binary_path?: string;
  install_hint?: string;
}

export interface BackendDetectionResult {
  backends: BackendDetection[];
}

export interface SettingsSummary {
  user: {
    id: "local";
    display_name: string;
  };
  app_version: string;
  default_backend: BackendId;
  theme: ThemeMode;
}

export type SettingsPatch = Partial<
  Pick<SettingsSummary, "default_backend" | "theme"> & {
    user: Partial<SettingsSummary["user"]>;
  }
>;
