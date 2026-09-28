/* Completez — utilitare comune */
(function () {
  'use strict';
  const CZ = (window.CZ = window.CZ || {});
  const U = (CZ.util = {});

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'multiple']);
  U.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (PROPS.has(k)) el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : String(kid));
    }
    return el;
  };

  U.uid = (p) => (p || 'id') + Math.random().toString(36).slice(2, 9);
  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* Normalizare pentru potrivirea etichetelor: fără diacritice, litere mici,
     punctuația devine spațiu (păstrăm punctul pentru „nr.”, „str.” etc.). */
  U.nrm = function (s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’'`´]/g, '')
      .replace(/[^a-z0-9.@]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  /* ş ţ (sedilă) → ș ț (virgulă), forma corectă în română */
  U.fixDiacritics = (s) =>
    String(s || '').replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');

  U.pad2 = (n) => String(n).padStart(2, '0');
  U.fmtDate = (d) => `${U.pad2(d.getDate())}.${U.pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  U.today = () => U.fmtDate(new Date());
  U.parseDate = function (s) {
    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  };

  U.debounce = function (fn, ms) {
    let t = null;
    const f = (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
    f.flush = (...a) => {
      clearTimeout(t);
      fn(...a);
    };
    return f;
  };

  U.b64ToBytes = function (b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  U.bytesToB64 = function (bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  };

  U.sha256Hex = async function (bytes) {
    try {
      if (!crypto || !crypto.subtle) return null;
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return null;
    }
  };

  U.readFile = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(new Uint8Array(r.result));
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(file);
    });
  U.readText = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });

  U.loadImg = (src) =>
    new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('Imaginea nu a putut fi citită.'));
      im.src = src;
    });

  U.toBlob = (canvas, type, q) =>
    new Promise((res) => canvas.toBlob((b) => res(b), type || 'image/png', q));

  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };

  /* Fontul încorporat (Arimo) — folosit identic în previzualizare și în PDF */
  let fontBytesCache = null;
  U.fontBytes = function () {
    if (!fontBytesCache) fontBytesCache = U.b64ToBytes(window.CZ_FONT_ARIMO_B64);
    return fontBytesCache.slice();
  };
  U.FONT = 'CZArimo';
  U.fontReady = (async function () {
    try {
      const face = new FontFace(U.FONT, U.b64ToBytes(window.CZ_FONT_ARIMO_B64).buffer);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch (e) {
      return false;
    }
  })();
  const measureCtx = document.createElement('canvas').getContext('2d');
  /* lățimea textului la 1px font-size, în px */
  U.textWidth1 = function (text) {
    measureCtx.font = `100px ${U.FONT}, Arial, sans-serif`;
    return measureCtx.measureText(text).width / 100;
  };

  /* Notificări scurte */
  U.toast = function (msg, kind, ms) {
    const root = document.getElementById('toasts');
    if (!root) return;
    const t = U.h('div', { class: 'toast' + (kind ? ' toast-' + kind : ''), role: 'status' }, msg);
    root.append(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    setTimeout(() => {
      t.classList.remove('is-in');
      setTimeout(() => t.remove(), 300);
    }, ms || 3400);
  };

  /* Salvarea unui fișier: în Claude prin capabilitatea „downloads”, altfel link de descărcare */
  U.saveFile = async function (filename, data, mime) {
    if (CZ.capsReady) {
      try {
        await CZ.capsReady;
      } catch (e) {}
    }
    const dl = CZ.caps && CZ.caps.downloads;
    if (dl) {
      try {
        const payload = typeof data === 'string' ? data : new Blob([data], { type: mime || 'application/octet-stream' });
        const r = await dl.save({ filename, data: payload });
        return r && r.status === 'delivered' ? 'delivered' : 'saved';
      } catch (e) {
        if (e && e.code === 'declined') return 'declined';
        if (e && e.code === 'rate_limited') {
          U.toast('Există deja o fereastră de salvare deschisă. Încearcă din nou peste câteva secunde.', 'warn');
          return 'error';
        }
        if (!e || !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) {
          U.toast('Fișierul nu a putut fi salvat: ' + ((e && e.message) || 'eroare necunoscută'), 'bad');
          return 'error';
        }
        /* capabilitate indisponibilă: încercăm varianta clasică */
      }
    }
    let framed = true;
    try {
      framed = window.self !== window.top;
    } catch (e) {}
    if (framed && window.claude) {
      U.toast('În această vizualizare descărcarea nu e permisă. Deschide aplicația direct în Claude și încearcă din nou.', 'bad', 7000);
      return 'error';
    }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = U.h('a', { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return 'saved';
    } catch (e) {
      U.toast('Browserul a blocat descărcarea.', 'bad');
      return 'error';
    }
  };

  /* Dialog propriu (confirm/prompt nu funcționează în toate mediile) */
  U.dialog = function ({ title, body, actions, wide }) {
    return new Promise((resolve) => {
      const root = document.getElementById('modalRoot');
      let wrap = null;
      const close = (v) => {
        if (wrap) wrap.remove();
        document.removeEventListener('keydown', onKey);
        resolve(v);
      };
      if (typeof body === 'function') body = body(close);
      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
      };
      const box = U.h(
        'div',
        { class: 'modal' + (wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        U.h('div', { class: 'modal-head' }, U.h('h2', { class: 'modal-title' }, title),
          U.h('button', { class: 'icon-btn', 'aria-label': 'Închide', onclick: () => close(null) }, U.icon('x'))),
        U.h('div', { class: 'modal-body' }, body),
        actions && actions.length
          ? U.h('div', { class: 'modal-actions' },
              actions.map((a) =>
                U.h('button', { class: 'btn ' + (a.kind || 'ghost'), onclick: () => close(a.value) }, a.label)))
          : null
      );
      wrap = U.h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(null); } }, box);
      root.append(wrap);
      document.addEventListener('keydown', onKey);
      const first = box.querySelector('input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea, .btn.primary');
      if (first) setTimeout(() => first.focus(), 30);
      box._close = close;
    });
  };
  U.confirm = (title, text, okLabel, danger) =>
    U.dialog({
      title,
      body: U.h('p', { class: 'modal-text' }, text),
      actions: [
        { label: 'Renunț', value: false },
        { label: okLabel || 'Da', value: true, kind: danger ? 'danger' : 'primary' },
      ],
    }).then((v) => v === true);

  /* Iconițe liniare mici (SVG inline) */
  const ICONS = {
    doc: 'M7 3h7l5 5v13H7z M14 3v5h5 M9.5 13h7 M9.5 17h5',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20c1.4-3.6 4.2-5 7.5-5s6.1 1.4 7.5 5',
    gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M19.4 13.5l1.6 1.2-1.6 2.8-1.9-.7a7 7 0 0 1-1.7 1l-.3 2h-3.2l-.3-2a7 7 0 0 1-1.7-1l-1.9.7-1.6-2.8 1.6-1.2a7 7 0 0 1 0-2l-1.6-1.2 1.6-2.8 1.9.7a7 7 0 0 1 1.7-1l.3-2h3.2l.3 2a7 7 0 0 1 1.7 1l1.9-.7 1.6 2.8-1.6 1.2a7 7 0 0 1 0 2z',
    x: 'M6 6l12 12 M18 6L6 18',
    plus: 'M12 5v14 M5 12h14',
    pen: 'M4 20l4-1 11-11-3-3L5 16z M14 6l3 3',
    sign: 'M3 17c2-4 4-9 6-9s-1 8 1 8 3-5 5-5 1 4 3 4 2-2 3-2 M3 21h18',
    cal: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
    check: 'M5 12l4 4 10-10',
    zoomin: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6 M11 8v6',
    zoomout: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    crop: 'M6 2v16h16 M2 6h16v16',
    rotate: 'M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4',
    download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
    upload: 'M12 20V9 M7 14l5-5 5 5 M5 4h14',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
    lock: 'M6 11h12v10H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    next: 'M5 12h13 M13 6l6 6-6 6',
    save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6',
    alert: 'M12 4l9 16H3z M12 10v4 M12 17.5v.5',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5v.5',
    back: 'M19 12H6 M11 6l-6 6 6 6',
    image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9.5a1.5 1.5 0 1 0 0-.01',
    file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  };
  U.icon = function (name, cls) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONS[name] || ICONS.info);
    svg.append(p);
    return svg;
  };
})();
