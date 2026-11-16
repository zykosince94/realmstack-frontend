import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authHeaders, client, unwrap } from "../api/client";
import { useWorkspace } from "../app/workspace";

/**
 * Query keys. Server state lives in the TanStack Query cache, keyed by scope, so
 * switching project or environment never shows another scope's data, and a mutation
 * refreshes exactly what it changed by invalidating these keys.
 */
export const keys = {
  projects: (token: string) => ["projects", token] as const,
  environments: (token: string, projectId: string) => ["environments", token, projectId] as const,
  scope: (projectId: string, envId: string) => ["scope", projectId, envId] as const,
  draft: (projectId: string, envId: string) => ["scope", projectId, envId, "draft"] as const,
  published: (projectId: string, envId: string) => ["scope", projectId, envId, "published"] as const,
  credentials: (projectId: string, envId: string) => ["scope", projectId, envId, "credentials"] as const,
  achievementStats: (projectId: string, envId: string) => ["scope", projectId, envId, "achievement-stats"] as const,
  questStats: (projectId: string, envId: string) => ["scope", projectId, envId, "quest-stats"] as const,
  versions: (projectId: string, envId: string) => ["scope", projectId, envId, "versions"] as const,
  aiGenerations: (projectId: string, envId: string) => ["scope", projectId, envId, "ai-generations"] as const,
  aiGeneration: (projectId: string, envId: string, id: string) => ["scope", projectId, envId, "ai-generations", id] as const,
  // AI settings belong to the dashboard user, not to a project or environment.
  aiSettings: (token: string) => ["ai-settings", token] as const,
  player: (playerToken: string) => ["player", playerToken] as const,
  playerAchievements: (playerToken: string) => ["player", playerToken, "achievements"] as const,
  playerStats: (playerToken: string) => ["player", playerToken, "stats"] as const,
  playerQuests: (playerToken: string) => ["player", playerToken, "quests"] as const,
};

/** Reports a query's error once through the workspace (which handles expired sessions). */
export function useReportError(error: unknown, fallback: string) {
  const { reportError } = useWorkspace();
  useEffect(() => {
    if (error) reportError(error, fallback);
  }, [error, fallback, reportError]);
}

function useScopeParams() {
  const { token, project, environment } = useWorkspace();
  return { token, path: { projectId: project.id, envId: environment.id }, projectId: project.id, envId: environment.id };
}

/** The editable configuration draft. `data` is undefined until loaded, so nothing can save over it. */
export function useDraft() {
  const { token, path, projectId, envId } = useScopeParams();
  const query = useQuery({
    queryKey: keys.draft(projectId, envId),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/configurations/draft", { params: { path }, headers: authHeaders({ token }) }), token),
  });
  useReportError(query.error, "Could not load the configuration draft.");
  return query;
}

/** The live configuration that runtime APIs use. */
export function usePublished() {
  const { token, path, projectId, envId } = useScopeParams();
  const query = useQuery({
    queryKey: keys.published(projectId, envId),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/configurations/published", { params: { path }, headers: authHeaders({ token }) }), token),
  });
  useReportError(query.error, "Could not load the published configuration.");
  return query;
}

/**
 * Validates the stored draft. Its key sits under the draft key, so invalidating the
 * draft (after any edit) re-validates it.
 */
export function useDraftValidation() {
  const { token, path, projectId, envId } = useScopeParams();
  return useQuery({
    queryKey: [...keys.draft(projectId, envId), "validation"],
    queryFn: () => unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/configurations/validate", { params: { path }, headers: authHeaders({ token }) }), token),
  });
}

export function useCredentials() {
  const { token, path, projectId, envId } = useScopeParams();
  const query = useQuery({
    queryKey: keys.credentials(projectId, envId),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/credentials", { params: { path }, headers: authHeaders({ token }) }), token),
  });
  useReportError(query.error, "Could not load server credentials.");
  return query;
}

export function useAchievementStats() {
  const { token, path, projectId, envId } = useScopeParams();
  const query = useQuery({
    queryKey: keys.achievementStats(projectId, envId),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/achievements/stats", { params: { path }, headers: authHeaders({ token }) }), token),
  });
  useReportError(query.error, "Could not load achievement statistics.");
  return query;
}

