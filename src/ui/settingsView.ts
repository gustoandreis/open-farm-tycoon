import { saveSettings, type Settings } from '../config/settings';
import { LANGUAGES, t, type Language } from '../i18n';
import type { SaveManager } from '../save/saveManager';
import { h } from './dom';
import { alertDialog, confirmDialog } from './modal';

export interface SettingsViewOptions {
  settings: Settings;
  saves: SaveManager;
  modalRoot: HTMLElement;
  onChange(s: Settings, languageChanged: boolean): void;
  onSaveDeleted?(): void;
}

const LANGUAGE_NAMES: Record<Language, string> = { 'pt-BR': 'Português (Brasil)', en: 'English' };

export function renderSettingsView(o: SettingsViewOptions): HTMLElement {
  const s = o.settings;
  const update = (patch: Partial<Settings>) => {
    const languageChanged = patch.language !== undefined && patch.language !== s.language;
    Object.assign(s, patch);
    saveSettings(s);
    o.onChange(s, languageChanged);
  };
  const slider = (key: 'music' | 'sfx' | 'ambient', label: string) =>
    h(
      'div',
      { class: 'field' },
      h('label', null, `${label}: `, h('span', null, `${Math.round(s[key] * 100)}%`)),
      h('input', {
        type: 'range',
        min: '0',
        max: '1',
        step: '0.05',
        value: String(s[key]),
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          const span = (e.target as HTMLInputElement).previousElementSibling?.querySelector('span');
          if (span) span.textContent = `${Math.round(v * 100)}%`;
          update({ [key]: v } as Partial<Settings>);
        },
      }),
    );
  const fullscreenSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'field' },
      h('label', null, t('settings.language')),
      h(
        'select',
        {
          'data-testid': 'settings-language',
          onchange: (e: Event) => update({ language: (e.target as HTMLSelectElement).value as Language }),
        },
        LANGUAGES.map((l) => h('option', { value: l, selected: l === s.language }, LANGUAGE_NAMES[l])),
      ),
    ),
    slider('music', t('settings.music')),
    slider('sfx', t('settings.sfx')),
    slider('ambient', t('settings.ambient')),
    h(
      'div',
      { class: 'field' },
      h('label', null, `${t('settings.uiScale')}: `, h('span', null, `${Math.round(s.uiScale * 100)}%`)),
      h('input', {
        type: 'range',
        min: '0.8',
        max: '1.5',
        step: '0.05',
        value: String(s.uiScale),
        onchange: (e: Event) => update({ uiScale: Number((e.target as HTMLInputElement).value) }),
        oninput: (e: Event) => {
          const span = (e.target as HTMLInputElement).previousElementSibling?.querySelector('span');
          if (span) span.textContent = `${Math.round(Number((e.target as HTMLInputElement).value) * 100)}%`;
        },
      }),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', null, t('settings.quality')),
      h(
        'div',
        { class: 'opt-group' },
        (['low', 'high'] as const).map((q) =>
          h(
            'button',
            {
              class: s.quality === q ? 'active' : '',
              onclick: (e: Event) => {
                update({ quality: q });
                const group = (e.target as HTMLElement).parentElement;
                group?.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
                (e.target as HTMLElement).classList.add('active');
              },
            },
            t(`settings.quality.${q}`),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'field row' },
      h('input', {
        type: 'checkbox',
        id: 'opt-reduced',
        checked: s.reducedMotion,
        onchange: (e: Event) => update({ reducedMotion: (e.target as HTMLInputElement).checked }),
      }),
      h('label', { for: 'opt-reduced' }, t('settings.reducedMotion')),
    ),
    h(
      'div',
      { class: 'field' },
      h(
        'button',
        {
          disabled: !fullscreenSupported,
          title: fullscreenSupported ? '' : t('settings.fullscreenUnsupported'),
          onclick: () => {
            try {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen();
            } catch {
              // ignore
            }
          },
        },
        `⛶ ${t('settings.fullscreen')}`,
      ),
    ),
    o.onSaveDeleted ? h('h3', null, t('settings.data')) : null,
    !o.onSaveDeleted
      ? null
      : h(
          'button',
          {
            class: 'danger',
            'data-testid': 'delete-save',
            onclick: async () => {
              if (!o.saves.hasSave()) {
                await alertDialog(o.modalRoot, t('settings.deleteSave'), t('settings.noSave'));
                return;
              }
              const ok = await confirmDialog(
                o.modalRoot,
                t('settings.deleteSave'),
                t('settings.deleteConfirm'),
                true,
              );
              if (!ok) return;
              o.saves.clear();
              o.onSaveDeleted?.();
              await alertDialog(o.modalRoot, t('settings.deleteSave'), t('settings.deleted'));
            },
          },
          `🗑 ${t('settings.deleteSave')}`,
        ),
  );
}
