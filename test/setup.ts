import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import '@vitest/web-worker';

// Node 25 ships an experimental built-in `localStorage` that is exposed via
// globalThis but is non-functional unless the runtime was launched with
// --localstorage-file=<path>. That stub takes precedence over jsdom's Storage
// implementation, leaving globalThis.localStorage as a plain object with no
// methods. Replace it with a minimal in-memory shim so our tests (and the
// store's BASE_LAYER_KEY persistence path) can use the standard Web Storage
// API. The shim resets between tests via a beforeEach in each test file.
class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}
const memoryLocalStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: memoryLocalStorage,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: memoryLocalStorage,
  });

  // jsdom does not implement matchMedia, which MUI's useMediaQuery relies on.
  // Default every query to "no match" (desktop-width behaviour); individual
  // tests can override window.matchMedia to exercise the mobile breakpoint.
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
}
