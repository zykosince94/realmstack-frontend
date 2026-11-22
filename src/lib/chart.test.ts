import { describe, expect, it } from "vitest";
import { columnPath, formatCount, nearestIndex, niceScale } from "./chart";

describe("niceScale", () => {
  it("rounds the top up to a clean step and lists the ticks", () => {
    expect(niceScale(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceScale(16)).toEqual({ max: 20, ticks: [0, 5, 10, 15, 20] });
    expect(niceScale(1234).max).toBe(1500);
  });
  it("keeps whole-number steps and a visible axis for small or empty series", () => {
    expect(niceScale(0)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
    expect(niceScale(2)).toEqual({ max: 2, ticks: [0, 1, 2] });
  });
});

describe("formatCount", () => {
  it("writes counts in full under 10,000 and compact above", () => {
    expect(formatCount(9999)).toBe((9999).toLocaleString());
    expect(formatCount(12_000)).toMatch(/^12\s?K$/);
  });
});

describe("columnPath", () => {
  it("rounds the data end and squares the base", () => {
    expect(columnPath(10, 20, 50, 100)).toBe("M10,100V54Q10,50 14,50H26Q30,50 30,54V100Z");
  });
  it("draws nothing for a zero-height column and clamps the radius for a short one", () => {
    expect(columnPath(0, 20, 100, 100)).toBe("");
    expect(columnPath(0, 20, 98, 100)).toContain("V100Q0,98 2,98");
  });
});

describe("nearestIndex", () => {
  it("snaps a pointer to the nearest point and stays in range", () => {
    expect(nearestIndex(0, 100, 5)).toBe(0);
    expect(nearestIndex(60, 100, 5)).toBe(2);
    expect(nearestIndex(140, 100, 5)).toBe(4);
    expect(nearestIndex(-10, 100, 5)).toBe(0);
  });
});
