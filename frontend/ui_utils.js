/**
 * ui_utils.js — Shared UI utility functions for PixelPulse edit mode panels.
 *
 * Provides: makeDraggable, positionWithin, dismissOnOutsideClick,
 *           showToast, makePanel, makeMenu, makeButton
 */

// ─── Singleton toast element ──────────────────────────────────────────────────

let _toastEl = null;
let _toastTimer = null;

function _ensureToast() {
  if (_toastEl) return _toastEl;
  _toastEl = document.createElement('div');
  _toastEl.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px',
    'transform:translateX(-50%)',
    'background:rgba(23,28,41,0.97)',
    'color:#fff', 'padding:8px 16px',
    'border-radius:8px', 'font:13px/1.4 system-ui,sans-serif',
    'display:none', 'z-index:200',
    'pointer-events:none',
    'transition:opacity 0.15s',
    'white-space:nowrap',
  ].join(';');
  document.body.appendChild(_toastEl);
  return _toastEl;
}

/**
 * Show a brief toast message.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warn'} [type='info']
 * @param {number} [duration=1600]
 */
export function showToast(message, type = 'info', duration = 1600) {
  const el = _ensureToast();
  const colors = {
    info:    'rgba(23,28,41,0.97)',
    success: 'rgba(30,72,50,0.97)',
    error:   'rgba(72,25,30,0.97)',
    warn:    'rgba(72,55,15,0.97)',
  };
  el.style.background = colors[type] ?? colors.info;
  el.textContent = message;
  el.style.display = 'block';
  el.style.opacity = '1';
  window.clearTimeout(_toastTimer);
  _toastTimer = window.setTimeout(() => {
    el.style.opacity = '0';
    window.setTimeout(() => { el.style.display = 'none'; }, 150);
  }, duration);
}

// ─── Panel positioning ────────────────────────────────────────────────────────

/**
 * Position a fixed element so it stays within the viewport with a margin.
 * @param {HTMLElement} node
 * @param {number} x  Desired left position
 * @param {number} y  Desired top position
 * @param {number} [margin=8]
 */
export function positionWithin(node, x, y, margin = 8) {
  // Temporarily make visible so getBoundingClientRect works
  const prevDisplay = node.style.display;
  if (prevDisplay === 'none') node.style.display = 'block';
  const rect = node.getBoundingClientRect();
  if (prevDisplay === 'none') node.style.display = prevDisplay;

  const nx = Math.max(margin, Math.min(x, window.innerWidth  - rect.width  - margin));
  const ny = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
  node.style.left = `${nx}px`;
  node.style.top  = `${ny}px`;
}

// ─── Drag behaviour ───────────────────────────────────────────────────────────

/**
 * Make a fixed-position panel draggable.
 *
 * Drag starts on mousedown anywhere on the panel EXCEPT interactive elements
 * (button, input, select, textarea, a, label, details, summary).
 * Touch events are also supported for Pi touchscreen use.
 *
 * @param {HTMLElement} panel  The panel element to make draggable.
 * @param {HTMLElement} [handle]  Optional sub-element that acts as the drag
 *   handle. Defaults to the panel itself.
 */
export function makeDraggable(panel, handle) {
  if (panel._ppDraggable) return;
  panel._ppDraggable = true;

  const PASSIVE_TAGS = new Set(['BUTTON','INPUT','SELECT','TEXTAREA','A','LABEL','DETAILS','SUMMARY']);
  const dragHandle = handle ?? panel;
  dragHandle.style.cursor = 'grab';

  let dragging = false;
  let startX = 0, startY = 0, origLeft = 0, origTop = 0;

  function clientPos(e) {
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX, y: src.clientY };
  }

  function onStart(e) {
    if (PASSIVE_TAGS.has(e.target.tagName)) return;
    const pos = clientPos(e);
    const rect = panel.getBoundingClientRect();
    dragging = true;
    startX = pos.x; startY = pos.y;
    origLeft = rect.left; origTop = rect.top;
    dragHandle.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    const pos = clientPos(e);
    const dx = pos.x - startX;
    const dy = pos.y - startY;
    const rect = panel.getBoundingClientRect();
    const nx = Math.max(0, Math.min(origLeft + dx, window.innerWidth  - rect.width));
    const ny = Math.max(0, Math.min(origTop  + dy, window.innerHeight - rect.height));
    panel.style.left = `${nx}px`;
    panel.style.top  = `${ny}px`;
  }

  function onEnd() {
    dragging = false;
    dragHandle.style.cursor = 'grab';
  }

  dragHandle.addEventListener('mousedown',  onStart);
  dragHandle.addEventListener('touchstart', onStart, { passive: false });
  window.addEventListener('mousemove',  onMove);
  window.addEventListener('touchmove',  onMove, { passive: false });
  window.addEventListener('mouseup',    onEnd);
  window.addEventListener('touchend',   onEnd);
}

// ─── Click-away dismiss ───────────────────────────────────────────────────────

/**
 * Hide an element when the user clicks outside it.
 * Attaches a one-shot capture-phase listener so it fires before any other
 * handlers, and only if the click is genuinely outside the element.
 *
 * @param {HTMLElement} el  Element to watch.
 * @param {()=>void} [onDismiss]  Optional callback after hiding.
 * @param {number} [delay=0]  Milliseconds to wait before arming the listener
 *   (prevents the opening click from immediately dismissing).
 */
