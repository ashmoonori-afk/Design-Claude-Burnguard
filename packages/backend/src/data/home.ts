import type {
  BackendDetectionResult,
  CreateProjectResponse,
  DesignSystemSummary,
  ProjectSummary,
} from "@bg/shared";
import backendDetectionFixture from "../fixtures/backends-detect.json";
import createProjectFixture from "../fixtures/create-project-response.json";
import designSystemFixture from "../fixtures/design-systems-list.json";
import projectFixture from "../fixtures/projects-list.json";

export const homeProjectFixtures = projectFixture as ProjectSummary[];
export const homeDesignSystemFixtures = designSystemFixture as DesignSystemSummary[];
export const homeCreateProjectFixture =
  createProjectFixture as CreateProjectResponse;
export const homeBackendDetectionFixture =
  backendDetectionFixture as BackendDetectionResult;
