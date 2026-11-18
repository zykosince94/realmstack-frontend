import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // The app remembers the open screen across reloads; every test starts fresh.
  sessionStorage.clear();
});
