# Completez

Unealtă personală pentru completarea și semnarea formularelor românești, din PDF sau din poză.
Rulează integral în browser. Profilurile, CNP-ul și semnăturile rămân în browserul dispozitivului.

- Pe web (merge și pe telefon, fără cont): https://radustar2003.github.io/completez/
- În Claude (cu butonul „Recunoaște cu Claude”): https://claude.ai/artifact/YU97KA8GWQ8gVD6SHBDXPW
- Local: `python -m http.server 8765 --directory completez`, apoi http://localhost:8765

## Publicare

- **Web:** GitHub Pages servește ramura `main` din repository-ul `RaduStar2003/completez`. Orice `git push` publică noua versiune în 1–2 minute.
- **Claude:** artifactul primește doar conținutul paginii. Generează-l cu `python tools/artifact_fragment.py <fișier>` și publică fișierul rezultat, împreună cu `app.css` și `js/`.

## Ce face

1. **Profiluri**: nume, CNP (cu verificarea cifrei de control, data nașterii și sexul deduse), buletin, adresă, studii, loc de muncă, câmpuri proprii.
2. **Semnătura din poză**: curăță fundalul și liniile caietului, decupează și salvează semnătura ca PNG transparent. Se poate și desena.
3. **Documente**:
   - PDF cu text: găsește liniile punctate sau subliniate și etichetele de lângă ele („Subsemnatul(a)”, „CNP”, „str.”, „nr.”, „C.I. seria”, „Semnătura”) și le completează din profil. Completează direct și câmpurile unui formular PDF (AcroForm).
   - Poză sau scanare: îndreaptă foaia (colțuri + perspectivă), face efectul de scanare și găsește liniile de completat. Ce se scrie pe fiecare linie alegi tu sau îl află Claude (butonul „Recunoaște cu Claude”, doar în Claude).
4. **Export PDF**: text cu diacritice corecte (font Arimo încorporat), semnătura, opțional o pagină „Jurnal de semnare” cu amprenta SHA-256 a documentului.
5. **Formulare recunoscute**: după export, așezarea câmpurilor se ține minte. Același PDF se completează direct data viitoare, iar fișierul de formulare se poate da colegilor.

## Structura

| Fișier | Rol |
|---|---|
| `index.html`, `app.css` | interfața |
| `js/util.js` | utilitare, dialoguri, salvarea fișierelor |
| `js/store.js` | datele locale, criptare opțională AES-GCM cu parolă |
| `js/cnp.js` | validarea CNP-ului |
| `js/schema.js` | câmpurile profilului și valorile deduse |
| `js/labeler.js` | dicționarul de etichete românești → câmpuri |
| `js/imaging.js` | semnătura din poză, îndreptarea pozei, găsirea liniilor |
| `js/docs.js` | deschiderea PDF-urilor și a pozelor, găsirea câmpurilor, șabloane |
| `js/exporter.js` | așezarea textului și PDF-ul final |
| `js/ai.js` | ajutorul opțional de la Claude (primește doar formularul gol) |
| `js/ui-*.js`, `js/app.js` | ecranele și pornirea |

Biblioteci: pdf.js 3.11 (Apache 2.0) și pdf-lib 1.17 (MIT) de pe cdnjs, fontkit (MIT) de pe jsDelivr. Fontul Arimo, inclus în `js/font-arimo.js`, este © The Arimo Project Authors, sub [licența Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).

## Limite cunoscute

- Semnătura pusă astfel este o semnătură electronică simplă (Legea 214/2024). Nu ajunge pentru contractul de muncă semnat electronic, pentru ANAF sau pentru acte notariale.
- Pe poze aplicația nu citește textul fără Claude, deci etichetele se aleg manual.
- Documentele Word trebuie salvate întâi ca PDF. Pozele HEIC nu se deschid.
