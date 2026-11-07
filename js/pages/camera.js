/**
 * NutriFuture — Camera AI Page (Toàn màn hình)
 * Nhận diện món ăn thời gian thực qua Camera hoặc Tải ảnh lên bằng Google Gemini Vision API
 */
const NF_PageCamera = (() => {
  'use strict';

  let currentStream = null;
  let capturedBase64 = null;
  let lastAnalysisResult = null;
  let currentFacingMode = 'environment'; // 'environment' = camera sau, 'user' = camera trước

  function stopCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    document.body.classList.remove('camera-active');
  }

  function render(container) {
    // Dừng camera cũ nếu đang chạy
    stopCamera();
    capturedBase64 = null;
    lastAnalysisResult = null;
    currentFacingMode = 'environment';

    // Bật chế độ toàn màn hình: ẩn header/thanh điều hướng
    document.body.classList.add('camera-active');

    const hasApiKey = NF_Gemini.isConfigured();

    container.innerHTML = `
      <div class="page page--camera">
        <div class="camera-stage" id="camera-viewport">
          <video id="camera-video" playsinline autoplay muted style="display:none;"></video>
          <img id="camera-preview" style="display:none;" alt="Captured preview" />

          <!-- Placeholder when camera is inactive -->
          <div class="camera-placeholder" id="camera-placeholder">
            <div class="camera-placeholder__icon">
              <i class="fa-solid fa-camera"></i>
            </div>
            <p>Bật camera hoặc tải ảnh đĩa thức ăn lên để AI phân tích</p>
            ${!hasApiKey ? `
              <button class="btn btn--primary" id="btn-quick-config-api" style="margin-top:var(--sp-3);">
                <i class="fa-solid fa-key"></i> Nhập API Key Gemini
              </button>
            ` : ''}
          </div>

          <!-- Scanning animation overlay -->
          <div class="scanner-overlay hidden" id="scanner-overlay">
            <div class="scanner-overlay__bg"></div>
            <div class="scanner-line"></div>
            <div class="scanner-info">
              <span><i class="fa-solid fa-brain"></i> Gemini Vision đang phân tích...</span>
              <span class="loading-spinner loading-spinner--sm"></span>
            </div>
          </div>

          <!-- Hidden canvas for capture -->
          <canvas id="camera-canvas" style="display:none;"></canvas>

          <!-- Thanh trên: quay lại + tiêu đề + lật camera -->
          <div class="camera-topbar">
            <button class="camera-icon-btn" id="btn-camera-back" title="Quay lại">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="camera-topbar__title">Camera AI</div>
            <button class="camera-icon-btn hidden" id="btn-flip-camera" title="Lật camera trước/sau">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>

          <!-- Thanh dưới: điều khiển nổi trên video -->
          <div class="camera-bottombar" id="camera-controls-start">
            <div class="btn--start-group">
              <button class="camera-btn camera-btn--primary" id="btn-start-camera">
                <i class="fa-solid fa-video"></i> Mở Camera
              </button>
              <button class="camera-btn camera-btn--secondary" id="btn-upload-file">
                <i class="fa-solid fa-image"></i> Tải ảnh lên
              </button>
              <input type="file" id="file-input-image" accept="image/*" style="display:none;" />
            </div>
          </div>

          <div class="camera-bottombar hidden" id="camera-controls-live">
            <button class="camera-icon-btn" id="btn-cancel-camera" title="Hủy">
              <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="shutter-btn" id="btn-capture-shot" title="Chụp ngay" aria-label="Chụp ảnh"></button>
            <button class="camera-icon-btn" id="btn-flip-camera-live" title="Lật camera trước/sau">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>

          <div class="camera-bottombar hidden" id="camera-controls-retake">
            <div class="btn--start-group">
              <button class="camera-btn camera-btn--secondary" id="btn-retake">
                <i class="fa-solid fa-rotate-left"></i> Chụp lại
              </button>
              <button class="camera-btn camera-btn--primary" id="btn-reanalyze">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Phân tích lại
              </button>
            </div>
          </div>

          <!-- Kết quả phân tích: trượt lên như bottom sheet, kính mờ, vuốt để thu gọn -->
          <div class="camera-result-sheet" id="camera-result-container">
            <div class="camera-result-sheet__handle" id="sheet-drag-handle">
              <span class="camera-result-sheet__grip"></span>
              <span class="camera-result-sheet__peek-label" id="sheet-peek-label">Kết quả phân tích AI</span>
              <button class="camera-result-sheet__toggle" id="btn-sheet-toggle" title="Thu gọn / Mở rộng" aria-label="Thu gọn hoặc mở rộng bảng kết quả">
                <i class="fa-solid fa-chevron-down"></i>
              </button>
            </div>
            <div class="camera-result-sheet__body" id="camera-result-body"></div>
          </div>
        </div>
      </div>
    `;

    setupEvents(container);
  }

  function setupEvents(container) {
    const video = container.querySelector('#camera-video');
    const previewImg = container.querySelector('#camera-preview');
    const placeholder = container.querySelector('#camera-placeholder');
    const canvas = container.querySelector('#camera-canvas');
    const scannerOverlay = container.querySelector('#scanner-overlay');

    const controlsStart = container.querySelector('#camera-controls-start');
    const controlsLive = container.querySelector('#camera-controls-live');
    const controlsRetake = container.querySelector('#camera-controls-retake');

    const btnStartCamera = container.querySelector('#btn-start-camera');
    const btnCancelCamera = container.querySelector('#btn-cancel-camera');
    const btnCaptureShot = container.querySelector('#btn-capture-shot');
    const btnUploadFile = container.querySelector('#btn-upload-file');
    const fileInput = container.querySelector('#file-input-image');
    const btnRetake = container.querySelector('#btn-retake');
    const btnReanalyze = container.querySelector('#btn-reanalyze');
    const btnQuickConfig = container.querySelector('#btn-quick-config-api');
    const btnBack = container.querySelector('#btn-camera-back');
    const btnFlipTop = container.querySelector('#btn-flip-camera');
    const btnFlipLive = container.querySelector('#btn-flip-camera-live');

    if (btnQuickConfig) {
      btnQuickConfig.onclick = showApiKeyModal;
    }

    btnBack.onclick = () => { location.hash = '#home'; };

    async function openCamera() {
      try {
        stopCameraStreamOnly();
        placeholder.style.display = 'none';
        previewImg.style.display = 'none';
        video.style.display = 'block';

        const constraints = {
          video: {
            facingMode: { ideal: currentFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        video.srcObject = stream;
        await video.play();

        // Camera trước thường được xem như gương -> lật ngang cho tự nhiên.
        // Camera sau giữ nguyên chiều thật của khung cảnh.
        video.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'none';

        controlsStart.classList.add('hidden');
        controlsLive.classList.remove('hidden');
        controlsRetake.classList.add('hidden');
        btnFlipTop.classList.remove('hidden');
      } catch (err) {
        console.error('Camera error:', err);
        placeholder.style.display = 'flex';
        video.style.display = 'none';
        NF_UI.showToast('Không thể truy cập camera. Hãy cấp quyền hoặc tải ảnh lên từ thư viện.', 'warning');
      }
    }

    function stopCameraStreamOnly() {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
      }
    }

    // Mở Camera stream
    btnStartCamera.onclick = openCamera;

    // Lật camera trước/sau (giữ phiên đang mở)
    const flipCamera = () => {
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      NF_UI.showToast(currentFacingMode === 'user' ? 'Đã chuyển sang camera trước' : 'Đã chuyển sang camera sau', 'info');
      openCamera();
    };
    btnFlipTop.onclick = flipCamera;
    btnFlipLive.onclick = flipCamera;

    // Hủy camera
    btnCancelCamera.onclick = () => {
      stopCameraStreamOnly();
      video.style.display = 'none';
      previewImg.style.display = 'none';
      placeholder.style.display = 'flex';

      controlsStart.classList.remove('hidden');
      controlsLive.classList.add('hidden');
      controlsRetake.classList.add('hidden');
      btnFlipTop.classList.add('hidden');
    };

    // Chụp từ camera
    btnCaptureShot.onclick = () => {
      if (!video.videoWidth || !video.videoHeight) {
        NF_UI.showToast('Camera chưa sẵn sàng. Vui lòng thử lại.', 'warning');
        return;
      }

      // Giới hạn độ phân giải để upload nhanh
      const maxDim = 1024;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // Nếu đang dùng camera trước (đã lật hiển thị), lật lại khi lưu ảnh
      // để ảnh gửi cho AI đúng chiều thật, không bị ngược chữ/ vật thể.
      if (currentFacingMode === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);

      capturedBase64 = canvas.toDataURL('image/jpeg', 0.85);

      // Hiển thị ảnh chụp và dừng camera
      stopCameraStreamOnly();
      video.style.display = 'none';
      previewImg.src = capturedBase64;
      previewImg.style.display = 'block';
      previewImg.style.transform = 'none';

      controlsLive.classList.add('hidden');
      controlsRetake.classList.remove('hidden');
      btnFlipTop.classList.add('hidden');

      // Tự động phân tích
      analyzeCurrentPhoto(container);
    };

    // Tải ảnh từ máy
    btnUploadFile.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Chặn sớm file quá lớn (ảnh RAW/HEIC gốc vài chục MB) TRƯỚC khi đọc vào bộ nhớ
      // qua FileReader — tránh treo trình duyệt trên máy yếu/điện thoại cũ.
      const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
      if (file.size > MAX_UPLOAD_BYTES) {
        NF_UI.showToast(
          `Ảnh quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn ảnh dưới 20MB.`,
          'warning'
        );
        fileInput.value = '';
        return;
      }

      stopCameraStreamOnly();
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          capturedBase64 = canvas.toDataURL('image/jpeg', 0.85);

          placeholder.style.display = 'none';
          video.style.display = 'none';
          previewImg.src = capturedBase64;
          previewImg.style.display = 'block';
          previewImg.style.transform = 'none';

          controlsStart.classList.add('hidden');
          controlsLive.classList.add('hidden');
          controlsRetake.classList.remove('hidden');
          btnFlipTop.classList.add('hidden');

          analyzeCurrentPhoto(container);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };

    // Nút chụp lại
    btnRetake.onclick = () => {
      capturedBase64 = null;
      lastAnalysisResult = null;
      previewImg.style.display = 'none';
      placeholder.style.display = 'flex';

      const sheet = container.querySelector('#camera-result-container');
      const resultBody = container.querySelector('#camera-result-body');
      const peekLabel = container.querySelector('#sheet-peek-label');
      if (sheet) sheet.classList.remove('is-open', 'is-peek');
      if (resultBody) resultBody.innerHTML = '';
      if (peekLabel) peekLabel.textContent = 'Kết quả phân tích AI';

      controlsRetake.classList.add('hidden');
      controlsStart.classList.remove('hidden');
    };

    // Phân tích lại
    btnReanalyze.onclick = () => {
      if (capturedBase64) {
        analyzeCurrentPhoto(container);
      }
    };

    // Kích hoạt vuốt để thu gọn / mở rộng bảng kết quả
    initResultSheetDrag(container);
  }

  async function analyzeCurrentPhoto(container) {
    const scannerOverlay = container.querySelector('#scanner-overlay');
    const sheet = container.querySelector('#camera-result-container');
    const resultBody = container.querySelector('#camera-result-body');
    const peekLabel = container.querySelector('#sheet-peek-label');

    if (!NF_Gemini.isConfigured()) {
      showApiKeyModal();
      return;
    }

    if (!capturedBase64) {
      NF_UI.showToast('Vui lòng chụp hoặc chọn ảnh trước.', 'warning');
      return;
    }

    scannerOverlay.classList.remove('hidden');
    sheet.classList.remove('is-peek');
    if (peekLabel) peekLabel.textContent = 'Đang phân tích...';
    resultBody.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p class="loading-text">Gemini Vision AI đang nhận diện món ăn & ước tính dinh dưỡng...</p>
      </div>
    `;
    requestAnimationFrame(() => sheet.classList.add('is-open'));

    try {
      const data = await NF_Gemini.analyzeImage(capturedBase64);
      // Đối chiếu tên AI nhận diện với CSDL nội bộ: nếu khớp đúng, lấy thêm "đặc sản vùng miền"
      // (số liệu dinh dưỡng vẫn giữ nguyên từ AI vì đây là ước tính từ ảnh thực tế, không phải khẩu phần chuẩn CSDL).
      const dbHit = NF_Foods.find(data.name);
      data.specialty = dbHit ? (dbHit.specialty || '') : '';
      lastAnalysisResult = data;
      scannerOverlay.classList.add('hidden');
      currentPortionId = 'm'; // ảnh mới → về lại khẩu phần Vừa mặc định
      renderResult(resultBody, data);
      if (peekLabel) peekLabel.textContent = `${data.name} • ${data.calories} kcal`;
      NF_UI.showToast(`Đã nhận diện thành công: ${NF_UI.escapeHtml(data.name)}!`, 'success');
    } catch (err) {
      console.error('Analyze error:', err);
      scannerOverlay.classList.add('hidden');
      if (peekLabel) peekLabel.textContent = 'Không thể phân tích ảnh';
      const msg = NF_Gemini.getErrorMessage(err);
      resultBody.innerHTML = `
        <div class="advice-box advice-box--warning">
          <div style="font-weight:700; margin-bottom:var(--sp-1);">
            <i class="fa-solid fa-triangle-exclamation"></i> Không thể phân tích ảnh
          </div>
          <p>${NF_UI.escapeHtml(msg)}</p>
          <div style="margin-top:var(--sp-3); display:flex; gap:var(--sp-2); flex-wrap:wrap;">
            <button class="btn btn--outline btn--sm" id="btn-retry-err">
              <i class="fa-solid fa-rotate-right"></i> Thử lại
            </button>
            <button class="btn btn--outline btn--sm" id="btn-open-config-err">
              <i class="fa-solid fa-key"></i> Kiểm tra API Key
            </button>
          </div>
        </div>
      `;

      const retryBtn = resultBody.querySelector('#btn-retry-err');
      if (retryBtn) retryBtn.onclick = () => analyzeCurrentPhoto(container);

      const configBtn = resultBody.querySelector('#btn-open-config-err');
      if (configBtn) configBtn.onclick = showApiKeyModal;
    }
  }

  /**
   * Cho phép vuốt tay cầm của bảng kết quả để thu gọn (peek) hoặc mở rộng
   * (open) — đồng thời bấm nút chevron hoặc chạm nhẹ vào tay cầm cũng có
   * tác dụng tương tự. Nhờ đó ảnh món ăn phía sau không bao giờ bị che kín
   * hoàn toàn và người dùng luôn có cách ẩn bảng đi.
   */
  function initResultSheetDrag(container) {
    const sheet = container.querySelector('#camera-result-container');
    const handle = container.querySelector('#sheet-drag-handle');
    const toggleBtn = container.querySelector('#btn-sheet-toggle');
    if (!sheet || !handle) return;

    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

    let dragging = false;
    let startPos = 0;
    let startTime = 0;
    let lastDelta = 0;
    let moved = false;

    const getSheetExtent = () => (isDesktop() ? sheet.getBoundingClientRect().width : sheet.getBoundingClientRect().height);

    const setDragTransform = (delta) => {
      const clamped = Math.max(0, delta); // chỉ cho kéo theo chiều thu gọn
      sheet.style.transform = isDesktop() ? `translateX(${clamped}px)` : `translateY(${clamped}px)`;
    };

    const settle = (shouldPeek) => {
      sheet.style.transform = '';
      sheet.classList.remove('is-dragging');
      sheet.classList.toggle('is-peek', shouldPeek);
      sheet.classList.toggle('is-open', !shouldPeek);
    };

    const onPointerDown = (e) => {
      if (!sheet.classList.contains('is-open') && !sheet.classList.contains('is-peek')) return;
      dragging = true;
      moved = false;
      startPos = isDesktop() ? e.clientX : e.clientY;
      startTime = Date.now();
      lastDelta = 0;
      sheet.classList.add('is-dragging');
      handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const pos = isDesktop() ? e.clientX : e.clientY;
      const delta = pos - startPos;
      if (Math.abs(delta) > 4) moved = true;
      lastDelta = delta;
      setDragTransform(delta);
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;

      if (!moved) {
        // Chạm nhẹ (không kéo) → coi như bấm nút thu gọn/mở rộng
        sheet.style.transform = '';
        sheet.classList.remove('is-dragging');
        const nowPeek = sheet.classList.contains('is-open');
        sheet.classList.toggle('is-peek', nowPeek);
        sheet.classList.toggle('is-open', !nowPeek);
        return;
      }

      const elapsed = Math.max(Date.now() - startTime, 1);
      const velocity = lastDelta / elapsed; // px/ms
      const extent = getSheetExtent() || 1;
      const draggedRatio = lastDelta / extent;

      // Vuốt đủ xa hoặc đủ nhanh theo chiều thu gọn → chuyển sang Peek
      const shouldPeek = draggedRatio > 0.22 || velocity > 0.5;
      settle(shouldPeek);
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);

    if (toggleBtn) {
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        const nowPeek = sheet.classList.contains('is-open');
        sheet.classList.toggle('is-peek', nowPeek);
        sheet.classList.toggle('is-open', !nowPeek);
      };
    }
  }

  let currentPortionId = 'm'; // reset mỗi lần phân tích ảnh mới (xem renderResult gọi từ nơi khác với data mới)

  function renderResult(targetEl, data) {
    const defaultMealType = getDefaultMealType();
    const portions = NF_Nutrition.PORTION_SIZES;
    const mult = NF_Nutrition.getPortionMultiplier(currentPortionId);
    const scaled = NF_Nutrition.scalePortion(data, mult);
    const allergyWarnings = NF_Nutrition.crossCheckAllergyWarning(data, NF_Nutrition.getUserAllergyIds());

    targetEl.innerHTML = `
      <div class="result-card" style="border:none; background:transparent; padding:0;">
        ${allergyWarnings.length ? `
          <div class="advice-box advice-box--warning" style="margin-bottom:var(--sp-3); border-color:var(--rose-200); background:var(--rose-50);">
            <div style="font-weight:800; color:var(--rose-700); margin-bottom:0.25rem;">
              <i class="fa-solid fa-triangle-exclamation"></i> Cảnh báo dị ứng (ước tính)
            </div>
            <p style="color:var(--rose-700); margin:0;">
              Món này có thể chứa: <strong>${NF_UI.escapeHtml(allergyWarnings.map((w) => w.label).join(', '))}</strong> —
              trùng với hồ sơ dị ứng của bạn. Đây là cảnh báo AI ước tính, hãy tự kiểm tra thành phần thật trước khi ăn.
            </p>
          </div>
        ` : ''}

        <div class="result-card__header">
          <div>
            <span class="result-card__badge">
              <i class="fa-solid fa-wand-magic-sparkles"></i> AI Phân Tích
            </span>
            <h2 class="result-card__name" style="margin-top:0.25rem;">${NF_UI.escapeHtml(data.name)}</h2>
            <div class="result-card__serving">
              <i class="fa-solid fa-bowl-food"></i> Khẩu phần AI ước tính: ${NF_UI.escapeHtml(data.serving)}
            </div>
            ${data.specialty ? `
              <div class="tag tag--primary" style="margin-top:0.375rem; display:inline-flex; align-items:center; gap:0.25rem;">
                <i class="fa-solid fa-map-location-dot"></i> Đặc sản ${NF_UI.escapeHtml(data.specialty)}
              </div>
            ` : ''}
          </div>
          <div style="text-align:right;">
            <div class="result-card__calories">${scaled.calories}</div>
            <span class="result-card__cal-unit">kcal / phần</span>
          </div>
        </div>

        <!-- Chọn lại định lượng thật: AI không đo được chính xác khối lượng trong ảnh -->
        <div style="margin-bottom:var(--sp-3);">
          <div class="text-xs text-muted" style="margin-bottom:0.25rem;">
            Phần bạn ăn ít/nhiều hơn AI ước tính? Điều chỉnh lại:
          </div>
          <div class="portion-toggle" style="display:flex; gap:var(--sp-2);">
            ${portions.map((p) => `
              <button type="button" class="btn ${p.id === currentPortionId ? 'btn--primary' : 'btn--outline'} btn--sm portion-btn" data-portion-id="${p.id}" style="flex:1;">
                ${p.label} (${p.shortLabel})
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 3 Macronutrients + Fiber -->
        <div class="nutrient-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:var(--sp-3);">
          <div class="nutrient-box">
            <div class="nutrient-box__label">Carb</div>
            <div class="nutrient-box__value" style="color:var(--sky-600);">${scaled.carb}g</div>
          </div>
          <div class="nutrient-box">
            <div class="nutrient-box__label">Protein</div>
            <div class="nutrient-box__value" style="color:var(--primary-600);">${scaled.protein}g</div>
          </div>
          <div class="nutrient-box">
            <div class="nutrient-box__label">Fat</div>
            <div class="nutrient-box__value" style="color:var(--amber-600);">${scaled.fat}g</div>
          </div>
          <div class="nutrient-box">
            <div class="nutrient-box__label">Chất xơ</div>
            <div class="nutrient-box__value" style="color:var(--primary-700);">${scaled.fiber == null ? '—' : scaled.fiber + 'g'}</div>
          </div>
        </div>

        <!-- Micronutrients & Food Group -->
        <div style="display:flex; flex-direction:column; gap:var(--sp-2); margin-bottom:var(--sp-3);">
          ${data.foodGroup ? `
            <div class="text-xs text-muted" style="overflow-wrap:break-word;">
              <strong>Nhóm thực phẩm:</strong> ${NF_UI.escapeHtml(data.foodGroup)}
            </div>
          ` : ''}

          ${(data.vitamins && data.vitamins.length > 0) || (data.minerals && data.minerals.length > 0) ? `
            <div class="micro-info">
              <i class="fa-solid fa-apple-whole"></i>
              ${data.vitamins && data.vitamins.length ? `<strong>Vitamin:</strong> ${NF_UI.escapeHtml(data.vitamins.join(', '))}. ` : ''}
              ${data.minerals && data.minerals.length ? `<strong>Khoáng chất:</strong> ${NF_UI.escapeHtml(data.minerals.join(', '))}.` : ''}
            </div>
          ` : ''}

          ${data.advice ? `
            <div class="advice-box advice-box--success">
              <i class="fa-solid fa-lightbulb"></i>
              <strong>Lời khuyên học đường:</strong> ${NF_UI.escapeHtml(data.advice)}
            </div>
          ` : ''}
        </div>

        <!-- Save to Diary Action -->
        <div class="card card--glass" style="background:var(--white); border:1px solid var(--slate-200); padding:var(--sp-3);">
          <div style="font-weight:700; font-size:var(--fs-sm); margin-bottom:var(--sp-2);">
            Lưu món ăn này vào nhật ký hôm nay
          </div>
          <div style="display:flex; gap:var(--sp-2); align-items:center; flex-wrap:wrap;">
            <select id="save-meal-type-select" class="search-bar__input" style="padding:0.5rem var(--sp-2); width:auto; flex:1; min-width:9rem;">
              <option value="Bữa Sáng" ${defaultMealType === 'Bữa Sáng' ? 'selected' : ''}>🌅 Bữa Sáng</option>
              <option value="Bữa Trưa" ${defaultMealType === 'Bữa Trưa' ? 'selected' : ''}>☀️ Bữa Trưa</option>
              <option value="Bữa Tối" ${defaultMealType === 'Bữa Tối' ? 'selected' : ''}>🌙 Bữa Tối</option>
              <option value="Bữa Phụ" ${defaultMealType === 'Bữa Phụ' ? 'selected' : ''}>🍎 Bữa Phụ</option>
            </select>
            <button class="btn btn--primary" id="btn-save-to-diary" style="white-space:nowrap;">
              <i class="fa-solid fa-bookmark"></i> Lưu vào nhật ký
            </button>
          </div>
        </div>
      </div>
    `;

    targetEl.querySelectorAll('.portion-btn').forEach((btn) => {
      btn.onclick = () => {
        currentPortionId = btn.dataset.portionId;
        renderResult(targetEl, data); // vẽ lại với khẩu phần mới, giữ nguyên data AI gốc
      };
    });

    const btnSave = targetEl.querySelector('#btn-save-to-diary');
    const mealSelect = targetEl.querySelector('#save-meal-type-select');

    if (btnSave) {
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
          tags: Array.isArray(data.tags) ? data.tags : [],
          mealType: mealType,
          source: 'camera',
          time: NF_UI.getTimeNow(),
        };

        NF_Storage.addDiaryEntry(entry, NF_Storage.getToday());
        NF_UI.showToast(`Đã lưu "${NF_UI.escapeHtml(data.name)}" vào ${mealType} hôm nay!`, 'success');
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-check"></i> Đã lưu';
      };
    }
  }

  function getDefaultMealType() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 10) return 'Bữa Sáng';
    if (hour >= 10 && hour < 14) return 'Bữa Trưa';
    if (hour >= 14 && hour < 17) return 'Bữa Phụ';
    return 'Bữa Tối';
  }

  function showApiKeyModal() {
    const currentKey = (typeof GEMINI_CONFIG !== 'undefined' && GEMINI_CONFIG.apiKey !== 'YOUR_GEMINI_API_KEY_HERE')
      ? GEMINI_CONFIG.apiKey
      : (localStorage.getItem('nf_gemini_api_key') || '');

    const html = `
      <div style="padding:var(--sp-2);">
        <h3 style="font-size:var(--fs-xl); font-weight:800; margin-bottom:var(--sp-2);">
          <i class="fa-solid fa-key" style="color:var(--primary-600);"></i> Cấu hình Google Gemini API Key
        </h3>
        <p class="text-sm text-muted" style="margin-bottom:var(--sp-3); line-height:1.5;">
          Khóa API được lưu trữ an toàn trong trình duyệt cục bộ của bạn để phục vụ việc phân tích hình ảnh và tra cứu.
        </p>
        
        <div style="margin-bottom:var(--sp-3);">
          <label class="card__label" for="input-modal-api-key">GEMINI API KEY</label>
          <input type="password" id="input-modal-api-key" class="search-bar__input" 
                 value="${currentKey}" placeholder="AIzaSy..." style="padding-left:var(--sp-3);" />
          <div style="display:flex; justify-content:space-between; margin-top:0.25rem; flex-wrap:wrap; gap:0.25rem;">
            <span class="text-xs text-muted">Lấy key miễn phí tại:</span>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" class="text-xs text-bold">
              Google AI Studio <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
          </div>
        </div>

        <div style="display:flex; gap:var(--sp-2); justify-content:flex-end; margin-top:var(--sp-4);">
          <button class="btn btn--outline" id="btn-modal-cancel-key">Hủy</button>
          <button class="btn btn--primary" id="btn-modal-save-key">Lưu cấu hình</button>
        </div>
      </div>
    `;

    NF_UI.showModal(html);

    document.getElementById('btn-modal-cancel-key').onclick = NF_UI.closeModal;
    document.getElementById('btn-modal-save-key').onclick = () => {
      const keyVal = document.getElementById('input-modal-api-key').value.trim();
      if (!keyVal) {
        NF_UI.showToast('Vui lòng nhập API key hợp lệ', 'warning');
        return;
      }
      localStorage.setItem('nf_gemini_api_key', keyVal);
      if (typeof GEMINI_CONFIG !== 'undefined') {
        GEMINI_CONFIG.apiKey = keyVal;
      }
      NF_UI.closeModal();
      NF_UI.showToast('Đã lưu API Key thành công!', 'success');
      // Re-render current page
      const content = document.getElementById('app-content');
      if (content) render(content);
    };
  }

  return {
    render,
    stopCamera,
    showApiKeyModal
  };
})();