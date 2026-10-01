import { t } from '../i18n';
import { h } from './dom';

export interface ModalHandle {
  close(): void;
  el: HTMLElement;
}

export interface ModalOptions {
  wide?: boolean;
  /** Called when ESC/backdrop closes the modal. Return false to prevent. */
  onDismiss?: () => boolean | void;
  dismissable?: boolean;
  onClose?: () => void;
}

const stack: { handle: ModalHandle; opts: ModalOptions }[] = [];

export function modalOpen(): boolean {
  return stack.length > 0;
}

/** ESC handling for the top-most modal. Returns true if consumed. */
export function dismissTopModal(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (top.opts.dismissable === false) return true;
  if (top.opts.onDismiss?.() === false) return true;
  top.handle.close();
  return true;
}

export function openModal(root: HTMLElement, content: HTMLElement, opts: ModalOptions = {}): ModalHandle {
  const box = h(
    'div',
    { class: `modal${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    content,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, box);
  let closed = false;
  const handle: ModalHandle = {
    el: box,
    close: () => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      const i = stack.findIndex((s) => s.handle === handle);
      if (i >= 0) stack.splice(i, 1);
      opts.onClose?.();
    },
  };
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop && opts.dismissable !== false) {
      if (opts.onDismiss?.() === false) return;
      handle.close();
    }
  });
  stack.push({ handle, opts });
  root.appendChild(backdrop);
  const focusable = box.querySelector<HTMLElement>('button.primary, input, button');
  focusable?.focus();
  return handle;
}

export function confirmDialog(
  root: HTMLElement,
  title: string,
  message: string,
  danger = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const yes = h(
      'button',
      { class: danger ? 'danger' : 'primary', 'data-testid': 'confirm-yes' },
      t('common.confirm'),
    );
    const no = h('button', { 'data-testid': 'confirm-no' }, t('common.cancel'));
    const m = openModal(
      root,
      h('div', null, h('h2', null, title), h('p', null, message), h('div', { class: 'actions' }, no, yes)),
      {
        onClose: () => resolve(result),
      },
    );
    yes.addEventListener('click', () => {
      result = true;
      m.close();
    });
    no.addEventListener('click', () => m.close());
    yes.focus();
  });
}

export function alertDialog(root: HTMLElement, title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const ok = h('button', { class: 'primary' }, t('common.ok'));
    const m = openModal(
      root,
      h('div', null, h('h2', null, title), h('p', null, message), h('div', { class: 'actions' }, ok)),
      {
        onClose: () => resolve(),
      },
    );
    ok.addEventListener('click', () => m.close());
    ok.focus();
  });
}
