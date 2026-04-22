import type { BackendId } from "./app";
import type { ProjectSummary } from "./home";
import type { SessionStatus } from "./harness";

export interface ProjectDetail extends ProjectSummary {
  dir_path: string;
  entrypoint: string;
  backend_id: BackendId;
  options_json: string | null;
}

export interface SessionInfo {
  id: string;
  project_id: string;
  backend_id: BackendId;
  status: SessionStatus;
  usage: {
    input: number;
    output: number;
    cached: number;
    cache_write: number;
  };
  updated_at: number;
  last_active_at: number;
}
