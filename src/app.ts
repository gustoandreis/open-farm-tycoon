import Phaser from 'phaser';
import { analytics } from './analytics/AnalyticsService';
import { audio } from './audio/AudioManager';
import { GAME_CONFIG } from './config/game';
import { loadSettings, type Settings } from './config/settings';
import { GameSession } from './game/GameSession';
import { FarmScene } from './game/scenes/FarmScene';
import { setLanguage, t } from './i18n';
import type { GamePlatform } from './platform';
import { SaveManager } from './save/saveManager';
import { Game, type NewGameOptions } from './simulation/game';
import { GameUI } from './ui/GameUI';
import { MainMenu } from './ui/menu';
import { alertDialog } from './ui/modal';

/** Top-level application: switches between the main menu and a game session. */
export class App {
  readonly settings: Settings;
  readonly saves = new SaveManager();
  corruptSave = false;
  private menu: MainMenu | null = null;
  private session: GameSession | null = null;
  private ui: GameUI | null = null;
  private phaser: Phaser.Game | null = null;

  constructor(
    private uiRoot: HTMLElement,
    private gameContainer: HTMLElement,
    private platform: GamePlatform,
  ) {
    this.settings = loadSettings();
    this.applySettings(false);
    const probe = this.saves.load();
    this.corruptSave = probe.status === 'corrupt';
    if (probe.status === 'corrupt') console.warn('[save] corrupt save detected:', probe.error);
    window.addEventListener('beforeunload', () => {
      if (this.session && !this.session.game.isGameOver) this.session.save(false);
      analytics.track('session_end');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.session && !this.session.game.isGameOver) this.session.save(false);
    });
  }

  applySettings(languageChanged: boolean): void {
    const s = this.settings;
    setLanguage(s.language);
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
    document.title = GAME_CONFIG.name;
    audio.setVolumes({ music: s.music, sfx: s.sfx, ambient: s.ambient });
    const scene = this.phaser?.scene.getScene('FarmScene') as FarmScene | null | undefined;
    scene?.setGraphics(s.quality, s.reducedMotion);
    if (languageChanged) {
      this.ui?.rebuild();
      this.menu?.render();
    }
  }

  showMenu(): void {
    this.teardownSession();
    this.menu?.destroy();
    this.menu = new MainMenu(this.uiRoot, {
      settings: this.settings,
      saves: this.saves,
      corruptSave: this.corruptSave,
      startNewGame: (opts) => this.startNewGame(opts),
      continueGame: () => this.continueGame(),
      applySettings: (lang) => this.applySettings(lang),
    });
  }

  startNewGame(opts: NewGameOptions & { tutorial: boolean }): void {
    const game = Game.newGame(opts);
    game.state.tutorial.active = opts.tutorial;
    this.corruptSave = false;
    analytics.track('game_start', { difficulty: opts.difficulty, region: opts.region ?? 'parana' });
    this.startSession(game);
    this.session?.save(false);
  }

  continueGame(): void {
    const r = this.saves.load();
    if (r.status !== 'ok') {
      this.corruptSave = r.status === 'corrupt';
      void alertDialog(this.uiRoot, t('menu.continue'), t('menu.corruptSave'));
      this.menu?.render();
      return;
    }
    analytics.track('game_continue', { day: r.state.day });
    this.startSession(new Game(r.state));
  }

  private startSession(game: Game): void {
    this.menu?.destroy();
    this.menu = null;
    this.teardownSession();
    const session = new GameSession(game, { saves: this.saves, platform: this.platform });
    this.session = session;
    try {
      this.phaser = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.gameContainer,
        backgroundColor: '#3d6b33',
        scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
        render: { antialias: true, roundPixels: true, powerPreference: 'high-performance' },
        fps: { target: 60 },
        banner: false,
        audio: { noAudio: true },
        scene: [],
      });
      this.phaser.scene.add('FarmScene', FarmScene, true, {
        session,
        quality: this.settings.quality,
        reducedMotion: this.settings.reducedMotion,
      });
    } catch (err) {
      console.error('[app] Phaser failed to start', err);
      void alertDialog(this.uiRoot, 'Erro', t('error.phaser'));
    }
    this.ui = new GameUI(this.uiRoot, session, {
      settings: this.settings,
      saves: this.saves,
      applySettings: (lang) => this.applySettings(lang),
      exitToMenu: () => this.exitToMenu(),
      newGame: () => this.showMenu(),
      getFps: () => this.phaser?.loop.actualFps ?? 0,
    });
    audio.startMusic();
    audio.startAmbient();
  }

  exitToMenu(): void {
    if (this.session && !this.session.game.isGameOver) this.session.save(false);
    // Natural break: a good moment for an (optional) portal interstitial.
    this.showMenu();
    audio.setSuspended(true);
    void this.platform.showInterstitial().finally(() => audio.setSuspended(false));
  }

  private teardownSession(): void {
    this.ui?.destroy();
    this.ui = null;
    if (this.phaser) {
      this.phaser.destroy(true);
      this.phaser = null;
    }
    this.session?.dispose();
    this.session = null;
    audio.stopMusic();
    audio.stopAmbient();
  }
}
