/* Completez — validarea CNP-ului (cifra de control cu constanta 279146358279)
   și deducerea sexului și a datei nașterii. */
(function () {
  'use strict';
  const CZ = window.CZ;
  const KEY = '279146358279';

  CZ.cnp = {
    clean: (s) => String(s || '').replace(/\D/g, ''),

    validate(raw) {
      const d = this.clean(raw);
      const res = { ok: false, digits: d, error: '', sex: null, birth: null, birthStr: '' };
      if (!d) {
        res.error = '';
        return res;
      }
      if (d.length !== 13) {
        res.error = d.length < 13 ? `Mai lipsesc ${13 - d.length} cifre.` : 'CNP-ul are exact 13 cifre.';
        return res;
      }
      const s = +d[0];
      if (s === 0) {
        res.error = 'Prima cifră nu poate fi 0.';
        return res;
      }
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += +d[i] * +KEY[i];
      let c = sum % 11;
      if (c === 10) c = 1;
      if (c !== +d[12]) {
        res.error = 'Cifra de control nu se potrivește. Verifică dacă ai tastat corect.';
        return res;
      }
      const yy = +d.slice(1, 3);
      const mm = +d.slice(3, 5);
      const dd = +d.slice(5, 7);
      let year;
      if (s === 1 || s === 2) year = 1900 + yy;
      else if (s === 3 || s === 4) year = 1800 + yy;
      else if (s === 5 || s === 6) year = 2000 + yy;
      else {
        /* 7, 8, 9: rezidenți și cetățeni străini — secolul nu e codificat */
        const cur = new Date().getFullYear() % 100;
        year = yy <= cur ? 2000 + yy : 1900 + yy;
      }
      const date = new Date(year, mm - 1, dd);
      if (mm < 1 || mm > 12 || date.getMonth() !== mm - 1 || date.getDate() !== dd) {
        res.error = 'Data nașterii din CNP nu este o dată validă.';
        return res;
      }
      res.ok = true;
      res.sex = s === 9 ? null : s % 2 === 1 ? 'M' : 'F';
      res.birth = date;
      res.birthStr = CZ.util.fmtDate(date);
      return res;
    },

    /* vârsta în ani împliniți la data de azi */
    age(birth) {
      if (!birth) return '';
      const now = new Date();
      let a = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) a--;
      return a >= 0 ? String(a) : '';
    },
  };
})();
