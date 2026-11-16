import { describe, expect, it } from "vitest";
import { asArray, equippableItems, itemSlot, keysOf, parseThresholds, pickKey } from "./config";

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

describe("asArray and keysOf", () => {
  it("normalises arrays and wrapped arrays", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray({ data: [3] })).toEqual([3]);
    expect(asArray({ items: [4] })).toEqual([4]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });
  it("extracts non-empty keys", () => {
    expect(keysOf([{ key: "a" }, { name: "no key" }, { key: "b" }])).toEqual(["a", "b"]);
  });
});
