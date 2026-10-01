import { CrazyGamesPlatform } from './CrazyGamesPlatform';
import type { GamePlatform } from './GamePlatform';
import { LocalPlatform } from './LocalPlatform';
import { PokiPlatform } from './PokiPlatform';

export type { GamePlatform } from './GamePlatform';

/**
 * Picks the platform from the build flag VITE_PLATFORM (local | crazygames | poki)
 * or the ?platform= URL parameter. Any failure falls back to LocalPlatform.
 */
export async function createPlatform(): Promise<GamePlatform> {
  let id = String(import.meta.env.VITE_PLATFORM ?? 'local');
  try {
    const p = new URLSearchParams(window.location.search).get('platform');
    if (p) id = p;
  } catch {
    // ignore
  }
  let platform: GamePlatform = new LocalPlatform();
  if (id === 'crazygames') platform = new CrazyGamesPlatform();
  else if (id === 'poki') platform = new PokiPlatform();
  try {
    await platform.initialize();
    return platform;
  } catch (err) {
    console.warn('[platform] init failed, using local platform', err);
    return new LocalPlatform();
  }
}
