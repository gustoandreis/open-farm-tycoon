import { loadScript, type GamePlatform } from './GamePlatform';

/** Subset of the CrazyGames HTML5 SDK v3 used by the game. */
interface CrazySdk {
  init(): Promise<void>;
  game: { gameplayStart(): void; gameplayStop(): void };
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks: { adStarted?(): void; adFinished?(): void; adError?(e: unknown): void },
    ): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySdk };
  }
}

export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * CrazyGames integration (decoupled). If the SDK cannot be loaded or
 * initialized, every call becomes a no-op and the game keeps working.
 */
export class CrazyGamesPlatform implements GamePlatform {
  readonly id = 'crazygames' as const;
  private sdk: CrazySdk | null = null;
  private playing = false;

  async initialize(): Promise<void> {
    if (!window.CrazyGames?.SDK) await loadScript(CRAZYGAMES_SDK_URL);
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) {
      console.warn('[platform] CrazyGames SDK unavailable; running without it.');
      return;
    }
    try {
      await sdk.init();
      this.sdk = sdk;
    } catch (err) {
      console.warn('[platform] CrazyGames SDK init failed', err);
    }
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    try {
      this.sdk?.game.gameplayStart();
    } catch {
      // ignore
    }
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    try {
      this.sdk?.game.gameplayStop();
    } catch {
      // ignore
    }
  }

  private requestAd(type: 'midgame' | 'rewarded'): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(false);
    return new Promise((resolve) => {
      try {
        sdk.ad.requestAd(type, {
          adFinished: () => resolve(true),
          adError: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  async showInterstitial(): Promise<void> {
    await this.requestAd('midgame');
  }

  showRewardedAd(): Promise<boolean> {
    return this.requestAd('rewarded');
  }
}
