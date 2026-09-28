/* Completez — deschiderea documentelor (PDF sau poze) și găsirea câmpurilor */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const IM = CZ.imaging;
  const D = (CZ.docs = {});

  const PDFJS_VER = '3.11.174';
  const lib = () => window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  D.ready = function () {
    const L = lib();
    if (L && L.GlobalWorkerOptions && !L.GlobalWorkerOptions.workerSrc) {
      L.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;
    }
    return !!(L && window.PDFLib && window.fontkit);
  };

  const baseName = (n) => String(n || 'document').replace(/\.[a-z0-9]{2,5}$/i, '');

  /* ---------- text din PDF, cu poziția fiecărui caracter ---------- */
  const cw = document.createElement('canvas').getContext('2d');
  const cwCache = new Map();
  function charW(ch, fam) {
    const k = fam + '\u0000' + ch;
    let v = cwCache.get(k);
    if (v == null) {
      cw.font = `100px ${fam || 'sans-serif'}`;
      v = cw.measureText(ch).width || 50;
      cwCache.set(k, v);
    }
    return v;
  }

  function buildLines(tc, vp) {
    const L = lib();
    const toks = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const tx = L.Util.transform(vp.transform, it.transform);
      if (Math.abs(Math.atan2(tx[1], tx[0])) > 0.08) continue;
      const h = Math.hypot(tx[2], tx[3]);
      if (h < 3) continue;
      const style = (tc.styles && tc.styles[it.fontName]) || {};
      toks.push({ str: U.fixDiacritics(it.str), x: tx[4], y: tx[5], w: Math.max(0, it.width * vp.scale), h, fam: style.fontFamily || 'sans-serif' });
    }
    toks.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const t of toks) {
      let target = null;
      for (let k = lines.length - 1; k >= 0 && k >= lines.length - 4; k--) {
        if (Math.abs(lines[k].y - t.y) <= 0.4 * Math.min(lines[k].h, t.h)) {
          target = lines[k];
          break;
        }
      }
      if (!target) {
        target = { y: t.y, h: t.h, toks: [] };
        lines.push(target);
      }
      target.toks.push(t);
      target.h = Math.max(target.h, t.h);
    }
    for (const Ln of lines) {
      Ln.toks.sort((a, b) => a.x - b.x);
      const chars = [];
      const xs = [];
      const xe = [];
      let prevEnd = null;
      for (const t of Ln.toks) {
        if (prevEnd != null && t.x - prevEnd > 0.12 * Ln.h) {
          chars.push(' ');
          xs.push(prevEnd);
          xe.push(t.x);
        }
        const cs = Array.from(t.str);
        const ws = cs.map((ch) => charW(ch, t.fam));
        const tot = ws.reduce((a, b) => a + b, 0) || 1;
        const k = t.w / tot;
        let x = t.x;
        for (let i = 0; i < cs.length; i++) {
          chars.push(cs[i]);
          xs.push(x);
          x += ws[i] * k;
          xe.push(x);
        }
        prevEnd = prevEnd == null ? t.x + t.w : Math.max(prevEnd, t.x + t.w);
      }
      Ln.chars = chars;
      Ln.xs = xs;
      Ln.xe = xe;
      Ln.text = chars.join('');
      Ln.x0 = xs.length ? xs[0] : 0;
      Ln.x1 = xe.length ? xe[xe.length - 1] : 0;
    }
    lines.sort((a, b) => a.y - b.y);
    return lines;
  }

  /* ---------- deschiderea unui PDF ---------- */
  D.openPdf = async function (bytes, name, onProgress) {
    const L = lib();
    const task = L.getDocument({ data: bytes.slice(), isEvalSupported: false });
    const pdf = await task.promise;
    const doc = { id: U.uid('d'), name: baseName(name), kind: 'pdf', bytes, pages: [], fields: [] };
    for (let i = 1; i <= pdf.numPages; i++) {
      if (onProgress) onProgress(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = U.clamp(1400 / vp1.width, 0.5, 3);
      const vp = page.getViewport({ scale });
      const canvas = U.canvas(vp.width, vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // intent „print”: randare fără requestAnimationFrame, deci merge și când fila e în fundal
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
      let tc = { items: [], styles: {} };
      try {
        tc = await page.getTextContent();
      } catch (e) {}
      let annots = [];
      try {
        annots = (await page.getAnnotations()).filter((a) => a.subtype === 'Widget');
      } catch (e) {}
      const pg = { index: i - 1, W: canvas.width, H: canvas.height, vp1, vp, aspect: canvas.height / canvas.width };
      pg.lines = buildLines(tc, vp);
      pg.text = pg.lines.map((l) => l.text).join('\n');
      pg.annots = annots;
      pg.px = IM.findBlanks(canvas);
      pg.blob = await U.toBlob(canvas, 'image/jpeg', 0.9);
      pg.url = URL.createObjectURL(pg.blob);
      doc.pages.push(pg);
      page.cleanup();
    }
    try {
      await pdf.destroy();
    } catch (e) {}
    doc.textAll = doc.pages.map((p) => p.text).join('\n');
    doc.hasText = doc.textAll.replace(/[\s._…]/g, '').length > 20;
    return doc;
  };

  /* ---------- deschiderea pozelor ---------- */
  const FULL = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const isFull = (c) => c.every((p, i) => Math.abs(p[0] - FULL[i][0]) < 0.004 && Math.abs(p[1] - FULL[i][1]) < 0.004);

  D.openImages = async function (files, onProgress) {
    const list = Array.from(files);
    const doc = {
      id: U.uid('d'),
      name: list.length === 1 ? baseName(list[0].name) : 'Document foto',
      kind: 'images',
      pages: [],
      fields: [],
      textAll: '',
      hasText: false,
    };
    for (let i = 0; i < list.length; i++) {
      if (onProgress) onProgress(i + 1, list.length);
      const srcUrl = URL.createObjectURL(list[i]);
      const img = await U.loadImg(srcUrl);
      const pg = { index: i, srcImg: img, srcUrl, rotate: 0, enhance: true };
      const rotated = IM.drawToCanvas(img, 3000, 0);
      pg.corners = IM.detectCorners(rotated);
      await D.renderImagePage(pg);
      doc.pages.push(pg);
    }
    return doc;
  };

  D.renderImagePage = async function (pg) {
    const base = IM.drawToCanvas(pg.srcImg, 3000, pg.rotate);
    const canvas = isFull(pg.corners) ? IM.drawToCanvas(base, 2200) : IM.warp(base, pg.corners, 2200);
    if (pg.enhance) IM.enhance(canvas);
    pg.W = canvas.width;
    pg.H = canvas.height;
    pg.aspect = pg.H / pg.W;
    pg.px = IM.findBlanks(canvas);
    pg.lines = [];
    pg.text = '';
    pg.blob = await U.toBlob(canvas, 'image/jpeg', 0.88);
    if (pg.url) URL.revokeObjectURL(pg.url);
    pg.url = URL.createObjectURL(pg.blob);
    pg.jpegBytes = new Uint8Array(await pg.blob.arrayBuffer());
  };
  D.isFullCorners = isFull;
  D.FULL = FULL;

  /* ---------- câmpuri ---------- */
  function mkField(pg, x, y, w, h, extra) {
    const f = Object.assign(
      {
        id: U.uid('f'),
        page: pg.index,
        x: U.clamp(x / pg.W, 0, 1),
        y: U.clamp(y / pg.H, 0, 1),
        w: U.clamp(w / pg.W, 0.004, 1),
        h: U.clamp(h / pg.H, 0.004, 1),
        type: 'text',
        key: null,
        label: '',
        labelTail: '',
        override: null,
        fontScale: 1,
        spread: false,
        profileId: null,
        sigId: null,
        source: 'auto',
        confidence: 'none',
      },
      extra || {}
    );
    if (f.x + f.w > 1) f.w = 1 - f.x;
    if (f.y + f.h > 1) f.h = 1 - f.y;
    return f;
  }
  D.mkField = mkField;

  const overlaps = (a, b) => {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ox > 0.3 * Math.min(a.w, b.w) && oy > 0.3 * Math.min(a.h, b.h);
  };

  function lastWords(s, n) {
    const w = String(s || '').trim().split(/\s+/);
    return w.slice(Math.max(0, w.length - n)).join(' ');
  }

  function hintBelow(pg, li, x0, x1) {
    const L = pg.lines[li];
    for (let k = li + 1; k < pg.lines.length && k <= li + 2; k++) {
      const N = pg.lines[k];
      if (N.y - L.y > L.h * 1.9) break;
      let s = '';
      for (let i = 0; i < N.chars.length; i++) {
        if (N.xe[i] >= x0 - L.h * 0.3 && N.xs[i] <= x1 + L.h * 0.3) s += N.chars[i];
      }
      s = s.trim();
      const m = /\(([^)]{2,48})\)/.exec(s);
      if (m) return m[1];
      if (s && N.h < L.h * 0.9 && s.length < 40) return s;
    }
    return '';
  }

  function prevLineTail(pg, li) {
    if (li === 0) return '';
    const P = pg.lines[li - 1];
    const L = pg.lines[li];
    if (L.y - P.y > L.h * 2.4) return '';
    const m = /[._…‥·](?: ?[._…‥·]){3,}|_{2,}/g;
    let lastEnd = 0;
    let r;
    while ((r = m.exec(P.text))) lastEnd = r.index + r[0].length;
    return P.text.slice(lastEnd);
  }

  const BLANK_RE = /[._…‥·](?: ?[._…‥·]){3,}|_{2,}/g;

  function detectPdfPage(pg, profile) {
    const fields = [];
    const lab = CZ.labeler;
    const typeFor = CZ.schema.typeForKey;
    let prevKey = null;
    let lastKey = null;
    const rightEdge = Math.max(0, ...pg.lines.map((l) => l.x1));

    const push = (f) => {
      // „Nr. înregistrare …… din ……”: legătura scurtă după un câmp al instituției rămâne tot al instituției
      if (!f.key && lastKey === 'ignore' && f.source === 'text' && U.nrm(f.labelTail).length <= 5) f.key = 'ignore';
      fields.push(f);
      lastKey = f.key;
      if (f.key && f.key !== 'ignore') prevKey = f.key;
    };
    const geom = (Ln, key) => {
      const fh = Ln.h;
      return typeFor(key) === 'signature' ? { top: Ln.y - fh * 2.4, h: fh * 2.8 } : { top: Ln.y - fh * 1.02, h: fh * 1.14 };
    };

    for (let li = 0; li < pg.lines.length; li++) {
      const Ln = pg.lines[li];
      const blanks = [];
      BLANK_RE.lastIndex = 0;
      let m;
      while ((m = BLANK_RE.exec(Ln.text))) {
        let s = m.index;
        const e = m.index + m[0].length - 1;
        // punctul din „str.”, „bl.”, „nr.” aparține etichetei, nu liniei punctate
        if (Ln.text[s] === '.' && s > 0 && /[\p{L}]/u.test(Ln.text[s - 1])) {
          s++;
          while (s < e && Ln.text[s] === ' ') s++;
        }
        if (e - s < 2) continue;
        blanks.push({ s, e, x0: Ln.xs[s], x1: Ln.xe[e] });
      }
      // 1) spații punctate sau subliniate scrise ca text
      for (let bi = 0; bi < blanks.length; bi++) {
        const b = blanks[bi];
        const cs = bi === 0 ? 0 : blanks[bi - 1].e + 1;
        let context = Ln.text.slice(cs, b.s);
        const afterEnd = bi + 1 < blanks.length ? blanks[bi + 1].s : Ln.text.length;
        const after = Ln.text.slice(b.e + 1, afterEnd).trim();
        const hm = /^\(([^)]{2,48})\)/.exec(after);
        let hint = hm ? hm[1] : hintBelow(pg, li, b.x0, b.x1);
        if (bi === 0 && !U.nrm(context)) context = prevLineTail(pg, li);
        const r = lab.label(context, hint, prevKey, profile);
        const g = geom(Ln, r.key);
        push(mkField(pg, b.x0, g.top, b.x1 - b.x0, g.h, {
          key: r.key, type: typeFor(r.key), label: r.label || (hint ? '(' + hint + ')' : ''),
          labelTail: lastWords(context, 3), confidence: r.confidence, source: 'text',
        }));
      }
      // 2) etichete urmate de spațiu gol mare („Data:”, „Semnătura”, „CNP:” fără puncte)
      const segs = [];
      let segStart = 0;
      for (let i = 0; i <= Ln.chars.length; i++) {
        const atEnd = i === Ln.chars.length;
        const bigGap = !atEnd && Ln.chars[i] === ' ' && Ln.xe[i] - Ln.xs[i] > Ln.h * 3;
        if (atEnd || bigGap) {
          if (i > segStart) segs.push({ s: segStart, e: i - 1, gapTo: atEnd ? rightEdge : Ln.xe[i] });
          segStart = i + 1;
        }
      }
      for (const sg of segs) {
        const raw = Ln.text.slice(sg.s, sg.e + 1);
        if (BLANK_RE.test(raw)) {
          BLANK_RE.lastIndex = 0;
          continue;
        }
        BLANK_RE.lastIndex = 0;
        const trimmed = raw.trim();
        const nt = U.nrm(trimmed);
        const isSig = /(^| )semnatur/.test(nt) && nt.length < 40;
        const endsColon = /:\s*$/.test(trimmed);
        if (!isSig && !endsColon) continue;
        const labelEnd = Ln.xe[sg.e];
        const space = sg.gapTo - labelEnd;
        const r = lab.label(trimmed, '', prevKey, profile);
        if (!r.key || r.key === 'ignore') continue;
        // există deja un câmp chiar în dreapta sau dedesubt?
        const fh = Ln.h;
        if (space >= fh * 5) {
          const g = geom(Ln, r.key);
          const w = Math.min(space - fh * 0.8, r.key === 'semnatura' ? fh * 12 : r.key === 'azi' ? fh * 7 : fh * 22);
          const cand = mkField(pg, labelEnd + fh * 0.4, g.top, w, g.h, {
            key: r.key, type: typeFor(r.key), label: r.label, labelTail: lastWords(trimmed, 3), confidence: 'low', source: 'text',
          });
          if (!fields.some((f) => overlaps(f, cand))) push(cand);
        } else if (isSig) {
          const next = pg.lines[li + 1];
          const room = !next || next.y - Ln.y > fh * 3.4;
          if (room) {
            const x0 = Math.max(0, Ln.xs[sg.s] - fh);
            const cand = mkField(pg, x0, Ln.y + fh * 0.25, fh * 12, fh * 2.6, {
              key: 'semnatura', type: 'signature', label: r.label, confidence: 'low', source: 'text',
            });
            if (!fields.some((f) => overlaps(f, cand))) push(cand);
          }
        }
      }
    }

    // 3) câmpuri de formular PDF (AcroForm)
    for (const a of pg.annots || []) {
      const isText = a.fieldType === 'Tx';
      const isCheck = a.fieldType === 'Btn' && a.checkBox;
      if (!isText && !isCheck) continue;
      if (a.readOnly) continue;
      if (isText && a.fieldValue && String(a.fieldValue).trim()) continue;
      const r4 = pg.vp.convertToViewportRectangle(a.rect);
      const rx = Math.min(r4[0], r4[2]);
      const ry = Math.min(r4[1], r4[3]);
      const rw = Math.abs(r4[2] - r4[0]);
      const rh = Math.abs(r4[3] - r4[1]);
      let context = '';
      const midY = ry + rh * 0.75;
      for (const Ln of pg.lines) {
        if (Math.abs(Ln.y - midY) < Math.max(Ln.h, rh) * 0.8) {
          let s = '';
          for (let i = 0; i < Ln.chars.length; i++) if (Ln.xe[i] <= rx + 2) s += Ln.chars[i];
          if (s.trim()) context = s.slice(-60);
        }
      }
      const r = CZ.labeler.label(context || a.alternativeText || a.fieldName || '', a.alternativeText || '', prevKey, profile);
      const f = mkField(pg, rx, ry, rw, rh, {
        key: isCheck ? null : r.key,
        type: isCheck ? 'check' : typeFor(r.key),
        label: r.label || a.alternativeText || a.fieldName || '',
        labelTail: lastWords(context, 3),
        confidence: r.confidence,
        source: 'acro',
        acroName: a.fieldName,
        acroCheck: isCheck,
      });
      for (let i = fields.length - 1; i >= 0; i--) if (overlaps(fields[i], f)) fields.splice(i, 1);
      push(f);
    }

    // 4) linii desenate (nu text): le adăugăm dacă nu se suprapun cu ce avem
    const px = pg.px || { blanks: [], fontPx: 20 };
    for (const b of px.blanks) {
      let Ln = null;
      for (const cand of pg.lines) {
        if (cand.y >= b.y - cand.h * 1.3 && cand.y <= b.y + cand.h * 0.35) {
          Ln = cand;
          break;
        }
      }
      const fh = Ln ? Ln.h : px.fontPx;
      let context = '';
      if (Ln) {
        let s = '';
        for (let i = 0; i < Ln.chars.length; i++) if (Ln.xe[i] <= b.x0 + 2) s += Ln.chars[i];
        const mm = s.match(/[._…‥·](?: ?[._…‥·]){3,}|_{2,}/g);
        if (mm) s = s.slice(s.lastIndexOf(mm[mm.length - 1]) + mm[mm.length - 1].length);
        context = s;
      }
      const r = CZ.labeler.label(context, '', null, profile);
      const isSig = r.key === 'semnatura';
      const cand = mkField(pg, b.x0, b.y - fh * (isSig ? 2.3 : 1.0), b.x1 - b.x0, fh * (isSig ? 2.7 : 1.12), {
        key: r.key, type: typeFor(r.key), label: r.label, labelTail: lastWords(context, 3), confidence: r.confidence, source: 'pixel',
      });
      if (fields.some((f) => overlaps(f, cand))) continue;
      fields.push(cand);
    }

    fields.sort((a, b) => a.y - b.y || a.x - b.x);
    CZ.labeler.postProcess(fields);
    return fields;
  }

  function detectImagePage(pg) {
    const px = pg.px || { blanks: [], fontPx: pg.H * 0.015 };
    return px.blanks.map((b) =>
      mkField(pg, b.x0, b.y - px.fontPx * 1.0, b.x1 - b.x0, px.fontPx * 1.12, { source: 'pixel', confidence: 'none' })
    );
  }

  D.detectPage = function (doc, pg, profile) {
    return doc.kind === 'pdf' ? detectPdfPage(pg, profile) : detectImagePage(pg);
  };

  D.detectAll = function (doc, profile) {
    doc.fields = [];
    for (const pg of doc.pages) doc.fields.push(...D.detectPage(doc, pg, profile));
  };

  /* ---------- șabloane: aceeași formă de document → aceleași câmpuri ---------- */
  D.fingerprint = async function (doc) {
    if (doc.kind !== 'pdf') return null;
    if (doc.hasText) {
      const t = U.nrm(doc.textAll).slice(0, 6000) + '|' + doc.pages.length;
      return 'T' + (await U.sha256Hex(new TextEncoder().encode(t)));
    }
    return 'B' + (await U.sha256Hex(doc.bytes));
  };

  D.templateFromDoc = function (doc) {
    return {
      name: doc.name,
      pages: doc.pages.length,
      updatedAt: Date.now(),
      fields: doc.fields
        .filter((f) => f.key !== 'ignore' || f.source === 'manual')
        .map((f) => ({
          page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, type: f.type, key: f.key, label: f.label,
          labelTail: f.labelTail, fontScale: f.fontScale, spread: f.spread, acroName: f.acroName || null, acroCheck: !!f.acroCheck,
        })),
    };
  };

  D.applyTemplate = function (doc, tpl) {
    doc.fields = tpl.fields
      .filter((f) => f.page < doc.pages.length)
      .map((f) => Object.assign({ id: U.uid('f'), override: null, profileId: null, sigId: null, source: 'template', confidence: 'high' }, f));
  };

  /* ---------- documentul demonstrativ: o cerere de cazare ---------- */
  D.buildSamplePdf = async function () {
    const { PDFDocument, rgb } = window.PDFLib;
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(window.fontkit);
    const font = await pdf.embedFont(U.fontBytes(), { subset: false });
    pdf.setTitle('Cerere de cazare (exemplu)');
    const page = pdf.addPage([595.28, 841.89]);
    const ink = rgb(0.08, 0.08, 0.1);
    const grey = rgb(0.35, 0.35, 0.4);
    const Lm = 64;
    const Rm = 531;
    const wOf = (s, size) => font.widthOfTextAtSize(s, size);
    function line(y, parts, opt) {
      const o = Object.assign({ size: 11, x: Lm, maxW: Rm - Lm, color: ink }, opt || {});
      const fixed = parts.filter((p) => typeof p === 'string').reduce((a, p) => a + wOf(p, o.size), 0);
      const flex = parts.filter((p) => typeof p === 'number').reduce((a, p) => a + p, 0);
      const free = Math.max(0, o.maxW - fixed);
      const dotW = wOf('.', o.size);
      const s = parts.map((p) => (typeof p === 'number' ? '.'.repeat(Math.max(4, Math.floor((free * p) / flex / dotW))) : p)).join('');
      page.drawText(s, { x: o.x, y, size: o.size, font, color: o.color });
    }
    const center = (s, y, size, color) => page.drawText(s, { x: (595.28 - wOf(s, size)) / 2, y, size, font, color: color || ink });

    line(790, ['Nr. înregistrare ', 1, ' din ', 1], { size: 9.5, maxW: 250, color: grey });
    center('UNIVERSITATEA — DIRECȚIA SOCIAL-ADMINISTRATIVĂ', 752, 10, grey);
    center('CERERE DE CAZARE', 722, 16);
    center('în căminele studențești', 702, 11, grey);
    line(662, ['Domnule Administrator,']);
    line(632, ['Subsemnatul(a) ', 1, ',']);
    line(606, ['CNP ', 1.15, ', născut(ă) la data de ', 0.85, ',']);
    line(580, ['domiciliat(ă) în localitatea ', 1, ', județul ', 0.8, ',']);
    line(554, ['str. ', 2.2, ', nr. ', 0.45, ', bl. ', 0.45, ', sc. ', 0.35, ', ap. ', 0.35, ',']);
    line(528, ['posesor/posesoare al/a C.I. seria ', 0.45, ' nr. ', 0.8, ', telefon ', 1, ',']);
    line(502, ['e-mail ', 1, ', student(ă) la Facultatea de ', 1.2, ',']);
    line(476, ['specializarea ', 2, ', anul ', 0.35, ', grupa ', 0.5, ',']);
    line(450, ['vă rog să-mi aprobați cazarea în căminul ', 0.7, ' în anul universitar ', 0.9, '.']);
    line(412, ['Declar pe propria răspundere că datele de mai sus sunt reale și că voi respecta']);
    line(395, ['Regulamentul de cazare în căminele universității.']);
    line(350, ['Data: ', 1], { maxW: 190 });
    line(350, ['Semnătura: ', 1], { x: 318, maxW: 213 });
    page.drawRectangle({ x: Lm - 6, y: 236, width: Rm - Lm + 12, height: 60, borderColor: rgb(0.6, 0.6, 0.66), borderWidth: 0.8 });
    line(278, ['Rezervat administrației căminului'], { size: 9, color: grey });
    line(256, ['Aprobat, camera ', 0.6, '   Administrator: ', 1], { size: 9.5, maxW: Rm - Lm - 12, color: grey });
    const bytes = await pdf.save();
    return new Uint8Array(bytes);
  };
})();
