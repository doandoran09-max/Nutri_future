/**
 * NutriFuture — NF_Fx: hiệu ứng nền & chuyển động RIÊNG cho từng giao diện (chỉ trang trí, không đụng tới dữ liệu).
 *
 * Mỗi giao diện (9 cấp) có "cảnh nền" (#nf-scene, nằm SAU nội dung) và "hạt lấp lánh" (#nf-sparkles, nằm TRÊN nội dung)
 * hoàn toàn khác nhau — không dùng chung một bộ hiệu ứng:
 *   fresh bong bóng · radiant tia nắng ban mai · celestial mây & sóng · nebula dải cực quang · cosmic hành tinh & quỹ đạo
 *   royal bụi vàng rơi · divine thánh quang & lông vũ · eternal lửa & tàn lửa · transcendent CHƯ THIÊN TINH ĐẤU (ngân hà,
 *   Bắc Đẩu / Nam Đẩu / Tử Vi, sao băng, sao chổi, siêu tân tinh).
 * Kiểu dáng & chuyển động nằm trong css/looks.css; file này chỉ dựng các phần tử.
 *
 * Phản hồi khi thao tác (cũng ở file này):
 *  - Ghi món vào nhật ký (mọi nguồn: tra cứu, camera, thủ công, kế hoạch AI): chip "+kcal" bay cong tới tổng calo / tab Nhật ký,
 *    chạm đích thì tổng "nảy" và nổ hạt của giao diện đang dùng. Nghe sự kiện 'nf:diary' nên không phải sửa từng nơi thêm món.
 *  - Trả lời câu đố: đúng → nổ hạt + "+điểm" + combo; sai → rung, viền đỏ chớp, đáp án đúng sáng lên; xong 5/5 → pháo hoa.
 *
 * An toàn:
 *  - Mọi phần tử tạo ra đều pointer-events:none, aria-hidden, chỉ animate transform/opacity (xem css/looks.css).
 *  - "Reduce motion": vẫn dựng cảnh nền TĨNH (đẹp, không chuyển động), không tạo hạt/sao băng.
 *  - Tạm dừng khi tab bị ẩn; ẩn ở trang Camera (để không che khung hình).
 *  - Mọi thao tác được bọc try/catch — lỗi hiệu ứng không bao giờ làm hỏng app.
 */
