/* ════════════════════════════════════════════════════════════════════
   spremni-pdf.js — izris dokumentov SmartClean v PDF (nad pdfgen.js).
   ENA koda za portal (fakture, listi za ure, evidenca kg, spremni listi) in
   aplikacijo za spremne liste (mobile/) — PDF je povsod enak, tudi logotip.
   Mere iz CSS dokumenta (1 px = 0,75 pt). Naloži se šele ob prvi uporabi.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  var SP = { BIZ: ['BSMART d.o.o.', 'Škalska cesta 6, 3210 Slovenske Konjice', '+386 41 209 676', '+386 68 693 988', 'blanka.kovacic1@gmail.com'] };
  // ── PDF v istem slogu: mere iz CSS zgoraj (1 px = 0,75 pt) ──
  var PT = 0.75;
  var DPDF = { M: 34.02, SP: 39.69, INK: [10 / 255, 10 / 255, 10 / 255], SIVA: [102 / 255, 102 / 255, 102 / 255], SIVA2: [107 / 255, 114 / 255, 128 / 255],
    CRTA: [236 / 255, 236 / 255, 236 / 255], OKVIR: [220 / 255, 220 / 255, 220 / 255], OKVIR2: [221 / 255, 221 / 255, 221 / 255],
    POZOR: [138 / 255, 90 / 255, 0] };
  // Osnovna črta prve vrstice v okvirju: vrh + (višina vrstice − višina pisave)/2 + vzpon (Archivo ≈ 0,878 em, vsa ≈ 1,088 em).
  function dpdfOsnova(vrh, pisavaPt, vrsticaPt) { return vrh + (vrsticaPt - 1.088 * pisavaPt) / 2 + 0.878 * pisavaPt; }
  function dpdfGlava(doc) {
    var M = DPDF.M, R = doc.W - M, lh = 9 * 1.6 * PT, h = SP.BIZ.length * lh;
    SP.BIZ.forEach(function (t, i) { doc.text(R, dpdfOsnova(M + i * lh, 9 * PT, lh), t, { size: 9 * PT, align: 'right', color: DPDF.SIVA }); });
    var dno = M + h;
    // .sc-wm: 32 px, line-height .9, poravnan na dno glave (align-items:flex-end)
    doc.logo(M, dno - 1.3, 32 * PT);
    var yl = dno + 14 * PT;
    doc.line(M, yl + 0.56, R, yl + 0.56, { width: 1.5 * PT, color: DPDF.INK });
    return yl + 1.5 * PT + 18 * PT;
  }
  function dpdfOkvir(doc, y, h) { doc.rrect(DPDF.M, y, doc.W - 2 * DPDF.M, h, 9 * PT, { stroke: DPDF.OKVIR, width: 1 * PT }); }
  // Prelom besedila na širino (po besedah; predolge besede ostanejo cele).
  function dpdfVrstice(doc, str, size, maxW, o) {
    var out = [];
    String(str == null ? '' : str).split(/\n/).forEach(function (odst) {
      var vr = '';
      odst.split(/\s+/).forEach(function (b) {
        if (!b) return;
        var t = vr ? vr + ' ' + b : b;
        if (vr && doc.width(t, size, o) > maxW) { out.push(vr); vr = b; } else vr = t;
      });
      out.push(vr);
    });
    return out;
  }
  // Glava tabele (.sc-table th): stolpci [{t, x, align}] ; vrne y pod črto.
  function dpdfTabGlava(doc, y, stolpci) {
    var fs = 9 * PT, osn = y + 0.878 * fs + 0.5;
    stolpci.forEach(function (c) { doc.text(c.x, osn, String(c.t).toUpperCase(), { size: fs, bold: true, spacing: 0.09, align: c.align || 'left', color: DPDF.INK }); });
    var yl = y + 9 * 1.2 * PT + 8 * PT;
    doc.line(DPDF.M, yl + 0.56, doc.W - DPDF.M, yl + 0.56, { width: 1.5 * PT, color: DPDF.INK });
    return yl + 1.5 * PT;
  }
  var DPDF_VRSTA = 26 * PT;   // td: 15 px + 2 × 5 px + 1 px črta
  function dpdfTabVrsta(doc, y, celice) {
    var fs = 10 * PT, osn = dpdfOsnova(y + 5 * PT, fs, 15 * PT);
    celice.forEach(function (c) { doc.text(c.x, osn, c.t, { size: fs, weight: c.w || 400, bold: c.w === 700, align: c.align || 'left', color: DPDF.INK }); });
    var yl = y + 25 * PT;
    doc.line(DPDF.M, yl + 0.37, doc.W - DPDF.M, yl + 0.37, { width: 1 * PT, color: DPDF.CRTA });
    return yl + 1 * PT;
  }
  // Vrstice tabele s preloma strani: zadnji dve vrstici gresta vedno skupaj z blokom pod
  // tabelo (seštevki), da ta nikoli ne ostane sam na novi strani. Na nadaljevanju se
  // ponovi glava tabele, pred njo pa (neobvezno) oznaka »… — nadaljevanje«.
  function dpdfTabela(doc, y, st, vrstice, blokPod, nadaljevanje) {
    var n = vrstice.length;
    for (var i = 0; i < n; i++) {
      var ostane = n - i, rezerva = ostane <= 2 ? ostane * DPDF_VRSTA + (blokPod || 0) : DPDF_VRSTA;
      if (i > 0 && !dpdfProstor(doc, y, rezerva)) {
        y = dpdfNovaStran(doc);
        if (nadaljevanje) y = dpdfNadaljevanje(doc, y, nadaljevanje);
        y = dpdfTabGlava(doc, y, st);
      }
      y = dpdfTabVrsta(doc, y, vrstice[i]);
    }
    return y;
  }
  function dpdfNadaljevanje(doc, y, besedilo) {
    doc.text(DPDF.M, dpdfOsnova(y, 11 * PT, 11 * 1.2 * PT), besedilo + ' — nadaljevanje', { size: 11 * PT, weight: 600, color: DPDF.SIVA });
    return y + 11 * 1.2 * PT + 10 * PT;
  }
  // Nova stran brez glave (logotip je le na prvi strani); vrne začetni y.
  function dpdfNovaStran(doc) { doc.addPage(); return DPDF.M; }
  function dpdfProstor(doc, y, potrebno) { return y + potrebno <= doc.H - DPDF.SP; }

  // Okvir naročnika (.sc-box.sc-client): ime podčrtano; pod njim naslov in podatki; desno (neobvezno) »Podpis:«.
  function dpdfNarocnik(doc, y, naziv, nazivSek, vrstice, podpis) {
    var M = DPDF.M, R = doc.W - M, x = M + 14 * PT, fs = 12 * PT, lh = 12 * 1.2 * PT;
    var h = 10 * PT + lh;
    vrstice.forEach(function (v) { h += v.razmik + 11 * 1.2 * PT; });
    h += 10 * PT;
    dpdfOkvir(doc, y, h);
    var osn = dpdfOsnova(y + 10 * PT, fs, lh);
    var w1 = doc.text(x, osn, 'Naročnik storitve: ', { size: fs, bold: true, color: DPDF.INK });
    var xi = x + w1 + 2 * PT, wi = doc.text(xi, osn, naziv, { size: fs, bold: true, color: DPDF.INK });
    doc.line(xi - 2 * PT, osn + 3.3, xi + wi + 2 * PT, osn + 3.3, { width: 2 * PT, color: DPDF.INK });
    if (nazivSek) doc.text(xi + wi + 6 * PT, osn, '(' + nazivSek + ')', { size: fs * 0.85, color: DPDF.SIVA2 });
    var yy = y + 10 * PT + lh;
    vrstice.forEach(function (v) {
      yy += v.razmik;
      doc.text(x, dpdfOsnova(yy, 11 * PT, 11 * 1.2 * PT), v.t, { size: 11 * PT, color: DPDF.SIVA });
      yy += 11 * 1.2 * PT;
    });
    if (podpis) {
      var xs = R - 14 * PT - 110 * PT;
      doc.line(xs, y + 10 * PT, xs, y + h - 10 * PT, { width: 1 * PT, color: DPDF.OKVIR });
      doc.text(xs + 16 * PT, osn, 'Podpis:', { size: fs, weight: 600, color: DPDF.SIVA });
    }
    return y + h + 10 * PT;
  }

  // En spremni list na trenutni strani. p (že oblikovano besedilo — portal in aplikacija imata
  // vsak svoja polja): { stevilka, naziv, nazivSek, oddaja, postavke: [{ naziv, kosov }],
  // kg (besedilo ali ''), opomba ('' = brez) }
  function stran(doc, p) {
    var items = p.postavke || [];
    var M = DPDF.M, R = doc.W - M;
    var y = dpdfGlava(doc);
    // Št. spremnega lista (vse krepko, kot .sc-num)
    var h = 10 * PT * 2 + 13 * 1.2 * PT; dpdfOkvir(doc, y, h);
    var osn = dpdfOsnova(y + 10 * PT, 13 * PT, 13 * 1.2 * PT);
    var w0 = doc.text(M + 14 * PT, osn, 'Št. spremnega lista: ', { size: 13 * PT, bold: true, color: DPDF.INK });
    doc.text(M + 14 * PT + w0, osn, p.stevilka || '—', { size: 13 * PT, bold: true, spacing: 0.01, color: DPDF.INK });
    y += h + 10 * PT;
    y = dpdfNarocnik(doc, y, p.naziv || '—', p.nazivSek || '', [{ t: p.oddaja, razmik: 10 * PT }], true);
    var cQ = M + (R - M) * 0.83;   // sredina stolpca »Oddaja« (34 % širine)
    var st = [{ t: 'Naziv Artikla', x: M + 8 * PT }, { t: 'Oddaja (št. kosov)', x: cQ, align: 'center' }];
    y += 4 * PT; y = dpdfTabGlava(doc, y, st);
    y = dpdfTabela(doc, y, st, items.length ? items.map(function (x) {
      return [{ t: x.naziv, x: M + 8 * PT, w: 600 }, { t: x.kosov, x: cQ, align: 'center', w: 700 }];
    }) : [[{ t: 'Ni postavk', x: M + 8 * PT }]], p.kg ? 26 : 0, 'Spremni list ' + (p.stevilka || ''));
    if (p.kg) {
      y += 12 * PT; if (!dpdfProstor(doc, y, 20)) y = dpdfNovaStran(doc);
      var o2 = dpdfOsnova(y, 12 * PT, 12 * 1.2 * PT), vv = p.kg;
      var wv = doc.text(R, o2, vv, { size: 12 * PT, bold: true, align: 'right', color: DPDF.INK });
      doc.text(R - wv, o2, 'Skupaj teža perila: ', { size: 12 * PT, weight: 600, align: 'right', color: DPDF.INK });
      y += 12 * 1.2 * PT;
    }
    // Tiska se SAMO opomba za stranko (interna ostane v portalu).
    if (p.opomba) {
      y += 10 * PT;
      var fs = 12 * PT, sirina = R - M - 2 * 12 * PT;
      var vrs = dpdfVrstice(doc, 'Opomba: ' + p.opomba, fs, sirina);
      var hh = 8 * PT * 2 + vrs.length * fs * 1.25;
      if (!dpdfProstor(doc, y, hh)) y = dpdfNovaStran(doc);
      doc.rrect(M, y, R - M, hh, 8 * PT, { stroke: DPDF.OKVIR2, width: 1 * PT });
      vrs.forEach(function (vr, i) {
        var ob = dpdfOsnova(y + 8 * PT + i * fs * 1.25, fs, fs * 1.25), xx = M + 12 * PT;
        if (i === 0 && vr.indexOf('Opomba:') === 0) { var wo = doc.text(xx, ob, 'Opomba:', { size: fs, bold: true, color: DPDF.INK }); doc.text(xx + wo, ob, vr.slice(7), { size: fs, color: DPDF.INK }); }
        else doc.text(xx, ob, vr, { size: fs, color: DPDF.INK });
      });
      y += hh;
    }
  }

  SP.PT = PT; SP.DPDF = DPDF; SP.DPDF_VRSTA = DPDF_VRSTA;
  SP.dpdfOsnova = dpdfOsnova; SP.dpdfGlava = dpdfGlava; SP.dpdfOkvir = dpdfOkvir; SP.dpdfVrstice = dpdfVrstice;
  SP.dpdfTabGlava = dpdfTabGlava; SP.dpdfTabVrsta = dpdfTabVrsta; SP.dpdfTabela = dpdfTabela; SP.dpdfNadaljevanje = dpdfNadaljevanje;
  SP.dpdfNovaStran = dpdfNovaStran; SP.dpdfProstor = dpdfProstor; SP.dpdfNarocnik = dpdfNarocnik; SP.stran = stran;
  window.SpremniPdf = SP;
})();
