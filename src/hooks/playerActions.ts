import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authHeaders, client, idempotencyKey, unwrap } from "../api/client";
import { useWorkspace } from "../app/workspace";
import { keys } from "./queries";

/**
 * What an admin can do to one player from the Players screen. Players never use the
 * dashboard, so these are management actions: each calls an admin route under the
 * environment you own, with your dashboard token and a fresh Idempotency-Key. The
 * server runs the same code the game would (balances cannot go below zero, a goal pays
 * once), so the rules cannot differ between the game and the dashboard.
 *
 * Every action goes through the workspace runner (busy state, error notice) and then
 * refreshes everything scoped to this environment: the player's tabs, the directory's
 * level column and the claim statistics.
 */
export function usePlayerActions(playerId: string) {
  const w = useWorkspace();
  const queryClient = useQueryClient();
  const { token, project, environment, run, notify } = w;
  const projectId = project.id;
  const envId = environment.id;

  return useMemo(() => {
    const base = { headers: authHeaders({ token }) };
    const path = { projectId, envId, playerId };
    const header = () => ({ "Idempotency-Key": idempotencyKey() });
    /** Runs one action, refreshes what it changed and reports the message it returns. */
    const act = (work: () => Promise<string>) => run(async () => {
      try {
        const message = await work();
        notify({ kind: "success", message });
      } finally {
        await queryClient.invalidateQueries({ queryKey: keys.scope(projectId, envId) });
      }
    });
    const reason = (text?: string) => text?.trim() || "dashboard";

    return {
      grantItem: (itemKey: string, quantity: number, why?: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/items/grant", { ...base, params: { path, header: header() }, body: { item_key: itemKey, quantity, reason: reason(why) } }), token);
        return `Granted ${quantity} × ${itemKey}.`;
      }),
      consumeItem: (itemKey: string, quantity: number) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/inventory/consume", { ...base, params: { path, header: header() }, body: { item_key: itemKey, quantity, reason: "dashboard" } }), token);
        return `Consumed ${quantity} × ${itemKey}.`;
      }),
      equipItem: (itemKey: string, slot: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/inventory/equip", { ...base, params: { path, header: header() }, body: { item_key: itemKey, slot } }), token);
        return `Equipped ${itemKey} in ${slot}.`;
      }),
      unequipSlot: (slot: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/inventory/unequip", { ...base, params: { path, header: header() }, body: { slot } }), token);
        return `Emptied the ${slot} slot.`;
      }),
      credit: (currencyKey: string, amount: number, why?: string) => act(async () => {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/currency/credit", { ...base, params: { path, header: header() }, body: { currency_key: currencyKey, amount, reason: reason(why) } }), token);
        return `Credited ${amount} ${currencyKey}. Balance: ${result.balance}.`;
      }),
      spend: (currencyKey: string, amount: number, why?: string) => act(async () => {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/currency/spend", { ...base, params: { path, header: header() }, body: { currency_key: currencyKey, amount, reason: reason(why) } }), token);
        return `Deducted ${amount} ${currencyKey}. Balance: ${result.balance}.`;
      }),
      awardXP: (amount: number, why?: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/xp/award", { ...base, params: { path, header: header() }, body: { amount, reason: reason(why) } }), token);
        return `Awarded ${amount} XP.`;
      }),
      submitScore: (leaderboardKey: string, score: number) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/leaderboards/{key}/scores", { ...base, params: { path: { ...path, key: leaderboardKey }, header: header() }, body: { score } }), token);
        return `Submitted ${score} to ${leaderboardKey}. The leaderboard keeps the player's best score.`;
      }),
      incrementStat: (statKey: string, amount: number, why?: string) => act(async () => {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/stats/{statKey}/increment", { ...base, params: { path: { ...path, statKey }, header: header() }, body: { amount, reason: reason(why) } }), token);
        return `${statKey} is now ${result.value}.`;
      }),
      setFlag: (flagKey: string, why?: string) => act(async () => {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/flags/{flagKey}/set", { ...base, params: { path: { ...path, flagKey }, header: header() }, body: { reason: reason(why) } }), token);
        return result.newly_set ? `Set ${flagKey}.` : `${flagKey} was already set; flags are set-only.`;
      }),
      claimAchievement: (key: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/achievements/{key}/claim", { ...base, params: { path: { ...path, key }, header: header() } }), token);
        return `Claimed ${key}; its rewards were paid.`;
      }),
      acceptQuest: (key: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/quests/{key}/accept", { ...base, params: { path: { ...path, key }, header: header() } }), token);
        return `Accepted ${key}.`;
      }),
      abandonQuest: (key: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/quests/{key}/abandon", { ...base, params: { path: { ...path, key }, header: header() } }), token);
        return `Abandoned ${key}. Rewards already claimed are kept.`;
      }),
      claimQuest: (key: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/quests/{key}/claim", { ...base, params: { path: { ...path, key }, header: header() } }), token);
        return `Claimed the earned rewards of ${key}.`;
      }),
      // Saves: the write sends the version that was read, so the admin never overwrites a
      // save the game wrote in the meantime (the server answers 409 SAVE_VERSION_CONFLICT).
      putSave: (slot: string, data: unknown, expectedVersion: number) => act(async () => {
        const result = await unwrap(client.PUT("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/saves/{slot}", { ...base, params: { path: { ...path, slot }, header: header() }, body: { data, expected_version: expectedVersion } }), token);
        return `Saved ${slot} (version ${result.version}).`;
      }),
      deleteSave: (slot: string, expectedVersion: number) => act(async () => {
        await unwrap(client.DELETE("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/saves/{slot}", { ...base, params: { path: { ...path, slot }, query: { expected_version: expectedVersion }, header: header() } }), token);
        return `Deleted the ${slot} save.`;
      }),
      // Bans are dashboard-only: they are not a game action, but they live here with the
      // other player actions so every change to a player goes through one place.
      banPlayer: (reason: string, expiresAt: string | null) => act(async () => {
        const result = await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/ban", { ...base, params: { path, header: header() }, body: { reason, expires_at: expiresAt } }), token);
        const until = result.ban.expires_at ? `until ${new Date(result.ban.expires_at).toLocaleString()}` : "permanently";
        return `Banned ${until}; ${result.sessions_revoked} session(s) signed out.`;
      }),
      liftBan: (note: string) => act(async () => {
        await unwrap(client.POST("/v1/projects/{projectId}/environments/{envId}/players/{playerId}/ban/lift", { ...base, params: { path, header: header() }, body: { note: note.trim() } }), token);
        return "Lifted the ban. The player can sign in again.";
      }),
    };
  }, [token, projectId, envId, playerId, run, notify, queryClient]);
}