export function dismissOnOutsideClick(el, onDismiss, delay = 80) {
  // Cancel any previous dismiss listener on this element
  if (el._ppDismissCleanup) {
    el._ppDismissCleanup();
    el._ppDismissCleanup = null;
  }

  const timer = window.setTimeout(() => {
    function handler(e) {
      // Ignore clicks that land inside the panel itself
      if (el.contains(e.target)) return;
      // Ignore clicks on the Pixi canvas (those come through as pointertap
      // and can race with the dismiss listener at delay=0)
      if (e.target?.tagName === 'CANVAS') return;
      el.style.display = 'none';
      document.removeEventListener('click', handler, true);
      el._ppDismissCleanup = null;
      onDismiss?.();
    }
    document.addEventListener('click', handler, true);
    el._ppDismissCleanup = () => document.removeEventListener('click', handler, true);
  }, delay);

  // Also store a cleanup so callers can cancel if they re-open
  el._ppDismissCancelTimer = () => window.clearTimeout(timer);
}

// ─── Panel / Menu factory helpers ─────────────────────────────────────────────

const PANEL_BASE = [
  'position:fixed',
  'display:none',
  'background:rgba(18,24,36,0.98)',
  'border:1px solid rgba(144,178,221,0.45)',
  'border-radius:10px',
  'color:#e8f1ff',
  'font:12px/1.4 system-ui,sans-serif',
  'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
].join(';');

/**
 * Create a styled floating panel element and append it to document.body.
 * @param {object} [opts]
 * @param {number}  [opts.zIndex=65]
 * @param {string}  [opts.padding='12px']
 * @param {string}  [opts.minWidth='260px']
 * @param {string}  [opts.maxWidth='340px']
 * @param {boolean} [opts.draggable=true]  Auto-apply makeDraggable.
 * @param {string}  [opts.title]  If provided, a drag-handle title bar is added.
 * @returns {HTMLDivElement}
 */
export function makePanel({ zIndex = 65, padding = '12px', minWidth = '260px', maxWidth = '340px', draggable = true, title } = {}) {
  const el = document.createElement('div');
  el.style.cssText = `${PANEL_BASE};z-index:${zIndex};padding:${padding};min-width:${minWidth};max-width:${maxWidth};`;
  document.body.appendChild(el);

  if (title) {
    const bar = _makeTitleBar(title, () => { el.style.display = 'none'; });
    el.appendChild(bar);
    if (draggable) makeDraggable(el, bar);
  } else if (draggable) {
    makeDraggable(el);
  }

  return el;
}

/**
 * Create a styled context menu element and append it to document.body.
 * @param {number} [zIndex=66]
 * @returns {HTMLDivElement}
 */
export function makeMenu(zIndex = 66) {
  const el = document.createElement('div');
  el.style.cssText = `${PANEL_BASE};z-index:${zIndex};padding:6px;min-width:160px;`;
  document.body.appendChild(el);
  return el;
}

/**
 * Create a styled menu button and append it to a parent element.
 * @param {HTMLElement} parent
 * @param {string} label
 * @param {()=>void} onClick
 * @param {object} [opts]
 * @param {string} [opts.color]   Optional text colour override.
 * @param {string} [opts.icon]    Optional leading emoji/icon.
 * @returns {HTMLButtonElement}
 */
export function makeMenuButton(parent, label, onClick, { color, icon } = {}) {
  const b = document.createElement('button');
  b.style.cssText = [
    'display:block', 'width:100%', 'text-align:left',
    'padding:8px 10px', 'border:0', 'border-radius:6px',
    'background:transparent', `color:${color ?? '#e8f1ff'}`,
    'cursor:pointer', 'font:12px/1.4 system-ui,sans-serif',
    'transition:background 0.1s',
  ].join(';');
  b.innerHTML = icon ? `<span style="margin-right:6px">${icon}</span>${label}` : label;
  b.addEventListener('mouseenter', () => { b.style.background = 'rgba(100,140,200,0.18)'; });
  b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
  b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
}

/**
 * Create a divider line inside a menu.
 * @param {HTMLElement} parent
 */
export function makeMenuDivider(parent) {
  const hr = document.createElement('div');
  hr.style.cssText = 'border-top:1px solid rgba(144,178,221,0.18);margin:4px 0;';
  parent.appendChild(hr);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _makeTitleBar(title, onClose) {
  const bar = document.createElement('div');
  bar.style.cssText = [
    'display:flex', 'justify-content:space-between', 'align-items:center',
    'font-weight:700', 'margin-bottom:8px',
    'padding-bottom:8px', 'border-bottom:1px solid rgba(144,178,221,0.2)',
    'cursor:grab', 'user-select:none',
  ].join(';');

  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  bar.appendChild(titleSpan);

  if (onClose) {
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = [
      'border:0', 'background:transparent', 'color:rgba(200,220,255,0.5)',
      'font-size:14px', 'cursor:pointer', 'padding:0 2px', 'line-height:1',
      'transition:color 0.1s',
    ].join(';');
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#e8f1ff'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = 'rgba(200,220,255,0.5)'; });
    closeBtn.addEventListener('click', onClose);
    bar.appendChild(closeBtn);
  }

  return bar;
}