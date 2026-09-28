/* Completez — dicționarul de etichete românești: textul dinaintea unui spațiu liber
   („Subsemnatul(a)”, „domiciliat(ă) în”, „C.I. seria … nr.”) → cheia din profil. */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;

  // [cheie, regex pe text normalizat (fără diacritice, litere mici), prioritate, ancorat la final]
  const E = '(?![a-z])'; // sfârșit de cuvânt (textul normalizat are doar a-z, 0-9, punct, @, spațiu)
  const RAW = [
    ['numeComplet', '\\b(subsemnat(ul|a)?|subscris(ul|a)?)( a)?' + E, 6],
    ['numeComplet', '\\bnume(le)? (si )?prenume(le)?' + E, 7],
    ['numeComplet', '\\b(nume(le)? complet|nume prenume)' + E, 7],
    ['numeComplet', '(^| )(studentul|studenta|student|pacientul|pacienta|pacient|candidatul|candidata|candidat|titularul|titulara|beneficiarul|beneficiara|angajatul|angajata|salariatul|salariata|elevul|eleva|declarantul|declaranta|domnul|doamna|dl\\.?|dna\\.?|d na|d l)( a)?$', 2, true],
    ['nume', '(^| )nume(le)?( de familie)?$', 3, true],
    ['prenume', '(^| )prenume(le)?$', 4, true],
    ['cnp', '\\b(c\\.? ?n\\.? ?p\\.?|cod(ul)? numeric personal)' + E, 8],
    ['dataNasterii', '\\b(data nasterii|data de nastere|nascut(a)?( a)? (la|pe)( data( de)?)?)' + E, 7],
    ['locNastere', '\\b(locul nasterii|loc(alitatea)? de nastere|nascut(a)?( a)? in( localitatea| orasul| municipiul| comuna| judetul)?)' + E, 7],
    ['sex', '(^| )sex(ul)?$', 6, true],
    ['cetatenie', '\\b(cetatenia|cetatenie|cetatean(a)?)' + E, 5],
    ['numeTata', '\\b((fiul|fiica)( a)?( lui)?|(prenumele|numele) tatalui|tatal)' + E, 6],
    ['numeMama', '((^| )si (al|a)( lui)?$|\\b(prenumele|numele) mamei|(^| )mama$)', 6],
    ['tipAct', '\\bposesor( a)?( posesoare)?( al)?( a)?( actului)?( de identitate)?$', 2, true],
    ['serieAct', '(^| )seri(a|e)$', 7, true],
    ['emitentAct', '\\b((eliberat|emis)(a)?( a)? de( catre)?)' + E, 7],
    ['dataEliberarii', '\\b(data eliberarii|(eliberat|emis)(a)?( a)? (la|in) data( de)?)' + E, 8],
    ['dataExpirarii', '\\b(valabil(a)?( a)? pana la|data expirarii|valabilitate)' + E, 8],
    ['adresaCompleta', '\\b(domiciliat(a)?( a)?( in)?|cu domiciliul( stabil)?( in)?|domiciliul|adresa( de domiciliu| de corespondenta| completa)?|resedinta( in)?|locuiesc in|avand domiciliul( in)?)' + E, 4],
    ['localitate', '\\b(localitatea|localitate|loc\\.|municipiul|mun\\.|orasul|oras|comuna|com\\.|satul|sat)' + E, 7],
    ['judet', '\\b(judetul|judet|jud\\.)' + E, 8],
    ['sector', '\\b(sectorul|sector|sect\\.)' + E, 8],
    ['strada', '\\b(strada|str\\.|bulevardul|bd\\.|b dul|calea|soseaua|sos\\.|aleea|piata|splaiul)' + E, 8],
    ['bloc', '(^| )(blocul|bloc|bl\\.)' + E, 9],
    ['scara', '(^| )(scara|sc\\.)' + E, 9],
    ['etaj', '(^| )(etajul|etaj|et\\.)' + E, 9],
    ['apartament', '(^| )(apartamentul|apartament|ap\\.|apt\\.)' + E, 9],
    ['codPostal', '\\bcod(ul)? postal' + E, 9],
    ['tara', '(^| )(tara|statul)$', 3, true],
    ['telefon', '\\b(telefon(ul)?|tel\\.?|mobil)' + E, 8],
    ['email', '\\b(e ?mail(ul)?|posta electronica)' + E, 9],
    ['universitate', '\\b(universitatea|universitatii|universitate)' + E, 5],
    ['facultate', '\\b(facultatea|facultatii|facultate)( de)?' + E, 6],
    ['specializare', '\\b(specializarea|specializare|program(ul)? de studii|program(ul)? de studiu|domeniul( de studii)?)' + E, 6],
    ['anStudiu', '(^| )(anul( de studiu| de studii)?|in anul|an(ul)? de studiu)$', 5, true],
    ['anUniversitar', '\\ban(ul)? universitar' + E, 9],
    ['grupa', '\\b(grupa|grupei)' + E, 8],
    ['nrMatricol', '\\b((nr\\.?|numar(ul)?) matricol|matricol)' + E, 10],
    ['formaInvatamant', '\\bforma de (invatamant|studii|studiu)' + E, 9],
    ['angajator', '\\b(angajat(a)?( a)? (la|al|in cadrul)|angajatorul|angajator|locul de munca|unitatea|societatea|institutia)' + E, 4],
    ['functie', '\\b(functia|functie|in functia de|ocupatia|profesia|postul( de)?|meseria)' + E, 6],
    ['iban', '\\b(iban|cont(ul)?( bancar)?( nr\\.?)?)' + E, 6],
    ['banca', '\\b(banca|deschis(a)?( a)? la)' + E, 7],
    ['varsta', '\\b(varsta|in varsta de)' + E, 7],
    ['semnatura', '\\bsemnatur', 10],
    ['azi', '(^| )(data|data completarii|data depunerii|astazi|azi)$', 3, true],
    ['ignore', '(^| )(administrator(ul)?|decan(ul)?|prodecan(ul)?|rector(ul)?|secretar(a|ul)?( sef)?|director(ul)?|sef(ul)?|presedinte(le)?|comisia|avizat|aprobat)( a)?$', 4, true],
    ['_nr', '(^| )(nr\\.?|numar(ul)?)$', 5, true],
    ['_data', '((^| )la data( de)?|(^| )data de|(^| )in data de)$', 5, true],
  ];
  const BASE = RAW.map(([key, src, w, anchored]) => ({ key, re: new RegExp(src, 'g'), w, anchored: !!anchored }));

  const OTHERS_SIGN = /(decan|rector|prorector|director|secretar|administrator|sef |medic|comisi|presedinte|angajator|reprezentant|primar|notar|avocat|profesor|coordonator|indrumator|responsabil|comandant|contabil)/;
  const INSTITUTION = /(nr\.? (de )?inregistrare|inregistrat(a)? (sub|cu) nr|\brezervat\b|\baprobat(a)?\b|\bavizat(a)?\b|(^| )viza\b|\bse aproba\b|nr\.? dosar|nr\.? intrare|\bregistratura\b)/;
  const ADDRESS_KEYS = new Set(['strada', 'localitate', 'judet', 'adresaCompleta', 'bloc', 'scara', 'etaj', 'apartament', 'sector', 'numar']);

  function customRules(profile) {
    if (!profile || !profile.custom) return [];
    return profile.custom
      .filter((c) => c.label && U.nrm(c.label).length >= 3)
      .map((c) => ({
        key: 'custom:' + c.id,
        re: new RegExp(U.nrm(c.label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        w: 12,
        anchored: false,
      }));
  }

  function bestMatch(ctx, rules, anyPosition) {
    let best = null;
    for (const r of rules) {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(ctx))) {
        if (!m[0].length) {
          r.re.lastIndex++;
          continue;
        }
        const end = m.index + m[0].length;
        if (r.anchored && !anyPosition && end < ctx.length) continue;
        if (!best || end > best.end || (end === best.end && (r.w > best.w || (r.w === best.w && m[0].length > best.len)))) {
          best = { key: r.key, end, w: r.w, len: m[0].length };
        }
      }
    }
    return best;
  }

  /* Eticheta scurtă, lizibilă, pentru interfață */
  function tailLabel(original) {
    let s = String(original || '').replace(/\s+/g, ' ').trim().replace(/^[,;.:\s]+/, '').replace(/[,;:\s]+$/, '');
    if (s.length > 34) {
      s = s.slice(s.length - 34);
      const i = s.indexOf(' ');
      if (i > 0 && i < 12) s = s.slice(i + 1);
      s = '…' + s;
    }
    return s;
  }

  /**
   * context: textul dinaintea spațiului liber (pe același rând, după spațiul liber anterior)
   * hint: textul explicativ de sub linie, ex. „(numele și prenumele)”
   * prevKey: cheia spațiului liber anterior, în ordinea citirii
   */
  function label(context, hint, prevKey, profile) {
    const ctx = U.nrm(context);
    const rules = BASE.concat(customRules(profile));
    let key = null;
    let confidence = 'none';

    if (hint) {
      const hm = bestMatch(U.nrm(hint), rules, true);
      if (hm && !hm.key.startsWith('_')) {
        key = hm.key;
        confidence = 'high';
      }
    }
    if (!key && ctx) {
      const m = bestMatch(ctx, rules, false);
      if (m && ctx.length - m.end <= 30) {
        key = m.key;
        confidence = ctx.length - m.end <= 4 ? 'high' : 'low';
      }
    }

    // rezolvări care depind de context
    if (key === '_nr') {
      if (/matricol/.test(ctx)) key = 'nrMatricol';
      else if (/telefon|(^| )tel/.test(ctx)) key = 'telefon';
      else if (prevKey === 'serieAct' || prevKey === 'tipAct' || /(c\.? ?i\.?|b\.? ?i\.?|carte|buletin|act|pasaport|seria)( |$)/.test(ctx)) key = 'nrAct';
      else if (prevKey === 'strada' || /(str\.|strada|bd\.|calea|sos\.|aleea)/.test(ctx)) key = 'numar';
      else if (ADDRESS_KEYS.has(prevKey)) key = 'numar';
      else {
        key = null;
        confidence = 'none';
      }
    }
    if (key === '_data') {
      if (prevKey === 'emitentAct' || /eliberat|emis/.test(ctx)) key = 'dataEliberarii';
      else if (/nascut/.test(ctx) || prevKey === 'numeComplet') key = /nascut/.test(ctx) ? 'dataNasterii' : null;
      else key = null;
      if (!key) confidence = 'none';
    }
    if (key === 'localitate' && (/nascut/.test(ctx) || (prevKey === 'dataNasterii' && !/domicil|adresa|resedint|locuiesc/.test(ctx)))) key = 'locNastere';
    if (key === 'semnatura' && OTHERS_SIGN.test(ctx + ' ' + U.nrm(hint))) key = 'ignore';
    if (INSTITUTION.test(ctx) && key !== 'semnatura') {
      key = 'ignore';
      confidence = 'high';
    }
    return { key, confidence, label: tailLabel(context) || tailLabel(hint) };
  }

  /* Corecții pe secvența de câmpuri (ordinea citirii) */
  function postProcess(fields) {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.key === 'adresaCompleta') {
        const next = fields.slice(i + 1, i + 5).map((x) => x.key);
        if (next.some((k) => ['strada', 'numar', 'bloc', 'scara', 'etaj', 'apartament'].includes(k)) && !next.includes('localitate')) {
          f.key = 'localitate';
        }
      }
    }
    return fields;
  }

  CZ.labeler = { label, postProcess, tailLabel };
})();
