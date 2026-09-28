/* Completez — profilurile: datele pentru autocompletare și semnăturile */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const S = CZ.store;
  const SC = CZ.schema;
  const h = U.h;

  const P = (CZ.profilesUI = { editingId: null });
  let root = null;

  P.mount = (el) => { root = el; };

  function afterChange() {
    S.save();
    if (CZ.editor) CZ.editor.refresh();
    if (CZ.app) CZ.app.renderChip();
  }

  P.createProfile = function () {
    const own = S.profiles().filter((p) => !p.isExample);
    const p = SC.newProfile(own.length ? 'Profil nou' : 'Eu');
    S.data.profiles.push(p);
    const act = S.activeProfile();
    if (!act || act.isExample) S.data.activeProfileId = p.id;
    P.editingId = p.id;
    afterChange();
    return p;
  };

  P.render = function (opts) {
    if (!root) return;
    if (opts && opts.newProfile) P.createProfile();
    const profs = S.profiles();
    if (!P.editingId || !S.profile(P.editingId)) P.editingId = (S.activeProfile() || profs[0] || {}).id || null;

    const head = h('div', { class: 'view-head' },
      h('div', null,
        h('h1', null, 'Profiluri'),
        h('p', null, 'Datele de aici completează automat formularele. Poți avea mai multe profiluri, de exemplu pentru tine și pentru un părinte. Rămân doar în acest browser.')),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { P.createProfile(); P.render(); } }, U.icon('plus'), 'Profil nou'));

    if (!profs.length) {
      root.replaceChildren(head, h('div', { class: 'card sblock' },
        h('h2', null, 'Încă nu ai niciun profil'),
        h('p', { class: 'muted' }, 'Creează-ți profilul o singură dată: nume, CNP, buletin, adresă, facultate. Apoi fiecare formular se completează singur.'),
        h('div', null, h('button', { class: 'btn primary', type: 'button', onclick: () => { P.createProfile(); P.render(); } }, 'Creează profilul meu'))));
      return;
    }
    const list = h('div', { class: 'plist', role: 'list' }, profs.map(pcard));
    const ed = S.profile(P.editingId);
    root.replaceChildren(head, h('div', { class: 'profiles' }, list, editor(ed)));
  };

  function masked(cnp) {
    const d = CZ.cnp.clean(cnp);
    return d.length >= 4 ? 'CNP •••••••••' + d.slice(-4) : 'fără CNP';
  }

  function pcard(p) {
    const active = S.data.activeProfileId === p.id;
    return h('button', {
      class: 'pcard' + (P.editingId === p.id ? ' is-on' : ''), type: 'button', role: 'listitem', 'data-pid': p.id,
      onclick: () => { P.editingId = p.id; P.render(); },
    },
      h('span', { class: 'pc-name' }, h('span', { class: 'pc-title' }, SC.displayName(p)),
        active ? h('span', { class: 'pill pen' }, 'activ') : null,
        p.isExample ? h('span', { class: 'pill' }, 'exemplu') : null),
      h('span', { class: 'pc-sub mono' }, masked(p.fields.cnp)),
      h('span', { class: 'pc-sub' }, p.signatures.length ? `${p.signatures.length} ${p.signatures.length === 1 ? 'semnătură' : 'semnături'}` : 'fără semnătură'));
  }

  function refreshCard(p) {
    const el = root.querySelector(`.pcard[data-pid="${p.id}"]`);
    if (el) el.replaceWith(pcard(p));
  }

  function cnpBox(p) {
    const cells = h('div', { class: 'cnp-cells', 'aria-hidden': 'true' });
    const help = h('p', { class: 'help', 'aria-live': 'polite' });
    const upd = () => {
      const v = CZ.cnp.validate(p.fields.cnp);
      const d = v.digits.padEnd(13, ' ').slice(0, 13);
      cells.replaceChildren(...Array.from(d).map((c) => h('span', null, c.trim())));
      cells.className = 'cnp-cells' + (v.ok ? ' ok' : v.digits.length === 13 ? ' bad' : '');
      if (v.ok) {
        const who = v.sex === 'F' ? 'femeie, născută' : v.sex === 'M' ? 'bărbat, născut' : 'născut(ă)';
        help.className = 'help ok';
        help.textContent = `CNP valid · ${who} la ${v.birthStr}`;
      } else {
        help.className = 'help' + (v.error && v.digits.length >= 13 ? ' bad' : '');
        help.textContent = v.error || 'Cifra de control se verifică automat.';
      }
    };
    upd();
    return { cells, help, upd };
  }

  function editor(p) {
    if (!p) return h('div');
    const saved = h('span', { class: 'saved-note', 'aria-live': 'polite' });
    let tm = null;
    const title = h('h2', null, SC.displayName(p));
    const touch = () => {
      title.textContent = SC.displayName(p);
      saved.textContent = 'Salvat';
      clearTimeout(tm);
      tm = setTimeout(() => (saved.textContent = ''), 1400);
      afterChange();
      refreshCard(p);
    };
    const touchLater = U.debounce(touch, 300);
    const active = S.data.activeProfileId === p.id;

    const headCard = h('div', { class: 'card peditor-head' },
      h('div', null, h('p', { class: 'eyebrow' }, p.isExample ? 'Profil demonstrativ' : active ? 'Profilul activ' : 'Profil'), title, saved),
      h('div', { class: 'row', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        !active ? h('button', { class: 'btn', type: 'button', onclick: () => {
          S.data.activeProfileId = p.id;
          if (CZ.editor.doc) CZ.editor.doc.profileId = p.id;
          afterChange();
          P.render();
          U.toast(`Completezi acum cu profilul ${SC.displayName(p)}.`, 'ok');
        } }, 'Folosește acest profil') : null,
        h('button', { class: 'btn danger', type: 'button', onclick: () => removeProfile(p) }, U.icon('trash'), p.isExample ? 'Șterge exemplul' : 'Șterge')));

    const labelInput = h('input', { class: 'input', id: 'pLabel', value: p.label || '', placeholder: 'Eu, Mama, Tata…' });
    labelInput.addEventListener('input', () => { p.label = labelInput.value; touchLater(); });
    const order = h('div', { class: 'seg', role: 'group', 'aria-label': 'Ordinea numelui' },
      ['np', 'pn'].map((o) => h('button', {
        type: 'button', class: p.nameOrder === o ? 'is-on' : '',
        onclick: (e) => { p.nameOrder = o; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('is-on')); e.currentTarget.classList.add('is-on'); touch(); },
      }, o === 'np' ? 'Nume Prenume' : 'Prenume Nume')));
    const basics = h('div', { class: 'card pgrid' },
      h('label', { class: 'field' }, h('span', null, 'Numele profilului (doar pentru tine)'), labelInput),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Cum scriu numele complet în formulare'), order));

    const sections = SC.groups.map((g) => {
      const filled = g.fields.filter((f) => String(p.fields[f.key] || '').trim()).length;
      const count = h('span', { class: 'count' }, `${filled} din ${g.fields.length}`);
      const grid = h('div', { class: 'pgrid' });
      let cnp = null;
      for (const def of g.fields) {
        const derived = def.fromCnp ? SC.value(p, def.key) : '';
        const input = h('input', {
          class: 'input' + (def.mono ? ' mono' : ''), id: 'pf_' + def.key, value: p.fields[def.key] || '',
          placeholder: derived && !p.fields[def.key] ? 'din CNP: ' + derived : def.ph || '',
          inputmode: def.inputmode || null, autocomplete: def.auto || 'off', spellcheck: 'false',
        });
        input.addEventListener('input', () => {
          let v = input.value;
          if (def.upper) {
            const pos = input.selectionStart;
            v = v.toUpperCase();
            input.value = v;
            try { input.setSelectionRange(pos, pos); } catch (e) {}
          }
          p.fields[def.key] = v;
          if (def.key === 'cnp' && cnp) {
            cnp.upd();
            grid.parentElement && grid.parentElement.parentElement && updateDerived(root, p);
          }
          const nf = g.fields.filter((f) => String(p.fields[f.key] || '').trim()).length;
          count.textContent = `${nf} din ${g.fields.length}`;
          touchLater();
        });
        const wrap = h('label', { class: 'field' + (def.short ? ' short' : '') }, h('span', null, def.label), input);
        if (def.key === 'cnp') {
          cnp = cnpBox(p);
          wrap.append(cnp.cells, cnp.help);
        }
        grid.append(wrap);
      }
      const hasData = filled > 0;
      return h('details', { class: 'card psection', open: g.open || hasData || null }, h('summary', null, g.title, count), grid);
    });

    const customList = h('div', { style: { display: 'grid', gap: '10px' } });
    const drawCustom = () => {
      customList.replaceChildren(...p.custom.map((c) => {
        const l = h('input', { class: 'input', value: c.label || '', placeholder: 'ex. Număr permis auto' });
        const v = h('input', { class: 'input', value: c.value || '', placeholder: 'valoarea' });
        l.addEventListener('input', () => { c.label = l.value; touchLater(); });
        v.addEventListener('input', () => { c.value = v.value; touchLater(); });
        return h('div', { class: 'custom-row' },
          h('label', { class: 'field' }, h('span', null, 'Eticheta din formular'), l),
          h('label', { class: 'field' }, h('span', null, 'Ce scriu acolo'), v),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Șterge câmpul ' + (c.label || ''), onclick: () => { p.custom = p.custom.filter((x) => x !== c); drawCustom(); touch(); } }, U.icon('trash')));
      }));
    };
    drawCustom();
    const custom = h('details', { class: 'card psection', open: p.custom.length ? true : null },
      h('summary', null, 'Câmpurile mele', h('span', { class: 'count' }, 'pentru ce nu e în listă')),
      h('div', { style: { padding: '16px', display: 'grid', gap: '12px' } },
        h('p', { class: 'help' }, 'Dacă un formular cere ceva ce nu apare mai sus, adaugă aici eticheta exact cum apare în formular. Data viitoare se completează singur.'),
        customList,
        h('div', null, h('button', { class: 'btn sm', type: 'button', onclick: () => { p.custom.push({ id: U.uid('c'), label: '', value: '' }); drawCustom(); touch(); } }, U.icon('plus'), 'Adaugă un câmp'))));

    const sigWrap = h('div', { class: 'sigs' });
    const drawSigs = () => {
      sigWrap.replaceChildren(
        ...p.signatures.map((s) => h('div', { class: 'sigcard' },
          h('div', { class: 'checker' }, h('img', { src: s.dataUrl, alt: s.name || 'Semnătură' })),
          h('div', { class: 'row' },
            h('label', { class: 'check small' },
              h('input', { type: 'radio', name: 'defsig_' + p.id, checked: p.defaultSigId === s.id, onchange: () => { p.defaultSigId = s.id; touch(); } }),
              'Implicită'),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Șterge semnătura', onclick: async () => {
              if (!(await U.confirm('Ștergi semnătura?', 'Documentele deja descărcate nu se schimbă.', 'Șterge', true))) return;
              p.signatures = p.signatures.filter((x) => x !== s);
              if (p.defaultSigId === s.id) p.defaultSigId = p.signatures[0] ? p.signatures[0].id : null;
              drawSigs();
              touch();
            } }, U.icon('trash'))))),
        h('div', { class: 'sigcard', style: { alignContent: 'center' } },
          h('p', { class: 'small muted' }, p.signatures.length ? 'Adaugă încă o semnătură (de exemplu inițialele).' : 'Adaugă semnătura ta.'),
          h('button', { class: 'btn sm primary', type: 'button', onclick: async () => { if (await P.addSignature(p, 'photo')) { drawSigs(); touch(); } } }, U.icon('camera'), 'Din poză'),
          h('button', { class: 'btn sm', type: 'button', onclick: async () => { if (await P.addSignature(p, 'draw')) { drawSigs(); touch(); } } }, U.icon('pen'), 'Desenează')));
    };
    drawSigs();
    const sigs = h('details', { class: 'card psection', open: true },
      h('summary', null, 'Semnături', h('span', { class: 'count' }, `${p.signatures.length}`)), sigWrap);

    return h('div', { class: 'peditor' }, headCard, basics, sigs, ...sections, custom);
  }

  function updateDerived(scope, p) {
    for (const key of ['dataNasterii', 'sex']) {
      const el = scope.querySelector('#pf_' + key);
      if (!el) continue;
      const d = SC.value(Object.assign({}, p, { fields: Object.assign({}, p.fields, { [key]: '' }) }), key);
      el.placeholder = d ? 'din CNP: ' + d : SC.defs[key].ph || '';
    }
  }

  async function removeProfile(p) {
    const ok = await U.confirm(
      p.isExample ? 'Ștergi profilul demonstrativ?' : `Ștergi profilul ${SC.displayName(p)}?`,
      'Datele și semnăturile acestui profil se șterg din browser. Documentele deja descărcate nu se schimbă.',
      'Șterge', true);
    if (!ok) return;
    S.data.profiles = S.profiles().filter((x) => x.id !== p.id);
    if (S.data.activeProfileId === p.id) S.data.activeProfileId = S.profiles()[0] ? S.profiles()[0].id : null;
    if (CZ.editor.doc && CZ.editor.doc.profileId === p.id) CZ.editor.doc.profileId = S.data.activeProfileId;
    P.editingId = null;
    afterChange();
    P.render();
  }

  /* ---------- semnătura ---------- */
  function saveSig(p, canvas, name) {
    const id = U.uid('s');
    p.signatures.push({ id, name: name || 'Semnătura', dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height, createdAt: Date.now() });
    if (!p.defaultSigId || !p.signatures.some((s) => s.id === p.defaultSigId)) p.defaultSigId = id;
    S.save();
    return id;
  }

  P.addSignature = function (p, mode) {
    return mode === 'draw' ? drawSignature(p) : photoSignature(p);
  };

  async function photoSignature(p) {
    let img = null;
    let result = null;
    const opts = { sens: 0, weight: 0, color: 'blue', rotate: 0 };
    const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'sigFile' });
    const orig = h('img', { class: 'sig-original', alt: 'Poza originală', hidden: true });
    const out = h('div', { class: 'checker' }, h('span', { class: 'muted small' }, 'Aici apare semnătura curățată, fără fundal.'));
    const outImg = h('img', { alt: 'Semnătura curățată' });
    const recompute = U.debounce(() => {
      if (!img) return;
      const c = CZ.imaging.extractSignature(img, opts);
      if (!c) {
        result = null;
        out.replaceChildren(h('span', { class: 'muted small' }, 'Nu am găsit o semnătură. Mărește sensibilitatea sau fă o poză mai clară.'));
        return;
      }
      result = c;
      outImg.src = c.toDataURL('image/png');
      out.replaceChildren(outImg);
    }, 120);
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const url = URL.createObjectURL(f);
        img = await U.loadImg(url);
        orig.src = url;
        orig.hidden = false;
        recompute();
      } catch (e) {
        U.toast('Poza nu a putut fi citită. Încearcă JPG sau PNG.', 'bad');
      }
    });
    const sens = h('input', { type: 'range', class: 'range', min: '-10', max: '10', value: '0', id: 'sigSens' });
    sens.addEventListener('input', () => { opts.sens = +sens.value / 10; recompute(); });
    const seg = (items, cur, set) => {
      const el = h('div', { class: 'seg', role: 'group' });
      items.forEach(([v, label]) => el.append(h('button', {
        type: 'button', class: v === cur ? 'is-on' : '',
        onclick: (e) => { el.querySelectorAll('button').forEach((b) => b.classList.remove('is-on')); e.currentTarget.classList.add('is-on'); set(v); recompute(); },
      }, label)));
      return el;
    };
    const name = h('input', { class: 'input', value: p.signatures.length ? 'Inițiale' : 'Semnătura', id: 'sigName' });
    const body = h('div', { class: 'sig-studio' },
      h('div', { class: 'pane' },
        h('label', { class: 'btn primary', for: 'sigFile' }, U.icon('camera'), 'Alege poza semnăturii'), file,
        orig,
        h('p', { class: 'help' }, 'Semnează pe o foaie albă, cu pix albastru sau negru. Fotografiază de aproape, în lumină bună, fără umbra telefonului pe foaie.')),
      h('div', { class: 'pane' },
        out,
        h('label', { class: 'field' }, h('span', null, 'Sensibilitate'), sens),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Grosimea liniei'),
          seg([[-1, 'Subțire'], [0, 'Normală'], [1, 'Groasă'], [2, 'Foarte groasă']], 0, (v) => (opts.weight = v))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Culoarea'),
          seg([['blue', 'Albastru'], ['black', 'Negru'], ['original', 'Ca în poză']], 'blue', (v) => (opts.color = v))),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'end' } },
          h('label', { class: 'field', style: { flex: '1' } }, h('span', null, 'Nume'), name),
          h('button', { class: 'btn', type: 'button', onclick: () => { opts.rotate = (opts.rotate + 90) % 360; recompute(); } }, U.icon('rotate'), 'Rotește'))));
    const ok = await U.dialog({ title: 'Semnătura din poză', body, wide: true, actions: [{ label: 'Renunț', value: false }, { label: 'Salvează semnătura', value: true, kind: 'primary' }] });
    if (!ok) return false;
    recompute.flush();
    if (!result) {
      U.toast('Alege întâi o poză cu semnătura ta.', 'warn');
      return false;
    }
    saveSig(p, result, name.value.trim());
    U.toast('Semnătura a fost salvată în profil.', 'ok');
    return true;
  }

  async function drawSignature(p) {
    const canvas = h('canvas', { class: 'pad', 'aria-label': 'Zonă în care semnezi cu degetul sau cu mouse-ul' });
    const ctx = canvas.getContext('2d');
    let color = '#18309a';
    let drawing = false;
    let hasInk = false;
    let pts = [];
    let dpr = 1;
    const setup = () => {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(10, Math.round(r.width * dpr));
      canvas.height = Math.max(10, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      hasInk = false;
    };
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      drawing = true;
      pts = [pos(e)];
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const pt = pos(e);
      pts.push(pt);
      const n = pts.length;
      if (n < 3) return;
      const a = pts[n - 3];
      const b = pts[n - 2];
      const c = pts[n - 1];
      const speed = Math.hypot(c.x - b.x, c.y - b.y) / Math.max(1, c.t - b.t);
      ctx.strokeStyle = color;
      ctx.lineWidth = U.clamp(3.2 - speed * 1.1, 1.4, 3.2);
      ctx.beginPath();
      ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
      ctx.stroke();
      hasInk = true;
    });
    const end = () => {
      if (drawing && pts.length && pts.length < 3) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        hasInk = true;
      }
      drawing = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    const colors = h('div', { class: 'seg', role: 'group', 'aria-label': 'Culoarea' },
      [['#18309a', 'Albastru'], ['#16161c', 'Negru']].map(([c, l], i) => h('button', {
        type: 'button', class: i === 0 ? 'is-on' : '',
        onclick: (e) => { color = c; colors.querySelectorAll('button').forEach((b) => b.classList.remove('is-on')); e.currentTarget.classList.add('is-on'); },
      }, l)));
    const body = h('div', { style: { display: 'grid', gap: '12px' } },
      h('p', { class: 'modal-text' }, 'Semnează cu degetul sau cu mouse-ul deasupra liniei.'),
      canvas,
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        colors,
        h('button', { class: 'btn sm', type: 'button', onclick: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false; } }, 'Șterge și reîncep')));
    const pr = U.dialog({ title: 'Desenează semnătura', body, wide: true, actions: [{ label: 'Renunț', value: false }, { label: 'Salvează semnătura', value: true, kind: 'primary' }] });
    requestAnimationFrame(setup);
    const ok = await pr;
    if (!ok) return false;
    if (!hasInk) {
      U.toast('Nu ai desenat nimic.', 'warn');
      return false;
    }
    const trimmed = CZ.imaging.trimCanvas(canvas);
    if (!trimmed) return false;
    saveSig(p, trimmed, p.signatures.length ? 'Semnătură desenată' : 'Semnătura');
    U.toast('Semnătura a fost salvată în profil.', 'ok');
    return true;
  }
})();
