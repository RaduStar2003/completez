/* Completez — așezarea textului (aceeași în previzualizare și în PDF) și exportul PDF */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;

  const COLORS = { black: [0.07, 0.07, 0.1], blue: [0.09, 0.18, 0.58] };
  const CSS_COLORS = { black: '#121218', blue: '#172e94' };

  /* Așezarea unui text într-o casetă. pw/ph = dimensiunile paginii în unitățile țintă;
     width1(text) = lățimea textului la dimensiunea 1 în aceleași unități. */
  function layoutText(f, text, pw, ph, width1) {
    const bw = f.w * pw;
    const bh = f.h * ph;
    const pad = Math.min(bh * 0.12, bw * 0.04);
    let size = bh * 0.8 * (f.fontScale || 1);
    const baseline = bh * 0.8;
    if (f.spread && text.length > 1) {
      const chars = Array.from(text);
      const slot = bw / chars.length;
      size = Math.min(size, slot * 1.3);
      const xs = chars.map((ch, i) => slot * (i + 0.5) - (width1(ch) * size) / 2);
      return { size, baseline, chars, xs };
    }
    const w = width1(text) * size;
    const avail = bw - 2 * pad;
    if (w > avail && w > 0) size = Math.max(size * (avail / w), 3);
    return { size, baseline, x: pad };
  }

  function sigRect(f, pw, ph, ar) {
    const bw = f.w * pw;
    const bh = f.h * ph;
    let dw;
    let dh;
    if (bw / bh > ar) {
      dh = bh * 0.96;
      dw = dh * ar;
    } else {
      dw = bw * 0.96;
      dh = dw / ar;
    }
    return { x: (bw - dw) / 2, y: bh - dh - (bh - dh) * 0.25, w: dw, h: dh };
  }

  CZ.layout = { text: layoutText, sig: sigRect, colors: CSS_COLORS };

  function wrap(font, text, size, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(t, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /**
   * ctx: { valueFor(f), sigFor(f) → {dataUrl, w, h} | null, textColor, audit, signer, docHash }
   */
  async function build(doc, ctx) {
    const { PDFDocument, rgb, degrees } = window.PDFLib;
    let pdf;
    if (doc.kind === 'pdf') pdf = await PDFDocument.load(doc.bytes, { ignoreEncryption: true });
    else pdf = await PDFDocument.create();
    pdf.registerFontkit(window.fontkit);
    const font = await pdf.embedFont(U.fontBytes(), { subset: false });
    const color = rgb(...(COLORS[ctx.textColor] || COLORS.black));
    const width1 = (t) => font.widthOfTextAtSize(t, 1);

    const geo = [];
    if (doc.kind === 'images') {
      for (const pg of doc.pages) {
        const img = await pdf.embedJpg(pg.jpegBytes);
        const W = 595.28;
        const H = W * pg.aspect;
        const page = pdf.addPage([W, H]);
        page.drawImage(img, { x: 0, y: 0, width: W, height: H });
        geo.push({ pw: W, ph: H, toPdf: (nx, ny) => [nx * W, H - ny * H], angle: 0 });
      }
    } else {
      for (const pg of doc.pages) {
        const vp = pg.vp1;
        const toPdf = (nx, ny) => vp.convertToPdfPoint(nx * vp.width, ny * vp.height);
        const a = toPdf(0.1, 0.1);
        const b = toPdf(0.2, 0.1);
        geo.push({ pw: vp.width, ph: vp.height, toPdf, angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI });
      }
    }

    // câmpurile formularului PDF (AcroForm) se completează direct
    const done = new Set();
    if (doc.kind === 'pdf' && doc.fields.some((f) => f.acroName)) {
      let form = null;
      try {
        form = pdf.getForm();
      } catch (e) {}
      if (form) {
        for (const f of doc.fields) {
          if (!f.acroName || f.type === 'signature' || f.key === 'ignore') continue;
          try {
            if (f.acroCheck) {
              const cb = form.getCheckBox(f.acroName);
              if (ctx.valueFor(f)) cb.check();
              done.add(f.id);
            } else {
              const v = ctx.valueFor(f);
              const tf = form.getTextField(f.acroName);
              if (v) {
                const max = tf.getMaxLength();
                tf.setText(max ? v.slice(0, max) : v);
              }
              done.add(f.id);
            }
          } catch (e) {
            /* câmp cu nume neobișnuit: îl desenăm ca text mai jos */
          }
        }
        try {
          form.updateFieldAppearances(font);
        } catch (e) {}
        try {
          form.flatten();
        } catch (e) {
          console.warn('Formularul nu a putut fi aplatizat', e);
        }
      }
    }

    const sigCache = new Map();
    let filled = 0;
    let signatures = 0;
    for (const f of doc.fields) {
      if (done.has(f.id)) {
        if (ctx.valueFor(f)) filled++;
        continue;
      }
      if (f.key === 'ignore') continue;
      const G = geo[f.page];
      if (!G) continue;
      const page = pdf.getPage(f.page);
      if (f.type === 'signature') {
        const sig = ctx.sigFor(f);
        if (!sig) continue;
        let img = sigCache.get(sig.dataUrl);
        if (!img) {
          img = await pdf.embedPng(U.b64ToBytes(sig.dataUrl.split(',')[1]));
          sigCache.set(sig.dataUrl, img);
        }
        const r = sigRect(f, G.pw, G.ph, img.width / img.height);
        const [X, Y] = G.toPdf((f.x * G.pw + r.x) / G.pw, (f.y * G.ph + r.y + r.h) / G.ph);
        page.drawImage(img, { x: X, y: Y, width: r.w, height: r.h, rotate: degrees(G.angle) });
        signatures++;
        continue;
      }
      const text = ctx.valueFor(f);
      if (!text) continue;
      const L = layoutText(f, text, G.pw, G.ph, width1);
      if (L.chars) {
        L.chars.forEach((ch, i) => {
          const [X, Y] = G.toPdf((f.x * G.pw + L.xs[i]) / G.pw, (f.y * G.ph + L.baseline) / G.ph);
          page.drawText(ch, { x: X, y: Y, size: L.size, font, color, rotate: degrees(G.angle) });
        });
      } else {
        const [X, Y] = G.toPdf((f.x * G.pw + L.x) / G.pw, (f.y * G.ph + L.baseline) / G.ph);
        page.drawText(text, { x: X, y: Y, size: L.size, font, color, rotate: degrees(G.angle) });
      }
      filled++;
    }

    if (ctx.audit) {
      const page = pdf.addPage([595.28, 841.89]);
      const ink = rgb(0.1, 0.1, 0.14);
      const grey = rgb(0.38, 0.38, 0.44);
      let y = 780;
      const put = (t, size, c, x) => {
        page.drawText(t, { x: x || 64, y, size, font, color: c || ink });
        y -= size * 1.55;
      };
      const para = (t, size, c) => wrap(font, t, size, 467).forEach((l) => put(l, size, c));
      put('Jurnal de semnare', 18);
      y -= 6;
      para('Pagină adăugată automat de aplicația Completez la cererea semnatarului.', 10, grey);
      y -= 10;
      const rows = [
        ['Document', doc.name],
        ['Pagini', String(doc.pages.length)],
        ['Semnat de', ctx.signer || '—'],
        ['Data și ora', new Date().toLocaleString('ro-RO') + ' (ceasul dispozitivului)'],
        ['Câmpuri completate', String(filled)],
        ['Semnături aplicate', String(signatures)],
        ['Dispozitiv', (navigator.userAgent || '').slice(0, 90)],
      ];
      for (const [k, v] of rows) {
        page.drawText(k, { x: 64, y, size: 10, font, color: grey });
        const lines = wrap(font, v, 10.5, 330);
        lines.forEach((l, i) => page.drawText(l, { x: 200, y: y - i * 14, size: 10.5, font, color: ink }));
        y -= Math.max(1, lines.length) * 14 + 8;
      }
      y -= 6;
      put('Amprenta SHA-256 a documentului original', 10, grey);
      const h = ctx.docHash || 'indisponibilă în acest browser';
      put(h.slice(0, 32), 10.5);
      if (h.length > 32) put(h.slice(32), 10.5);
      y -= 12;
      para(
        'Tipul semnăturii: semnătură electronică simplă — imaginea semnăturii olografe a titularului, aplicată de acesta. ' +
          'Conform Legii nr. 214/2024, are efectul unei semnături olografe doar în cazurile prevăzute de lege (de exemplu, dacă este recunoscută de cealaltă parte). ' +
          'Nu este o semnătură electronică avansată sau calificată. Ora de mai sus provine de la dispozitiv și nu este o marcă temporală calificată.',
        9.5,
        grey
      );
    }

    pdf.setTitle(doc.name);
    pdf.setSubject('Document completat cu Completez');
    pdf.setCreator('Completez');
    pdf.setProducer('Completez (pdf-lib)');
    if (ctx.docHash) pdf.setKeywords(['sha256-original:' + ctx.docHash]);
    pdf.setModificationDate(new Date());
    return { bytes: await pdf.save(), filled, signatures };
  }

  CZ.exporter = { build };
})();
