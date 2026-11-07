/**
 * NutriFuture — Home Page (Trang chủ)
 * Dashboard tổng quan dinh dưỡng hàng ngày cho học sinh THPT.
 *
 * Thứ tự bố cục có chủ đích (ưu tiên giảm dần):
 *  1. Trạng thái hôm nay (calo) — thông tin quan trọng nhất, xem là biết ngay
 *  2. Hành động chính (Camera AI / Tra cứu / Nhật ký / Lịch sử) — bước tiếp theo
 *  3. Nhật ký gần đây — xem lại nhanh
 *  cột phụ: Chỉ số cá nhân (BMI/TDEE/Nước) + Nhắc uống nước + Lời khuyên khoa học
 */
const NF_PageHome = (() => {
  'use strict';

  function render(container) {
    const profile = NF_Storage.getProfile();
    const todayStr = NF_Storage.getToday();
    const summary = NF_Storage.getDiarySummary(todayStr);
    const hasProfile = !!(profile && profile.tdee);

    const tdee = hasProfile ? profile.tdee : 2000;
    const consumedCal = summary.totalCalories || 0;
    const calPercent = Math.min(Math.round((consumedCal / tdee) * 100), 100);

    const waterTarget = hasProfile ? profile.waterMl : 2000;
    const waterConsumed = summary.waterMl || 0;
    const waterPercent = Math.min(Math.round((waterConsumed / waterTarget) * 100), 100);

    let profilePromptHtml = '';
    if (!hasProfile) {
      profilePromptHtml = `
        <div class="card setup-card" style="margin-bottom: var(--sp-4);">
          <div class="setup-card__icon">👋</div>
          <h3 class="setup-card__title">Chào mừng bạn đến với NutriFuture!</h3>
          <p class="setup-card__desc">
            Ứng dụng khoa học giúp học sinh THPT theo dõi dinh dưỡng và nhận tư vấn từ AI Gemini.
            Hãy nhập chỉ số thể trạng để máy tính toán TDEE và nhu cầu calo chính xác cho bạn.
          </p>
          <a href="#profile" class="btn btn--primary" style="display:inline-flex; align-items:center; gap:var(--sp-2);">
            <i class="fa-solid fa-user-pen"></i> Thiết lập hồ sơ cá nhân
          </a>
        </div>
      `;
    }

    const bmiInfo = hasProfile ? NF_UI.getBMIClass(profile.bmi) : null;

    // Tóm tắt điểm/chuỗi ngày cho thẻ "Học mà chơi" (chỉ đọc, không tốn quota)
    let gameLine = 'Đố vui dinh dưỡng, tích điểm và nhận huy hiệu';
    try {
      if (typeof NF_Game !== 'undefined' && NF_Game) {
        const g = NF_Game.getSummary();
        gameLine = `⭐ ${NF_UI.formatNumber(g.points)} điểm • 🔥 ${g.streak} ngày liên tục`;
      }
    } catch (e) { /* không để lỗi game làm hỏng trang chủ */ }

    container.innerHTML = `
      <div class="page page--home">
        <!-- Hero Title -->
        <div class="page__header">
          <div class="section-label">Đề tài KHKT Dinh Dưỡng Học Đường</div>
          <h1 class="page-title">NutriFuture AI</h1>
          <p class="text-sm text-muted">Trợ lý phân tích dinh dưỡng thông minh cho học sinh THPT</p>
        </div>

        <div class="page__body">
          ${profilePromptHtml}

          <div class="home-layout">
            <!-- Cột chính: Trạng thái hôm nay -> Hành động chính -> Nhật ký gần đây -->
            <div class="home-layout__main">

              <!-- 1. Calorie Overview Card (quan trọng nhất) -->
              <div class="card card--glass">
                <div class="card__label">Tổng quan năng lượng • ${NF_UI.formatDate(todayStr)}</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:var(--sp-2); flex-wrap:wrap; gap:var(--sp-2);">
                  <div>
                    <span class="stat-card__value" id="home-cal-val">${NF_UI.formatNumber(consumedCal)}</span>
                    <span class="stat-card__unit">/ ${NF_UI.formatNumber(tdee)} kcal</span>
                  </div>
                  <span class="tag ${consumedCal > tdee ? 'tag--amber' : 'tag--primary'}">
                    ${calPercent}% mục tiêu
                  </span>
                </div>
                <div class="progress-bar" style="margin-bottom:var(--sp-3);">
                  <div class="progress-bar__fill" style="width: ${calPercent}%;"></div>
                </div>

                <!-- Macro split mini -->
                <div class="nutrient-grid">
                  <div class="nutrient-box">
                    <span class="nutrient-box__label">Carb</span>
                    <div class="nutrient-box__value" style="color:var(--sky-600);">${summary.totalCarb}g</div>
                  </div>
                  <div class="nutrient-box">
                    <span class="nutrient-box__label">Protein</span>
                    <div class="nutrient-box__value" style="color:var(--primary-600);">${summary.totalProtein}g</div>
                  </div>
                  <div class="nutrient-box">
                    <span class="nutrient-box__label">Fat</span>
                    <div class="nutrient-box__value" style="color:var(--amber-600);">${summary.totalFat}g</div>
                  </div>
                </div>
              </div>

              <!-- 2. Quick Action Grid (hành động chính, ngay sau trạng thái) -->
              <div>
                <div class="section-label" style="margin-bottom:var(--sp-2);">TÍNH NĂNG CHÍNH</div>
                <div class="quick-grid">
                  <div class="quick-card quick-card--wide" onclick="location.hash='#game'">
                    <div style="display:flex; align-items:center; gap:var(--sp-3);">
                      <div class="quick-card__icon" style="background:var(--green-100); color:var(--green-700); margin-bottom:0; flex:0 0 auto;">
                        <i class="fa-solid fa-gamepad"></i>
                      </div>
                      <div style="min-width:0;">
                        <div class="quick-card__title" style="margin-bottom:0.15rem;">Học mà chơi</div>
                        <div class="quick-card__desc">${gameLine}</div>
                      </div>
                    </div>
                  </div>

                  <div class="quick-card" onclick="location.hash='#camera'">
                    <div class="quick-card__icon" style="background:var(--primary-100); color:var(--primary-700);">
                      <i class="fa-solid fa-camera-retro"></i>
                    </div>
                    <div class="quick-card__title">Camera AI</div>
                    <div class="quick-card__desc">Chụp ảnh món ăn để AI nhận diện khẩu phần & calo</div>
                  </div>

                  <div class="quick-card" onclick="location.hash='#lookup'">
                    <div class="quick-card__icon" style="background:var(--sky-100); color:var(--sky-700);">
                      <i class="fa-solid fa-magnifying-glass"></i>
                    </div>
                    <div class="quick-card__title">Tra cứu AI</div>
                    <div class="quick-card__desc">Tìm kiếm thành phần dinh dưỡng của mọi món ăn Việt</div>
                  </div>

                  <div class="quick-card" onclick="location.hash='#diary'">
                    <div class="quick-card__icon" style="background:var(--amber-100); color:var(--amber-700);">
                      <i class="fa-solid fa-book-open"></i>
                    </div>
                    <div class="quick-card__title">Nhật ký bữa ăn</div>
                    <div class="quick-card__desc">Ghi nhận khẩu phần và theo dõi biểu đồ dinh dưỡng</div>
                  </div>

                  <div class="quick-card" onclick="location.hash='#history'">
                    <div class="quick-card__icon" style="background:var(--purple-50); color:var(--purple-500);">
                      <i class="fa-solid fa-chart-line"></i>
                    </div>
                    <div class="quick-card__title">Lịch sử & Báo cáo</div>
                    <div class="quick-card__desc">Xem thống kê nhiều ngày và sao lưu dữ liệu JSON</div>
                  </div>
                </div>
              </div>

              <!-- 3. Recent meals today preview -->
              <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-3); gap:var(--sp-2); flex-wrap:wrap;">
                  <div class="section-label" style="margin-bottom:0;">MÓN ĂN ĐÃ GHI HÔM NAY (${summary.count})</div>
                  <a href="#diary" class="text-xs text-bold" style="color:var(--primary-600); white-space:nowrap;">Xem tất cả <i class="fa-solid fa-angle-right"></i></a>
                </div>

                <div id="home-today-meals">
                  ${summary.entries && summary.entries.length > 0 ? `
                    <div style="display:flex; flex-direction:column; gap:var(--sp-2);">
                      ${summary.entries.slice(-3).reverse().map(item => `
                        <div class="diary-entry" style="padding:var(--sp-2) var(--sp-3);">
                          <div class="diary-entry__info">
                            <div class="diary-entry__name">${NF_UI.escapeHtml(item.name)}</div>
                            <div class="diary-entry__meta">
                              <span class="diary-entry__meal-tag">${NF_UI.getMealIcon(item.mealType)} ${item.mealType || 'Bữa ăn'}</span>
                              <span>${NF_UI.escapeHtml(item.serving || '')}</span>
                            </div>
                          </div>
                          <div class="diary-entry__cal">${item.calories} kcal</div>
                        </div>
                      `).join('')}
                    </div>
                  ` : `
                    <div style="text-align:center; padding:var(--sp-4) 0; color:var(--slate-400);">
                      <i class="fa-solid fa-utensils" style="font-size:1.5rem; margin-bottom:var(--sp-2); display:block; opacity:0.6;"></i>
                      <p class="text-xs">Chưa có món ăn nào trong hôm nay.<br>Hãy dùng Camera AI hoặc Tra cứu để thêm!</p>
                    </div>
                  `}
                </div>
              </div>
            </div>

            <!-- Cột phụ: Chỉ số cá nhân -> Nhắc uống nước -> Lời khuyên -->
            <div class="home-layout__side">
              ${hasProfile ? `
                <div class="metric-grid metric-grid--stack">
                  <div class="metric-card metric-card--bmi">
                    <div class="metric-card__label">Chỉ số BMI</div>
                    <div class="metric-card__value">${profile.bmi}</div>
                    <div class="metric-card__extra">
                      <span class="bmi-badge bmi-badge--${bmiInfo.color}">${bmiInfo.label}</span>
                    </div>
                  </div>
                  <div class="metric-card metric-card--tdee">
                    <div class="metric-card__label">TDEE Khuyến nghị</div>
                    <div class="metric-card__value">${profile.tdee}</div>
                    <div class="metric-card__extra" style="color:var(--amber-700);">kcal / ngày</div>
                  </div>
                  <div class="metric-card metric-card--water">
                    <div class="metric-card__label">Mục tiêu Nước</div>
                    <div class="metric-card__value">${(profile.waterMl / 1000).toFixed(1)}</div>
                    <div class="metric-card__extra" style="color:var(--sky-700);">Lít / ngày</div>
                  </div>
                </div>
              ` : ''}

              <!-- Water Tracker Card -->
              <div class="water-tracker">
                <div style="font-size:1.75rem; color:var(--sky-500);"><i class="fa-solid fa-droplet"></i></div>
                <div class="water-tracker__info">
                  <div class="card__label" style="color:var(--sky-700); margin-bottom:0;">NƯỚC UỐNG HÔM NAY</div>
                  <div class="water-tracker__value">
                    <span id="home-water-val">${waterConsumed}</span> <span class="text-xs text-muted">/ ${waterTarget} ml</span>
                  </div>
                  <div class="progress-bar" style="margin-top:0.25rem; height:0.25rem; background:var(--sky-100);">
                    <div class="progress-bar__fill" id="home-water-progress" style="background:var(--sky-500); width:${waterPercent}%;"></div>
                  </div>
                </div>
                <button class="water-tracker__btn" id="btn-add-water" title="Thêm 250ml nước">
                  <i class="fa-solid fa-plus"></i> 250ml
                </button>
              </div>

              <!-- Scientific Note -->
              <div class="advice-box advice-box--info">
                <i class="fa-solid fa-circle-info"></i>
                <strong>Khuyến nghị dinh dưỡng lứa tuổi học đường:</strong>
                Học sinh THPT (15-18 tuổi) cần chế độ dinh dưỡng cân bằng gồm 50-55% năng lượng từ Tinh bột, 15-20% từ Chất đạm và 25-30% từ Chất béo lành mạnh để tối ưu phát triển thể chất và trí não (Viện Dinh Dưỡng Quốc Gia Việt Nam).
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    const waterBtn = container.querySelector('#btn-add-water');
    if (waterBtn) {
      waterBtn.onclick = () => {
        const newWater = NF_Storage.addWater(250, todayStr);
        const waterValEl = container.querySelector('#home-water-val');
        const waterProgEl = container.querySelector('#home-water-progress');
        const reachedGoal = newWater >= waterTarget && (newWater - 250) < waterTarget;
        if (waterValEl) waterValEl.textContent = newWater;
        if (waterProgEl) {
          const pct = Math.min(Math.round((newWater / waterTarget) * 100), 100);
          waterProgEl.style.width = pct + '%';
        }
        // Hiệu ứng "pop" 150 ms bằng CSS (không dùng thư viện)
        waterBtn.classList.remove('pop');
        void waterBtn.offsetWidth;
        waterBtn.classList.add('pop');
        if (reachedGoal) {
          NF_UI.showToast('Tuyệt vời! Bạn đã đạt mục tiêu nước hôm nay 💧🎉', 'success');
        } else {
          NF_UI.showToast(`Đã thêm 250ml nước (+250ml)!`, 'info');
        }
      };
    }
  }

  return {
    render
  };
})();