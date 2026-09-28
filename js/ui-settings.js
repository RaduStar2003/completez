/* Completez — setări: siguranța datelor, copii de siguranță, formulare recunoscute, aspect, informații */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const S = CZ.store;
  const h = U.h;

  const ST = (CZ.settingsUI = {});
  let root = null;
  ST.mount = (el) => { root = el; };

  const stampDate = () => new Date().toISOString().slice(0, 10);

  async function askNewPassword() {
    const a = h('input', { class: 'input', type: 'password', id: 'pw1', autocomplete: 'new-password' });
    const b = h('input', { class: 'input', type: 'password', id: 'pw2', autocomplete: 'new-password' });
    const ok = await U.dialog({
      title: 'Parolă pentru datele tale',
      body: h('div', { style: { display: 'grid', gap: '12px' } },
        h('p', { class: 'modal-text' }, 'Datele se criptează în browser cu această parolă. Dacă o uiți, nu mai pot fi recuperate, așa că fă și o copie de siguranță.'),
        h('label', { class: 'field' }, h('span', null, 'Parola nouă (minim 6 caractere)'), a),
        h('label', { class: 'field' }, h('span', null, 'Repetă parola'), b)),
      actions: [{ label: 'Renunț', value: false }, { label: 'Setează parola', value: true, kind: 'primary' }],
    });
    if (!ok) return null;
    if (a.value.length < 6) { U.toast('Parola trebuie să aibă cel puțin 6 caractere.', 'warn'); return null; }
    if (a.value !== b.value) { U.toast('Parolele nu se potrivesc.', 'warn'); return null; }
    return a.value;
  }

  async function askPassword(title) {
    const a = h('input', { class: 'input', type: 'password', id: 'pwAsk', autocomplete: 'current-password' });
    const ok = await U.dialog({
      title: title || 'Parola copiei de siguranță',
      body: h('label', { class: 'field' }, h('span', null, 'Parola'), a),
      actions: [{ label: 'Renunț', value: false }, { label: 'Continuă', value: true, kind: 'primary' }],
    });
    return ok ? a.value : null;
  }

  function block(title, ...kids) {
    return h('section', { class: 'card sblock' }, h('h2', null, title), ...kids);
  }

  ST.render = function () {
    if (!root) return;
    const st = S.data.settings;

    // siguranță
    const sec = [];
    sec.push(h('p', { class: 'muted' }, S.persistent
      ? 'Profilurile, semnăturile și formularele recunoscute sunt salvate doar în acest browser, pe acest dispozitiv. Pe alt telefon sau calculator, mută-le cu o copie de siguranță.'
      : 'Acest browser nu permite salvarea datelor (probabil o fereastră privată). Ce completezi acum se pierde la închidere.'));
    if (!S.canEncrypt()) {
      sec.push(h('p', { class: 'help bad' }, 'Criptarea nu este disponibilă în acest browser.'));
    } else if (st.protected) {
      sec.push(h('div', { class: 'row' },
        h('span', { class: 'pill ok' }, U.icon('lock'), 'Protejat cu parolă'),
        h('button', { class: 'btn sm', type: 'button', onclick: async () => { const pw = await askNewPassword(); if (pw) { await S.setPassword(pw); U.toast('Parola a fost schimbată.', 'ok'); ST.render(); } } }, 'Schimbă parola'),
        h('button', { class: 'btn sm', type: 'button', onclick: async () => {
          if (!(await U.confirm('Scoți parola?', 'Datele vor fi salvate necriptat în acest browser.', 'Scoate parola'))) return;
          await S.removePassword();
          U.toast('Parola a fost scoasă.', 'ok');
          ST.render();
        } }, 'Scoate parola'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => location.reload() }, 'Blochează acum')));
    } else {
      sec.push(h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: async () => { const pw = await askNewPassword(); if (pw) { await S.setPassword(pw); U.toast('Datele sunt acum criptate cu parola ta.', 'ok'); ST.render(); } } },
          U.icon('lock'), 'Protejează cu o parolă')));
      sec.push(h('p', { class: 'help' }, 'Recomandat dacă folosești un calculator comun: CNP-ul și semnătura rămân criptate până introduci parola.'));
    }

    // copie de siguranță
    const inBackup = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'inBackup' });
    inBackup.addEventListener('change', async () => {
      const f = inBackup.files[0];
      inBackup.value = '';
      if (!f) return;
      try {
        const data = await S.parseBackup(await U.readText(f), () => askPassword());
        if (!data) return;
        const n = (data.profiles || []).length;
        if (!(await U.confirm('Înlocuiești datele?', `Copia conține ${n} ${n === 1 ? 'profil' : 'profiluri'}. Datele din acest browser vor fi înlocuite.`, 'Înlocuiește'))) return;
        const protectedNow = S.data.settings.protected;
        S.data = Object.assign(S.defaults(), data);
        S.data.settings = Object.assign(S.defaults().settings, data.settings || {}, { protected: protectedNow && !!S.key });
        S.data.exampleSeeded = true;
        await S.saveNow();
        U.toast('Datele au fost încărcate.', 'ok');
        if (CZ.app) CZ.app.afterDataReplaced();
      } catch (e) {
        U.toast(e && e.name === 'OperationError' ? 'Parola nu e corectă.' : 'Fișierul nu a putut fi citit: ' + ((e && e.message) || e), 'bad', 6000);
      }
    });

    // șabloane
    const tpls = Object.entries(S.data.templates || {}).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
    const tplList = h('div', { class: 'tpl-list' },
      tpls.length
        ? tpls.map(([fp, t]) => h('div', { class: 'tpl' },
            h('div', { class: 'grow' }, h('b', null, t.name || 'Formular'),
              h('div', { class: 'small muted' }, `${t.fields.length} câmpuri · ${t.pages} ${t.pages === 1 ? 'pagină' : 'pagini'} · ${new Date(t.updatedAt || Date.now()).toLocaleDateString('ro-RO')}`)),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Uită formularul ' + (t.name || ''), onclick: () => { delete S.data.templates[fp]; S.save(); ST.render(); } }, U.icon('trash'))))
        : h('p', { class: 'muted small' }, 'Încă niciunul. După ce descarci un PDF completat, formularul apare aici.'));
    const inTpl = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'inTpl' });
    inTpl.addEventListener('change', async () => {
      const f = inTpl.files[0];
      inTpl.value = '';
      if (!f) return;
      try {
        const obj = JSON.parse(await U.readText(f));
        if (!obj || obj.kind !== 'templates' || typeof obj.templates !== 'object') throw new Error('nu este un fișier cu formulare Completez');
        let n = 0;
        for (const [fp, t] of Object.entries(obj.templates)) {
          if (!t || !Array.isArray(t.fields)) continue;
          S.data.templates[fp] = {
            name: String(t.name || 'Formular').slice(0, 120), pages: +t.pages || 1, updatedAt: Date.now(),
            fields: t.fields.filter((x) => x && [x.x, x.y, x.w, x.h].every(Number.isFinite)).map((x) => ({
              page: +x.page || 0, x: +x.x, y: +x.y, w: +x.w, h: +x.h, type: ['text', 'signature', 'check'].includes(x.type) ? x.type : 'text',
              key: x.key ? String(x.key).slice(0, 40) : null, label: String(x.label || '').slice(0, 60), labelTail: String(x.labelTail || '').slice(0, 60),
              fontScale: +x.fontScale || 1, spread: !!x.spread, acroName: x.acroName ? String(x.acroName) : null, acroCheck: !!x.acroCheck,
            })),
          };
          n++;
        }
        S.save();
        U.toast(`Am adăugat ${n} ${n === 1 ? 'formular' : 'formulare'}.`, 'ok');
        ST.render();
      } catch (e) {
        U.toast('Fișierul nu a putut fi citit: ' + ((e && e.message) || e), 'bad', 6000);
      }
    });

    // aspect
    const colorSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Culoarea textului completat' },
      [['black', 'Negru'], ['blue', 'Albastru']].map(([v, l]) => h('button', {
        type: 'button', class: st.textColor === v ? 'is-on' : '',
        onclick: () => { st.textColor = v; S.save(); ST.render(); if (CZ.editor) CZ.editor.refresh(); },
      }, l)));
    const auditChk = h('input', { type: 'checkbox', checked: !!st.auditPage, onchange: (e) => { st.auditPage = e.target.checked; S.save(); const a = document.getElementById('auditChk'); if (a) a.checked = st.auditPage; } });

    const level = (lv, title, text, here) => h('div', { class: 'level' + (here ? ' here' : '') },
      h('span', { class: 'lv' }, lv), h('b', null, title), h('p', null, text));

    root.replaceChildren(
      h('div', { class: 'view-head' }, h('div', null, h('h1', null, 'Setări'), h('p', null, 'Unde stau datele, cum le muți pe alt dispozitiv și ce valoare are semnătura pusă de aplicație.'))),
      h('div', { class: 'settings' },
        block('Siguranța datelor', ...sec),
        block('Copie de siguranță',
          h('p', { class: 'muted' }, 'Descarcă un fișier cu profilurile, semnăturile și formularele recunoscute, ca să le muți pe telefon sau pe alt calculator.' + (st.protected ? ' Copia rămâne criptată cu parola ta.' : '')),
          h('div', { class: 'row' },
            h('button', { class: 'btn', type: 'button', onclick: async () => {
              const text = await S.exportBackup();
              const r = await U.saveFile(`completez-copie-${stampDate()}.json`, text, 'application/json');
              if (r === 'saved') U.toast('Copia de siguranță a fost salvată.', 'ok');
            } }, U.icon('download'), 'Descarcă o copie'),
            h('label', { class: 'btn', for: 'inBackup' }, U.icon('upload'), 'Încarcă o copie'), inBackup)),
        block('Formulare recunoscute',
          h('p', { class: 'muted' }, 'Când descarci un PDF completat, aplicația ține minte unde sunt câmpurile. Data viitoare, același formular se completează direct. Fișierul cu formulare nu conține date personale, doar așezarea câmpurilor, așa că îl poți da colegilor.'),
          tplList,
          h('div', { class: 'row' },
            tpls.length ? h('button', { class: 'btn sm', type: 'button', onclick: async () => {
              const text = JSON.stringify({ app: 'completez', kind: 'templates', exportedAt: new Date().toISOString(), templates: S.data.templates });
              await U.saveFile(`completez-formulare-${stampDate()}.json`, text, 'application/json');
            } }, U.icon('download'), 'Descarcă formularele') : null,
            h('label', { class: 'btn sm', for: 'inTpl' }, U.icon('upload'), 'Adaugă formulare primite'), inTpl)),
        block('Aspect',
          h('div', { class: 'row' }, h('span', null, 'Culoarea textului completat'), colorSeg),
          h('label', { class: 'check' }, auditChk, 'Adaugă implicit pagina „Jurnal de semnare” la PDF'),
          h('p', { class: 'help' }, 'Jurnalul trece data, ora, amprenta SHA-256 a documentului original și tipul semnăturii. Ajută ca dovadă, dar nu transformă semnătura în una calificată.')),
        block('Ce valoare are semnătura',
          h('div', { class: 'levels' },
            level('1', 'Semnătură simplă, ce face aplicația', 'Imaginea semnăturii tale pusă pe document. Merge pentru cereri, declarații și formulare interne, acolo unde instituția o acceptă. Dacă e contestată, cine o folosește trebuie să dovedească (Legea 214/2024).', true),
            level('2', 'Simplă, cu jurnal de semnare', 'Aceeași semnătură, plus o pagină cu data și amprenta documentului. E o probă în plus, dar rămâne semnătură simplă.', true),
            level('3', 'Semnătură avansată', 'Cu buletinul electronic (CEI) și aplicația ROeID. În România are valoarea unei semnături de mână.'),
            level('4', 'Semnătură calificată', 'De la un furnizor autorizat (de exemplu certSIGN sau Trans Sped) sau, din 2027, din portofelul digital RO Wallet. E cerută pentru contractul de muncă semnat electronic și pentru ANAF.')),
          h('p', { class: 'help' }, 'Nu folosi aplicația pentru acte care cer notar (vânzarea unui imobil, donații, ipoteci, procuri pentru acestea) sau pentru testamente.')),
        block('Despre',
          h('p', { class: 'muted' }, 'Completez 0.1, unealtă personală. Documentele se deschid și se completează în browser; nimic nu pleacă de pe dispozitiv. Ajutorul lui Claude pornește doar când apeși butonul și primește doar formularul gol, fără datele din profil.'),
          h('p', { class: 'help' }, 'Folosește pdf.js (Mozilla), pdf-lib și fontul Arimo (licența Apache 2.0).')),
        block('Șterge datele',
          h('p', { class: 'muted' }, 'Șterge toate profilurile, semnăturile și formularele recunoscute din acest browser.'),
          h('div', null, h('button', { class: 'btn danger', type: 'button', onclick: async () => {
            if (!(await U.confirm('Ștergi tot?', 'Profilurile, semnăturile și formularele recunoscute se șterg definitiv din acest browser.', 'Șterge tot', true))) return;
            S.wipe();
            await S.saveNow();
            U.toast('Datele au fost șterse.', 'ok');
            if (CZ.app) CZ.app.afterDataReplaced();
          } }, U.icon('trash'), 'Șterge toate datele'))))
    );
  };
})();
