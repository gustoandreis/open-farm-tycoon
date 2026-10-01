/** Abstraction over web game portals. The game must never depend on a portal SDK. */
export interface GamePlatform {
  readonly id: 'local' | 'crazygames' | 'poki';
  initialize(): Promise<void>;
  /** Player is actively playing (unpaused gameplay). */
  gameplayStart(): void;
  /** Player stopped playing (menu, pause, modal). */
  gameplayStop(): void;
  /** Interstitial at a natural break. Resolves when finished (or immediately if none). */
  showInterstitial(): Promise<void>;
  /** Optional rewarded ad. Resolves true only if the reward should be granted. */
  showRewardedAd(): Promise<boolean>;
  saveData?(data: unknown): Promise<void>;
  loadData?(): Promise<unknown>;
}

/** Loads an external script with a timeout; resolves false on failure (never throws). */
export function loadScript(src: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      const timer = window.setTimeout(() => resolve(false), timeoutMs);
      el.onload = () => {
        window.clearTimeout(timer);
        resolve(true);
      };
      el.onerror = () => {
        window.clearTimeout(timer);
        resolve(false);
      };
      document.head.appendChild(el);
    } catch {
      resolve(false);
    }
  });
}
