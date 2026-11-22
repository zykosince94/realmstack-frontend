import { createContext, useContext } from "react";
import type { Environment, Project } from "../api/types";

export type Notice = { kind: "success" | "error"; message: string };

/** The dashboard's screens (the sidebar order lives in App). */
export type ScreenId = "dashboard" | "players" | "economy" | "progression" | "leaderboards" | "stats" | "achievements" | "quests" | "ai" | "client" | "docs" | "settings";

/**
 * Everything a feature screen needs from the shell: who is signed in, which project
 * and environment are selected, the Test client's demo player, and the shared action
 * runner that owns busy/notice state.
 */
export type Workspace = {
  token: string;
  project: Project;
  environment: Environment;
  environments: Environment[];
  setProject: (project: Project) => void;
  setEnvironments: (environments: Environment[]) => void;
  onProjectArchived: () => void;
  /** Switches the dashboard to another screen, e.g. from the AI assistant to its settings. */
  openScreen: (screen: ScreenId) => void;
  demoPlayerId: string;
  setDemoPlayerId: (id: string) => void;
  demoPlayerToken: string;
  setDemoPlayerToken: (token: string) => void;
  busy: boolean;
  /** Runs one user action: sets busy, clears the notice, and reports failures. Never nest run inside run. */
  run: (work: () => Promise<void>) => Promise<void>;
  notify: (notice: Notice | null) => void;
  /** Reports a failed load; signs out when the dashboard session has expired. */
  reportError: (error: unknown, fallback: string) => void;
};

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace must be used inside a selected project and environment.");
  return workspace;
}