const NF_Fx = (() => {
  'use strict';

  const BURST_TARGETS = '.btn, .nav-btn, .quick-card, .chip-btn, .quiz-option, .header-date, .look-tile, .water-tracker__btn, .shutter-btn';
  const COUNT_TARGETS = '.stat-card__value, .metric-card__value, .water-tracker__value';
  const MAX_BURSTS = 6;

  let scene = null;
  let layer = null;
  let rebuildTimer = 0;
  let activeBursts = 0;
  let lookTimer = 0;
  let lastPtr = { x: 0, y: 0, t: 0 };
  let flightEnd = 0;
  const counting = new WeakSet();

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const f1 = (n) => n.toFixed(1);
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const reduced = () => mq('(prefers-reduced-motion: reduce)').matches;
  const realm = () => document.documentElement.dataset.nfRealm || 'fresh';
  const isSmall = () => window.innerWidth < 640;

  /* ─── CẢNH NỀN theo giao diện ─── */

  const span = (cls, vars) => `<span class="${cls}" style="${vars || ''}"></span>`;
  const repeat = (n, fn) => { let out = ''; for (let i = 0; i < n; i++) out += fn(i); return out; };

  /** Đám sao dùng 1 phần tử + nhiều box-shadow (rất nhẹ). Toạ độ quanh tâm màn hình, đơn vị vmax → xoay quanh tâm được. */
  function starField(n, spread, alphaMin) {
    const R = 62;
    const cols = ['255,255,255', '200,220,255', '255,215,235', '255,240,200', '190,235,255'];
    const parts = [];
    for (let i = 0; i < n; i++) {
      parts.push(`${f1(rand(-R, R))}vmax ${f1(rand(-R, R))}vmax 0 ${spread}px rgba(${pick(cols)},${f1(rand(alphaMin, 1))})`);
    }
    return parts.join(',');
  }

  /** Thiên hà xoắn ốc bằng SVG: 2 nhánh xoắn logarit + chòm sao bụi + lõi sáng. */
  function galaxySvg(id, colA, colB) {
    const arms = 2, steps = 46, thetaMax = 6.1, r0 = 7, b = Math.log(92 / r0) / thetaMax;
    let paths = '', dots = '';
    for (let k = 0; k < arms; k++) {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * thetaMax;
        const r = r0 * Math.exp(b * th);
        const a = th + k * Math.PI;
        pts.push(`${f1(Math.cos(a) * r)},${f1(Math.sin(a) * r)}`);
      }
      const col = k === 0 ? colA : colB;
      const line = pts.join(' ');
      paths += `<polyline points="${line}" stroke="${col}" stroke-opacity=".10" stroke-width="22"/>`;
      paths += `<polyline points="${line}" stroke="${col}" stroke-opacity=".20" stroke-width="12"/>`;
      paths += `<polyline points="${line}" stroke="${col}" stroke-opacity=".42" stroke-width="4.5"/>`;
      for (let i = 0; i < 70; i++) {
        const th = rand(0.2, thetaMax);
        const r = r0 * Math.exp(b * th) + rand(-1, 1) * (3 + r0 * Math.exp(b * th) * 0.16);
        const a = th + k * Math.PI + rand(-0.08, 0.08);
        dots += `<circle cx="${f1(Math.cos(a) * r)}" cy="${f1(Math.sin(a) * r)}" r="${f1(rand(0.35, 1.5))}" fill="${pick(['#fff', '#fff', '#ffd9f0', '#cfe4ff'])}" fill-opacity="${f1(rand(0.5, 1))}"/>`;
      }
    }
    return `<svg class="nfs-galaxy-svg" viewBox="-100 -100 200 200" aria-hidden="true">
      <defs><radialGradient id="${id}"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".18" stop-color="#ffe6b8" stop-opacity=".95"/><stop offset=".5" stop-color="#ff9ec8" stop-opacity=".35"/><stop offset="1" stop-color="#6d67ff" stop-opacity="0"/></radialGradient></defs>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>${dots}
      <circle r="30" fill="url(#${id})"/></svg>`;
  }

  /** Chòm sao (toạ độ % màn hình): Bắc Đẩu, Nam Đẩu, Tử Vi. Nét vẽ dần rồi mờ đi, các sao nhấp nháy. */
  function constellationSvg(small) {
    const C = [
      { name: 'bacdau', path: [[56, 26], [62, 22], [68, 20.5], [73, 22], [74.5, 30], [83, 31], [84.5, 23], [73, 22]], delay: 0 },
      { name: 'namdau', path: [[9, 72], [14, 76], [21, 77], [27, 72], [22, 67], [9, 72]], extra: [[27, 72], [31, 66], [29, 60]], delay: -5 },
      { name: 'tuvi', path: [[8, 10], [13, 17], [19, 11], [25, 18], [31, 10]], delay: -9 },
    ].slice(0, small ? 2 : 3);
    let out = '';
    C.forEach((c) => {
      const segs = [c.path].concat(c.extra ? [c.extra] : []);
      segs.forEach((pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          out += `<line class="nfs-cline" pathLength="1" x1="${pts[i][0]}%" y1="${pts[i][1]}%" x2="${pts[i + 1][0]}%" y2="${pts[i + 1][1]}%" style="animation-delay:${c.delay + i * 0.25}s"/>`;
        }
      });
      const stars = c.path.slice(0, c.path.length - (c.name === 'bacdau' ? 1 : 0)).concat(c.extra ? c.extra.slice(1) : []);
      stars.forEach((p, i) => {
        out += `<circle class="nfs-cstar-glow" cx="${p[0]}%" cy="${p[1]}%" r="7" style="animation-delay:${c.delay + i * 0.4}s"/><circle class="nfs-cstar" cx="${p[0]}%" cy="${p[1]}%" r="2.2" style="animation-delay:${i * 0.35}s"/>`;
      });
    });
    return `<svg class="nfs-const" width="100%" height="100%" aria-hidden="true">${out}</svg>`;
  }

  const SCENES = {
    /* 1 · Bong bóng nổi lên */
    fresh: (small) => repeat(small ? 8 : 14, () =>
      span('nfs-bubble', `--x:${f1(rand(2, 96))}%;--y:${f1(rand(6, 90))}%;--s:${f1(rand(12, 46))}px;--d:${f1(rand(14, 28))}s;--dl:-${f1(rand(0, 26))}s;--sw:${f1(rand(-30, 30))}px`)),

    /* 2 · Tia nắng ban mai */
    radiant: () => span('nfs-sun') + span('nfs-sun-core') + span('nfs-horizon'),

    /* 3 · Mây trôi & sóng nước */
    celestial: (small) =>
      repeat(small ? 3 : 5, (i) => span('nfs-cloud', `--y:${f1(4 + i * (small ? 22 : 15) + rand(0, 6))}%;--w:${f1(rand(34, 60))}vmax;--x:${f1(rand(-10, 70))}%;--d:${f1(rand(50, 90))}s;--dl:-${f1(rand(0, 60))}s;--o:${f1(rand(0.55, 0.95))}`)) +
      span('nfs-wave nfs-wave--a') + span('nfs-wave nfs-wave--b'),

    /* 4 · Dải cực quang */
    nebula: () =>
      span('nfs-ribbon nfs-ribbon--a') + span('nfs-ribbon nfs-ribbon--b') + span('nfs-ribbon nfs-ribbon--c'),

    /* 5 · Hành tinh, vành đai, mặt trăng quay & tia quét HUD */
    cosmic: () =>
      span('nfs-planet') + '<span class="nfs-orbit"><span class="nfs-moon"></span></span>' + span('nfs-scan'),

    /* 6 · Hai dải sáng vàng lướt chéo */
    royal: () => span('nfs-beam nfs-beam--a') + span('nfs-beam nfs-beam--b') + span('nfs-vignette'),

    /* 7 · Thánh quang: tia sáng từ trên cao + vầng hào quang */
    divine: () => span('nfs-godrays') + span('nfs-halo') + span('nfs-halo nfs-halo--b'),

    /* 8 · Lửa: hơi nóng dưới đáy + những ngọn lửa */
    eternal: (small) =>
      span('nfs-heat') +
      repeat(small ? 4 : 7, (i) => span('nfs-flame', `--x:${f1(4 + i * (small ? 24 : 14) + rand(-3, 3))}%;--w:${f1(rand(22, 38))}vmax;--h:${f1(rand(34, 52))}vh;--d:${f1(rand(2.2, 4.2))}s;--dl:-${f1(rand(0, 4))}s`)),

    /* 9 · CHƯ THIÊN TINH ĐẤU — bầu trời sao xoay, dải Ngân Hà, 2 thiên hà, chòm sao, sao băng, sao chổi, siêu tân tinh */
    transcendent: (small) => {
      const sky = (cls, n, spread, aMin) => `<span class="nfs-sky ${cls}"><span class="nfs-stars" style="box-shadow:${starField(n, spread, aMin)}"></span></span>`;
      return sky('nfs-sky--far', small ? 110 : 160, 0, 0.45) +
        sky('nfs-sky--mid', small ? 55 : 85, 0.5, 0.6) +
        sky('nfs-sky--near', small ? 22 : 36, 1, 0.8) +
        span('nfs-milky') +
        `<span class="nfs-galaxy nfs-galaxy--big">${galaxySvg('gA', '#8a8dff', '#ff7ad0')}</span>` +
        (small ? '' : `<span class="nfs-galaxy nfs-galaxy--small">${galaxySvg('gB', '#4de1ff', '#b58cff')}</span>`) +
        constellationSvg(small) +
        repeat(small ? 3 : 6, (i) => span('nfs-shoot', `--x:${f1(rand(-5, 65))}%;--y:${f1(rand(0, 48))}%;--len:${f1(rand(90, 190))}px;--d:${f1(rand(6, 12))}s;--dl:-${f1(rand(0, 10))}s;--a:${f1(rand(22, 36))}deg`)) +
        span('nfs-comet') +
        repeat(small ? 2 : 4, () => span('nfs-flare', `--x:${f1(rand(6, 94))}%;--y:${f1(rand(6, 90))}%;--s:${f1(rand(38, 78))}px;--d:${f1(rand(5, 9))}s;--dl:-${f1(rand(0, 9))}s`));
    },
  };

  /* ─── HẠT LẤP LÁNH (trên nội dung) theo giao diện ─── */

  const PARTICLES = {
    fresh: null,                                        // Khởi Đầu Xanh: yên tĩnh, chỉ có bong bóng nền
    radiant: { n: 12, cls: 'p-ray' },
    celestial: { n: 9, cls: 'p-glint' },
    nebula: { n: 18, cls: 'p-dust' },
    cosmic: { n: 12, cls: 'p-blip' },
    royal: { n: 18, cls: 'p-gold' },
    divine: { n: 12, cls: 'p-orb' },
    eternal: { n: 28, cls: 'p-ember' },
    transcendent: { n: 34, cls: 'p-star' },
  };

  function buildParticles(r, small) {
    const spec = PARTICLES[r];
    if (!spec) return '';
    const n = Math.round(spec.n * (small ? 0.65 : 1));
    const colors = ['var(--nf-s1)', 'var(--nf-s2)', 'var(--nf-s3)'];
    return repeat(n, (i) =>
      `<span class="nf-p ${spec.cls}" style="--x:${f1(rand(2, 96))}%;--y:${f1(rand(4, 94))}%;--s:${f1(rand(7, 17))}px;--d:${f1(rand(3.4, 7.4))}s;--dl:-${f1(rand(0, 8))}s;--o:${f1(rand(0.6, 0.95))};--dr:-${f1(rand(8, 26))}px;--sw:${f1(rand(-26, 26))}px;--c:${colors[i % 3]}"></span>`);
  }

  /* ─── Dựng / gỡ ─── */

  function ensureLayers() {
    if (!scene) {
      scene = document.createElement('div');
      scene.id = 'nf-scene';
      scene.setAttribute('aria-hidden', 'true');
      document.body.appendChild(scene);
    }
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'nf-sparkles';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
  }

  function removeLayers() {
    if (scene && scene.parentNode) scene.parentNode.removeChild(scene);
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    scene = null;
    layer = null;
  }

  function buildScene() {
    try {
      ensureLayers();
      const r = SCENES[realm()] ? realm() : 'fresh';
      const small = isSmall();
      scene.dataset.realm = r;
      layer.dataset.realm = r;
      scene.innerHTML = SCENES[r](small);
      // Reduce motion: giữ cảnh nền tĩnh, bỏ hạt bay & sao băng (CSS đã tắt mọi animation)
      layer.innerHTML = reduced() ? '' : buildParticles(r, small);
    } catch (e) { console.warn('[NF_Fx] scene:', e); }
  }

  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(buildScene, 120);
  }

  /* ─── Nổ sao khi bấm ─── */

  const BURST_N = { fresh: 6, radiant: 9, celestial: 8, nebula: 10, cosmic: 8, royal: 10, divine: 10, eternal: 13, transcendent: 22 };

  function burst(x, y) {
    try {
      if (reduced() || activeBursts >= MAX_BURSTS) return;
      const r = realm();
      const big = r === 'transcendent';
      const root = document.createElement('div');
      root.className = 'nf-burst';
      root.dataset.realm = r;
      root.setAttribute('aria-hidden', 'true');
      root.style.left = x + 'px';
      root.style.top = y + 'px';
      const n = BURST_N[r] || 8;
      const colors = ['var(--nf-s1)', 'var(--nf-s2)', 'var(--nf-s3)', '#ffffff'];
      let html = big || r === 'cosmic' ? '<b class="nf-shock"></b>' : '';
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + rand(-0.3, 0.3);
        const rad = rand(26, 64) * (big ? 1.9 : 1);
        html += `<i style="--tx:${f1(Math.cos(a) * rad)}px;--ty:${f1(Math.sin(a) * rad)}px;--s:${f1(rand(6, 13) * (big ? 1.5 : 1))}px;--c:${colors[i % colors.length]}"></i>`;
      }
      root.innerHTML = html;
      document.body.appendChild(root);
      activeBursts++;
      setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); activeBursts = Math.max(0, activeBursts - 1); }, big ? 1000 : 760);
    } catch (e) { /* bỏ qua */ }
  }

  function onPointerDown(e) {
    try {
      lastPtr = { x: e.clientX, y: e.clientY, t: Date.now() };   // để chip "+kcal" bay ra từ đúng nút vừa bấm
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = e.target && e.target.closest ? e.target.closest(BURST_TARGETS) : null;
      if (!t || t.disabled) return;
      burst(e.clientX, e.clientY);
    } catch (err) { /* bỏ qua */ }
  }

  /* ─── Đếm số chạy khi vào trang ─── */

  function parseInteger(text) {
    const t = (text || '').trim();
    if (/^\d{1,6}$/.test(t)) return { value: Number(t), grouped: false };
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
      const v = Number(t.replace(/\./g, ''));
      // chỉ nhận nếu đúng định dạng vi-VN của chính số đó (tránh nhầm số thập phân như "2.500")
      if (typeof NF_UI !== 'undefined' && NF_UI.formatNumber && NF_UI.formatNumber(v) === t) return { value: v, grouped: true };
    }
    return null;
  }

  function countUp(el) {
    if (counting.has(el)) return;
    const parsed = parseInteger(el.textContent);
    if (!parsed || parsed.value < 3) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > (window.innerHeight || 800)) return;   // ngoài màn hình: khỏi chạy
    counting.add(el);

    const target = parsed.value;
    const fmt = (n) => (parsed.grouped && typeof NF_UI !== 'undefined' ? NF_UI.formatNumber(n) : String(n));
    const finalText = el.textContent;
    const duration = 750;
    const t0 = performance.now();
    let lastWritten = null;

    function frame(now) {
      // Dừng nếu phần tử đã bị gỡ khỏi trang, hoặc nội dung bị nơi khác cập nhật trong lúc đếm
      if (!el.isConnected || (lastWritten !== null && el.textContent !== lastWritten)) { counting.delete(el); return; }
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { el.textContent = finalText; counting.delete(el); return; }
      lastWritten = fmt(Math.round(target * eased));
      el.textContent = lastWritten;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function enhancePage(root) {
    try {
      if (!root || reduced()) return;
      root.querySelectorAll(COUNT_TARGETS).forEach(countUp);
    } catch (e) { /* bỏ qua */ }
  }

  /* ─── Đổi giao diện: chớp sáng + chuyển màu mượt ─── */

  function lookChanged() {
    try {
      if (reduced()) return;
      const html = document.documentElement;
      html.classList.add('nf-look-switching');
      const flash = document.createElement('div');
      flash.className = 'nf-look-flash';
      flash.setAttribute('aria-hidden', 'true');
      document.body.appendChild(flash);
      setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 760);
      clearTimeout(lookTimer);
      lookTimer = setTimeout(() => html.classList.remove('nf-look-switching'), 800);
      const r = document.documentElement.getBoundingClientRect();
      burst(Math.round(r.width / 2), Math.round((window.innerHeight || 800) * 0.35));
    } catch (e) { /* bỏ qua */ }
  }

  /* ─── Phản hồi khi thao tác: chip bay · nảy · câu đố ─── */

  const center = (el) => {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return (r.width || r.height) ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };

  /** Nảy nhẹ một phần tử (số tổng, icon tab…) */
  function pop(el) {
    try {
      if (!el || reduced()) return;
      el.classList.remove('nf-pop');
      void el.offsetWidth;
      el.classList.add('nf-pop');
      setTimeout(() => el.classList.remove('nf-pop'), 720);
    } catch (e) { /* bỏ qua */ }
  }

  /** Chip nổi lên rồi mờ (vd "+10 điểm") tại toạ độ màn hình */
  function floatText(text, x, y, cls) {
    try {
      if (reduced()) return;
      const el = document.createElement('div');
      el.className = 'nf-chip nf-float ' + (cls || '');
      el.textContent = text;
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      const a = el.animate([
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.6)`, opacity: 0 },
        { transform: `translate(${x}px, ${y - 18}px) translate(-50%, -50%) scale(1.12)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${x}px, ${y - 62}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${x}px, ${y - 92}px) translate(-50%, -50%) scale(0.95)`, opacity: 0 },
      ], { duration: 1150, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' });
      a.onfinish = () => el.remove();
      setTimeout(() => el.remove(), 1500);
    } catch (e) { /* bỏ qua */ }
  }

  /** Đích cho chip "+kcal": tổng calo trên trang Nhật ký, nếu không có thì icon tab Nhật ký */
  function findEntryTarget() {
    const total = document.getElementById('diary-total-cal');
    if (total && center(total)) return total;
    const nav = document.querySelector('.nav-btn[data-target="#diary"]');
    const icon = nav && (nav.querySelector('i') || nav);
    return icon && center(icon) ? icon : null;
  }

  /** Thời gian còn lại (ms) tới khi chip chạm đích — trang Nhật ký dùng để đếm số đúng lúc chip tới */
  function entryFlightMs() { return Math.max(0, Math.round(flightEnd - performance.now())); }

  function celebrateEntry(kcal) {
    try {
      if (reduced() || !(kcal > 0)) return;
      const target = findEntryTarget();
      const end = center(target) || { x: window.innerWidth / 2, y: 70 };
      const start = (Date.now() - lastPtr.t < 4000 && lastPtr.t) ? { x: lastPtr.x, y: lastPtr.y } : { x: window.innerWidth / 2, y: window.innerHeight * 0.72 };
      const DUR = 950;
      flightEnd = performance.now() + DUR;

      // đường cong bậc 2: điểm điều khiển nằm cao hơn cả 2 đầu → chip bay vòng lên rồi lao xuống đích
      const ctrl = { x: (start.x + end.x) / 2 + (end.x - start.x) * 0.15, y: Math.min(start.y, end.y) - 130 };
      const at = (t) => {
        const u = 1 - t;
        return { x: u * u * start.x + 2 * u * t * ctrl.x + t * t * end.x, y: u * u * start.y + 2 * u * t * ctrl.y + t * t * end.y };
      };
      const frames = (scaleMul) => [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((t) => {
        const p = at(t);
        const sc = (t < 0.25 ? 0.6 + t * 2.2 : 1.15 - (t - 0.25) * 0.75) * scaleMul;
        return { offset: t, opacity: t === 0 ? 0 : (t > 0.94 ? 0.85 : 1), transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${Math.max(0.35, sc).toFixed(2)})` };
      });
      const opts = (delay) => ({ duration: DUR, delay, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'both' });

      const chip = document.createElement('div');
      chip.className = 'nf-chip nf-fly';
      chip.textContent = `+${kcal} kcal`;
      chip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(chip);
      chip.animate(frames(1), opts(0));

      // đuôi sao chổi: 5 ngôi sao nhỏ bay theo sau, mỗi ngôi trễ hơn một chút
      const colors = ['var(--nf-s1)', 'var(--nf-s2)', 'var(--nf-s3)'];
      const dots = [];
      for (let i = 1; i <= 5; i++) {
        const d = document.createElement('span');
        d.className = 'nf-fly-dot';
        d.style.setProperty('--c', colors[i % 3]);
        document.body.appendChild(d);
        d.animate(frames(0.32 + (5 - i) * 0.05), opts(i * 55));
        dots.push(d);
      }

      setTimeout(() => {
        chip.remove();
        dots.forEach((d) => d.remove());
        pop(target);
        burst(end.x, end.y);
      }, DUR + 5 * 55 + 20);
    } catch (e) { console.warn('[NF_Fx] celebrateEntry:', e); }
  }

  /** Đếm số từ `from` tới `to` (sau `delay` ms). Tự dừng nếu nội dung bị nơi khác thay đổi. */
  function tweenNumber(el, from, to, opts) {
    try {
      const o = opts || {};
      if (!el || reduced() || !(to > from)) { if (el) el.textContent = to; return; }
      const delay = o.delay || 0, dur = o.duration || 700;
      const fmt = (n) => (NF_UI && NF_UI.formatNumber && o.grouped ? NF_UI.formatNumber(n) : String(n));
      el.textContent = fmt(from);
      let last = el.textContent;
      const t0 = performance.now() + delay;
      const frame = (now) => {
        if (!el.isConnected || el.textContent !== last) { return; }        // đã bị thay/gỡ → dừng, không ghi đè
        const p = Math.max(0, Math.min(1, (now - t0) / dur));
        const v = p >= 1 ? to : Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        last = fmt(v);
        el.textContent = last;
        if (p < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    } catch (e) { if (el) el.textContent = to; }
  }

  /* — Câu đố — */

  function wrongFlash() {
    try {
      const el = document.createElement('div');
      el.className = 'nf-wrong-flash';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      const a = el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
      a.onfinish = () => el.remove();
      setTimeout(() => el.remove(), 700);
      if (navigator.vibrate) navigator.vibrate(70);
    } catch (e) { /* bỏ qua */ }
  }

  function comboChip(streak, host) {
    const c = center(host);
    if (!c) return;
    const r = host.getBoundingClientRect();
    floatText(`🔥 Combo ×${streak}`, Math.min(window.innerWidth - 70, Math.max(70, c.x)), r.top + 26, 'nf-combo');
  }

  /**
   * Gọi ngay SAU khi thẻ câu đố đã dựng lại với đáp án.
   * o: { correct, gained, streak, root }  — root = phần tử chứa câu đố
   */
  function quizFeedback(o) {
    try {
      if (reduced() || !o) return;
      const host = o.root || document;
      const good = host.querySelector('.quiz-option--correct');
      const c = center(good);
      if (!c) return;
      if (o.correct) {
        burst(c.x, c.y);
        if ((o.streak || 0) >= 3) setTimeout(() => burst(c.x + 46, c.y - 22), 150);
        if ((o.streak || 0) >= 5) setTimeout(() => burst(c.x - 46, c.y + 12), 300);
        if (o.gained) floatText(`+${o.gained} điểm`, c.x, c.y - 8, 'nf-float--good');
        if ((o.streak || 0) >= 2) setTimeout(() => comboChip(o.streak, host.closest ? (host.closest('.card') || host) : host), 260);
      } else {
        wrongFlash();
        good.classList.add('nf-reveal');            // đáp án đúng nhấp nháy viền để bạn thấy ngay
        setTimeout(() => good.classList.remove('nf-reveal'), 2200);
      }
    } catch (e) { console.warn('[NF_Fx] quizFeedback:', e); }
  }

  /** Xong lượt 5 câu: 5/5 → pháo hoa nhiều điểm; còn lại → 1 lần nổ nhẹ */
  function quizFinished(o) {
    try {
      if (reduced() || !o) return;
      const host = o.root && o.root.closest ? (o.root.closest('.card') || o.root) : o.root;
      const r = host && host.getBoundingClientRect ? host.getBoundingClientRect() : null;
      const cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      const cy = r ? r.top + Math.min(r.height / 2, 200) : window.innerHeight / 2;
      if (o.total && o.score === o.total) {
        [[0, 0], [180, -60], [340, 70], [520, -30], [700, 40]].forEach(([d, dx], i) => setTimeout(() => burst(cx + dx * (i % 2 ? 1 : -1) * 0.6, cy + (i % 3) * 22 - 20), d));
        floatText('Hoàn hảo! 🎓', cx, cy - 20, 'nf-combo');
      } else if (o.total) {
        burst(cx, cy);
        floatText(`${o.score}/${o.total} câu đúng`, cx, cy - 10, 'nf-float--good');
      }
    } catch (e) { /* bỏ qua */ }
  }

  /* ─── Khởi tạo ─── */

  function syncRoute() {
    document.documentElement.dataset.nfRoute = ((window.location.hash || '#home').split('?')[0] || '#home').slice(1);
  }

  function init() {
    try {
      syncRoute();
      window.addEventListener('hashchange', syncRoute);
      document.addEventListener('pointerdown', onPointerDown, { passive: true });
      // Ghi món từ BẤT KỲ nguồn nào (tra cứu, camera, thủ công, kế hoạch AI) đều phát 'nf:diary' → chip +kcal bay tới nhật ký
      window.addEventListener('nf:diary', (e) => {
        const d = (e && e.detail) || {};
        if (d.action === 'add' && d.entry) celebrateEntry(Math.round(Number(d.entry.calories) || 0));
      });

      // Đổi giao diện (cấp lên / chọn thủ công / xem thử) → dựng lại cảnh nền tương ứng
      new MutationObserver(scheduleRebuild).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nf-realm'] });

      // Người dùng bật/tắt "Reduce motion" giữa chừng · xoay màn hình / đổi cỡ cửa sổ qua ngưỡng "nhỏ"
      const m = mq('(prefers-reduced-motion: reduce)');
      if (m.addEventListener) m.addEventListener('change', buildScene);
      let wasSmall = isSmall();
      window.addEventListener('resize', () => { const now = isSmall(); if (now !== wasSmall) { wasSmall = now; scheduleRebuild(); } });

      // Tab bị ẩn → tạm dừng hiệu ứng (đỡ tốn pin)
      document.addEventListener('visibilitychange', () => {
        if (scene) scene.classList.toggle('is-paused', document.hidden);
        if (layer) layer.classList.toggle('is-paused', document.hidden);
      });

      buildScene();
    } catch (e) { console.warn('[NF_Fx] init:', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { enhancePage, burst, lookChanged, rebuild: buildScene, pop, floatText, celebrateEntry, entryFlightMs, tweenNumber, quizFeedback, quizFinished };
})();