export function useQuestStats() {
  const { token, path, projectId, envId } = useScopeParams();
  const query = useQuery({
    queryKey: keys.questStats(projectId, envId),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/quests/stats", { params: { path }, headers: authHeaders({ token }) }), token),
  });
  useReportError(query.error, "Could not load quest statistics.");
  return query;
}

/** Published configuration versions, newest first (for rollback). */
export function useVersions() {
  const { token, path, projectId, envId } = useScopeParams();
  const query = useQuery({
    queryKey: keys.versions(projectId, envId),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/configurations/versions", { params: { path }, headers: authHeaders({ token }) }), token),
  });
  useReportError(query.error, "Could not load configuration versions.");
  return query;
}

/**
 * The signed-in user's AI provider settings. A 503 AI_UNAVAILABLE means the assistant
 * is switched off on this deployment; callers show that state instead of an error, so
 * it is not retried and not reported.
 */
export function useAISettings() {
  const { token } = useWorkspace();
  return useQuery({
    queryKey: keys.aiSettings(token),
    retry: false,
    queryFn: () => unwrap(client.GET("/v1/ai/settings", { headers: authHeaders({ token }) }), token),
  });
}

export function useAIGenerations(enabled: boolean) {
  const { token, path, projectId, envId } = useScopeParams();
  return useQuery({
    queryKey: keys.aiGenerations(projectId, envId),
    enabled,
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/ai/generations", { params: { path }, headers: authHeaders({ token }) }), token),
  });
}

/** Statuses that are still changing; the dashboard polls while a generation has one. */
export const runningStatuses: readonly string[] = ["pending", "running"];

/** One generation, polled every 1.5 s while it runs (generations run in the background). */
export function useAIGeneration(id: string | null) {
  const { token, path, projectId, envId } = useScopeParams();
  return useQuery({
    queryKey: keys.aiGeneration(projectId, envId, id ?? ""),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data && runningStatuses.includes(query.state.data.status) ? 1500 : false),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/ai/generations/{id}", { params: { path: { ...path, id: id! } }, headers: authHeaders({ token }) }), token),
  });
}

/** The demo player's quest log, as a game client would see it. Disabled until a player signs in. */
export function usePlayerQuests() {
  const { demoPlayerToken } = useWorkspace();
  return useQuery({
    queryKey: keys.playerQuests(demoPlayerToken),
    enabled: demoPlayerToken !== "",
    queryFn: () => unwrap(client.GET("/v1/players/me/quests", { headers: authHeaders({ token: demoPlayerToken }) }), demoPlayerToken),
  });
}

/** The demo player's achievements (masked, as a game client would see them). Disabled until a player signs in. */
export function usePlayerAchievements() {
  const { demoPlayerToken } = useWorkspace();
  return useQuery({
    queryKey: keys.playerAchievements(demoPlayerToken),
    enabled: demoPlayerToken !== "",
    queryFn: () => unwrap(client.GET("/v1/players/me/achievements", { headers: authHeaders({ token: demoPlayerToken }) }), demoPlayerToken),
  });
}

/** The demo player's counters and flags. Disabled until a player signs in. */
export function usePlayerStats() {
  const { demoPlayerToken } = useWorkspace();
  return useQuery({
    queryKey: keys.playerStats(demoPlayerToken),
    enabled: demoPlayerToken !== "",
    queryFn: () => unwrap(client.GET("/v1/players/me/stats", { headers: authHeaders({ token: demoPlayerToken }) }), demoPlayerToken),
  });
}

/** Invalidation helpers for after a mutation. Stable while the scope is, so they are safe in hook dependencies. */
export function useInvalidate() {
  const queryClient = useQueryClient();
  const { project, environment, demoPlayerToken } = useWorkspace();
  return useMemo(() => ({
    scope: () => queryClient.invalidateQueries({ queryKey: keys.scope(project.id, environment.id) }),
    draft: () => queryClient.invalidateQueries({ queryKey: keys.draft(project.id, environment.id) }),
    player: () => queryClient.invalidateQueries({ queryKey: keys.player(demoPlayerToken) }),
  }), [queryClient, project.id, environment.id, demoPlayerToken]);
}
