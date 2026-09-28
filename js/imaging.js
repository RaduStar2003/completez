/* Completez — prelucrarea imaginilor, integral în browser:
   semnătura din poză, îndreptarea și „scanarea” fotografiilor,
   găsirea liniilor punctate și a liniilor de completat. */
(function () {
  'use strict';
  const CZ = window.CZ;
  const U = CZ.util;
  const IM = (CZ.imaging = {});

  /* ---------- bază ---------- */

  IM.drawToCanvas = function (src, maxSide, rotate) {
    const sw = src.naturalWidth || src.width;
    const sh = src.naturalHeight || src.height;
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.round(sw * k);
    const h = Math.round(sh * k);
    const rot = ((rotate || 0) % 360 + 360) % 360;
    const c = rot === 90 || rot === 270 ? U.canvas(h, w) : U.canvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
    return c;
  };

  IM.gray = function (canvas) {
    const W = canvas.width;
    const H = canvas.height;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const g = new Uint8ClampedArray(W * H);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    return { g, W, H };
  };

  /* fundalul (hârtia): maximul pe blocuri, netezit, apoi extins la dimensiunea imaginii */
  function background(g, W, H, block) {
    const bw = Math.ceil(W / block);
    const bh = Math.ceil(H / block);
    const small = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        let mx = 0;
        const x0 = bx * block;
        const y0 = by * block;
        const x1 = Math.min(W, x0 + block);
        const y1 = Math.min(H, y0 + block);
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const v = g[y * W + x];
          if (v > mx) mx = v;
        }
        small[by * bw + bx] = mx;
      }
    }
    // netezire 3x3 de două ori
    let a = small;
    for (let pass = 0; pass < 2; pass++) {
      const b = new Float32Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) {
            s += a[yy * bw + xx];
            n++;
          }
        }
        b[y * bw + x] = s / n;
      }
      a = b;
    }
    // interpolare biliniară
    const bg = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const fy = Math.min(bh - 1.001, Math.max(0, y / block - 0.5));
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.min(bw - 1.001, Math.max(0, x / block - 0.5));
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const i00 = a[y0 * bw + x0];
        const i10 = a[y0 * bw + Math.min(bw - 1, x0 + 1)];
        const i01 = a[Math.min(bh - 1, y0 + 1) * bw + x0];
        const i11 = a[Math.min(bh - 1, y0 + 1) * bw + Math.min(bw - 1, x0 + 1)];
        bg[y * W + x] = (i00 * (1 - tx) + i10 * tx) * (1 - ty) + (i01 * (1 - tx) + i11 * tx) * ty;
      }
    }
    return bg;
  }

  function otsu(values, n) {
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) hist[values[i]]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let t = 127;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) {
        best = between;
        t = i;
      }
    }
    return t;
  }

  /* componente conexe (8-vecinătate) pe o mască binară */
  function components(mask, W, H, maxComps) {
    const labels = new Int32Array(W * H);
    const stack = new Int32Array(W * H);
    const comps = [];
    let next = 1;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start]) continue;
      let sp = 0;
      stack[sp++] = start;
      labels[start] = next;
      let x0 = W, y0 = H, x1 = -1, y1 = -1, area = 0;
      while (sp) {
        const p = stack[--sp];
        const y = (p / W) | 0;
        const x = p - y * W;
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const q = yy * W + xx;
            if (mask[q] && !labels[q]) {
              labels[q] = next;
              stack[sp++] = q;
            }
          }
        }
      }
      comps.push({ id: next, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
      next++;
      if (maxComps && comps.length > maxComps) break;
    }
    return { labels, comps };
  }

  /* ---------- binarizare adaptivă (Bradley) ---------- */
  IM.binarize = function (g, W, H) {
    const S = Math.max(9, Math.round(W / 36));
    const s2 = S >> 1;
    const T = 0.17;
    const W1 = W + 1;
    const I = new Uint32Array(W1 * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += g[y * W + x];
        I[(y + 1) * W1 + (x + 1)] = I[y * W1 + (x + 1)] + row;
      }
    }
    const ink = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const ya = Math.max(0, y - s2);
      const yb = Math.min(H - 1, y + s2);
      for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - s2);
        const xb = Math.min(W - 1, x + s2);
        const cnt = (xb - xa + 1) * (yb - ya + 1);
        const sum = I[(yb + 1) * W1 + (xb + 1)] - I[ya * W1 + (xb + 1)] - I[(yb + 1) * W1 + xa] + I[ya * W1 + xa];
        const v = g[y * W + x];
        if (v * cnt < sum * (1 - T) && v < 200) ink[y * W + x] = 1;
      }
    }
    return ink;
  };

  /* ---------- spații libere desenate: linii punctate și linii continue ---------- */
  IM.findBlanks = function (canvas) {
    const { g, W, H } = IM.gray(canvas);
    const ink = IM.binarize(g, W, H);
    const { comps } = components(ink, W, H, 400000);

    // înălțimea tipică a literelor
    const hs = comps
      .filter((c) => c.h > H * 0.004 && c.h < H * 0.04 && c.w < c.h * 3 && c.area > 8)
      .map((c) => c.h)
      .sort((a, b) => a - b);
    const letterH = hs.length ? hs[(hs.length / 2) | 0] : H * 0.012;
    const fontPx = U.clamp(letterH / 0.62, H * 0.008, H * 0.05);

    const blanks = [];

    // 1) linii punctate: șiruri de componente mici, aliniate, la distanțe mici
    const dMax = Math.max(2, Math.round(fontPx * 0.2));
    const dots = comps.filter((c) => c.w <= dMax && c.h <= dMax && c.w <= c.h * 2.5 + 1 && c.h <= c.w * 2.5 + 1);
    dots.forEach((d) => {
      d.cx = (d.x0 + d.x1) / 2;
      d.cy = (d.y0 + d.y1) / 2;
    });
    dots.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const rows = [];
    const tolY = Math.max(1.5, dMax * 0.8);
    for (const d of dots) {
      let row = null;
      for (let i = rows.length - 1; i >= 0 && i >= rows.length - 6; i--) {
        if (Math.abs(rows[i].cy - d.cy) <= tolY) {
          row = rows[i];
          break;
        }
      }
      if (!row) {
        row = { cy: d.cy, items: [] };
        rows.push(row);
      }
      row.items.push(d);
      row.cy = row.cy + (d.cy - row.cy) / row.items.length;
    }
    const bigComps = comps.filter((c) => c.h > dMax * 2.2 || c.w > dMax * 4);
    const maxGap = Math.max(dMax * 3.5, fontPx * 0.6);
    for (const row of rows) {
      row.items.sort((a, b) => a.cx - b.cx);
      let chain = [];
      const flush = () => {
        if (chain.length >= 5) {
          const x0 = chain[0].x0;
          const x1 = chain[chain.length - 1].x1;
          if (x1 - x0 >= fontPx * 2) {
            const yb = Math.max(...chain.map((c) => c.y1));
            const yt = Math.min(...chain.map((c) => c.y0));
            const crossed = bigComps.some((c) => c.x1 > x0 && c.x0 < x1 && c.y1 >= yt && c.y0 <= yb && (c.x0 > x0 + dMax && c.x1 < x1 - dMax));
            if (!crossed) blanks.push({ x0, x1, y: yb, kind: 'dots' });
          }
        }
        chain = [];
      };
      for (const d of row.items) {
        if (chain.length && d.x0 - chain[chain.length - 1].x1 > maxGap) flush();
        chain.push(d);
      }
      flush();
    }

    // 2) linii continue (sublinieri de completat)
    const minLen = Math.max(W * 0.04, fontPx * 2.5);
    const maxThick = Math.max(3, Math.round(fontPx * 0.2));
    const active = [];
    const lines = [];
    for (let y = 0; y < H; y++) {
      const runs = [];
      let rs = -1;
      let last = -10;
      for (let x = 0; x < W; x++) {
        if (ink[y * W + x]) {
          if (rs < 0) rs = x;
          last = x;
        } else if (rs >= 0 && x - last > 2) {
          if (last - rs + 1 >= minLen) runs.push([rs, last]);
          rs = -1;
        }
      }
      if (rs >= 0 && last - rs + 1 >= minLen) runs.push([rs, last]);
      for (const [a, b] of runs) {
        let hit = null;
        for (const L of active) {
          if (L.y1 >= y - 2) {
            const ov = Math.min(b, L.x1) - Math.max(a, L.x0);
            if (ov > 0.6 * Math.min(b - a, L.x1 - L.x0)) {
              hit = L;
              break;
            }
          }
        }
        if (hit) {
          hit.x0 = Math.min(hit.x0, a);
          hit.x1 = Math.max(hit.x1, b);
          hit.y1 = y;
        } else {
          const L = { x0: a, x1: b, y0: y, y1: y };
          active.push(L);
          lines.push(L);
        }
      }
      for (let i = active.length - 1; i >= 0; i--) if (active[i].y1 < y - 2) active.splice(i, 1);
    }
    // o linie cu bare verticale la capete e marginea unui chenar sau a unui tabel, nu un loc de scris
    const vertAt = (x, y) => {
      let best = 0;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        let run = 0;
        let up = 0;
        for (let yy = y - 1; yy >= 0 && yy > y - fontPx * 1.6; yy--) { if (ink[yy * W + xx]) run++; else break; }
        up = run;
        run = 0;
        for (let yy = y + maxThick; yy < H && yy < y + fontPx * 1.6; yy++) { if (ink[yy * W + xx]) run++; else break; }
        best = Math.max(best, up, run);
      }
      return best;
    };
    for (const L of lines) {
      if (L.y1 - L.y0 + 1 > maxThick) continue;
      if (L.x1 - L.x0 > W * 0.92) continue;
      if (vertAt(L.x0, L.y0) > fontPx * 0.7 || vertAt(L.x1, L.y0) > fontPx * 0.7) continue;
      blanks.push({ x0: L.x0, x1: L.x1, y: L.y0, kind: 'line' });
    }

    // 3) păstrăm doar spațiile goale deasupra (fără text scris peste ele)
    const out = [];
    for (const b of blanks) {
      const top = Math.max(0, Math.round(b.y - fontPx * 0.95));
      const bot = Math.max(0, Math.round(b.y - fontPx * (b.kind === 'dots' ? 0.3 : 0.22)));
      let cnt = 0;
      let area = 0;
      for (let y = top; y < bot; y++) for (let x = b.x0; x <= b.x1; x += 2) {
        area++;
        if (ink[y * W + x]) cnt++;
      }
      if (area && cnt / area > 0.035) continue;
      // fără duplicate (linie punctată detectată și ca linie)
      if (out.some((o) => Math.abs(o.y - b.y) < fontPx * 0.5 && Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) > 0.5 * Math.min(o.x1 - o.x0, b.x1 - b.x0))) continue;
      out.push(b);
    }
    out.sort((a, b) => a.y - b.y || a.x0 - b.x0);
    return { blanks: out, W, H, fontPx };
  };

  /* ---------- colțurile documentului dintr-o fotografie ---------- */
  IM.detectCorners = function (img) {
    const c = IM.drawToCanvas(img, 480);
    const { g, W, H } = IM.gray(c);
    const t = otsu(g, g.length);
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < g.length; i++) mask[i] = g[i] > t ? 1 : 0;
    const { labels, comps } = components(mask, W, H);
    const full = [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (!comps.length) return full;
    const big = comps.reduce((a, b) => (b.area > a.area ? b : a));
    if (big.area < W * H * 0.18) return full;
    if (big.w > W * 0.97 && big.h > H * 0.97) return full;
    let tl = [W, H], tr = [0, H], br = [0, 0], bl = [W, 0];
    let sTL = Infinity, sTR = -Infinity, sBR = -Infinity, sBL = Infinity;
    for (let y = big.y0; y <= big.y1; y++) {
      for (let x = big.x0; x <= big.x1; x++) {
        if (labels[y * W + x] !== big.id) continue;
        const s = x + y;
        const d = x - y;
        if (s < sTL) { sTL = s; tl = [x, y]; }
        if (s > sBR) { sBR = s; br = [x, y]; }
        if (d > sTR) { sTR = d; tr = [x, y]; }
        if (d < sBL) { sBL = d; bl = [x, y]; }
      }
    }
    return [tl, tr, br, bl].map(([x, y]) => [U.clamp(x / (W - 1), 0, 1), U.clamp(y / (H - 1), 0, 1)]);
  };

  function solve8(A, b) {
    const n = 8;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      const p = M[col][col];
      if (Math.abs(p) < 1e-12) return null;
      for (let c2 = col; c2 <= n; c2++) M[col][c2] /= p;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (!f) continue;
        for (let c2 = col; c2 <= n; c2++) M[r][c2] -= f * M[col][c2];
      }
    }
    return M.map((row) => row[n]);
  }

  /* corectează perspectiva: corners = [[x,y]...] (0..1) în ordinea sus-stânga, sus-dreapta, jos-dreapta, jos-stânga */
  IM.warp = function (img, corners, maxSide) {
    const src = IM.drawToCanvas(img, 3000);
    const SW = src.width;
    const SH = src.height;
    const P = corners.map(([x, y]) => [x * (SW - 1), y * (SH - 1)]);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let w = Math.max(dist(P[0], P[1]), dist(P[3], P[2]));
    let h = Math.max(dist(P[0], P[3]), dist(P[1], P[2]));
    const ratio = h / w;
    if (Math.abs(ratio - Math.SQRT2) / Math.SQRT2 < 0.12) h = w * Math.SQRT2;
    else if (Math.abs(ratio - 1 / Math.SQRT2) * Math.SQRT2 < 0.12) h = w / Math.SQRT2;
    const k = Math.min(1, (maxSide || 2200) / Math.max(w, h));
    const OW = Math.max(50, Math.round(w * k));
    const OH = Math.max(50, Math.round(h * k));
    const dst = [[0, 0], [OW - 1, 0], [OW - 1, OH - 1], [0, OH - 1]];
    const A = [];
    const bv = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = dst[i];
      const [x, y] = P[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
      bv.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
      bv.push(y);
    }
    const hm = solve8(A, bv);
    const out = U.canvas(OW, OH);
    if (!hm) {
      out.getContext('2d').drawImage(src, 0, 0, OW, OH);
      return out;
    }
    const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SW, SH).data;
    const octx = out.getContext('2d');
    const od = octx.createImageData(OW, OH);
    const o = od.data;
    const [h0, h1, h2, h3, h4, h5, h6, h7] = hm;
    let p = 0;
    for (let v = 0; v < OH; v++) {
      for (let u = 0; u < OW; u++, p += 4) {
        const den = h6 * u + h7 * v + 1;
        const x = (h0 * u + h1 * v + h2) / den;
        const y = (h3 * u + h4 * v + h5) / den;
        if (x < 0 || y < 0 || x > SW - 1 || y > SH - 1) {
          o[p] = o[p + 1] = o[p + 2] = 255;
          o[p + 3] = 255;
          continue;
        }
        const x0 = x | 0;
        const y0 = y | 0;
        const tx = x - x0;
        const ty = y - y0;
        const x1 = Math.min(SW - 1, x0 + 1);
        const y1 = Math.min(SH - 1, y0 + 1);
        const i00 = (y0 * SW + x0) * 4;
        const i10 = (y0 * SW + x1) * 4;
        const i01 = (y1 * SW + x0) * 4;
        const i11 = (y1 * SW + x1) * 4;
        for (let ch = 0; ch < 3; ch++) {
          o[p + ch] = (sd[i00 + ch] * (1 - tx) + sd[i10 + ch] * tx) * (1 - ty) + (sd[i01 + ch] * (1 - tx) + sd[i11 + ch] * tx) * ty;
        }
        o[p + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  };

  /* efect de scanare: hârtie albă uniformă, culorile păstrate */
  IM.enhance = function (canvas) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data;
    const g = new Uint8ClampedArray(W * H);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    const bg = background(g, W, H, Math.max(16, Math.round(Math.max(W, H) / 60)));
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const gain = U.clamp(248 / Math.max(bg[i], 40), 1, 3.2);
      for (let ch = 0; ch < 3; ch++) {
        let v = d[j + ch] * gain;
        v = (v - 18) * 1.08; // puțin contrast
        d[j + ch] = v;
      }
    }
    ctx.putImageData(id, 0, 0);
    return canvas;
  };

  /* ---------- semnătura din poză ---------- */
  IM.extractSignature = function (img, opts) {
    const o = Object.assign({ sens: 0, weight: 0, color: 'blue', rotate: 0 }, opts || {});
    const c = IM.drawToCanvas(img, 1400, o.rotate);
    const W = c.width;
    const H = c.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const src = ctx.getImageData(0, 0, W, H).data;
    const g = new Uint8ClampedArray(W * H);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (src[j] * 77 + src[j + 1] * 150 + src[j + 2] * 29) >> 8;
    const bg = background(g, W, H, Math.max(10, Math.round(Math.max(W, H) / 40)));
    const nv = new Uint8ClampedArray(W * H);
    for (let i = 0; i < g.length; i++) nv[i] = U.clamp((g[i] / Math.max(bg[i], 30)) * 255, 0, 255);
    const t0 = otsu(nv, nv.length) / 255;
    const t = U.clamp(Math.min(t0, 0.86), 0.55, 0.9) + o.sens * 0.1;
    let alpha = new Float32Array(W * H);
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < nv.length; i++) {
      const v = nv[i] / 255;
      const a = U.clamp((t + 0.04 - v) / 0.12, 0, 1);
      alpha[i] = a;
      if (a > 0.35) mask[i] = 1;
    }
    // eliminăm punctele izolate și umbrele lipite de margine
    const { labels, comps } = components(mask, W, H);
    const minArea = Math.max(8, W * H * 0.00003);
    const drop = new Set();
    for (const cp of comps) {
      const touches = cp.x0 === 0 || cp.y0 === 0 || cp.x1 === W - 1 || cp.y1 === H - 1;
      if (cp.area < minArea || (touches && (cp.w > W * 0.45 || cp.h > H * 0.45))) drop.add(cp.id);
    }
    for (let i = 0; i < alpha.length; i++) if (!mask[i] || drop.has(labels[i])) {
      if (mask[i]) alpha[i] = 0;
      else if (alpha[i] > 0) {
        // halou de antialiasing: păstrăm doar lângă tușe valide
        const y = (i / W) | 0;
        const x = i - y * W;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx;
          if (mask[q] && !drop.has(labels[q])) {
            near = true;
            break;
          }
        }
        if (!near) alpha[i] = 0;
      }
    }
    // grosimea liniei
    for (let pass = 0; pass < Math.abs(o.weight); pass++) {
      const b = new Float32Array(W * H);
      const grow = o.weight > 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = alpha[y * W + x];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = alpha[yy * W + xx];
          v = grow ? Math.max(v, q * 0.92) : Math.min(v, q);
        }
        b[y * W + x] = v;
      }
      alpha = b;
    }
    // decupare
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (alpha[y * W + x] > 0.08) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03) + 2;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad);
    y1 = Math.min(H - 1, y1 + pad);
    const OW = x1 - x0 + 1;
    const OH = y1 - y0 + 1;
    const out = U.canvas(OW, OH);
    const octx = out.getContext('2d');
    const od = octx.createImageData(OW, OH);
    const q = od.data;
    const INK = { blue: [24, 48, 150], black: [22, 22, 28] }[o.color];
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
      const si = (y + y0) * W + (x + x0);
      const di = (y * OW + x) * 4;
      const a = alpha[si];
      if (INK) {
        q[di] = INK[0];
        q[di + 1] = INK[1];
        q[di + 2] = INK[2];
      } else {
        q[di] = src[si * 4] * 0.75;
        q[di + 1] = src[si * 4 + 1] * 0.75;
        q[di + 2] = src[si * 4 + 2] * 0.75;
      }
      q[di + 3] = Math.round(a * 255);
    }
    octx.putImageData(od, 0, 0);
    // limităm dimensiunea salvată
    const k = Math.min(1, 900 / OW, 360 / OH);
    if (k < 1) {
      const small = U.canvas(OW * k, OH * k);
      small.getContext('2d').drawImage(out, 0, 0, small.width, small.height);
      return small;
    }
    return out;
  };

  /* decupează ce s-a desenat pe o pânză (semnătură desenată) */
  IM.trimCanvas = function (canvas) {
    const W = canvas.width;
    const H = canvas.height;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const pad = 6;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad);
    y1 = Math.min(H - 1, y1 + pad);
    const out = U.canvas(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    const k = Math.min(1, 900 / out.width, 360 / out.height);
    if (k < 1) {
      const small = U.canvas(out.width * k, out.height * k);
      small.getContext('2d').drawImage(out, 0, 0, small.width, small.height);
      return small;
    }
    return out;
  };

  /* semnătură demonstrativă pentru profilul-exemplu (desenată procedural) */
  IM.exampleSignature = function () {
    const c = U.canvas(560, 190);
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgb(24,48,150)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const stroke = (w, fn) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      fn();
      ctx.stroke();
    };
    // „M”
    stroke(4.2, () => {
      ctx.moveTo(40, 130);
      ctx.bezierCurveTo(55, 90, 70, 40, 78, 44);
      ctx.bezierCurveTo(86, 48, 80, 110, 88, 112);
      ctx.bezierCurveTo(98, 112, 108, 44, 118, 46);
      ctx.bezierCurveTo(128, 48, 122, 118, 132, 122);
      ctx.bezierCurveTo(138, 124, 146, 116, 152, 108);
    });
    // „Ionescu” ca o scriere legată
    stroke(3.6, () => {
      ctx.moveTo(176, 60);
      ctx.bezierCurveTo(178, 80, 176, 110, 172, 124);
      ctx.moveTo(188, 112);
      ctx.bezierCurveTo(196, 92, 214, 92, 214, 108);
      ctx.bezierCurveTo(214, 124, 194, 126, 192, 112);
      ctx.bezierCurveTo(206, 104, 224, 98, 232, 104);
      ctx.bezierCurveTo(236, 112, 236, 122, 238, 124);
      ctx.bezierCurveTo(242, 104, 262, 94, 266, 106);
      ctx.bezierCurveTo(268, 116, 266, 122, 270, 124);
      ctx.bezierCurveTo(286, 124, 300, 96, 292, 96);
      ctx.bezierCurveTo(280, 98, 282, 124, 300, 122);
      ctx.bezierCurveTo(314, 118, 318, 100, 332, 100);
      ctx.bezierCurveTo(318, 104, 320, 118, 336, 122);
      ctx.bezierCurveTo(350, 124, 360, 102, 372, 102);
      ctx.bezierCurveTo(356, 106, 358, 124, 376, 122);
      ctx.bezierCurveTo(390, 120, 396, 100, 400, 100);
      ctx.bezierCurveTo(398, 112, 402, 124, 414, 120);
      ctx.bezierCurveTo(424, 116, 428, 100, 430, 100);
      ctx.bezierCurveTo(430, 112, 432, 124, 444, 118);
    });
    // trăsătura de subliniere
    stroke(3, () => {
      ctx.moveTo(60, 150);
      ctx.bezierCurveTo(180, 138, 360, 140, 500, 124);
    });
    return IM.trimCanvas(c);
  };
})();
