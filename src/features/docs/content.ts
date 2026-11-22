import type { DocTab } from "../../lib/docs";
import overview from "./content/overview.md?raw";
import gettingStarted from "./content/getting-started.md?raw";
import concepts from "./content/concepts.md?raw";
import players from "./content/players.md?raw";
import inventoryEconomy from "./content/inventory-economy.md?raw";
import progression from "./content/progression.md?raw";
import leaderboards from "./content/leaderboards.md?raw";
import statsAchievements from "./content/stats-achievements.md?raw";
import quests from "./content/quests.md?raw";
import saves from "./content/saves.md?raw";
import activity from "./content/activity.md?raw";
import ai from "./content/ai.md?raw";
import admin from "./content/admin.md?raw";
import apiConventions from "./content/api-conventions.md?raw";
import apiDashboard from "./content/api-dashboard.md?raw";
import apiPlayer from "./content/api-player.md?raw";
import apiServer from "./content/api-server.md?raw";
import apiPublic from "./content/api-public.md?raw";
import apiErrors from "./content/api-errors.md?raw";
import deploymentCompose from "./content/deployment-compose.md?raw";
import deploymentSelfHosting from "./content/deployment-self-hosting.md?raw";
import deploymentConfig from "./content/deployment-config.md?raw";
import deploymentProduction from "./content/deployment-production.md?raw";
import deploymentOperations from "./content/deployment-operations.md?raw";
import deploymentScaling from "./content/deployment-scaling.md?raw";
import security from "./content/security.md?raw";
import unity from "./content/unity.md?raw";
import faq from "./content/faq.md?raw";
import limitations from "./content/limitations.md?raw";

/**
 * The documentation map. The tab order is the reading order; page order is the order
 * of the page list and the previous/next links. Content lives in `content/*.md` so it
 * can be edited without touching React code.
 */
export const docTabs: DocTab[] = [
  {
    id: "overview",
    label: "Overview",
    description: "What RealmStack is, how to get a project running, and the ideas every feature shares.",
    pages: [
      { id: "overview", title: "What is RealmStack?", summary: "A multi-tenant backend for game accounts, economy, progression and live content.", body: overview },
      { id: "getting-started", title: "Getting started", summary: "Create a project, publish configuration, connect a client and make the first writes.", body: gettingStarted },
      { id: "concepts", title: "Core concepts", summary: "Tenancy, drafts, publishing, idempotency, ledgers, goals and UTC periods.", body: concepts },
    ],
  },
  {
    id: "guides",
    label: "Feature guides",
    description: "How each service behaves, what it stores, and the rules the server enforces.",
    pages: [
      { id: "players", title: "Players and sessions", summary: "Registration, login, rotating refresh tokens, profiles and bans.", body: players },
      { id: "inventory-economy", title: "Inventory and economy", summary: "Item stacks, equipment, currency balances and the append-only ledger.", body: inventoryEconomy },
      { id: "progression", title: "Progression", summary: "Versioned XP thresholds, level calculation and per-player pinning.", body: progression },
      { id: "leaderboards", title: "Leaderboards", summary: "Best-score ranking, ties, seasons, top-N, rank and the optional Redis projection.", body: leaderboards },
      { id: "stats-achievements", title: "Stats, flags and achievements", summary: "Server-reported world events and the shared goal engine.", body: statsAchievements },
      { id: "quests", title: "Quests", summary: "Staged goals, chains, repeat periods, availability windows and claims.", body: quests },
      { id: "saves", title: "Cloud saves", summary: "Versioned JSON slots that never overwrite silently.", body: saves },
      { id: "activity", title: "Player activity", summary: "Concurrent and daily active players derived from session issuance.", body: activity },
      { id: "ai", title: "AI configuration assistant", summary: "Bring your own key, generate a proposal, review it, then publish.", body: ai },
      { id: "admin", title: "Player management", summary: "Dashboard lookup, inspection and every game action performed for a player.", body: admin },
    ],
  },
  {
    id: "api",
    label: "API reference",
    description: "Authentication, every route, request shapes, response envelopes and error codes.",
    pages: [
      { id: "api-conventions", title: "Auth and conventions", summary: "Base URL, the four auth styles, envelopes, idempotency, pagination and limits.", body: apiConventions },
      { id: "api-dashboard", title: "Dashboard routes", summary: "Projects, environments, configuration, player management, bans, saves and activity.", body: apiDashboard },
      { id: "api-player", title: "Player routes", summary: "Registration, sessions, profile, inventory, economy, stats, achievements, quests and saves.", body: apiPlayer },
      { id: "api-server", title: "Trusted server routes", summary: "Grants, credits, XP, stats, claims, saves and the batch endpoint.", body: apiServer },
      { id: "api-public", title: "Public and leaderboard routes", summary: "Public environment scope, registration/login and score reads and writes.", body: apiPublic },
      { id: "api-errors", title: "Errors and status codes", summary: "The error envelope, field errors and the codes clients should handle.", body: apiErrors },
    ],
  },
  {
    id: "deployment",
    label: "Deployment",
    description: "Running the stack locally, configuring it, and operating it in production.",
    pages: [
      { id: "deployment-compose", title: "Local Docker Compose", summary: "The full stack, the backend-only stack, demo data and resetting the volume.", body: deploymentCompose },
      { id: "deployment-self-hosting", title: "Self-hosting", summary: "Run the API and static dashboard on your own host with PostgreSQL, TLS and backups.", body: deploymentSelfHosting },
      { id: "deployment-config", title: "Configuration reference", summary: "Every environment variable, its default and what it changes.", body: deploymentConfig },
      { id: "deployment-production", title: "Production checklist", summary: "TLS, secrets, PostgreSQL, pooling, replicas, Redis and backups.", body: deploymentProduction },
      { id: "deployment-operations", title: "Operations", summary: "Migrations, maintenance, rebuilds, verification, upgrades and monitoring.", body: deploymentOperations },
      { id: "deployment-scaling", title: "Scaling and load testing", summary: "Quotas, retention, the k6 profile and the known bottlenecks.", body: deploymentScaling },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    description: "Security notes, engine integration, frequently asked questions and current limits.",
    pages: [
      { id: "security", title: "Security model", summary: "Tokens, credentials, tenancy, SSRF protection and what is not included.", body: security },
      { id: "unity", title: "Unity and engine integration", summary: "A thin HTTP client, session storage and the recommended call sequence.", body: unity },
      { id: "faq", title: "FAQ", summary: "Short answers to the questions new integrators ask first.", body: faq },
      { id: "limitations", title: "Known limits", summary: "What RealmStack does not do, and the trade-offs behind its limits.", body: limitations },
    ],
  },
];

export function findTab(tabId: string): DocTab {
  return docTabs.find((tab) => tab.id === tabId) ?? docTabs[0];
}

export function findPage(tab: DocTab, pageId: string) {
  return tab.pages.find((page) => page.id === pageId) ?? tab.pages[0];
}
