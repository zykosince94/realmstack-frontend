// React Flow measures nodes with ResizeObserver and reads the viewport transform with
// DOMMatrixReadOnly; jsdom has neither and lays nothing out. These stand-ins (from
// React Flow's testing guide) let nodes render so tests can query them. Real layout,
// dragging and edge geometry are not testable in jsdom; the graph logic behind them
// is unit-tested in src/lib/quests.test.ts.
let installed = false;

export function mockReactFlow() {
  if (installed) return;
  installed = true;

  class ResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      // React Flow 12.12 reads contentRect for the pan/zoom extent. Like a real
      // ResizeObserver, report after the current work: React Flow ignores measurements
      // that arrive before its viewport element is registered.
      const contentRect = { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 640, right: 1000, bottom: 640 } as DOMRectReadOnly;
      setTimeout(() => {
        if (target.isConnected) this.callback([{ target, contentRect } as ResizeObserverEntry], this as unknown as globalThis.ResizeObserver);
      }, 0);
    }
    unobserve() {}
    disconnect() {}
  }

  class DOMMatrixReadOnly {
    m22: number;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
      this.m22 = scale !== undefined ? Number(scale) : 1;
    }
  }

  Object.assign(globalThis, { ResizeObserver, DOMMatrixReadOnly });
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get() { return parseFloat((this as HTMLElement).style.height) || 1; } },
    offsetWidth: { configurable: true, get() { return parseFloat((this as HTMLElement).style.width) || 1; } },
  });
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
}

/** Makes window.matchMedia report `matches` for every query (e.g. a narrow screen). */
export function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
