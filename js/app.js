/* Completez — pornirea aplicației, navigarea și ecranul de blocare */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const S = CZ.store;
  const SC = CZ.schema;
  const h = U.h;
  const $ = (s) => document.querySelector(s);

  const APP = (CZ.app = {});
  CZ.caps = CZ.caps || { downloads: null };
  const TABS = ['document', 'profiluri', 'setari'];
  let current = 'document';

  APP.go = function (tab, opts) {
    if (!TABS.includes(tab)) tab = 'document';
    current = tab;
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    for (const t of TABS) $('#view-' + t).hidden = t !== tab;
    if (tab === 'profiluri') CZ.profilesUI.render(opts);
    if (tab === 'setari') CZ.settingsUI.render();
    if (tab === 'document' && CZ.editor.doc) CZ.editor.refresh();
    try {
      history.replaceState(null, '', '#' + tab);
    } catch (e) {}
    window.scrollTo(0, 0);
  };

  APP.renderChip = function () {
    const chip = $('#profileChip');
    if (!chip) return;
    const p = S.activeProfile();
    const name = p ? SC.displayName(p) : 'Fără profil';
    const initials = p
      ? ((p.fields.prenume || '')[0] || '') + ((p.fields.nume || '')[0] || '') || (name[0] || '?')
      : '+';
    chip.replaceChildren(h('span', { class: 'avatar' }, initials.toUpperCase()), h('span', { class: 'pname' }, name));
    chip.setAttribute('aria-label', 'Profilul activ: ' + name + '. Schimbă profilul');
  };

  async function chipMenu() {
    const profs = S.profiles();
    await U.dialog({
      title: 'Completez pentru',
      body: (close) => h('div', { style: { display: 'grid', gap: '8px' } },
        profs.length ? profs.map((p) => h('button', {
          class: 'pcard' + (S.data.activeProfileId === p.id ? ' is-on' : ''), type: 'button',
          onclick: () => {
            S.data.activeProfileId = p.id;
            if (CZ.editor.doc) CZ.editor.doc.profileId = p.id;
            S.save();
            APP.renderChip();
            CZ.editor.refresh();
            if (current === 'profiluri') CZ.profilesUI.render();
            close(p.id);
          },
        }, h('span', { class: 'pc-name' }, SC.displayName(p), p.isExample ? h('span', { class: 'pill' }, 'exemplu') : null),
          h('span', { class: 'pc-sub' }, p.label && p.label !== SC.displayName(p) ? p.label : ' '))) : h('p', { class: 'muted' }, 'Nu ai încă niciun profil.'),
        h('button', { class: 'btn', type: 'button', onclick: () => { close(null); APP.go('profiluri', profs.length ? null : { newProfile: true }); } },
          U.icon('user'), profs.length ? 'Gestionează profilurile' : 'Creează profilul meu')),
    });
  }

  APP.afterDataReplaced = function () {
    APP.renderChip();
    if (CZ.editor.doc) {
      CZ.editor.doc.profileId = (S.activeProfile() || {}).id || null;
      CZ.editor.refresh();
    } else {
      CZ.editor.renderIntake();
    }
    CZ.profilesUI.editingId = null;
    APP.go(current);
  };

  APP.onAiReady = () => { if (CZ.editor.onAiReady) CZ.editor.onAiReady(); };

  async function initCaps() {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const dl = await window.claude.use('downloads');
        if (dl) CZ.caps.downloads = dl;
      }
    } catch (e) {}
  }

  function seedExample() {
    const p = SC.exampleProfile();
    try {
      const c = CZ.imaging.exampleSignature();
      if (c) {
        const id = U.uid('s');
        p.signatures.push({ id, name: 'Semnătură exemplu', dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height, createdAt: Date.now() });
        p.defaultSigId = id;
      }
    } catch (e) {}
    S.data.profiles.push(p);
    S.data.activeProfileId = p.id;
    S.data.exampleSeeded = true;
    S.save();
  }

  function start() {
    document.querySelectorAll('[data-icon]').forEach((el) => el.replaceWith(U.icon(el.dataset.icon)));
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => APP.go(b.dataset.tab)));
    document.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); APP.go(a.dataset.go); }));
    $('#profileChip').addEventListener('click', chipMenu);
    CZ.editor.mount($('#view-document'));
    CZ.profilesUI.mount($('#view-profiluri'));
    CZ.settingsUI.mount($('#view-setari'));

    let firstRun = false;
    if (!S.data.exampleSeeded && !S.profiles().length) {
      seedExample();
      firstRun = true;
    }
    APP.renderChip();
    const hash = (location.hash || '').replace('#', '');
    const tab = TABS.includes(hash) ? hash : 'document';
    APP.go(tab);
    if (firstRun && tab === 'document') CZ.editor.openSample();
    U.fontReady.then(() => { if (CZ.editor.doc) CZ.editor.refresh(); });
    if (!CZ.docs.ready()) {
      U.toast('Bibliotecile pentru PDF nu s-au încărcat. Verifică conexiunea la internet și reîncarcă pagina.', 'bad', 8000);
    }
  }

  function showLock() {
    const lock = $('#lock');
    const pw = h('input', { class: 'input', type: 'password', id: 'unlockPw', autocomplete: 'current-password', placeholder: 'Parola' });
    const err = h('p', { class: 'help bad', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Deblochează');
    const form = h('form', { class: 'card lock-card' },
      h('span', { class: 'brand-word', style: { justifySelf: 'start' } }, 'Complet', h('b', null, 'ez')),
      h('h1', null, 'Datele sunt protejate'),
      h('p', { class: 'muted' }, 'Introdu parola ca să folosești profilurile și semnăturile salvate pe acest dispozitiv.'),
      h('label', { class: 'field' }, h('span', null, 'Parola'), pw),
      err,
      btn,
      h('button', { class: 'linklike small', type: 'button', onclick: async () => {
        const ok = await U.confirm('Ai uitat parola?', 'Datele criptate nu pot fi recuperate fără parolă. Poți șterge tot și începe de la zero.', 'Șterge și încep din nou', true);
        if (!ok) return;
        S.wipe();
        await S.saveNow();
        lock.hidden = true;
        start();
      } }, 'Am uitat parola'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      err.textContent = '';
      try {
        await S.unlock(pw.value);
        lock.hidden = true;
        start();
      } catch (ex) {
        err.textContent = 'Parola nu e corectă.';
        pw.select();
      } finally {
        btn.disabled = false;
      }
    });
    lock.replaceChildren(form);
    lock.hidden = false;
    setTimeout(() => pw.focus(), 50);
  }

  function boot() {
    CZ.docs.ready();
    const st = S.load();
    CZ.capsReady = initCaps();
    CZ.ai.init();
    if (st === 'locked') showLock();
    else start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
