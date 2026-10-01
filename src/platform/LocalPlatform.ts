import type { GamePlatform } from './GamePlatform';

/** Default platform: no ads, no SDK. Always works. */
export class LocalPlatform implements GamePlatform {
  readonly id = 'local' as const;
  async initialize(): Promise<void> {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  async showInterstitial(): Promise<void> {}
  async showRewardedAd(): Promise<boolean> {
    return false;
  }
}
