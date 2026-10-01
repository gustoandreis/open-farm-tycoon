import { loadScript, type GamePlatform } from './GamePlatform';

/** Subset of the Poki SDK v2 used by the game. */
interface PokiSdk {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(onStart?: () => void): Promise<boolean>;
}

declare global {
  interface Window {
    PokiSDK?: PokiSdk;
  }
}

export const POKI_SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

/** Poki integration (decoupled). Falls back to no-ops when the SDK is missing. */
export class PokiPlatform implements GamePlatform {
  readonly id = 'poki' as const;
  private sdk: PokiSdk | null = null;
  private playing = false;

  async initialize(): Promise<void> {
    if (!window.PokiSDK) await loadScript(POKI_SDK_URL);
    const sdk = window.PokiSDK;
    if (!sdk) {
      console.warn('[platform] Poki SDK unavailable; running without it.');
      return;
    }
    try {
      await sdk.init();
      sdk.gameLoadingFinished();
      this.sdk = sdk;
    } catch (err) {
      console.warn('[platform] Poki SDK init failed', err);
    }
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    try {
      this.sdk?.gameplayStart();
    } catch {
      // ignore
    }
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    try {
      this.sdk?.gameplayStop();
    } catch {
      // ignore
    }
  }

  async showInterstitial(): Promise<void> {
    try {
      await this.sdk?.commercialBreak();
    } catch {
      // ignore
    }
  }

  async showRewardedAd(): Promise<boolean> {
    try {
      return (await this.sdk?.rewardedBreak()) ?? false;
    } catch {
      return false;
    }
  }
}
