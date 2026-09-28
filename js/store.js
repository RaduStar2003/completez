/* Completez — datele rămân în browserul acestui dispozitiv (localStorage),
   opțional criptate cu parolă (AES-GCM, cheie derivată cu PBKDF2). */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const KEY = 'completez.v1';
  const ITER = 310000;

  const S = (CZ.store = {
    data: null,
    locked: false,
    persistent: true,
    envelope: null,
    key: null,
    salt: null,
  });

  S.defaults = () => ({
    version: 1,
    profiles: [],
    activeProfileId: null,
    templates: {},
    settings: { textColor: 'black', auditPage: false, protected: false },
    exampleSeeded: false,
  });

  function readRaw() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      S.persistent = false;
      return null;
    }
  }
  function writeRaw(str) {
    try {
      localStorage.setItem(KEY, str);
      S.persistent = true;
      return true;
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        U.toast('Spațiul de stocare al browserului e plin. Șterge semnături sau șabloane vechi.', 'bad', 6000);
      } else {
        S.persistent = false;
      }
      return false;
    }
  }

  S.load = function () {
    const raw = readRaw();
    if (!raw) {
      S.data = S.defaults();
      return 'empty';
    }
    try {
      const obj = JSON.parse(raw);
      if (obj && obj.enc) {
        S.envelope = obj;
        S.locked = true;
        return 'locked';
      }
      S.data = Object.assign(S.defaults(), obj);
      S.data.settings = Object.assign(S.defaults().settings, obj.settings || {});
      return 'ok';
    } catch (e) {
      S.data = S.defaults();
      return 'corrupt';
    }
  };

  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  async function encryptJSON(obj, key, salt) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const pt = new TextEncoder().encode(JSON.stringify(obj));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
    return { enc: 'aes-gcm', v: 1, iter: ITER, salt: U.bytesToB64(salt), iv: U.bytesToB64(iv), ct: U.bytesToB64(ct) };
  }
  async function decryptEnvelope(env, password) {
    const salt = U.b64ToBytes(env.salt);
    const key = await deriveKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: U.b64ToBytes(env.iv) }, key, U.b64ToBytes(env.ct));
    return { obj: JSON.parse(new TextDecoder().decode(pt)), key, salt };
  }

  S.canEncrypt = () => !!(window.crypto && crypto.subtle);

  S.unlock = async function (password) {
    const { obj, key, salt } = await decryptEnvelope(S.envelope, password); // aruncă eroare dacă parola e greșită
    S.data = Object.assign(S.defaults(), obj);
    S.data.settings = Object.assign(S.defaults().settings, obj.settings || {});
    S.key = key;
    S.salt = salt;
    S.locked = false;
  };

  let saving = Promise.resolve();
  S.saveNow = function () {
    if (!S.data || S.locked) return saving;
    saving = saving.then(async () => {
      if (S.data.settings.protected && S.key) {
        const env = await encryptJSON(S.data, S.key, S.salt);
        writeRaw(JSON.stringify(env));
      } else {
        writeRaw(JSON.stringify(S.data));
      }
    }).catch(() => {});
    return saving;
  };
  S.save = U.debounce(() => S.saveNow(), 350);

  S.setPassword = async function (password) {
    S.salt = crypto.getRandomValues(new Uint8Array(16));
    S.key = await deriveKey(password, S.salt);
    S.data.settings.protected = true;
    await S.saveNow();
  };
  S.removePassword = async function () {
    S.data.settings.protected = false;
    S.key = null;
    S.salt = null;
    await S.saveNow();
  };

  S.exportBackup = async function () {
    const payload = { app: 'completez', kind: 'backup', exportedAt: new Date().toISOString(), data: S.data };
    if (S.data.settings.protected && S.key) {
      return JSON.stringify({ app: 'completez', kind: 'backup-enc', env: await encryptJSON(payload, S.key, S.salt) });
    }
    return JSON.stringify(payload);
  };
  /* întoarce obiectul de date citit din copia de siguranță; cere parola dacă e criptată */
  S.parseBackup = async function (text, askPassword) {
    const obj = JSON.parse(text);
    if (obj && obj.kind === 'backup-enc') {
      const pw = await askPassword();
      if (!pw) return null;
      const { obj: inner } = await decryptEnvelope(obj.env, pw);
      return inner.data;
    }
    if (obj && obj.kind === 'backup' && obj.data) return obj.data;
    throw new Error('Fișierul nu este o copie de siguranță Completez.');
  };

  S.wipe = function () {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
    S.data = S.defaults();
    S.data.exampleSeeded = true;
    S.key = null;
    S.salt = null;
    S.locked = false;
  };

  /* Acces comod la profiluri */
  S.profiles = () => (S.data ? S.data.profiles : []);
  S.profile = (id) => S.profiles().find((p) => p.id === id) || null;
  S.activeProfile = function () {
    return S.profile(S.data.activeProfileId) || S.profiles()[0] || null;
  };
})();
