import { describe, expect, it } from "vitest";
import { defaultCondition, describeCondition, equippableItems, errorsFor, indexesWithErrors, itemSlot, keysOf, parseThresholds, pickKey, progressPercent } from "./config";

describe("pickKey", () => {
  it("keeps the current choice while it is still an option", () => {
    expect(pickKey("gems", ["credits", "gems"])).toBe("gems");
  });
  it("falls back to the first option when the choice is missing or stale", () => {
    expect(pickKey("", ["credits", "gems"])).toBe("credits");
    expect(pickKey("plasma_rifle", ["health_potion"])).toBe("health_potion");
  });
  it("returns an empty string when there are no options", () => {
    expect(pickKey("anything", [])).toBe("");
  });
});

describe("item slots", () => {
  const items = [
    { key: "potion", metadata: { healing: 5 } },
    { key: "sword", metadata: { slot: "weapon" } },
    { key: "odd", metadata: { slot: 3 } },
    { key: "bare" },
  ];
  it("reads only string slots", () => {
    expect(itemSlot(items[1])).toBe("weapon");
    expect(itemSlot(items[0])).toBeNull();
    expect(itemSlot(items[2])).toBeNull();
    expect(itemSlot(items[3])).toBeNull();
  });
  it("lists only equippable items", () => {
    expect(equippableItems(items).map((item) => item.key)).toEqual(["sword"]);
    expect(equippableItems(undefined)).toEqual([]);
  });
});

describe("parseThresholds", () => {
  it("accepts positive, strictly increasing integers", () => {
    expect(parseThresholds("100, 300,700")).toEqual([100, 300, 700]);
  });
  it.each(["0, 100", "100, 100", "300, 200", "10, abc", "1.5", "", "-5"])("rejects %j", (text) => {
    expect(parseThresholds(text)).toBeNull();
  });
});

describe("keysOf", () => {
  it("extracts non-empty keys", () => {
    expect(keysOf([{ key: "a" }, {}, { key: "b" }])).toEqual(["a", "b"]);
    expect(keysOf(undefined)).toEqual([]);
  });
});

describe("conditions", () => {
  it("creates only the fields each type accepts", () => {
    expect(defaultCondition("flag", { flag: "met_elder", stat: "trolls" })).toEqual({ type: "flag", flag_key: "met_elder" });
    expect(defaultCondition("item_granted")).toEqual({ type: "item_granted", target: 1 });
    expect(defaultCondition("currency_spent", { currency: "credits" })).toEqual({ type: "currency_spent", currency_key: "credits", target: 1 });
    expect(defaultCondition("xp_total", { item: "ignored" })).toEqual({ type: "xp_total", target: 1 });
  });
  it("describes conditions, treating a missing item key as any item", () => {
    expect(describeCondition({ type: "item_granted", target: 5 })).toBe("Granted 5 × any item");
    expect(describeCondition({ type: "stat", stat_key: "trolls", target: 100 })).toBe("Counter trolls reaches 100");
  });
  it("turns progress into a capped percentage", () => {
    expect(progressPercent({ type: "stat", current: 2, target: 3, met: false, has_value: true })).toBe(66);
    expect(progressPercent({ type: "stat", current: 9, target: 3, met: true, has_value: true })).toBe(100);
    expect(progressPercent({ type: "stat", current: 3, target: 3, met: false, has_value: true })).toBe(99);
    expect(progressPercent({ type: "leaderboard_score", current: 0, target: 60, met: false, has_value: false })).toBe(0);
  });
});

describe("field errors", () => {
  const errors = [
    { field: "achievements[2].conditions[0].stat_key", message: "references unknown counter" },
    { field: "achievements[2]", message: "whole definition" },
    { field: "achievements[12].key", message: "duplicate" },
    { field: "items[0].name", message: "required" },
  ];
  it("maps errors to paths inside one definition", () => {
    expect(errorsFor(errors, "achievements", 2)).toEqual({ "conditions[0].stat_key": "references unknown counter", "": "whole definition" });
    expect(errorsFor(errors, "achievements", 1)).toEqual({});
  });
  it("finds which definitions have errors", () => {
    expect([...indexesWithErrors(errors, "achievements")].sort((a, b) => a - b)).toEqual([2, 12]);
  });
});
