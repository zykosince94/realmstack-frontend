import { describe, expect, it } from "vitest";
import type { Config } from "../api/types";
import { configFileFormat, definitionCount, emptyConfig, exportConfiguration, parseConfigurationFile } from "./config";

describe("configuration files", () => {
  const config = { ...emptyConfig(), items: [{ key: "sword", name: "Sword", category: "", stackable: false, max_stack: 1, metadata: {} }], progression: [100] } as Config;

  it("wraps an export with its source and round-trips through import", () => {
    const file = exportConfiguration(config, { project: "Star Forge", slug: "star-forge", environment: "development", version: 4 }, new Date("2027-01-02T03:04:05Z"));
    expect(file).toMatchObject({ format: configFileFormat, version: 1, exported_at: "2027-01-02T03:04:05.000Z", source: { configuration_version: 4 } });
    expect(parseConfigurationFile(JSON.stringify(file))).toEqual(config);
  });

  it("accepts a bare configuration and fills the optional lists", () => {
    const bare = { items: [], currencies: [], progression: [], leaderboards: [] };
    expect(parseConfigurationFile(JSON.stringify(bare))).toEqual(emptyConfig());
    expect(definitionCount(config)).toBe(2);
  });

  it("explains what is wrong with a file that is not a configuration", () => {
    expect(() => parseConfigurationFile("{nope")).toThrow("not valid JSON");
    expect(() => parseConfigurationFile("[]")).toThrow("does not contain");
    expect(() => parseConfigurationFile(JSON.stringify({ format: "other" }))).toThrow("not a RealmStack configuration export");
    expect(() => parseConfigurationFile(JSON.stringify({ format: configFileFormat, version: 2, config }))).toThrow("newer RealmStack");
    expect(() => parseConfigurationFile(JSON.stringify({ format: configFileFormat, version: 1 }))).toThrow("no configuration");
    expect(() => parseConfigurationFile(JSON.stringify({ items: [] }))).toThrow("\"currencies\"");
    expect(() => parseConfigurationFile(JSON.stringify({ items: [], currencies: [], progression: [], leaderboards: [], quests: {} }))).toThrow("\"quests\" must be a list");
  });
});
