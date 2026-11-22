import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { authHeaders, client, unwrap, unwrapPage, unwrapWithMeta } from "../api/client";
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
  adminPlayers: (projectId: string, envId: string, search: string, bannedOnly: boolean) => ["scope", projectId, envId, "players", "list", search, bannedOnly] as const,
  adminPlayer: (projectId: string, envId: string, playerId: string, part: string) => ["scope", projectId, envId, "players", playerId, part] as const,
  // AI settings belong to the dashboard user, not to a project or environment.
  aiSettings: (token: string) => ["ai-settings", token] as const,
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

/** Invalidation helpers for after a mutation. Stable while the scope is, so they are safe in hook dependencies. */
export function useInvalidate() {
  const queryClient = useQueryClient();
  const { project, environment } = useWorkspace();
  return useMemo(() => ({
    scope: () => queryClient.invalidateQueries({ queryKey: keys.scope(project.id, environment.id) }),
    draft: () => queryClient.invalidateQueries({ queryKey: keys.draft(project.id, environment.id) }),
  }), [queryClient, project.id, environment.id]);
}

// --- Players (the admin views of the environment's players; actions are in playerActions.ts) ---

/** The environment's players, newest first; search matches name, email, external key or ID. bannedOnly lists players with a ban in force. */
export function usePlayerDirectory(search: string, bannedOnly = false) {
  const { token, path, projectId, envId } = useScopeParams();
  const query = useInfiniteQuery({
    queryKey: keys.adminPlayers(projectId, envId, search, bannedOnly),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => unwrapPage(client.GET("/v1/projects/{projectId}/environments/{envId}/players", {
      params: { path, query: { limit: 25, ...(search ? { search } : {}), ...(bannedOnly ? { banned: true } : {}), ...(pageParam ? { cursor: pageParam } : {}) } }, headers: authHeaders({ token }),
    }), token),
    getNextPageParam: (last) => last.nextCursor,
  });
  useReportError(query.error, "Could not load players.");
  return query;
}

function usePlayerScope(playerId: string) {
  const scope = useScopeParams();
  return { ...scope, playerPath: { ...scope.path, playerId } };
}

/** One player's profile and session summary. */
export function useAdminPlayerProfile(playerId: string) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  const query = useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "profile"),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
  useReportError(query.error, "Could not load the player.");
  return query;
}

export function useAdminPlayerProgression(playerId: string) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "progression"),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/progression", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

export function useAdminPlayerCurrency(playerId: string) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "currency"),
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/currency", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

export function useAdminPlayerInventory(playerId: string, enabled: boolean) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "inventory"),
    enabled,
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/inventory", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

export function useAdminPlayerStats(playerId: string, enabled: boolean) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "stats"),
    enabled,
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/stats", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

export function useAdminPlayerAchievements(playerId: string, enabled: boolean) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "achievements"),
    enabled,
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/achievements", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

export function useAdminPlayerQuests(playerId: string, enabled: boolean) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "quests"),
    enabled,
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/quests", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

/** The player's ban history, newest first. */
export function useAdminPlayerBans(playerId: string, enabled: boolean) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "bans"),
    enabled,
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/bans", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

/** The player's save slots (no data) and the limits the server enforces. */
export function useAdminPlayerSaves(playerId: string, enabled: boolean) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "saves"),
    enabled,
    queryFn: () => unwrapWithMeta(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/saves", { params: { path: playerPath }, headers: authHeaders({ token }) }), token),
  });
}

/** One save slot with its data. Its key sits under the slot list, so a write refreshes both. */
export function useAdminPlayerSave(playerId: string, slot: string) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useQuery({
    queryKey: [...keys.adminPlayer(projectId, envId, playerId, "saves"), slot],
    queryFn: () => unwrap(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/saves/{slot}", { params: { path: { ...playerPath, slot } }, headers: authHeaders({ token }) }), token),
  });
}

/** The player's economy ledger, newest first, a page at a time. */
export function useAdminPlayerLedger(playerId: string, enabled: boolean) {
  const { token, playerPath, projectId, envId } = usePlayerScope(playerId);
  return useInfiniteQuery({
    queryKey: keys.adminPlayer(projectId, envId, playerId, "transactions"),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => unwrapPage(client.GET("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/transactions", {
      params: { path: playerPath, query: { limit: 25, ...(pageParam ? { cursor: pageParam } : {}) } }, headers: authHeaders({ token }),
    }), token),
    getNextPageParam: (last) => last.nextCursor,
  });
}
