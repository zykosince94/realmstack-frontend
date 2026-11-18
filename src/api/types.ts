// Friendly names for types generated from the backend's api/openapi.yaml.
// Never hand-write a request or response type: regenerate with `npm run generate:api`.
import type { components } from "./generated/schema";

export type Schemas = components["schemas"];

export type Project = Schemas["Project"];
export type Environment = Schemas["Environment"];
export type Credential = Schemas["Credential"];
export type Config = Schemas["Configuration"];
export type Published = Schemas["PublishedConfiguration"];
export type ItemDefinition = Schemas["ItemDefinition"];
export type CurrencyDefinition = Schemas["CurrencyDefinition"];
export type LeaderboardDefinition = Schemas["LeaderboardDefinition"];
export type StatDefinition = Schemas["StatDefinition"];
export type AchievementDefinition = Schemas["AchievementDefinition"];
export type Condition = Schemas["Condition"];
export type ConditionType = Condition["type"];
export type Rewards = Schemas["Rewards"];
export type PlayerAchievement = Schemas["PlayerAchievement"];
export type ConditionProgress = Schemas["ConditionProgress"];
export type AchievementStat = Schemas["AchievementStat"];
export type QuestDefinition = Schemas["QuestDefinition"];
export type QuestStage = Schemas["QuestStage"];
export type PlayerQuest = Schemas["PlayerQuest"];
export type PlayerQuestStage = Schemas["PlayerQuestStage"];
export type QuestStat = Schemas["QuestStat"];
export type AISettings = Schemas["AISettings"];
export type AIParams = Schemas["AIParams"];
export type AIOperation = Schemas["AIGenerationRequest"]["operation"];
export type AIGeneration = Schemas["AIGeneration"];
export type AIProposal = Schemas["AIProposal"];
export type ConfigurationVersion = Schemas["ConfigurationVersion"];
export type PlayerStats = Schemas["PlayerStats"];
export type InventoryItem = Schemas["InventoryItem"];
export type Balance = Schemas["Balance"];
export type Transaction = Schemas["Transaction"];
export type LeaderboardEntry = Schemas["LeaderboardEntry"];
export type FieldError = Schemas["FieldError"];
export type PlayerSummary = Schemas["PlayerSummary"];
export type PlayerAdminProfile = Schemas["PlayerAdminProfile"];
export type Progression = Schemas["Progression"];
