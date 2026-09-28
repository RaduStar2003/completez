/* Completez — structura profilului, valori deduse și lista de chei pentru câmpuri */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;

  const GROUPS = [
    {
      id: 'identitate', title: 'Identitate', open: true,
      fields: [
        { key: 'nume', label: 'Nume de familie', ph: 'Ionescu', auto: 'family-name' },
        { key: 'prenume', label: 'Prenume', ph: 'Maria', auto: 'given-name' },
        { key: 'cnp', label: 'CNP', ph: '13 cifre', mono: true, inputmode: 'numeric' },
        { key: 'dataNasterii', label: 'Data nașterii', ph: 'zz.ll.aaaa', fromCnp: true },
        { key: 'locNastere', label: 'Locul nașterii', ph: 'Cluj-Napoca' },
        { key: 'sex', label: 'Sex', ph: 'M sau F', fromCnp: true },
        { key: 'cetatenie', label: 'Cetățenia', ph: 'română' },
        { key: 'numeTata', label: 'Prenumele tatălui', ph: 'Ion' },
        { key: 'numeMama', label: 'Prenumele mamei', ph: 'Elena' },
      ],
    },
    {
      id: 'act', title: 'Act de identitate', open: true,
      fields: [
        { key: 'tipAct', label: 'Tipul actului', ph: 'CI' },
        { key: 'serieAct', label: 'Seria', ph: 'CJ', upper: true },
        { key: 'nrAct', label: 'Numărul', ph: '123456', mono: true, inputmode: 'numeric' },
        { key: 'emitentAct', label: 'Eliberat de', ph: 'SPCLEP Cluj-Napoca' },
        { key: 'dataEliberarii', label: 'Data eliberării', ph: 'zz.ll.aaaa' },
        { key: 'dataExpirarii', label: 'Valabil până la', ph: 'zz.ll.aaaa' },
      ],
    },
    {
      id: 'domiciliu', title: 'Domiciliu', open: true,
      fields: [
        { key: 'localitate', label: 'Localitatea', ph: 'Cluj-Napoca' },
        { key: 'judet', label: 'Județul', ph: 'Cluj' },
        { key: 'sector', label: 'Sectorul (doar București)', ph: '3' },
        { key: 'strada', label: 'Strada', ph: 'Observatorului' },
        { key: 'numar', label: 'Număr', ph: '34', short: true },
        { key: 'bloc', label: 'Bloc', ph: 'A4', short: true },
        { key: 'scara', label: 'Scara', ph: '2', short: true },
        { key: 'etaj', label: 'Etaj', ph: '3', short: true },
        { key: 'apartament', label: 'Apartament', ph: '14', short: true },
        { key: 'codPostal', label: 'Cod poștal', ph: '400347', short: true, inputmode: 'numeric' },
        { key: 'tara', label: 'Țara', ph: 'România' },
      ],
    },
    {
      id: 'contact', title: 'Contact', open: false,
      fields: [
        { key: 'telefon', label: 'Telefon', ph: '07xx xxx xxx', inputmode: 'tel', auto: 'tel' },
        { key: 'email', label: 'E-mail', ph: 'nume@exemplu.ro', inputmode: 'email', auto: 'email' },
      ],
    },
    {
      id: 'studii', title: 'Studii', open: false,
      fields: [
        { key: 'universitate', label: 'Universitatea', ph: 'Universitatea din București' },
        { key: 'facultate', label: 'Facultatea', ph: 'Facultatea de Drept' },
        { key: 'specializare', label: 'Specializarea', ph: 'Drept' },
        { key: 'anStudiu', label: 'Anul de studiu', ph: 'II', short: true },
        { key: 'grupa', label: 'Grupa', ph: '221', short: true },
        { key: 'nrMatricol', label: 'Număr matricol', ph: '1234', mono: true },
        { key: 'formaInvatamant', label: 'Forma de învățământ', ph: 'IF' },
      ],
    },
    {
      id: 'munca', title: 'Loc de muncă și bancă', open: false,
      fields: [
        { key: 'angajator', label: 'Angajator', ph: 'SC Exemplu SRL' },
        { key: 'functie', label: 'Funcția', ph: 'Asistent' },
        { key: 'iban', label: 'IBAN', ph: 'RO49 AAAA 1B31 0075 9384 0000', mono: true, upper: true },
        { key: 'banca', label: 'Banca', ph: 'Banca Transilvania' },
      ],
    },
  ];

  const DEFS = {};
  GROUPS.forEach((g) => g.fields.forEach((f) => (DEFS[f.key] = Object.assign({ group: g.id }, f))));

  const DERIVED = [
    { key: 'numeComplet', label: 'Nume și prenume', group: 'identitate' },
    { key: 'varsta', label: 'Vârsta', group: 'identitate' },
    { key: 'actComplet', label: 'Act de identitate (tip, serie, număr)', group: 'act' },
    { key: 'adresaCompleta', label: 'Adresa completă', group: 'domiciliu' },
    { key: 'anUniversitar', label: 'Anul universitar curent', group: 'studii' },
  ];
  DERIVED.forEach((d) => (DEFS[d.key] = Object.assign({ derived: true }, d)));

  const SPECIAL = [
    { key: 'azi', label: 'Data de azi' },
    { key: 'semnatura', label: 'Semnătura' },
    { key: 'check', label: 'Bifă (X)' },
    { key: 'text', label: 'Text scris de mine' },
    { key: 'ignore', label: 'Nu completez' },
  ];
  SPECIAL.forEach((d) => (DEFS[d.key] = Object.assign({ special: true }, d)));

  const Schema = (CZ.schema = { groups: GROUPS, defs: DEFS });

  Schema.newProfile = function (label) {
    return {
      id: U.uid('p'),
      label: label || 'Profil nou',
      nameOrder: 'np',
      fields: {},
      custom: [],
      signatures: [],
      defaultSigId: null,
      createdAt: Date.now(),
    };
  };

  Schema.displayName = function (p) {
    if (!p) return '';
    const n = [p.fields.nume, p.fields.prenume].filter(Boolean);
    const full = (p.nameOrder === 'pn' ? n.reverse() : n).join(' ').trim();
    return full || p.label || 'Profil fără nume';
  };

  Schema.keyLabel = function (key, profile) {
    if (!key) return 'Necunoscut';
    if (key.startsWith('custom:')) {
      const c = profile && profile.custom.find((x) => 'custom:' + x.id === key);
      return c ? c.label || 'Câmp propriu' : 'Câmp propriu';
    }
    return (DEFS[key] && DEFS[key].label) || key;
  };

  Schema.typeForKey = (key) => (key === 'semnatura' ? 'signature' : key === 'check' ? 'check' : 'text');

  /* opțiunile pentru lista „Ce se completează aici” */
  Schema.keyOptions = function (profile) {
    const out = [];
    for (const g of GROUPS) {
      const opts = g.fields.map((f) => ({ key: f.key, label: f.label }));
      DERIVED.filter((d) => d.group === g.id).forEach((d) => opts.unshift({ key: d.key, label: d.label }));
      out.push({ group: g.title, options: opts });
    }
    if (profile && profile.custom.length) {
      out.push({ group: 'Câmpurile mele', options: profile.custom.map((c) => ({ key: 'custom:' + c.id, label: c.label || 'Câmp propriu' })) });
    }
    out.push({ group: 'Altele', options: SPECIAL.map((s) => ({ key: s.key, label: s.label })) });
    return out;
  };

  const STREET_TYPES = /^(str|strada|bd|b dul|bulevardul|calea|sos|soseaua|aleea|piata|splaiul|intrarea|drumul|fundatura|pasajul)\b/;

  function cnpInfo(p) {
    const v = CZ.cnp.validate(p.fields.cnp);
    return v.ok ? v : null;
  }

  Schema.value = function (p, key) {
    if (!p) return '';
    const f = p.fields;
    const t = (k) => String(f[k] || '').trim();
    switch (key) {
      case 'numeComplet': {
        const n = [t('nume'), t('prenume')].filter(Boolean);
        return (p.nameOrder === 'pn' ? n.reverse() : n).join(' ');
      }
      case 'cnp':
        return CZ.cnp.clean(f.cnp);
      case 'dataNasterii': {
        if (t('dataNasterii')) return t('dataNasterii');
        const c = cnpInfo(p);
        return c ? c.birthStr : '';
      }
      case 'sex': {
        if (t('sex')) return t('sex');
        const c = cnpInfo(p);
        return c && c.sex ? c.sex : '';
      }
      case 'varsta': {
        const c = cnpInfo(p);
        const b = c ? c.birth : U.parseDate(t('dataNasterii'));
        return CZ.cnp.age(b);
      }
      case 'cetatenie':
        return t('cetatenie') || 'română';
      case 'tipAct':
        return t('tipAct') || 'CI';
      case 'tara':
        return t('tara') || 'România';
      case 'actComplet': {
        const parts = [t('tipAct') || 'CI'];
        if (t('serieAct')) parts.push('seria ' + t('serieAct'));
        if (t('nrAct')) parts.push('nr. ' + t('nrAct'));
        return t('serieAct') || t('nrAct') ? parts.join(' ') : '';
      }
      case 'adresaCompleta': {
        const parts = [];
        const str = t('strada');
        const streetBits = [];
        if (str) streetBits.push(STREET_TYPES.test(U.nrm(str)) ? str : 'str. ' + str);
        if (t('numar')) streetBits.push('nr. ' + t('numar'));
        if (streetBits.length) parts.push(streetBits.join(' '));
        if (t('bloc')) parts.push('bl. ' + t('bloc'));
        if (t('scara')) parts.push('sc. ' + t('scara'));
        if (t('etaj')) parts.push('et. ' + t('etaj'));
        if (t('apartament')) parts.push('ap. ' + t('apartament'));
        const loc = t('localitate');
        const jud = t('judet');
        const isBuc = U.nrm(jud || loc).startsWith('bucuresti');
        if (loc) parts.push(loc);
        if (isBuc) {
          if (t('sector')) parts.push('sector ' + t('sector'));
        } else if (jud) {
          parts.push('jud. ' + jud);
        }
        return parts.join(', ');
      }
      case 'azi':
        return U.today();
      case 'anUniversitar': {
        const d = new Date();
        const y = d.getFullYear();
        return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
      }
      case 'check':
        return 'X';
      case 'semnatura':
      case 'text':
      case 'ignore':
        return '';
      default:
        if (key && key.startsWith('custom:')) {
          const c = p.custom.find((x) => 'custom:' + x.id === key);
          return c ? String(c.value || '').trim() : '';
        }
        return t(key);
    }
  };

  /* Dacă formularul are deja „Facultatea de …” și valoarea începe cu „Facultatea de”,
     scoatem cuvintele repetate. */
  Schema.stripOverlap = function (labelTail, value) {
    if (!labelTail || !value) return value;
    const lw = U.nrm(labelTail).split(' ').filter(Boolean);
    const vwOrig = String(value).trim().split(/\s+/);
    const vw = vwOrig.map((w) => U.nrm(w));
    for (let k = Math.min(3, lw.length, vw.length - 1); k >= 1; k--) {
      const tail = lw.slice(lw.length - k).join(' ');
      const head = vw.slice(0, k).join(' ');
      if (tail && tail === head) return vwOrig.slice(k).join(' ');
    }
    return value;
  };

  Schema.exampleProfile = function () {
    const p = Schema.newProfile('Maria Ionescu (exemplu)');
    p.isExample = true;
    Object.assign(p.fields, {
      nume: 'Ionescu',
      prenume: 'Maria',
      cnp: '2990315123456',
      locNastere: 'Cluj-Napoca',
      numeTata: 'Mihai',
      numeMama: 'Elena',
      tipAct: 'CI',
      serieAct: 'CJ',
      nrAct: '482913',
      emitentAct: 'SPCLEP Cluj-Napoca',
      dataEliberarii: '12.04.2021',
      dataExpirarii: '15.03.2031',
      localitate: 'Cluj-Napoca',
      judet: 'Cluj',
      strada: 'Observatorului',
      numar: '34',
      bloc: 'A4',
      scara: '2',
      etaj: '3',
      apartament: '14',
      codPostal: '400347',
      telefon: '0740 123 456',
      email: 'maria.ionescu@exemplu.ro',
      universitate: 'Universitatea Babeș-Bolyai',
      facultate: 'Facultatea de Litere',
      specializare: 'Limba și literatura română – Limba engleză',
      anStudiu: 'II',
      grupa: '221',
      nrMatricol: 'LT2154',
      formaInvatamant: 'IF',
    });
    return p;
  };
})();
