/* Completez — ecranul documentului: încărcare, pagini cu câmpuri, fișa câmpului, export */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const S = CZ.store;
  const D = CZ.docs;
  const SC = CZ.schema;
  const h = U.h;
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  };

  const E = (CZ.editor = { doc: null, sel: null, tool: null, zoom: 1, aiCtl: null, aiBlocked: false });
  let root = null;

  /* ---------- valori ---------- */
  E.profileFor = (f) =>
    (f && f.profileId && S.profile(f.profileId)) || (E.doc && S.profile(E.doc.profileId)) || S.activeProfile();

  E.valueFor = function (f) {
    if (!f || f.key === 'ignore') return '';
    if (f.type === 'check') return f.key === 'check' || (f.override && f.override.trim()) ? 'X' : '';
    if (f.override != null) return f.override;
    if (!f.key || f.key === 'text' || f.key === 'semnatura') return '';
    const v = SC.value(E.profileFor(f), f.key);
    return v ? SC.stripOverlap(f.labelTail, v) : '';
  };

  E.sigFor = function (f) {
    const p = E.profileFor(f);
    if (!p || !p.signatures.length) return null;
    return p.signatures.find((s) => s.id === f.sigId) || p.signatures.find((s) => s.id === p.defaultSigId) || p.signatures[0];
  };

  function stateOf(f) {
    if (f.key === 'ignore') return 'ignored';
    if (f.type === 'signature') return E.sigFor(f) ? 'filled' : 'empty';
    if (E.valueFor(f)) return 'filled';
    if (!f.key) return 'unknown';
    if (f.type === 'check') return 'empty';
    return 'empty';
  }
  E.stateOf = stateOf;

  function tagText(f, st) {
    if (st === 'unknown') {
      if (E.sel === f.id) return '? ' + (f.label || 'alege ce se scrie aici');
      return f.label ? '? ' + (f.label.length > 22 ? '…' + f.label.slice(-20) : f.label) : '?';
    }
    const name = SC.keyLabel(f.key, E.profileFor(f));
    if (st === 'empty') return name + ' · lipsește';
    if (st === 'ignored') return 'nu completez';
    return name;
  }

  const selField = () => (E.doc ? E.doc.fields.find((f) => f.id === E.sel) || null : null);

  /* ---------- intrare ---------- */
  E.mount = function (el) {
    root = el;
    E.renderIntake();
  };

  E.renderIntake = function () {
    E.doc = null;
    E.sel = null;
    E.tool = null;
    const inPdf = h('input', {
      type: 'file', id: 'inPdf', accept: 'application/pdf,.pdf', class: 'sr-only',
      onchange: (e) => { const fl = Array.from(e.target.files); e.target.value = ''; E.openFiles(fl); },
    });
    const inImg = h('input', {
      type: 'file', id: 'inImg', accept: 'image/*', multiple: true, class: 'sr-only',
      onchange: (e) => { const fl = Array.from(e.target.files); e.target.value = ''; E.openFiles(fl); },
    });
    const prof = S.activeProfile();
    const card = h('div', { class: 'intake-card', id: 'dropZone' },
      h('p', { class: 'eyebrow' }, 'Document nou'),
      h('h1', null, 'Completează un formular fără să-l scrii de mână'),
      h('p', { class: 'lead' },
        'Încarcă PDF-ul de pe site-ul facultății sau fă o poză foii primite. Spațiile goale devin câmpuri, ' +
        'se completează din profilul tău, iar tu doar verifici și semnezi.'),
      h('div', { class: 'intake-actions' },
        h('label', { class: 'btn primary big', for: 'inPdf' }, U.icon('file'), 'Alege un PDF'), inPdf,
        h('label', { class: 'btn big', for: 'inImg' }, U.icon('camera'), 'Poză sau scanare'), inImg),
      h('div', { class: 'intake-foot' },
        h('span', null, 'sau trage fișierul aici'),
        h('span', { 'aria-hidden': 'true' }, '·'),
        h('button', { class: 'linklike', type: 'button', onclick: () => E.openSample() }, 'Deschide cererea demonstrativă')),
      h('div', { class: 'formline', 'aria-hidden': 'true' },
        h('span', null, 'Subsemnatul(a)'), h('span', { class: 'dots' }),
        h('span', { class: 'val' }, prof ? SC.value(prof, 'numeComplet') || 'numele tău' : 'numele tău'))
    );
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    card.addEventListener('dragover', (e) => { stop(e); card.classList.add('is-drag'); });
    card.addEventListener('dragleave', (e) => { stop(e); card.classList.remove('is-drag'); });
    card.addEventListener('drop', (e) => {
      stop(e);
      card.classList.remove('is-drag');
      if (e.dataTransfer && e.dataTransfer.files.length) E.openFiles(Array.from(e.dataTransfer.files));
    });
    const step = (n, t, d) => h('li', null, h('span', { class: 'n' }, n), h('div', null, h('b', null, t), h('p', null, d)));
    root.replaceChildren(h('div', { class: 'intake' },
      card,
      h('ol', { class: 'steps' },
        step('1', 'Încarci documentul', 'PDF, poză cu telefonul sau scanare. Un document Word îl salvezi întâi ca PDF.'),
        step('2', 'Verifici câmpurile', 'Albastru înseamnă completat din profil. Portocaliu înseamnă că alegi tu ce se scrie acolo.'),
        step('3', 'Semnezi și descarci', 'Semnătura ta din poză se pune pe document, iar PDF-ul rămâne la tine.')),
      notice('lock', 'Datele rămân pe dispozitivul tău',
        'Profilurile, CNP-ul și semnătura se păstrează doar în acest browser. Nu se trimite nimic nicăieri, ' +
        'în afară de cazul în care ceri ajutorul lui Claude pentru un formular gol.')
    ));
  };

  function notice(icon, title, text, kind, actions) {
    return h('div', { class: 'notice' + (kind ? ' ' + kind : '') },
      U.icon(icon),
      h('div', { class: 'notice-body' },
        title ? h('p', { class: 'notice-title' }, title) : null,
        text ? h('p', { class: 'small' }, text) : null,
        actions && actions.length ? h('div', { class: 'notice-actions' }, actions) : null));
  }

  function showLoading(text) {
    root.replaceChildren(h('div', { class: 'card progress-line' }, h('span', { class: 'spinner' }), h('span', null, text)));
  }

  function openError(e) {
    const n = e && e.name;
    if (n === 'PasswordException') return 'PDF-ul e protejat cu parolă. Deschide-l, salvează o copie fără parolă și încearc-o pe aceea.';
    if (n === 'InvalidPDFException') return 'Fișierul nu pare un PDF valid.';
    return 'Documentul nu a putut fi deschis: ' + ((e && e.message) || 'eroare necunoscută');
  }

  E.openFiles = async function (files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (!D.ready()) {
      U.toast('Bibliotecile PDF nu s-au încărcat. Verifică conexiunea la internet și reîncarcă pagina.', 'bad', 6000);
      return;
    }
    const pdfs = list.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    const imgs = list.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
    if (!pdfs.length && !imgs.length) {
      if (list.some((f) => /\.(docx?|odt|rtf)$/i.test(f.name))) {
        U.toast('Documentele Word nu se deschid direct. Salvează-l ca PDF (Fișier → Salvare ca → PDF) și încarcă PDF-ul.', 'warn', 7000);
      } else if (list.some((f) => /\.(heic|heif)$/i.test(f.name))) {
        U.toast('Pozele HEIC nu pot fi citite aici. Alege poza din galerie ca JPG sau fă o captură de ecran.', 'warn', 7000);
      } else {
        U.toast('Tipul fișierului nu e acceptat. Folosește PDF, JPG sau PNG.', 'warn');
      }
      return;
    }
    showLoading('Deschid documentul…');
    try {
      let doc;
      if (pdfs.length) {
        const bytes = await U.readFile(pdfs[0]);
        doc = await D.openPdf(bytes, pdfs[0].name, (i, n) => showLoading(`Citesc pagina ${i} din ${n}…`));
      } else {
        doc = await D.openImages(imgs, (i, n) => showLoading(`Îndrept poza ${i} din ${n}…`));
      }
      await E.setDoc(doc);
    } catch (e) {
      console.error(e);
      U.toast(openError(e), 'bad', 7000);
      E.renderIntake();
    }
  };

  E.openSample = async function () {
    if (!D.ready()) {
      U.toast('Bibliotecile PDF nu s-au încărcat. Verifică conexiunea la internet.', 'bad', 6000);
      return;
    }
    showLoading('Pregătesc cererea demonstrativă…');
    try {
      const bytes = await D.buildSamplePdf();
      const doc = await D.openPdf(bytes, 'Cerere de cazare (exemplu).pdf');
      await E.setDoc(doc, { sample: true });
    } catch (e) {
      console.error(e);
      U.toast('Exemplul nu a putut fi creat: ' + (e.message || e), 'bad', 6000);
      E.renderIntake();
    }
  };

  E.setDoc = async function (doc, opts) {
    E.doc = doc;
    E.sel = null;
    E.tool = null;
    E.zoom = 1;
    doc.profileId = (S.activeProfile() || {}).id || null;
    doc.isSample = !!(opts && opts.sample);
    doc.fp = await D.fingerprint(doc);
    const tpl = doc.fp && !doc.isSample ? S.data.templates[doc.fp] : null;
    if (tpl) {
      D.applyTemplate(doc, tpl);
      doc.templateUsed = true;
    } else {
      D.detectAll(doc, E.profileFor(null));
    }
    E.renderDoc();
  };

  function closeDoc() {
    if (E.aiCtl) E.aiCtl.abort();
    if (E.doc) E.doc.pages.forEach((p) => {
      if (p.url) URL.revokeObjectURL(p.url);
      if (p.srcUrl) URL.revokeObjectURL(p.srcUrl);
    });
    E.renderIntake();
  }

  /* ---------- documentul deschis ---------- */
  E.renderDoc = function () {
    const doc = E.doc;
    const kind = doc.kind === 'pdf' ? (doc.hasText ? 'PDF cu text' : 'PDF scanat') : doc.pages.length > 1 ? `${doc.pages.length} poze` : 'Poză';
    const head = h('div', { class: 'doc-head' },
      h('div', null, h('p', { class: 'eyebrow' }, kind), h('h1', null, doc.name), h('p', { class: 'doc-meta', id: 'docMeta' })),
      h('button', { class: 'btn ghost', type: 'button', onclick: closeDoc }, U.icon('back'), 'Alt document'));
    const viewer = h('div', { class: 'viewer', id: 'viewer' }, h('div', { class: 'pages', id: 'pages' }));
    const inspector = h('aside', { class: 'inspector is-idle', id: 'inspector', 'aria-label': 'Câmpul selectat' });
    root.replaceChildren(h('div', { class: 'doc' },
      head,
      h('div', { id: 'docNotices', style: { display: 'grid', gap: '10px' } }),
      h('div', { class: 'summary', id: 'docSummary' }),
      buildToolbar(),
      h('div', { class: 'workspace' }, viewer, inspector),
      buildActionbar()));
    renderPages();
    renderNotices();
    renderSummary();
    renderInspector();
  };

  function pageEl(i) {
    return document.querySelector(`.page[data-page="${i}"]`);
  }

  function renderPages() {
    const pagesEl = $('#pages');
    if (!pagesEl) return;
    pagesEl.replaceChildren();
    pagesEl.style.width = E.zoom * 100 + '%';
    const n = E.doc.pages.length;
    E.doc.pages.forEach((pg, i) => {
      const svg = svgEl('svg', { class: 'ink', viewBox: `0 0 1000 ${(1000 * pg.aspect).toFixed(2)}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      const layer = h('div', { class: 'layer' });
      const page = h('div', { class: 'page' + (E.tool ? ' tool-on' : ''), 'data-page': i, style: { aspectRatio: `${pg.W} / ${pg.H}` } },
        h('img', { src: pg.url, alt: `Pagina ${i + 1}`, draggable: 'false' }), svg, layer);
      layer.addEventListener('pointerdown', (e) => onPointerDown(e, i));
      const tools = [];
      if (E.doc.kind === 'images') {
        tools.push(h('button', { class: 'btn sm', type: 'button', onclick: () => cropPage(pg) }, U.icon('crop'), 'Colțuri'));
        tools.push(h('button', { class: 'btn sm', type: 'button', onclick: () => rotatePage(pg) }, U.icon('rotate'), 'Rotește'));
      }
      tools.push(h('button', { class: 'btn sm ghost', type: 'button', onclick: () => redetectPage(pg) }, 'Caută din nou câmpurile'));
      pagesEl.append(h('div', { class: 'page-wrap' },
        h('div', { class: 'page-bar' }, h('span', null, `Pagina ${i + 1} din ${n}`), h('span', { class: 'grow' }), tools),
        page));
    });
    E.doc.fields.forEach(drawField);
    const zv = $('#zoomVal');
    if (zv) zv.textContent = Math.round(E.zoom * 100) + '%';
  }

  function drawField(f) {
    const pe = pageEl(f.page);
    if (!pe) return;
    const layer = pe.querySelector('.layer');
    const svg = pe.querySelector('svg.ink');
    let el = layer.querySelector(`[data-id="${f.id}"]`);
    if (!el) {
      el = h('div', { class: 'fld', 'data-id': f.id, role: 'button', tabindex: '0' },
        h('span', { class: 'tag' }), h('span', { class: 'h-resize', 'aria-hidden': 'true' }));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(f.id, true);
        }
      });
      layer.append(el);
    }
    el.style.left = f.x * 100 + '%';
    el.style.top = f.y * 100 + '%';
    el.style.width = f.w * 100 + '%';
    el.style.height = f.h * 100 + '%';
    const st = stateOf(f);
    el.dataset.state = st;
    el.classList.toggle('is-selected', E.sel === f.id);
    el.querySelector('.tag').textContent = tagText(f, st);
    el.setAttribute('aria-label', tagText(f, st) + (E.valueFor(f) ? ': ' + E.valueFor(f) : ''));

    let g = svg.querySelector(`[data-id="${f.id}"]`);
    if (!g) {
      g = svgEl('g', { 'data-id': f.id });
      svg.append(g);
    }
    g.replaceChildren();
    if (st === 'ignored') return;
    const pg = E.doc.pages[f.page];
    const pw = 1000;
    const ph = 1000 * pg.aspect;
    if (f.type === 'signature') {
      const sig = E.sigFor(f);
      if (!sig) return;
      const r = CZ.layout.sig(f, pw, ph, sig.w / sig.h);
      g.append(svgEl('image', { href: sig.dataUrl, x: f.x * pw + r.x, y: f.y * ph + r.y, width: r.w, height: r.h, preserveAspectRatio: 'none' }));
      return;
    }
    const text = E.valueFor(f);
    if (!text) return;
    const L = CZ.layout.text(f, text, pw, ph, U.textWidth1);
    const fill = CZ.layout.colors[S.data.settings.textColor] || CZ.layout.colors.black;
    const t = svgEl('text', {
      x: L.chars ? L.xs.map((x) => (f.x * pw + x).toFixed(2)).join(' ') : (f.x * pw + L.x).toFixed(2),
      y: (f.y * ph + L.baseline).toFixed(2),
      'font-size': L.size.toFixed(2),
      'font-family': `${U.FONT}, Arimo, Arial, sans-serif`,
      fill,
    });
    t.textContent = L.chars ? L.chars.join('') : text;
    g.append(t);
  }

  function removeFieldEls(id) {
    document.querySelectorAll(`[data-id="${id}"]`).forEach((n) => n.remove());
  }

  E.refresh = function () {
    if (!E.doc || !$('#pages')) return;
    E.doc.fields.forEach(drawField);
    renderSummary();
    renderInspector();
    renderNotices();
    syncProfileSelect();
  };

  /* ---------- selecție și mutare ---------- */
  function select(id, focusInspector) {
    const prev = E.sel;
    E.sel = id;
    if (prev) {
      const pf = E.doc.fields.find((f) => f.id === prev);
      if (pf) drawField(pf);
    }
    const f = selField();
    if (f) drawField(f);
    renderInspector();
    // pe ecran îngust, fișa acoperă partea de jos: aducem câmpul deasupra ei
    if (f && window.innerWidth < 1180) {
      const el = document.querySelector(`.fld[data-id="${f.id}"]`);
      const ins = $('#inspector');
      if (el && ins) {
        requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const sheetTop = ins.getBoundingClientRect().top;
          if (r.bottom > sheetTop - 12 || r.top < 70) window.scrollBy({ top: r.top - Math.max(90, sheetTop * 0.3), behavior: 'smooth' });
        });
      }
    }
    if (focusInspector) {
      const inp = document.getElementById('insValue') || document.getElementById('insKey');
      if (inp) setTimeout(() => inp.focus(), 20);
    }
  }

  function onPointerDown(e, pageIndex) {
    const pe = pageEl(pageIndex);
    const rect = pe.getBoundingClientRect();
    const fldEl = e.target.closest('.fld');
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (E.tool && !fldEl) {
      addFieldAt(pageIndex, nx, ny, E.tool);
      setTool(null);
      return;
    }
    if (!fldEl) {
      if (E.sel) select(null);
      return;
    }
    const f = E.doc.fields.find((x) => x.id === fldEl.dataset.id);
    if (!f) return;
    const isResize = e.target.classList.contains('h-resize');
    const wasSelected = E.sel === f.id;
    if (!wasSelected) select(f.id);
    if (e.pointerType === 'touch' && !wasSelected && !isResize) return; // prima atingere doar selectează
    e.preventDefault();
    try { fldEl.setPointerCapture(e.pointerId); } catch (err) {}
    const st = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y, fw: f.w, fh: f.h, moved: false };
    const move = (ev) => {
      if (!st.moved && Math.hypot(ev.clientX - st.x, ev.clientY - st.y) < 4) return;
      st.moved = true;
      const dx = (ev.clientX - st.x) / rect.width;
      const dy = (ev.clientY - st.y) / rect.height;
      if (isResize) {
        f.w = U.clamp(st.fw + dx, 0.01, 1 - f.x);
        f.h = U.clamp(st.fh + dy, 0.006, 1 - f.y);
      } else {
        f.x = U.clamp(st.fx + dx, 0, 1 - f.w);
        f.y = U.clamp(st.fy + dy, 0, 1 - f.h);
      }
      drawField(f);
    };
    const end = () => {
      fldEl.removeEventListener('pointermove', move);
      fldEl.removeEventListener('pointerup', end);
      fldEl.removeEventListener('pointercancel', end);
      if (st.moved) f.edited = true;
      else if (wasSelected && !isResize) {
        const inp = document.getElementById('insValue');
        if (inp) inp.focus();
      }
    };
    fldEl.addEventListener('pointermove', move);
    fldEl.addEventListener('pointerup', end);
    fldEl.addEventListener('pointercancel', end);
  }

  function addFieldAt(pageIndex, nx, ny, tool) {
    const pg = E.doc.pages[pageIndex];
    const ar = pg.aspect;
    let w = 0.3;
    let hh = 0.024;
    let key = 'text';
    if (tool === 'signature') { w = 0.24; hh = 0.07; key = 'semnatura'; }
    if (tool === 'date') { w = 0.16; key = 'azi'; }
    if (tool === 'check') { w = 0.028; hh = w / ar; key = 'check'; }
    const x = U.clamp(nx - (tool === 'check' ? w / 2 : 0.01), 0, 1 - w);
    const y = U.clamp(ny - hh * 0.7, 0, 1 - hh);
    const f = {
      id: U.uid('f'), page: pageIndex, x, y, w, h: hh, key, type: SC.typeForKey(key), label: '', labelTail: '',
      override: null, fontScale: 1, spread: false, profileId: null, sigId: null, source: 'manual', confidence: 'high',
    };
    E.doc.fields.push(f);
    drawField(f);
    select(f.id, tool === 'text');
    renderSummary();
  }

  function deleteField(f) {
    E.doc.fields = E.doc.fields.filter((x) => x.id !== f.id);
    removeFieldEls(f.id);
    if (E.sel === f.id) E.sel = null;
    renderInspector();
    renderSummary();
  }

  function setTool(t) {
    E.tool = E.tool === t ? null : t;
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('is-on', b.dataset.tool === E.tool));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('tool-on', !!E.tool));
    const hint = $('#toolHint');
    if (hint) {
      const msg = { text: 'Atinge pagina unde vrei textul', signature: 'Atinge locul semnăturii', date: 'Atinge locul datei', check: 'Atinge căsuța de bifat' }[E.tool];
      hint.hidden = !msg;
      hint.textContent = msg || '';
    }
  }

  function zoomBy(dir) {
    const steps = [1, 1.5, 2, 2.5, 3];
    const i = Math.max(0, steps.indexOf(E.zoom));
    E.zoom = steps[U.clamp(i + dir, 0, steps.length - 1)];
    const pagesEl = $('#pages');
    if (pagesEl) pagesEl.style.width = E.zoom * 100 + '%';
    const zv = $('#zoomVal');
    if (zv) zv.textContent = Math.round(E.zoom * 100) + '%';
  }

  function buildToolbar() {
    const t = (tool, icon, label) =>
      h('button', { class: 'btn', type: 'button', 'data-tool': tool, onclick: () => setTool(tool) }, U.icon(icon), label);
    return h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Adaugă pe pagină' },
      t('text', 'plus', 'Text'), t('signature', 'sign', 'Semnătură'), t('date', 'cal', 'Dată'), t('check', 'check', 'Bifă'),
      h('span', { class: 'sep' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Micșorează pagina', onclick: () => zoomBy(-1) }, U.icon('zoomout')),
      h('span', { class: 'zoom-val', id: 'zoomVal' }, '100%'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mărește pagina', onclick: () => zoomBy(1) }, U.icon('zoomin')),
      h('span', { class: 'tool-hint', id: 'toolHint', hidden: true }));
  }

  /* ---------- rezumat, notificări, fișa câmpului ---------- */
  function counts() {
    const act = E.doc.fields.filter((f) => stateOf(f) !== 'ignored');
    const review = act.filter((f) => ['unknown', 'empty'].includes(stateOf(f)));
    return {
      act,
      filled: act.filter((f) => stateOf(f) === 'filled').length,
      review,
      sig: E.doc.fields.some((f) => f.type === 'signature' && stateOf(f) === 'filled'),
    };
  }

  function renderSummary() {
    const el = $('#docSummary');
    if (!el || !E.doc) return;
    const c = counts();
    const ai = CZ.ai.available(E.doc) && !E.aiBlocked && E.doc.fields.length;
    el.replaceChildren(...[
      h('span', { class: 'pill ok' }, h('span', { class: 'dot' }), `${c.filled} completate`),
      c.review.length
        ? h('span', { class: 'pill warn' }, h('span', { class: 'dot' }), `${c.review.length} de verificat`)
        : h('span', { class: 'pill' }, 'nimic de verificat'),
      h('span', { class: 'pill' + (c.sig ? ' pen' : '') }, c.sig ? 'semnătura e pusă' : 'fără semnătură'),
      h('span', { class: 'grow' }),
      c.review.length ? h('button', { class: 'btn sm', type: 'button', onclick: nextReview }, 'Următorul de verificat', U.icon('next')) : null,
      ai ? h('button', { class: 'btn sm', type: 'button', onclick: runAI, disabled: !!E.aiCtl }, U.icon('spark'),
        E.doc.kind === 'pdf' ? 'Verifică cu Claude' : 'Recunoaște cu Claude') : null,
    ].filter(Boolean));
    const meta = $('#docMeta');
    if (meta) {
      const n = E.doc.pages.length;
      meta.textContent = `${n} ${n === 1 ? 'pagină' : 'pagini'} · ${c.act.length} câmpuri` + (E.doc.templateUsed ? ' · așezare salvată' : '');
    }
  }

  function nextReview() {
    const list = counts().review.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    if (!list.length) return;
    const i = list.findIndex((f) => f.id === E.sel);
    const f = list[(i + 1) % list.length];
    select(f.id);
    const el = document.querySelector(`.fld[data-id="${f.id}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function legalWarnings(doc) {
    const t = U.nrm((doc.textAll || '') + ' ' + (doc.aiDocType || ''));
    const out = [];
    if (/contract(ul)? individual de munca/.test(t)) {
      out.push(['Contract de muncă', 'Un contract individual de muncă semnat electronic cere semnătură avansată sau calificată (Codul muncii, art. 16). Poza semnăturii nu ajunge: precompletează-l aici, apoi semnează-l calificat sau pe hârtie.']);
    }
    if (/\bprocura\b|contract(ul)? de donatie|\bipoteca|\btestament|conventie matrimoniala|vanzare cumparare (a )?(imobil|teren|apartament|casa|locuinta)/.test(t)) {
      out.push(['Act care cere notar', 'Acest tip de act cere formă autentică la notar sau scriere de mână. Îl poți precompleta, dar semnătura din aplicație nu îl face valabil.']);
    }
    if (/consimtamant(ul)? informat|acordul pacientului/.test(t)) {
      out.push(['Consimțământ medical', 'Consimțământul informat se dă în scris. O semnătură-imagine ține doar dacă pacientul nu o contestă; pentru clinici, semnătura calificată e mai sigură.']);
    }
    for (const w of doc.aiWarnings || []) out.push(['Observația lui Claude', w]);
    return out;
  }

  function renderNotices() {
    const el = $('#docNotices');
    if (!el || !E.doc) return;
    const doc = E.doc;
    const items = [];
    if (E.aiStatus) {
      items.push(h('div', { class: 'notice' }, h('span', { class: 'spinner' }),
        h('div', { class: 'notice-body' }, h('p', null, E.aiStatus)),
        h('button', { class: 'btn sm', type: 'button', onclick: () => E.aiCtl && E.aiCtl.abort() }, 'Oprește')));
    }
    const prof = S.activeProfile();
    if (doc.isSample || (prof && prof.isExample)) {
      items.push(notice('info', 'Acesta e un exemplu',
        doc.isSample
          ? 'Cererea de cazare e completată automat cu profilul demonstrativ „Maria Ionescu”. Atinge un câmp ca să vezi de unde vine valoarea, apoi descarcă PDF-ul.'
          : 'Completezi cu profilul demonstrativ. Creează-ți profilul tău ca documentele să conțină datele tale.',
        'stampy',
        [
          h('button', { class: 'btn sm primary', type: 'button', onclick: () => CZ.app.go('profiluri', { newProfile: true }) }, 'Creează profilul meu'),
          doc.isSample ? h('button', { class: 'btn sm', type: 'button', onclick: closeDoc }, 'Încarcă documentul meu') : null,
        ]));
    }
    if (doc.templateUsed) {
      items.push(notice('save', 'Formular recunoscut',
        'L-ai mai completat. Câmpurile sunt așezate ca data trecută.', '',
        [h('button', { class: 'btn sm', type: 'button', onclick: () => {
          D.detectAll(doc, E.profileFor(null));
          doc.templateUsed = false;
          renderPages();
          renderSummary();
          renderNotices();
        } }, 'Caută câmpurile din nou')]));
    }
    if (doc.kind === 'images' && doc.fields.length && doc.fields.every((f) => !f.key) && !CZ.ai.canImages()) {
      items.push(notice('info', 'Alege ce se scrie în fiecare câmp',
        'Pe poze, aplicația găsește liniile de completat, dar nu citește textul. Atinge fiecare câmp portocaliu și alege ce se scrie acolo. Data viitoare, pentru același PDF, așezarea se păstrează.'));
    }
    if (doc.kind === 'images' && doc.fields.length && CZ.ai.canImages() && doc.fields.every((f) => !f.key) && !E.aiBlocked) {
      items.push(notice('spark', 'Claude poate citi formularul',
        'Aplicația a găsit liniile de completat. Apasă „Recunoaște cu Claude” ca să afle ce se scrie pe fiecare. Se trimite doar poza formularului, fără datele tale.'));
    }
    if (!doc.fields.length) {
      items.push(notice('info', 'Nu am găsit spații de completat',
        'Adaugă câmpuri cu butoanele Text, Semnătură, Dată sau Bifă, apoi atinge pagina unde vrei să apară.'));
    }
    for (const [t, x] of legalWarnings(doc)) items.push(notice('alert', t, x, 'warn'));
    if (!S.persistent) {
      items.push(notice('alert', 'Datele nu se pot salva în acest browser',
        'Probabil ești într-o fereastră privată. Poți completa documentul, dar profilul se pierde la închidere.', 'warn'));
    }
    el.replaceChildren(...items);
  }

  function keySelect(f) {
    const prof = E.profileFor(f);
    const sel = h('select', { class: 'select', id: 'insKey' });
    if (!f.key) sel.append(h('option', { value: '' }, 'Alege ce se scrie aici…'));
    for (const g of SC.keyOptions(prof)) {
      const og = h('optgroup', { label: g.group });
      for (const o of g.options) og.append(h('option', { value: o.key }, o.label));
      sel.append(og);
    }
    sel.value = f.key || '';
    sel.addEventListener('change', () => {
      const k = sel.value || null;
      const wasSig = f.type === 'signature';
      f.key = k;
      f.type = SC.typeForKey(k);
      if (f.type !== 'check' && k !== 'text') f.override = null;
      if (f.type === 'signature' && !wasSig && f.h < 0.045) {
        const nh = Math.min(f.h * 2.5, 0.12);
        f.y = U.clamp(f.y + f.h - nh, 0, 1 - nh);
        f.h = nh;
      }
      f.confidence = 'high';
      drawField(f);
      renderInspector();
      renderSummary();
    });
    return sel;
  }

  function idleInspector() {
    return h('div', { class: 'inspector-empty' },
      h('p', { class: 'eyebrow' }, 'Cum verifici'),
      h('ul', null,
        h('li', null, 'Atinge un câmp ca să vezi ce se scrie acolo și de unde vine.'),
        h('li', null, 'Trage de câmpul selectat ca să-l muți; pătratul din colț îl mărește.'),
        h('li', null, 'Cu Text, Semnătură, Dată sau Bifă adaugi ce lipsește.')),
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'sw filled' }), 'completat din profil'),
        h('span', null, h('i', { class: 'sw empty' }), 'știu ce e, dar lipsește din profil'),
        h('span', null, h('i', { class: 'sw unknown' }), 'alegi tu ce se scrie'),
        h('span', null, h('i', { class: 'sw ignored' }), 'nu se completează (e al instituției)')));
  }

  function renderInspector() {
    const ins = $('#inspector');
    if (!ins || !E.doc) return;
    const f = selField();
    ins.classList.toggle('is-idle', !f);
    if (!f) {
      ins.replaceChildren(idleInspector());
      return;
    }
    const prof = E.profileFor(f);
    const title = f.label ? `„${f.label}”` : f.source === 'manual' ? 'Câmp adăugat de tine' : 'Câmp găsit automat';
    const parts = [
      h('div', { class: 'inspector-head' },
        h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, `Pagina ${f.page + 1}`), h('p', { class: 'inspector-title' }, title)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Închide fișa câmpului', onclick: () => select(null) }, U.icon('x'))),
      h('label', { class: 'field' }, h('span', null, 'Ce se completează aici'), keySelect(f)),
    ];

    if (f.type === 'signature') {
      const sigs = prof ? prof.signatures : [];
      const cur = E.sigFor(f);
      const grid = h('div', { class: 'sig-choices' },
        sigs.map((s) => h('button', {
          class: 'sig-choice' + (cur && cur.id === s.id ? ' is-on' : ''), type: 'button', 'aria-label': 'Folosește semnătura ' + (s.name || ''),
          onclick: () => { f.sigId = s.id; drawField(f); renderInspector(); renderSummary(); },
        }, h('img', { src: s.dataUrl, alt: s.name || 'Semnătură' }))));
      parts.push(h('div', { class: 'field' },
        h('span', { class: 'field-label' }, sigs.length ? 'Semnătura folosită' : 'Nu ai încă o semnătură în profil'),
        sigs.length ? grid : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', type: 'button', onclick: () => addSignature(prof, 'photo') }, U.icon('camera'), 'Din poză'),
          h('button', { class: 'btn sm', type: 'button', onclick: () => addSignature(prof, 'draw') }, U.icon('pen'), 'Desenează'))));
    } else if (f.type === 'check') {
      parts.push(h('p', { class: 'help' }, f.key === 'check' ? 'În căsuță se pune un X.' : 'Alege „Bifă (X)” ca să pui un X în căsuță.'));
    } else {
      const v = E.valueFor(f);
      const input = h('input', { class: 'input', id: 'insValue', value: v, autocomplete: 'off', placeholder: f.key && f.key !== 'text' ? 'lipsește din profil' : 'Scrie aici' });
      input.addEventListener('input', () => {
        f.override = input.value;
        if (!f.key) f.key = 'text';
        drawField(f);
        summaryLater();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(null); });
      parts.push(h('label', { class: 'field' }, h('span', null, 'Ce apare pe document'), input));
      const fromProfile = f.key && !['text', 'azi', 'check'].includes(f.key);
      if (fromProfile && f.override != null) {
        parts.push(h('button', { class: 'linklike small', type: 'button', onclick: () => { f.override = null; drawField(f); renderInspector(); renderSummary(); } },
          'Folosește din nou valoarea din profil'));
      } else if (fromProfile && !SC.value(prof, f.key) && !f.key.startsWith('custom:')) {
        parts.push(h('p', { class: 'help' }, `„${SC.keyLabel(f.key, prof)}” nu e completat în profil. Scrie aici doar pentru acest document sau `,
          h('button', { class: 'linklike', type: 'button', onclick: () => CZ.app.go('profiluri') }, 'completează profilul'), '.'));
      } else if (fromProfile) {
        parts.push(h('p', { class: 'help' }, `Din profilul ${SC.displayName(prof)}. Dacă scrii altceva, se schimbă doar în acest document.`));
      }
      parts.push(h('div', { class: 'row' },
        h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Litere mai mici', onclick: () => { f.fontScale = U.clamp((f.fontScale || 1) / 1.12, 0.4, 2.2); drawField(f); } }, 'A−'),
        h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Litere mai mari', onclick: () => { f.fontScale = U.clamp((f.fontScale || 1) * 1.12, 0.4, 2.2); drawField(f); } }, 'A+'),
        h('label', { class: 'check small' },
          h('input', { type: 'checkbox', checked: !!f.spread, onchange: (e) => { f.spread = e.target.checked; drawField(f); } }),
          'O literă în fiecare căsuță')));
    }

    if (S.profiles().length > 1 && f.key && f.key !== 'ignore') {
      const ps = h('select', { class: 'select', id: 'insProfile' },
        h('option', { value: '' }, 'Profilul documentului'),
        S.profiles().map((p) => h('option', { value: p.id }, SC.displayName(p))));
      ps.value = f.profileId || '';
      ps.addEventListener('change', () => { f.profileId = ps.value || null; drawField(f); renderInspector(); renderSummary(); });
      parts.push(h('label', { class: 'field' }, h('span', null, 'Datele cui'), ps));
    }

    parts.push(h('div', { class: 'row end' },
      h('button', { class: 'btn sm danger', type: 'button', onclick: () => deleteField(f) }, U.icon('trash'), 'Șterge câmpul'),
      h('button', { class: 'btn sm primary', type: 'button', onclick: () => select(null) }, 'Gata')));
    ins.replaceChildren(...parts);
  }
  const summaryLater = U.debounce(() => renderSummary(), 250);

  async function addSignature(prof, mode) {
    if (!prof) return;
    const ok = await CZ.profilesUI.addSignature(prof, mode);
    if (ok) E.refresh();
  }

  /* ---------- pagini din poze ---------- */
  async function refreshImagePage(pg) {
    showPageBusy(pg, true);
    await D.renderImagePage(pg);
    // după îndreptare coordonatele se schimbă, așa că toate câmpurile paginii se caută din nou
    E.doc.fields = E.doc.fields.filter((f) => f.page !== pg.index);
    E.doc.fields.push(...D.detectPage(E.doc, pg, E.profileFor(null)));
    E.sel = null;
    renderPages();
    renderSummary();
    renderNotices();
    renderInspector();
  }
  function showPageBusy(pg, on) {
    const pe = pageEl(pg.index);
    if (pe) pe.style.opacity = on ? '0.5' : '';
  }

  async function rotatePage(pg) {
    pg.rotate = (pg.rotate + 90) % 360;
    const rotated = CZ.imaging.drawToCanvas(pg.srcImg, 3000, pg.rotate);
    pg.corners = CZ.imaging.detectCorners(rotated);
    await refreshImagePage(pg);
  }

  async function cropPage(pg) {
    const base = CZ.imaging.drawToCanvas(pg.srcImg, 1400, pg.rotate);
    const W = base.width;
    const H = base.height;
    let corners = pg.corners.map((p) => p.slice());
    const img = h('img', { src: base.toDataURL('image/jpeg', 0.85), alt: 'Poza originală', draggable: 'false' });
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
    const poly = svgEl('polygon', { fill: 'rgba(35,65,198,0.13)', stroke: '#2341c6', 'stroke-width': Math.max(2, W / 350) });
    const handles = [0, 1, 2, 3].map((i) => svgEl('circle', { class: 'crop-handle', r: Math.max(12, W / 40), 'data-i': i }));
    svg.append(poly, ...handles);
    const paint = () => {
      poly.setAttribute('points', corners.map(([x, y]) => `${x * W},${y * H}`).join(' '));
      handles.forEach((hd, i) => {
        hd.setAttribute('cx', corners[i][0] * W);
        hd.setAttribute('cy', corners[i][1] * H);
      });
    };
    paint();
    svg.addEventListener('pointerdown', (e) => {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      let best = -1;
      let bd = 0.12;
      corners.forEach(([x, y], i) => {
        const d = Math.hypot((x - px) * rect.width, (y - py) * rect.height) / Math.max(rect.width, rect.height);
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) return;
      e.preventDefault();
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      const move = (ev) => {
        corners[best] = [U.clamp((ev.clientX - rect.left) / rect.width, 0, 1), U.clamp((ev.clientY - rect.top) / rect.height, 0, 1)];
        paint();
      };
      const up = () => {
        svg.removeEventListener('pointermove', move);
        svg.removeEventListener('pointerup', up);
        svg.removeEventListener('pointercancel', up);
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
    });
    const enh = h('input', { type: 'checkbox', checked: pg.enhance !== false });
    const body = h('div', { style: { display: 'grid', gap: '12px' } },
      h('p', { class: 'modal-text' }, 'Trage de cele patru colțuri până se potrivesc cu marginile foii. Poza se îndreaptă ca o scanare.'),
      h('div', { class: 'crop-stage' }, img, svg),
      h('div', { class: 'row', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' } },
        h('button', { class: 'btn sm', type: 'button', onclick: () => { corners = D.FULL.map((p) => p.slice()); paint(); } }, 'Toată poza'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => { corners = CZ.imaging.detectCorners(base); paint(); } }, 'Găsește marginile'),
        h('label', { class: 'check small' }, enh, 'Hârtie albă (efect de scanare)')));
    const ok = await U.dialog({ title: 'Îndreaptă poza', body, wide: true, actions: [{ label: 'Renunț', value: false }, { label: 'Aplică', value: true, kind: 'primary' }] });
    if (!ok) return;
    pg.corners = corners;
    pg.enhance = enh.checked;
    await refreshImagePage(pg);
    U.toast('Poza a fost îndreptată, iar câmpurile au fost căutate din nou.', 'ok');
  }

  function redetectPage(pg) {
    const keep = E.doc.fields.filter((f) => f.page !== pg.index || f.source === 'manual');
    E.doc.fields = keep.concat(D.detectPage(E.doc, pg, E.profileFor(null)));
    E.sel = null;
    renderPages();
    renderSummary();
    renderNotices();
    renderInspector();
  }

  /* ---------- Claude ---------- */
  async function runAI() {
    if (E.aiCtl || !E.doc) return;
    const ctl = new AbortController();
    E.aiCtl = ctl;
    E.aiStatus = 'Claude se uită pe formular…';
    renderNotices();
    renderSummary();
    try {
      const res = await CZ.ai.assist(E.doc, E.profileFor(null), {
        signal: ctl.signal,
        onStatus: (t) => { E.aiStatus = t; renderNotices(); },
      });
      E.doc.aiWarnings = res.warnings;
      if (res.docType) E.doc.aiDocType = res.docType;
      E.doc.fields.forEach(drawField);
      U.toast(res.changed || res.added
        ? `Claude a lămurit ${res.changed} câmpuri` + (res.added ? ` și a adăugat ${res.added}` : '') + '. Verifică-le înainte de semnare.'
        : 'Claude nu a găsit nimic de schimbat.', 'ok', 5000);
    } catch (e) {
      if (!e || e.code !== 'cancelled') U.toast(CZ.ai.errorText(e), 'warn', 6000);
      if (e && ['not_granted', 'sampling_disabled', 'images_unavailable', 'not_declared', 'capability_disabled'].includes(e.code)) E.aiBlocked = true;
    } finally {
      E.aiCtl = null;
      E.aiStatus = '';
      renderNotices();
      renderSummary();
      renderInspector();
    }
  }
  E.onAiReady = () => { if (E.doc) { renderSummary(); renderNotices(); } };

  /* ---------- bara de acțiuni și exportul ---------- */
  function syncProfileSelect() {
    const sel = $('#docProfile');
    if (!sel || !E.doc) return;
    sel.replaceChildren(...S.profiles().map((p) => h('option', { value: p.id }, SC.displayName(p))));
    if (!S.profile(E.doc.profileId)) E.doc.profileId = (S.activeProfile() || {}).id || null;
    sel.value = E.doc.profileId || '';
  }

  function buildActionbar() {
    const sel = h('select', { class: 'select', id: 'docProfile', 'aria-label': 'Profilul cu care completezi' });
    sel.addEventListener('change', () => {
      E.doc.profileId = sel.value;
      E.doc.fields.forEach(drawField);
      renderSummary();
      renderInspector();
    });
    const audit = h('input', { type: 'checkbox', id: 'auditChk', checked: !!S.data.settings.auditPage });
    const bar = h('div', { class: 'actionbar' },
      h('label', { class: 'field' }, h('span', { class: 'small muted' }, 'Completez pentru'), sel),
      h('span', { class: 'grow' }),
      h('label', { class: 'check small', title: 'Adaugă la final o pagină cu data, amprenta documentului și tipul semnăturii' }, audit, 'Jurnal de semnare'),
      h('button', { class: 'btn primary', id: 'btnExport', type: 'button', onclick: exportDoc }, U.icon('download'), 'Descarcă PDF'));
    setTimeout(syncProfileSelect, 0);
    return bar;
  }

  async function imagesHash(doc) {
    const total = doc.pages.reduce((a, p) => a + p.jpegBytes.length, 0);
    const all = new Uint8Array(total);
    let o = 0;
    for (const p of doc.pages) { all.set(p.jpegBytes, o); o += p.jpegBytes.length; }
    return U.sha256Hex(all);
  }

  async function exportDoc() {
    const doc = E.doc;
    const btn = $('#btnExport');
    if (!doc || !btn) return;
    btn.disabled = true;
    const old = btn.lastChild.textContent;
    btn.lastChild.textContent = 'Pregătesc PDF-ul…';
    try {
      const prof = E.profileFor(null);
      const hash = doc.kind === 'pdf' ? await U.sha256Hex(doc.bytes) : await imagesHash(doc);
      const res = await CZ.exporter.build(doc, {
        valueFor: E.valueFor,
        sigFor: E.sigFor,
        textColor: S.data.settings.textColor,
        audit: $('#auditChk') ? $('#auditChk').checked : false,
        signer: prof ? SC.displayName(prof) : '',
        docHash: hash,
      });
      const name = `${doc.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document'} - completat.pdf`;
      const r = await U.saveFile(name, res.bytes, 'application/pdf');
      if (r === 'saved' || r === 'delivered') {
        stamp(res.signatures ? 'Semnat' : 'Completat');
        U.toast(r === 'delivered' ? 'PDF-ul a fost trimis.' : `Gata: ${name}`, 'ok', 4500);
      } else if (r === 'declined') {
        U.toast('Salvarea a fost anulată.', '', 2500);
      }
      if (doc.fp && !doc.isSample) {
        S.data.templates[doc.fp] = D.templateFromDoc(doc);
        S.save();
      }
    } catch (e) {
      console.error(e);
      U.toast('PDF-ul nu a putut fi creat: ' + ((e && e.message) || e), 'bad', 7000);
    } finally {
      btn.disabled = false;
      btn.lastChild.textContent = old;
    }
  }

  function stamp(text) {
    const pe = pageEl(0);
    if (!pe) return;
    const s = h('div', { class: 'stamp stamp-float' }, text);
    pe.append(s);
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('is-in')));
    setTimeout(() => { s.classList.remove('is-in'); setTimeout(() => s.remove(), 400); }, 2600);
  }

  /* ---------- tastatură ---------- */
  document.addEventListener('keydown', (e) => {
    if (!E.doc || !root || root.hidden) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.modal-wrap')) return;
    if (e.key === 'Escape') {
      if (E.tool) setTool(null);
      else if (E.sel) select(null);
      return;
    }
    const f = selField();
    if (!f) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteField(f);
      return;
    }
    const step = e.shiftKey ? 0.01 : 0.002;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) {
      e.preventDefault();
      f.x = U.clamp(f.x + mv[0], 0, 1 - f.w);
      f.y = U.clamp(f.y + mv[1], 0, 1 - f.h);
      drawField(f);
    }
  });
})();
