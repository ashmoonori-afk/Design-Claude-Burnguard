import type { DesignSystemSummary } from "./home";

export interface DesignSystemDetail extends DesignSystemSummary {
  description: string | null;
  source_type: "sample" | "github" | "figma" | "upload" | "manual" | null;
  source_uri: string | null;
  dir_path: string;
  skill_md_path: string | null;
  tokens_css_path: string | null;
  readme_md_path: string | null;
  archived_at: number | null;
}
