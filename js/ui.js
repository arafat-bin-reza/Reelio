// Toasts, confirm and prompt dialogs, and generic modal wiring.

import { $ } from './util.js';

const TOAST_DURATION = 3500;

export function toast(message, type = 'info', duration = TOAST_DURATION) {
  const container = $('#toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  container.appendChild(el);

  const remove = () => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
}

export function confirmDialog({ title = 'Are you sure?', message = '', okText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  const ok = $('#confirm-ok');
  const cancel = $('#confirm-cancel');
  ok.textContent = okText;
  cancel.textContent = cancelText;
  ok.classList.toggle('btn-danger', danger);
  ok.classList.toggle('btn-primary', !danger);

  return new Promise((resolve) => {
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
    cancel.focus();
  });
}

export function promptDialog({ title = 'Rename', label = 'New title', value = '', okText = 'Save' } = {}) {
  const dialog = $('#prompt-dialog');
  const input = $('#prompt-input');
  $('#prompt-title').textContent = title;
  $('#prompt-label').textContent = label;
  $('#prompt-ok').textContent = okText;
  input.value = value;

  return new Promise((resolve) => {
    dialog.returnValue = '';
    dialog.addEventListener(
      'close',
      () => {
        const text = input.value.trim();
        resolve(dialog.returnValue === 'ok' && text ? text : null);
      },
      { once: true }
    );
    dialog.showModal();
    input.focus();
    input.select();
  });
}

/** Close a dialog from any element inside it carrying a data-close attribute. */
export function wireCloseButtons(dialog) {
  dialog.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => dialog.close());
  });
}

/** Close any open modal when the backdrop (outside the content box) is clicked. */
export function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}
