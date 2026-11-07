/**
 * NutriFuture — Lookup Page (Tra cứu Dinh Dưỡng AI)
 * Tra cứu thông tin calo, macro, vi chất và lời khuyên dinh dưỡng bằng Gemini Text API
 */
const NF_PageLookup = (() => {
  'use strict';

  let currentResult = null;
  let savedKey = null; // món vừa lưu vào nhật ký (để không cho lưu trùng khi giao diện vẽ lại)
  let currentPortionId = 'm'; // reset mỗi lần tra món mới (xem doSearch)

  function render(container) {
    currentResult = null;
    const fullHistory = NF_Storage.getLookupHistory();
    const history = fullHistory.slice(0, 3); // Chỉ hiển thị 3 kết quả gần nhất
    const hasApiKey = NF_Gemini.isConfigured();

    const popularChips = [
      'Phở bò tái',
      'Cơm tấm sườn bì',
      'Bánh mì kẹp thịt',
      'Bún chả Hà Nội',
      'Canh chua cá lóc',
      'Trà sữa trân châu',
      'Trứng ốp la 2 quả',
      'Sữa tươi 200ml'
    ];

    container.innerHTML = `
      <div class="page page--lookup">
        <div class="page__header">
          <div class="section-label">Cơ sở Dữ liệu Tri thức AI</div>
          <h1 class="page-title">Tra cứu Dinh dưỡng</h1>
          <p class="text-sm text-muted">Hỏi AI thành phần dinh dưỡng chuẩn xác của mọi món ăn Việt Nam</p>
        </div>

        <div class="page__body">
          ${!hasApiKey ? `
            <div class="card setup-card" style="margin-bottom:var(--sp-4);">
              <div class="setup-card__icon"><i class="fa-solid fa-key" style="color:var(--amber-600);"></i></div>
              <h3 class="setup-card__title">Cần Google Gemini API Key</h3>
              <p class="setup-card__desc">
                Tính năng tra cứu cần API Key để kết nối với Gemini AI.
              </p>
              <button class="btn btn--primary" id="btn-quick-config-lookup">
                <i class="fa-solid fa-gear"></i> Nhập API Key ngay
              </button>
            </div>
          ` : ''}

          <!-- Grid Layout -->
          <div class="grid-2-desktop">
            <!-- Cột trái: Tìm kiếm & Kết quả -->
            <div style="display:flex; flex-direction:column; gap:var(--sp-4);">
              <!-- Search Bar -->
          <div class="card" style="padding:var(--sp-3);">
            <form id="form-search-food" class="search-bar" onsubmit="return false;">
              <i class="fa-solid fa-magnifying-glass search-bar__icon"></i>
              <input 
                type="text" 
                id="input-food-query" 
                class="search-bar__input" 
                placeholder="Nhập tên món ăn (vd: Phở bò, Cơm gà...)" 
                autocomplete="off"
              />
              <button type="submit" class="search-bar__btn" id="btn-submit-search">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Tra cứu
              </button>
            </form>

            <!-- Popular Suggestion Chips -->
            <div style="margin-top:var(--sp-3);">
              <div class="card__label">GỢI Ý TÌM KIẾM NHANH</div>
              <div style="display:flex; flex-wrap:wrap; gap:var(--sp-2); margin-top:0.25rem;">
                ${popularChips.map(chip => `
                  <button type="button" class="tag tag--primary chip-btn" data-query="${chip}" style="cursor:pointer; border:none; padding:0.25rem 0.625rem;">
                    ${chip}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Result Container -->
          <div id="lookup-result-area"></div>

            </div> <!-- Close left column -->

            <!-- Cột phải: Lịch sử -->
            <div style="display:flex; flex-direction:column; gap:var(--sp-4);">
              <!-- History Section -->
              <div class="card" id="lookup-history-section">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-3);">
              <div class="section-label" style="margin-bottom:0;">LỊCH SỬ TRA CỨU (3 GẦN NHẤT)</div>
              ${history.length > 0 ? `
                <button class="btn btn--outline btn--sm" id="btn-clear-history" style="font-size:var(--fs-xs); padding:0.125rem 0.5rem;">
                  <i class="fa-solid fa-trash-can"></i> Xóa lịch sử
                </button>
              ` : ''}
            </div>

            <div id="lookup-history-list" class="lookup-history">
              ${history.length > 0 ? history.map((item, idx) => `
                <div class="lookup-history__item is-interactive" data-idx="${idx}">
                  <div>
                    <div style="font-weight:700; color:var(--slate-900);">${NF_UI.escapeHtml(item.name)}</div>
                    <div class="text-xs text-muted">${NF_UI.escapeHtml(item.serving || '1 phần')} • ${NF_UI.escapeHtml(item.foodGroup || 'Dinh dưỡng')}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:800; color:var(--primary-700);">${NF_UI.num(item.calories)} kcal</div>
                    <span class="text-xs text-muted"><i class="fa-solid fa-chevron-right"></i></span>
                  </div>
                </div>
              `).join('') : `
                <div style="text-align:center; padding:var(--sp-4) 0; color:var(--slate-400);">
                  <p class="text-xs">Chưa có lịch sử tra cứu nào.</p>
                </div>
              `}
            </div>
              </div>
            </div> <!-- Close right column -->
          </div> <!-- Close grid-2-desktop -->
        </div>
      </div>
    `;

    setupEvents(container, history);
  }

  function setupEvents(container, history) {
    const form = container.querySelector('#form-search-food');
    const input = container.querySelector('#input-food-query');
    const btnSubmit = container.querySelector('#btn-submit-search');
    const resultArea = container.querySelector('#lookup-result-area');
    const chips = container.querySelectorAll('.chip-btn');
    const historyItems = container.querySelectorAll('.lookup-history__item');
    const btnClearHistory = container.querySelector('#btn-clear-history');
    const btnQuickConfig = container.querySelector('#btn-quick-config-lookup');

    if (btnQuickConfig) {
      btnQuickConfig.onclick = NF_PageCamera.showApiKeyModal;
    }

    // Chống bấm liên tiếp: khóa ô nhập + chip khi đang tra, và bỏ qua kết quả của lượt tra đã cũ
    let searching = false;
    let token = 0;

    const setBusy = (busy) => {
      searching = busy;
      input.disabled = busy;
      chips.forEach((c) => { c.disabled = busy; });
      if (busy) NF_UI.showInlineLoading(btnSubmit, 'Đang tra…');
      else NF_UI.hideInlineLoading(btnSubmit);
    };

    /** Món có trong CSDL: số liệu LẤY TỪ CSDL (không bao giờ bị AI ghi đè), AI chỉ bổ sung nhận xét. */
    const dbBase = (hit) => ({
      name: hit.name,
      serving: hit.serving,
      calories: hit.calories,
      protein: hit.protein,
      fat: hit.fat,
      carb: hit.carb,
      fiber: null,
      vitamins: [],
      minerals: [],
      foodGroup: hit.group,
      tags: [...hit.tags],
      advice: '',
      source: 'lookup',
      dataSource: 'db',
    });

    const applyComment = (data, extra) => {
      if (!extra) return data;
      // Chỉ nhận 4 trường nhận xét — số calo/đạm/béo/carb từ AI (nếu có) bị bỏ hoàn toàn
      return {
        ...data,
        advice: extra.advice || '',
        fiber: extra.fiber == null ? data.fiber : extra.fiber,
        vitamins: extra.vitamins || [],
        minerals: extra.minerals || [],
      };
    };

    const doSearch = async (query) => {
      if (searching) return;
      const q = (query || input.value || '').trim();
      if (!q) {
        NF_UI.showToast('Vui lòng nhập tên món ăn cần tra cứu', 'warning');
        return;
      }

      const hit = NF_Foods.find(q);

      // Món trong CSDL không cần API key để hiện số liệu; chỉ món ngoài CSDL mới cần
      if (!hit && !NF_Gemini.isConfigured()) {
        NF_PageCamera.showApiKeyModal();
        return;
      }

      const myToken = ++token;
      input.value = q;
      savedKey = null;
      setBusy(true);

      if (!hit) {
        resultArea.innerHTML = `
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <p class="loading-text">Gemini AI đang tra cứu dữ liệu dinh dưỡng cho "${NF_UI.escapeHtml(q)}"...</p>
          </div>
        `;
      }

      currentPortionId = 'm'; // món mới → về lại khẩu phần Vừa mặc định

      try {
        let data;
        if (hit) {
          data = dbBase(hit);
          // Dùng nhận xét đã lưu nếu có (hiện ngay, kể cả offline), rồi mới hỏi AI nếu chưa có
          const cached = NF_Gemini.getCachedComment(hit);
          if (cached) data = applyComment(data, cached);
        } else {
          data = await NF_Gemini.searchFood(q);
        }
        if (myToken !== token) return;

        currentResult = data;
        renderResult(resultArea, data, { commentPending: !!hit && !data.advice && NF_Gemini.isConfigured() });
        NF_Storage.addLookupHistory(data);
        NF_UI.showToast(`Đã tìm thấy thông tin cho "${NF_UI.escapeHtml(data.name)}"`, 'success');
        setBusy(false);

        // Nhận xét AI cho món CSDL: chạy nền, lỗi/hết quota thì chỉ đơn giản là không có ô "Lời khuyên"
        if (hit && !data.advice && NF_Gemini.isConfigured()) {
          try {
            const extra = await NF_Gemini.commentOnFood(hit);
            if (myToken === token) {
              currentResult = applyComment(currentResult, extra);
              renderResult(resultArea, currentResult, { noAnim: true });
              NF_Storage.updateLatestLookup(currentResult);
            }
          } catch (aiErr) {
            console.warn('[Lookup] Không lấy được nhận xét AI, vẫn hiển thị số liệu CSDL:', aiErr);
            if (myToken === token) renderResult(resultArea, currentResult, { noAnim: true });
          }
        }
      } catch (err) {
        if (myToken !== token) return;
        console.error('Search error:', err);
        setBusy(false);
        const msg = NF_UI.escapeHtml(NF_Gemini.getErrorMessage(err));
        resultArea.innerHTML = `
          <div class="advice-box advice-box--warning" style="margin-top:var(--sp-3);">
            <div style="font-weight:700; margin-bottom:var(--sp-1);">
              <i class="fa-solid fa-triangle-exclamation"></i> Không thể tra cứu món ăn
            </div>
            <p>${msg}</p>
            <div style="margin-top:var(--sp-3);">
              <button class="btn btn--outline btn--sm" id="btn-retry-search">
                <i class="fa-solid fa-rotate-right"></i> Thử lại
              </button>
            </div>
          </div>
        `;
        const retryBtn = resultArea.querySelector('#btn-retry-search');
        if (retryBtn) retryBtn.onclick = () => doSearch(q);
      }
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      doSearch();
    };

    chips.forEach(chip => {
      chip.onclick = () => {
        const q = chip.dataset.query;
        doSearch(q);
      };
    });

    historyItems.forEach(item => {
      item.onclick = () => {
        const idx = parseInt(item.dataset.idx, 10);
        if (history[idx]) {
          currentResult = history[idx];
          savedKey = null;
          currentPortionId = 'm';
          renderResult(resultArea, history[idx], {});
          // Scroll smoothly to result
          resultArea.scrollIntoView({ behavior: 'smooth' });
        }
      };
    });

    if (btnClearHistory) {
      btnClearHistory.onclick = async () => {
        const confirmed = await NF_UI.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử tra cứu?');
        if (confirmed) {
          localStorage.removeItem('nf_lookup_history');
          render(container);
          NF_UI.showToast('Đã xóa lịch sử tra cứu', 'info');
        }
      };
    }
  }

  function renderResult(targetEl, data, opts = {}) {
    const hour = new Date().getHours();
    let defaultMeal = 'Bữa Trưa';
    if (hour >= 5 && hour < 10) defaultMeal = 'Bữa Sáng';
    else if (hour >= 10 && hour < 14) defaultMeal = 'Bữa Trưa';
    else if (hour >= 14 && hour < 17) defaultMeal = 'Bữa Phụ';
    else defaultMeal = 'Bữa Tối';

    const n = NF_UI.num;
    const esc = NF_UI.escapeHtml;
    const isDb = data.dataSource === 'db';
    const badgeText = isDb
      ? (data.advice ? 'Dữ liệu chuẩn + nhận xét AI' : 'Dữ liệu chuẩn')
      : 'Dữ liệu Gemini AI';
    const badgeIcon = isDb && !data.advice ? 'fa-circle-check' : 'fa-wand-magic-sparkles';
    const vit = Array.isArray(data.vitamins) ? data.vitamins : [];
    const min = Array.isArray(data.minerals) ? data.minerals : [];
    const key = `${data.name}|${data.serving}`;
    const alreadySaved = savedKey === key;

    const portions = NF_Nutrition.PORTION_SIZES;
    const mult = NF_Nutrition.getPortionMultiplier(currentPortionId);
    const scaled = NF_Nutrition.scalePortion(data, mult);
    const fiberText = (scaled.fiber === null || scaled.fiber === undefined) ? '—' : `${n(scaled.fiber)}g`;
    // Đối chiếu dị ứng: món CSDL khớp theo từ khóa tên; món AI còn có containsAllergens do AI tự nhận diện
    const allergyWarnings = NF_Nutrition.crossCheckAllergyWarning(data, NF_Nutrition.getUserAllergyIds());

    // Thẻ kết quả chỉ mờ dần (không trượt) để không "giật" khi thay khối loading
    targetEl.innerHTML = `
      <div class="result-card ${opts.noAnim ? '' : 'result-card--fade'}" style="margin-top:var(--sp-3);">
        ${allergyWarnings.length ? `
          <div class="advice-box advice-box--warning" style="margin-bottom:var(--sp-3); border-color:var(--rose-200); background:var(--rose-50);">
            <div style="font-weight:800; color:var(--rose-700); margin-bottom:0.25rem;">
              <i class="fa-solid fa-triangle-exclamation"></i> Cảnh báo dị ứng (ước tính)
            </div>
            <p style="color:var(--rose-700); margin:0;">
              Món này có thể chứa: <strong>${esc(allergyWarnings.map((w) => w.label).join(', '))}</strong> —
              trùng với hồ sơ dị ứng của bạn. Đây là cảnh báo AI ước tính, hãy tự kiểm tra thành phần thật trước khi ăn.
            </p>
          </div>
        ` : ''}

        <div class="result-card__header">
          <div>
            <span class="result-card__badge" style="background:var(--sky-50); color:var(--sky-700); border-color:var(--sky-200);">
              <i class="fa-solid ${badgeIcon}"></i> ${badgeText}
            </span>
            <h2 class="result-card__name" style="margin-top:0.25rem;">${esc(data.name)}</h2>
            <div class="result-card__serving">
              <i class="fa-solid fa-bowl-food"></i> Khẩu phần chuẩn: ${esc(data.serving)}
            </div>
          </div>
          <div style="text-align:right;">
            <div class="result-card__calories">${n(scaled.calories)}</div>
            <span class="result-card__cal-unit">kcal / phần</span>
          </div>
        </div>

        <!-- Size khẩu phần thật: S=70% / M=100% / L=130% so với khẩu phần chuẩn -->
        <div style="margin-bottom:var(--sp-3);">
          <div class="text-xs text-muted" style="margin-bottom:0.25rem;">Chọn cỡ bát/tô thực tế của bạn:</div>
          <div class="portion-toggle" style="display:flex; gap:var(--sp-2);">
            ${portions.map((p) => `
              <button type="button" class="btn ${p.id === currentPortionId ? 'btn--primary' : 'btn--outline'} btn--sm portion-btn" data-portion-id="${p.id}" style="flex:1;">
                ${p.label} (${p.shortLabel})
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Nutrient Grid -->
        <div class="nutrient-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:var(--sp-3);">
          <div class="nutrient-box">
            <div class="nutrient-box__label">Carb</div>
            <div class="nutrient-box__value" style="color:var(--sky-600);">${n(scaled.carb)}g</div>
          </div>
          <div class="nutrient-box">
            <div class="nutrient-box__label">Protein</div>
            <div class="nutrient-box__value" style="color:var(--primary-600);">${n(scaled.protein)}g</div>
          </div>
          <div class="nutrient-box">
            <div class="nutrient-box__label">Fat</div>
            <div class="nutrient-box__value" style="color:var(--amber-600);">${n(scaled.fat)}g</div>
          </div>
          <div class="nutrient-box">
            <div class="nutrient-box__label">Chất xơ</div>
            <div class="nutrient-box__value" style="color:var(--primary-700);">${fiberText}</div>
          </div>
        </div>

        <!-- Details -->
        <div style="display:flex; flex-direction:column; gap:var(--sp-2); margin-bottom:var(--sp-3);">
          ${data.foodGroup ? `
            <div class="text-xs text-muted">
              <strong>Nhóm thực phẩm:</strong> ${esc(data.foodGroup)}
            </div>
          ` : ''}

          ${vit.length > 0 || min.length > 0 ? `
            <div class="micro-info">
              <i class="fa-solid fa-apple-whole"></i>
              ${vit.length ? `<strong>Vitamin:</strong> ${esc(vit.join(', '))}. ` : ''}
              ${min.length ? `<strong>Khoáng chất:</strong> ${esc(min.join(', '))}.` : ''}
            </div>
          ` : ''}

          ${data.advice ? `
            <div class="advice-box advice-box--success">
              <i class="fa-solid fa-lightbulb"></i>
              <strong>Lời khuyên cho học sinh:</strong> ${esc(data.advice)}
            </div>
          ` : (opts.commentPending ? `
            <div class="text-xs text-muted"><i class="fa-solid fa-spinner fa-spin"></i> AI đang viết nhận xét…</div>
          ` : '')}
        </div>

        <!-- Save Action -->
        <div class="card card--glass" style="background:var(--white); border:1px solid var(--slate-200); padding:var(--sp-3);">
          <div style="font-weight:700; font-size:var(--fs-sm); margin-bottom:var(--sp-2);">
            Lưu món ăn này vào nhật ký hôm nay
          </div>
          <div style="display:flex; gap:var(--sp-2); align-items:center;">
            <select id="lookup-meal-select" class="search-bar__input" style="padding:0.5rem var(--sp-2); width:auto; flex:1;">
              <option value="Bữa Sáng" ${defaultMeal === 'Bữa Sáng' ? 'selected' : ''}>🌅 Bữa Sáng</option>
              <option value="Bữa Trưa" ${defaultMeal === 'Bữa Trưa' ? 'selected' : ''}>☀️ Bữa Trưa</option>
              <option value="Bữa Tối" ${defaultMeal === 'Bữa Tối' ? 'selected' : ''}>🌙 Bữa Tối</option>
              <option value="Bữa Phụ" ${defaultMeal === 'Bữa Phụ' ? 'selected' : ''}>🍎 Bữa Phụ</option>
            </select>
            <button class="btn btn--primary" id="btn-save-lookup-diary" style="white-space:nowrap;" ${alreadySaved ? 'disabled' : ''}>
              ${alreadySaved ? '<i class="fa-solid fa-check"></i> Đã lưu' : '<i class="fa-solid fa-bookmark"></i> Lưu vào nhật ký'}
            </button>
          </div>
        </div>
      </div>
    `;

    // Số kcal đếm lên (chỉ lần hiển thị đầu; lần vẽ lại khi nhận xét AI đến thì không lặp hiệu ứng)
    if (!opts.noAnim) {
      NF_UI.animateNumber(targetEl.querySelector('.result-card__calories'), 0, scaled.calories, 600);
    }

    targetEl.querySelectorAll('.portion-btn').forEach((btn) => {
      btn.onclick = () => {
        currentPortionId = btn.dataset.portionId;
        renderResult(targetEl, data, { noAnim: true }); // vẽ lại với khẩu phần mới, giữ nguyên data gốc
      };
    });

    const btnSave = targetEl.querySelector('#btn-save-lookup-diary');
    const mealSelect = targetEl.querySelector('#lookup-meal-select');

    if (btnSave && !alreadySaved) {
      btnSave.onclick = () => {
        const mealType = mealSelect ? mealSelect.value : 'Bữa ăn';
        const entry = {
          name: data.name,
          serving: data.serving,
          calories: scaled.calories,
          protein: scaled.protein,
          fat: scaled.fat,
          carb: scaled.carb,
          fiber: scaled.fiber,
          tags: Array.isArray(data.tags) ? data.tags.filter((t) => t === 'veg' || t === 'fruit') : [],
          mealType: mealType,
          source: 'lookup',
          time: NF_UI.getTimeNow(),
        };

        NF_Storage.addDiaryEntry(entry, NF_Storage.getToday());
        savedKey = key;
        NF_UI.showToast(`Đã lưu "${esc(data.name)}" vào ${mealType} hôm nay!`, 'success');
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-check"></i> Đã lưu';
      };
    }
  }

  return {
    render
  };
})();
