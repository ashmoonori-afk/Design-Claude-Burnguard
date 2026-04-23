import type {
  BackendDetectionResult,
  DesignSystemSummary,
  ProjectSummary,
  SettingsSummary,
} from "@bg/shared";

/**
 * Mirrors `packages/backend/src/fixtures/projects-list.json` after the
 * backend's archived filter (`archived_at !== null` is dropped server-side
 * in GET /api/projects). Keeping bytes-for-bytes parity makes the switch
 * from inline mocks to `fetch("/api/projects")` a single-line change.
 */
export const mockProjects: ProjectSummary[] = [
  {
    id: "01J8F9H1A0RECENTPROJ000001",
    name: "Series A Investor Landing",
    type: "prototype",
    design_system_id: "goldman-sachs",
    design_system_name: "Goldman Sachs Design System",
    thumbnail_path: "/fixtures/thumbnails/investor-landing.png",
    updated_at: 1713751200000,
    archived_at: null,
  },
  {
    id: "01J8F9H1A0RECENTPROJ000002",
    name: "Quarterly Review Deck",
    type: "slide_deck",
    design_system_id: "goldman-sachs",
    design_system_name: "Goldman Sachs Design System",
    thumbnail_path: "/fixtures/thumbnails/qr-deck.png",
    updated_at: 1713747600000,
    archived_at: null,
  },
  {
    id: "01J8F9H1A0RECENTPROJ000003",
    name: "Toss Template Landing",
    type: "from_template",
    design_system_id: "toss",
    design_system_name: "Toss Design System",
    thumbnail_path: "/fixtures/thumbnails/toss-template.png",
    updated_at: 1713661200000,
    archived_at: null,
  },
  {
    id: "01J8F9H1A0RECENTPROJ000004",
    name: "Portfolio Playground",
    type: "other",
    design_system_id: null,
    design_system_name: null,
    thumbnail_path: null,
    updated_at: 1713574800000,
    archived_at: null,
  },
  {
    id: "01J8F9H1A0RECENTPROJ000005",
    name: "Market Update Microsite",
    type: "prototype",
    design_system_id: "salt",
    design_system_name: "Salt Design System",
    thumbnail_path: "/fixtures/thumbnails/market-update.png",
    updated_at: 1713488400000,
    archived_at: null,
  },
];

/**
 * Mirrors `packages/backend/src/fixtures/design-systems-list.json`.
 * Keeps all statuses; HomeView filters to `status === "published"` on its own,
 * matching GET /api/design-systems default behavior.
 */
export const mockDesignSystems: DesignSystemSummary[] = [
  {
    id: "goldman-sachs",
    name: "Goldman Sachs Design System",
    status: "published",
    is_template: false,
    thumbnail_path: "/fixtures/thumbnails/goldman-sachs.png",
    updated_at: 1713751200000,
  },
  {
    id: "toss",
    name: "Toss Design System",
    status: "published",
    is_template: true,
    thumbnail_path: "/fixtures/thumbnails/toss.png",
    updated_at: 1713664800000,
  },
  {
    id: "salt",
    name: "Salt Design System",
    status: "review",
    is_template: false,
    thumbnail_path: "/fixtures/thumbnails/salt.png",
    updated_at: 1713578400000,
  },
  {
    id: "internal-labs",
    name: "Internal Labs System",
    status: "draft",
    is_template: false,
    thumbnail_path: null,
    updated_at: 1713492000000,
  },
];

export const mockBackendDetection: BackendDetectionResult = {
  backends: [
    {
      id: "claude-code",
      found: true,
      version: "1.0.23",
      binary_path: "C:/Users/lg/AppData/Roaming/npm/claude.cmd",
    },
    {
      id: "codex",
      found: false,
      install_hint: "Install from https://github.com/openai/codex",
    },
  ],
};

export const mockSettings: SettingsSummary = {
  user: { id: "local", display_name: "You" },
  app_version: "0.4.0",
  default_backend: "claude-code",
  theme: "light",
};
