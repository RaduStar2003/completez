/* Completez — ajutor opțional de la Claude (doar în Claude, la cererea utilizatorului).
   Trimitem formularul gol (textul din jurul spațiilor sau poza cu casete numerotate),
   niciodată datele din profil. */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const A = (CZ.ai = { sample: null, limits: null });

  A.init = async function () {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      const s = await window.claude.use('sample');
      if (!s) return;
      A.sample = s;
      try {
        A.limits = await s.limits();
      } catch (e) {
        A.limits = null;
      }
      if (CZ.app && CZ.app.onAiReady) CZ.app.onAiReady();
    } catch (e) {}
  };

  A.canImages = () => !!(A.sample && A.limits && A.limits.images);
  A.available = (doc) => !!(A.sample && doc && (doc.hasText || A.canImages()));

  function catalog(profile) {
    const out = [];
    for (const g of CZ.schema.keyOptions(profile)) for (const o of g.options) out.push({ key: o.key, label: o.label });
    return out;
  }

  const ERR = {
    not_granted: 'Nu ai permis paginii să folosească Claude. Poți continua manual.',
    sampling_disabled: 'Claude nu este disponibil pentru acest cont.',
    rate_limited: 'Prea multe cereri într-un timp scurt. Încearcă din nou peste un minut.',
    session_expired: 'Sesiunea Claude a expirat. Autentifică-te din nou și reîncearcă.',
    image_rejected: 'Poza nu a putut fi trimisă. Încearcă o poză mai mică sau mai clară.',
    images_unavailable: 'În această vizualizare Claude nu poate primi imagini.',
    invalid_json: 'Răspunsul nu a putut fi citit. Mai încearcă o dată.',
    refused: 'Claude a refuzat această cerere.',
    prompt_too_large: 'Documentul e prea lung pentru o singură cerere.',
  };
  A.errorText = (e) => (e && ERR[e.code]) || 'Claude nu a răspuns. Poți continua manual sau reîncerca.';

  async function annotatedImage(pg, fields) {
    const img = await U.loadImg(pg.url);
    const k = Math.min(1, 1500 / img.naturalWidth);
    const c = U.canvas(img.naturalWidth * k, img.naturalHeight * k);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    ctx.lineWidth = Math.max(2, c.width / 500);
    const fs = Math.max(13, Math.round(c.width / 70));
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    fields.forEach((f, i) => {
      const x = f.x * c.width;
      const y = f.y * c.height;
      const w = f.w * c.width;
      const h = f.h * c.height;
      ctx.strokeStyle = '#e0141e';
      ctx.strokeRect(x, y, w, h);
      const label = String(i + 1);
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = '#e0141e';
      ctx.fillRect(x, Math.max(0, y - fs - 4), tw, fs + 4);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 4, Math.max(fs, y - 4));
    });
    return U.toBlob(c, 'image/jpeg', 0.86);
  }

  const RULES_TEXT =
    'Use "text" for blanks that need information not in the list (a room number, a reason, an amount). ' +
    'Use "ignore" for blanks that the institution fills in (registration number, approval, the signature of a dean/doctor/employer) or that are not places to write. ' +
    'Use "semnatura" only for the signature of the person filling in the form, and "azi" for the date of filling in.';

  function textPrompt(pg, fields, keys) {
    const pageText = pg.text.slice(0, 5000);
    const list = fields
      .map((f) => `${f.id} | text before: «${(f.label || '').slice(-60)}» | current guess: ${f.key || 'none'}`)
      .join('\n');
    return (
      'You help fill in a Romanian form. Below is the text of one page, then a list of blank spaces found on it ' +
      '(each with the text right before it). For each blank, choose the key of the personal data that belongs there.\n\n' +
      'Allowed keys:\n' + keys.map((k) => `${k.key}: ${k.label}`).join('\n') + '\n\n' + RULES_TEXT + '\n\n' +
      'PAGE TEXT:\n' + pageText + '\n\nBLANKS:\n' + list + '\n\n' +
      'Reply with only JSON: {"fields":[{"id":"...","key":"..."}],"docType":"short Romanian name of the document","warnings":["short Romanian warnings, only if the document legally needs a qualified or notarial signature"]}'
    );
  }

  function imagePrompt(fields, keys) {
    return (
      'The image is one page of a Romanian form (a photo or a scan). Red numbered boxes mark blank spaces that were found automatically. ' +
      'For each box number, choose the key of the personal data that belongs there, by reading the printed label next to or under the box.\n\n' +
      'Allowed keys:\n' + keys.map((k) => `${k.key}: ${k.label}`).join('\n') + '\n\n' + RULES_TEXT + '\n\n' +
      `There are ${fields.length} boxes. Also list up to 12 important blank places that have NO red box (for example empty table cells next to a label, or a signature line), ` +
      'with their position as fractions of the image width and height (x and y are the top-left corner).\n\n' +
      'Reply with only JSON: {"boxes":[{"n":1,"key":"cnp","label":"CNP"}],"missing":[{"x":0.12,"y":0.55,"w":0.3,"h":0.025,"key":"semnatura","label":"Semnătura"}],' +
      '"docType":"short Romanian name of the document","warnings":["short Romanian warnings, only if the document legally needs a qualified or notarial signature"]}'
    );
  }

  /* Rulează asistentul pe tot documentul. Întoarce un rezumat. */
  A.assist = async function (doc, profile, opts) {
    const o = opts || {};
    const keys = catalog(profile);
    const valid = new Set(keys.map((k) => k.key));
    const res = { changed: 0, added: 0, warnings: [], docType: '' };
    for (const pg of doc.pages) {
      if (o.signal && o.signal.aborted) break;
      const all = doc.fields.filter((f) => f.page === pg.index);
      if (doc.kind === 'pdf' && doc.hasText) {
        const unsure = all.filter((f) => !f.key || f.confidence === 'low' || f.confidence === 'none');
        if (!unsure.length) continue;
        if (o.onStatus) o.onStatus(`Pagina ${pg.index + 1}: Claude verifică ${unsure.length} câmpuri…`);
        const out = await A.sample.json(textPrompt(pg, unsure, keys), { signal: o.signal, modelTier: 'quick' });
        for (const it of (out && out.fields) || []) {
          const f = unsure.find((x) => x.id === String(it.id));
          const key = String(it.key || '');
          if (!f || !valid.has(key) || f.key === key) continue;
          f.key = key;
          f.type = CZ.schema.typeForKey(key);
          f.confidence = 'ai';
          res.changed++;
        }
        collect(out, res);
      } else {
        if (!A.canImages()) continue;
        if (o.onStatus) o.onStatus(`Pagina ${pg.index + 1}: Claude citește poza…`);
        const blob = await annotatedImage(pg, all);
        const out = await A.sample.json(imagePrompt(all, keys), { signal: o.signal, images: [blob] });
        for (const it of (out && out.boxes) || []) {
          const f = all[Number(it.n) - 1];
          const key = String(it.key || '');
          if (!f || !valid.has(key)) continue;
          if (f.key !== key) res.changed++;
          f.key = key;
          f.type = CZ.schema.typeForKey(key);
          f.confidence = 'ai';
          if (it.label) f.label = String(it.label).slice(0, 40);
        }
        for (const m of ((out && out.missing) || []).slice(0, 12)) {
          const key = String(m.key || '');
          const x = Number(m.x);
          const y = Number(m.y);
          let w = Number(m.w);
          let h = Number(m.h);
          if (!valid.has(key) || key === 'ignore' || ![x, y, w, h].every(Number.isFinite)) continue;
          if (x < 0 || y < 0 || x > 1 || y > 1) continue;
          w = U.clamp(w, 0.03, 1 - x);
          h = U.clamp(h, 0.012, key === 'semnatura' ? 0.12 : 0.05);
          const nf = CZ.docs.mkField(pg, x * pg.W, y * pg.H, w * pg.W, h * pg.H, {
            key, type: CZ.schema.typeForKey(key), label: String(m.label || '').slice(0, 40), source: 'ai', confidence: 'ai',
          });
          const clash = doc.fields.some((f) => f.page === pg.index &&
            Math.min(f.x + f.w, nf.x + nf.w) - Math.max(f.x, nf.x) > 0.3 * Math.min(f.w, nf.w) &&
            Math.min(f.y + f.h, nf.y + nf.h) - Math.max(f.y, nf.y) > 0.3 * Math.min(f.h, nf.h));
          if (clash) continue;
          doc.fields.push(nf);
          res.added++;
        }
        collect(out, res);
      }
    }
    return res;
  };

  function collect(out, res) {
    if (!out) return;
    if (out.docType && !res.docType) res.docType = String(out.docType).slice(0, 80);
    for (const w of out.warnings || []) if (w && res.warnings.length < 4) res.warnings.push(String(w).slice(0, 240));
  }
})();
