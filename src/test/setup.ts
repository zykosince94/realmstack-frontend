import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Lazy screens and their chunks can take longer than the 1 s default when the whole
// suite runs in parallel; the assertions still fail if the content never arrives.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // The app remembers the open screen across reloads; every test starts fresh.
  sessionStorage.clear();
  // The public docs page is selected by the URL hash; do not leak it between tests.
  window.history.replaceState(null, "", "/");
});
