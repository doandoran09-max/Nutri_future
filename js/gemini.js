/**
 * NutriFuture — Gemini API Wrapper
 * Gọi Google Gemini API (Text + Vision) trực tiếp từ browser.
 * Hỗ trợ tự động fallback model, kiểm tra kết nối và chẩn đoán lỗi chi tiết.
 */
const NF_Gemini = (() => {
  'use strict';

  /* ─── Lấy API Key (được trim sạch khoảng trắng) ─── */

  function getApiKey() {
    let key = '';
    if (typeof GEMINI_CONFIG !== 'undefined' && GEMINI_CONFIG.apiKey && GEMINI_CONFIG.apiKey !== 'YOUR_GEMINI_API_KEY_HERE') {
      key = GEMINI_CONFIG.apiKey;
    } else {
      key = localStorage.getItem('nf_gemini_api_key') || '';
    }
    return (key || '').trim();
  }

  // Danh sách model theo thứ tự ưu tiên — cân bằng giữa độ chính xác cao và tốc độ
  const CANDIDATE_MODELS = [
    // Ưu tiên dòng Flash chuẩn để đảm bảo độ chính xác tốt hơn
    'gemini-2.5-flash',
    'gemini-flash-latest',
    // Dòng Lite dự phòng khi bản chuẩn bị quá tải (503)
    'gemini-2.5-flash-lite',
    'gemini-flash-lite-latest',
    // Dòng Pro (chính xác nhất nhưng dễ lỗi/chậm nhất)
    'gemini-2.5-pro',
    'gemini-pro-latest',
    // Thế hệ cũ (nếu key vẫn hỗ trợ)
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
  ];

  const API_VERSIONS = ['v1beta', 'v1'];

  // Giới hạn số model dự phòng thử tối đa khi lỗi (thay vì toàn bộ 11 model × 2 version = 22 lần gọi,
  // vừa chậm vừa "đốt" quota rất nhanh khi key đã hết hạn mức)
  const MAX_FALLBACK_ATTEMPTS = 3;
  const REQUEST_TIMEOUT_MS = 15000; // 15 giây — tránh treo vô hạn khi mạng chậm/đứng
  const RETRY_BACKOFF_MS = 1200; // Nghỉ giữa các lần thử lại khi gặp lỗi 429 (rate limit)

  // Danh sách model hiển thị cho người dùng chọn thủ công trong giao diện (Hồ sơ)
  const MODEL_OPTIONS = [
    { value: 'auto', label: 'Tự động (khuyên dùng — AI tự chọn model tốt nhất)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — Cân bằng tốc độ & độ chính xác' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — Nhanh nhất, nhẹ nhất' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — Chính xác nhất, chậm hơn' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — Thế hệ trước, ổn định' },
    { value: 'gemini-flash-latest', label: 'Gemini Flash (mới nhất theo Google)' },
    { value: 'gemini-pro-latest', label: 'Gemini Pro (mới nhất theo Google)' },
  ];

  function getSelectedModel() {
    return localStorage.getItem('nf_selected_model') || 'auto';
  }

  function setSelectedModel(modelId) {
    if (!modelId || modelId === 'auto') {
      localStorage.removeItem('nf_selected_model');
    } else {
      localStorage.setItem('nf_selected_model', modelId);
    }
    // Xóa cache "model đang hoạt động" để lần gọi tiếp theo dùng đúng lựa chọn mới
    localStorage.removeItem('nf_working_model');
    localStorage.removeItem('nf_working_version');
  }

  function getModel() {
    // 1. Ưu tiên tuyệt đối: model người dùng chọn thủ công trong Hồ sơ
    const selected = getSelectedModel();
    if (selected && selected !== 'auto') return selected;

    // 2. Chế độ "Tự động": dùng model đã xác nhận hoạt động tốt gần nhất
    const cached = localStorage.getItem('nf_working_model');
    if (cached) return cached;
    if (typeof GEMINI_CONFIG !== 'undefined' && GEMINI_CONFIG.model) {
      return GEMINI_CONFIG.model;
    }
    return 'gemini-2.5-flash';
  }

  function getApiVersion() {
    return localStorage.getItem('nf_working_version') || 'v1beta';
  }

  function isConfigured() {
    const key = getApiKey();
    return !!(key && key.length > 10 && key !== 'YOUR_GEMINI_API_KEY_HERE');
  }

  function _getApiUrl(model, version) {
    const m = model || getModel();
    const ver = version || getApiVersion();
    const key = encodeURIComponent(getApiKey());
    return `https://generativelanguage.googleapis.com/${ver}/models/${m}:generateContent?key=${key}`;
  }

  /* ─── Thực thi gọi API với 1 model & version cụ thể ─── */

  async function _executeRequest(model, body, version = 'v1beta') {
    const url = _getApiUrl(model, version);

    // AbortController: hủy request nếu quá REQUEST_TIMEOUT_MS — tránh treo vô hạn khi mạng chậm
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        const timeoutError = new Error('REQUEST_TIMEOUT');
        timeoutError.status = 0;
        timeoutError.model = model;
        timeoutError.version = version;
        throw timeoutError;
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.warn(`[Gemini API] Request failed (${version}/${model}):`, response.status, errData);
      
      const googleMsg = errData?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      const err = new Error(googleMsg);
      err.status = response.status;
      err.details = errData;
      err.model = model;
      err.version = version;
      throw err;
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('EMPTY_RESPONSE');

    // Lưu lại model & version hoạt động tốt
    localStorage.setItem('nf_working_model', model);
    localStorage.setItem('nf_working_version', version);
    return text;
  }

  /* ─── Gọi API chung với cơ chế Auto-Fallback thông minh ─── */

  function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const _RETRYABLE_STATUSES = [404, 503, 429, 0]; // 0 = timeout (AbortError)

  async function _call(prompt, base64Image = null, opts = {}) {
    if (!isConfigured()) {
      throw new Error('API_NOT_CONFIGURED');
    }

    const parts = [];
    parts.push({ text: prompt });

    if (base64Image) {
      const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: cleanBase64
        }
      });
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens || ((typeof GEMINI_CONFIG !== 'undefined' && GEMINI_CONFIG.maxTokens) ? GEMINI_CONFIG.maxTokens : 2048),
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.15,
      }
    };

    const primaryModel = getModel();
    const primaryVer = getApiVersion();

    try {
      return await _executeRequest(primaryModel, body, primaryVer);
    } catch (err) {
      // Nếu gặp lỗi 404 (không tìm thấy model), 503 (quá tải), 429 (giới hạn request),
      // hoặc timeout (0) — thử tự động fallback, nhưng GIỚI HẠN số lần thử để tránh
      // "bắn" hàng chục request liên tiếp làm cạn quota nhanh hơn khi key đã hết hạn mức.
      if (_RETRYABLE_STATUSES.includes(err.status)) {
        console.warn(`[Gemini API] Lỗi ${err.status} từ model "${primaryModel}" (${primaryVer}). Đang thử model dự phòng (tối đa ${MAX_FALLBACK_ATTEMPTS} lần)...`);

        let attempts = 0;
        outer:
        for (const ver of API_VERSIONS) {
          for (const candidate of CANDIDATE_MODELS) {
            if (candidate === primaryModel && ver === primaryVer) continue;
            if (attempts >= MAX_FALLBACK_ATTEMPTS) break outer;

            // Nghỉ 1 nhịp trước khi thử lại nếu lỗi là rate-limit (429) — tránh dồn dập
            // gọi lại ngay lập tức càng làm tình trạng giới hạn tệ hơn.
            if (err.status === 429 && attempts > 0) {
              await _sleep(RETRY_BACKOFF_MS);
            }

            attempts++;
            try {
              console.info(`[Gemini API] Thử kết nối dự phòng (${attempts}/${MAX_FALLBACK_ATTEMPTS}): ${ver}/${candidate}`);
              const text = await _executeRequest(candidate, body, ver);
              console.info(`[Gemini API] Kết nối dự phòng thành công với: ${ver}/${candidate}!`);
              if (err.status === 404 || err.status === 503) {
                localStorage.setItem('nf_working_model', candidate);
                localStorage.setItem('nf_working_version', ver);
              }
              return text;
            } catch (retryErr) {
              if (_RETRYABLE_STATUSES.includes(retryErr.status)) continue;
              throw retryErr;
            }
          }
        }

        // Đã thử hết số lần cho phép — trả lỗi gốc rõ ràng thay vì tiếp tục âm thầm thử
        if (err.status === 429) {
          const quotaErr = new Error('Đã thử ' + attempts + ' model dự phòng nhưng vẫn bị giới hạn hạn mức (429). Vui lòng đợi một lát rồi thử lại.');
          quotaErr.status = 429;
          throw quotaErr;
        }
      }

      throw err;
    }
  }

  /* ─── Chẩn đoán & Kiểm tra kết nối API Key ─── */

  async function testConnection(keyOverride) {
    const key = (keyOverride || getApiKey()).trim();
    if (!key) {
      return { ok: false, message: 'Chưa nhập API Key.' };
    }

    let lastError = null;

    for (const ver of API_VERSIONS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const url = `https://generativelanguage.googleapis.com/${ver}/models?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          const models = (data.models || [])
            .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace(/^models\//, ''));
          
          // Tự động tìm model tốt nhất để lưu
          for (const p of CANDIDATE_MODELS) {
            if (models.includes(p)) {
              localStorage.setItem('nf_working_model', p);
              localStorage.setItem('nf_working_version', ver);
              break;
            }
          }

          return {
            ok: true,
            version: ver,
            models: models,
            message: `Kết nối thành công (${ver})! Đã tìm thấy ${models.length} model khả dụng: ${models.slice(0, 4).join(', ')}...`
          };
        } else {
          lastError = data?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        }
      } catch (e) {
        lastError = e.name === 'AbortError' ? `Quá thời gian chờ (${REQUEST_TIMEOUT_MS / 1000}s) khi kết nối ${ver}` : e.message;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return {
      ok: false,
      message: lastError || 'Không thể kết nối đến máy chủ Google.'
    };
  }

  /* ─── Parse JSON từ response (xử lý markdown code blocks) ─── */

  function _parseJSON(text) {
    let cleaned = text.trim();
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) {
          throw new Error('PARSE_ERROR');
        }
      }
      throw new Error('PARSE_ERROR');
    }
  }

  /* ─── Thông báo lỗi tiếng Việt chi tiết ─── */

  function getErrorMessage(error) {
    const msg = error?.message || String(error);
    const detail = error?.details?.error?.message;
    const fullDetail = detail ? `"${detail}"` : (msg ? `"${msg}"` : '');

    if (msg === 'REQUEST_TIMEOUT' || error?.status === 0) {
      return `Yêu cầu tới Gemini AI quá thời gian chờ (${REQUEST_TIMEOUT_MS / 1000}s). Mạng có thể đang chậm — vui lòng kiểm tra kết nối và thử lại.`;
    }

    if (msg === 'API_NOT_CONFIGURED') {
      return 'Chưa cấu hình API key. Vui lòng vào mục Hồ sơ để nhập API key.';
    }

    if (error?.status === 401 || error?.status === 403 || msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('permission')) {
      return `Lỗi xác thực API Key (${error?.status || 403}): ${fullDetail}. Hãy kiểm tra lại API key hoặc bỏ giới hạn HTTP Referrer trong Google Cloud Console khi chạy thử nghiệm trên localhost.`;
    }

    if (error?.status === 404 || msg.includes('404')) {
      return `Lỗi 404 từ Google: ${fullDetail}. Nguyên nhân thường gặp:\n1. API key chưa được bật API "Generative Language API" trên Google Cloud Console.\n2. Key bị dán sai ký tự.\n3. Bạn có thể bấm "Kiểm tra kết nối" trong Hồ sơ để xem chi tiết.`;
    }

    if (error?.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) {
      return `Đã vượt giới hạn lượt gọi miễn phí của Google (429): ${fullDetail}. Vui lòng thử lại sau vài giây.`;
    }

    if (msg === 'NO_FOOD_DETECTED') {
      return 'Không nhận diện được món ăn trong ảnh. Hãy chụp rõ hơn hoặc tải ảnh đĩa thức ăn góc chính diện.';
    }

    if (msg === 'PARSE_ERROR') {
      return 'AI phản hồi dữ liệu không đúng cấu trúc. Vui lòng bấm thử lại.';
    }

    if (msg === 'NETWORK_ERROR' || msg.toLowerCase().includes('failed to fetch')) {
      return 'Lỗi kết nối mạng hoặc trình duyệt chặn CORS. Hãy kiểm tra kết nối internet.';
    }

    return `Lỗi từ Gemini AI: ${fullDetail || msg}`;
  }

  /* ─── Làm sạch dữ liệu AI trước khi dùng (AI luôn coi là KHÔNG tin cậy) ─── */

  const _round1 = (v) => Math.round(Number(v) * 10) / 10 || 0;
  const _bool = (v) => v === true || v === 'true';
  const _str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const _strList = (v, maxItems = 6) =>
    (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, maxItems).map((x) => x.trim().slice(0, 40));

  /** hasVeg/hasFruit (AI) → mảng tags chuẩn ['veg','fruit'] dùng cho game. */
  function _tagsFrom(data) {
    const tags = [];
    if (_bool(data.hasVeg)) tags.push('veg');
    if (_bool(data.hasFruit)) tags.push('fruit');
    return tags;
  }

  const _TAG_RULES = `- "hasVeg": true CHỈ KHI rau/củ là thành phần chính đáng kể của phần ăn (vd: rau luộc, salad, canh rau); ngược lại false.
- "hasFruit": true CHỈ KHI phần ăn là trái cây hoặc có trái cây đáng kể; ngược lại false.`;

  // Danh sách id danh mục dị ứng hợp lệ dùng trong prompt — lấy từ NF_Nutrition nếu đã nạp
  // (luôn nạp trước gemini.js trong index.html), nếu không thì dùng danh sách dự phòng cố định.
  const _ALLERGEN_PROMPT_IDS = (typeof NF_Nutrition !== 'undefined' && Array.isArray(NF_Nutrition.ALLERGEN_IDS))
    ? NF_Nutrition.ALLERGEN_IDS.join(', ')
    : 'peanut, tree_nuts, shellfish, fish, egg, dairy, soy, gluten, sesame';

  const _ALLERGEN_RULES = `- "containsAllergens": mảng các id (CHỈ dùng đúng id trong danh sách sau, không tự đặt id khác, để trống [] nếu không có): ${_ALLERGEN_PROMPT_IDS}.
  Chỉ liệt kê id khi thành phần đó THỰC SỰ xuất hiện rõ ràng trong món (vd có tôm/cua → "shellfish"; có trứng → "egg"; nước mắm/mắm tính là "fish"). Không đoán mò khi không chắc.`;

  function _foodFromAI(data, fallbackName, source) {
    return {
      name: _str(data.name, 120) || fallbackName,
      serving: _str(data.serving, 80) || 'Ước tính',
      calories: Math.max(0, Math.round(Number(data.calories)) || 0),
      protein: Math.max(0, _round1(data.protein)),
      fat: Math.max(0, _round1(data.fat)),
      carb: Math.max(0, _round1(data.carb)),
      fiber: Math.max(0, _round1(data.fiber)),
      vitamins: _strList(data.vitamins),
      minerals: _strList(data.minerals),
      foodGroup: _str(data.foodGroup, 60),
      tags: _tagsFrom(data),
      advice: _str(data.advice, 400),
      // Danh mục dị ứng (id cố định — xem NF_Nutrition.ALLERGEN_CATEGORIES) mà AI "nhìn"/suy luận
      // thấy có thể có trong món; dùng để đối chiếu với hồ sơ dị ứng của học sinh (cảnh báo kép).
      containsAllergens: _allergenIdList(data.containsAllergens),
      source,
      dataSource: 'ai',
    };
  }

  // Danh sách id danh mục dị ứng hợp lệ — lấy từ NF_Nutrition nếu đã nạp (luôn nạp trước gemini.js
  // trong index.html); nếu không có module thì bỏ qua lọc, giữ nguyên id AI trả về.
  function _allergenIdList(v) {
    const arr = (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').slice(0, 9);
    if (typeof NF_Nutrition === 'undefined' || !Array.isArray(NF_Nutrition.ALLERGEN_IDS)) return arr;
    return arr.filter((id) => NF_Nutrition.ALLERGEN_IDS.includes(id));
  }

  /* ─── API: Nhận diện ảnh món ăn (Gemini Vision) ─── */

  async function analyzeImage(base64Image) {
    const prompt = `Bạn là chuyên gia dinh dưỡng Việt Nam. Phân tích hình ảnh món ăn này và ước tính thành phần dinh dưỡng cho 1 khẩu phần.

CHỈ trả về JSON thuần (không có text ngoài JSON), theo đúng format:
{
  "name": "Tên món ăn bằng tiếng Việt",
  "serving": "Mô tả khẩu phần (vd: 1 đĩa ~350g)",
  "calories": 0,
  "protein": 0,
  "fat": 0,
  "carb": 0,
  "fiber": 0,
  "vitamins": ["tên vitamin chính"],
  "minerals": ["tên khoáng chất chính"],
  "foodGroup": "Nhóm thực phẩm chính (Tinh bột / Chất đạm / Chất béo / Vitamin & Khoáng chất)",
  "hasVeg": false,
  "hasFruit": false,
  "containsAllergens": [],
  "advice": "1 câu lời khuyên dinh dưỡng ngắn cho học sinh THPT (15-22 tuổi)"
}

Nếu KHÔNG nhận diện được thức ăn trong hình, trả về:
{"error": "NO_FOOD_DETECTED"}

Lưu ý: Giá trị dinh dưỡng phải là số (không có đơn vị). Ước tính dựa trên khẩu phần trung bình tại Việt Nam.
${_TAG_RULES}
${_ALLERGEN_RULES}`;

    // maxTokens thấp hơn mặc định: schema JSON gọn, trả sớm giúp phản hồi nhanh hơn
    // mà không cắt cụt dữ liệu hợp lệ (ước lượng tối đa thực tế ~500-600 token).
    const text = await _call(prompt, base64Image, { maxTokens: 700 });
    const data = _parseJSON(text);

    if (data.error === 'NO_FOOD_DETECTED') {
      throw new Error('NO_FOOD_DETECTED');
    }
    return _foodFromAI(data, 'Món ăn không xác định', 'camera');
  }

  /* ─── API: Tra cứu món ăn bằng text (món KHÔNG có trong CSDL nội bộ → hoàn toàn từ AI) ─── */

  async function searchFood(query) {
    const prompt = `Bạn là chuyên gia dinh dưỡng Việt Nam. Cung cấp thông tin dinh dưỡng cho món ăn: ${JSON.stringify(String(query).slice(0, 120))}

CHỈ trả về JSON thuần (không có text ngoài JSON), theo đúng format:
{
  "name": "Tên đầy đủ của món ăn (tiếng Việt)",
  "serving": "Khẩu phần tiêu chuẩn (vd: 1 tô ~400g)",
  "calories": 0,
  "protein": 0,
  "fat": 0,
  "carb": 0,
  "fiber": 0,
  "vitamins": ["vitamin chính"],
  "minerals": ["khoáng chất chính"],
  "foodGroup": "Nhóm thực phẩm (Tinh bột / Chất đạm / Chất béo / Vitamin & Khoáng chất)",
  "hasVeg": false,
  "hasFruit": false,
  "containsAllergens": [],
  "advice": "1 câu lời khuyên dinh dưỡng cho học sinh THPT (15-22 tuổi)"
}

Lưu ý: Giá trị phải là số. Ước tính dựa trên khẩu phần trung bình tại Việt Nam.
${_TAG_RULES}
${_ALLERGEN_RULES}`;

    // maxTokens thấp hơn mặc định: schema JSON gọn, trả sớm giúp phản hồi nhanh hơn.
    const text = await _call(prompt, null, { maxTokens: 700 });
    return _foodFromAI(_parseJSON(text), String(query).slice(0, 120), 'lookup');
  }

  /* ─── API: Nhận xét AI cho món CÓ trong CSDL (số liệu gốc KHÔNG bao giờ bị AI ghi đè) ─── */

  const COMMENT_CACHE_KEY = 'nf_food_comments';
  const COMMENT_CACHE_MAX = 120;

  function _readCommentCache() {
    try { return JSON.parse(localStorage.getItem(COMMENT_CACHE_KEY)) || {}; } catch (e) { return {}; }
  }

  /** Lấy nhận xét đã lưu (nếu có) — dùng được cả khi offline/hết quota. */
  function getCachedComment(dbItem) {
    const c = dbItem && _readCommentCache()[dbItem.id];
    return c ? { ...c } : null;
  }

  /** Chỉ giữ 4 trường nhận xét; mọi trường số calo/đạm/béo/carb (nếu AI lỡ trả về) bị bỏ. */
  function _cleanComment(data) {
    const fiber = Number(data.fiber);
    return {
      advice: _str(data.advice, 300),
      fiber: isFinite(fiber) && fiber >= 0 && fiber <= 60 ? _round1(fiber) : null,
      vitamins: _strList(data.vitamins),
      minerals: _strList(data.minerals),
    };
  }

  async function commentOnFood(dbItem) {
    const cached = getCachedComment(dbItem);
    if (cached) return cached; // món trong CSDL là cố định → không tốn thêm quota cho lần tra cứu sau

    const prompt = `Bạn là chuyên gia dinh dưỡng Việt Nam. Dưới đây là số liệu CHUẨN (đã kiểm chứng) của một món trong cơ sở dữ liệu:
- Món: ${dbItem.name} — khẩu phần: ${dbItem.serving}
- Calo: ${dbItem.calories} kcal; đạm: ${dbItem.protein}g; béo: ${dbItem.fat}g; carb: ${dbItem.carb}g

TUYỆT ĐỐI KHÔNG thay đổi, không làm tròn lại, không nhắc lại các số calo/đạm/béo/carb. Chỉ bổ sung nhận xét.

CHỈ trả về JSON thuần (không có text ngoài JSON):
{
  "advice": "Tối đa 2 câu nhận xét/lời khuyên cho học sinh THPT (15-22 tuổi) khi ăn món này với đúng khẩu phần trên",
  "fiber": 0,
  "vitamins": ["vitamin chính"],
  "minerals": ["khoáng chất chính"]
}
"fiber" là số gam chất xơ ước tính cho đúng khẩu phần trên.`;

    const text = await _call(prompt);
    const extra = _cleanComment(_parseJSON(text));
    if (!extra.advice && extra.fiber === null && !extra.vitamins.length && !extra.minerals.length) {
      throw new Error('PARSE_ERROR');
    }

    try {
      const cache = _readCommentCache();
      cache[dbItem.id] = { ...extra, ts: Date.now() };
      const keys = Object.keys(cache);
      if (keys.length > COMMENT_CACHE_MAX) {
        keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0))
          .slice(0, keys.length - COMMENT_CACHE_MAX).forEach((k) => delete cache[k]);
      }
      localStorage.setItem(COMMENT_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* localStorage đầy/bị chặn: bỏ qua cache */ }
    return extra;
  }

  /* ─── API: Gợi ý thực đơn AI ─── */

  const MEAL_TYPES = ['Bữa Sáng', 'Bữa Trưa', 'Bữa Tối', 'Bữa Phụ'];

  async function suggestMealPlan(profile, opts = {}) {
    const avoid = (opts.avoid || []).filter(Boolean).slice(0, 24);
    const genderVi = profile.gender === 'male' ? 'Nam' : 'Nữ';
    const tdee = Number(profile.tdee) || 0;
    const lo = Math.round(tdee * 0.92);
    const hi = Math.round(tdee * 1.08);
    const prompt = `Bạn là chuyên gia dinh dưỡng Việt Nam. Gợi ý thực đơn 1 ngày cho học sinh THPT:
- Giới tính: ${genderVi}
- Tuổi: ${profile.age} tuổi
- TDEE: ${tdee} kcal/ngày
- BMI: ${profile.bmi}

Yêu cầu BẮT BUỘC:
- Đúng 4 mục: "Bữa Sáng", "Bữa Trưa", "Bữa Tối", "Bữa Phụ" (3 bữa chính + 1 bữa phụ)
- Tổng calo của 4 mục nằm trong khoảng ${lo}–${hi} kcal (bám sát TDEE)
- Cân đối 4 nhóm chất: tinh bột (50-55%), chất đạm (15-20%), chất béo (25-30%), vitamin/khoáng chất
- Trong cả ngày PHẢI có ít nhất 1 món rau xanh và ít nhất 1 món trái cây (ghi rõ trong tên món)
- Món Việt Nam phổ biến, dễ tìm
${avoid.length ? `- KHÔNG dùng lại các món sau: ${avoid.join('; ')}` : ''}
${opts.feedback ? `- Lần trước chưa đạt vì: ${opts.feedback}. Hãy sửa đúng các điểm này.` : ''}

CHỈ trả về JSON thuần:
{
  "planName": "Tên thực đơn mô tả",
  "meals": [
    {
      "type": "Bữa Sáng",
      "name": "Tên món (liệt kê các món trong bữa)",
      "calories": 0,
      "protein": 0,
      "fat": 0,
      "carb": 0,
      "hasVeg": false,
      "hasFruit": false,
      "description": "Mô tả ngắn"
    }
  ],
  "advice": "1-2 câu lời khuyên dinh dưỡng chung"
}
"hasVeg"/"hasFruit" = bữa đó có rau xanh / trái cây hay không.`;

    const text = await _call(prompt, null, { temperature: 0.7, maxTokens: 3000 });
    const data = _parseJSON(text);

    const meals = (Array.isArray(data.meals) ? data.meals : []).slice(0, 6).map((m) => ({
      type: MEAL_TYPES.includes(m && m.type) ? m.type : 'Bữa Phụ',
      name: _str(m && m.name, 160),
      calories: Math.max(0, Math.round(Number(m && m.calories)) || 0),
      protein: Math.max(0, _round1(m && m.protein)),
      fat: Math.max(0, _round1(m && m.fat)),
      carb: Math.max(0, _round1(m && m.carb)),
      tags: _tagsFrom(m || {}),
      description: _str(m && m.description, 240),
    })).filter((m) => m.name);

    return {
      planName: _str(data.planName, 100) || 'Thực đơn AI',
      meals,
      // Tự cộng thay vì tin "totalCalories" do AI báo (AI hay cộng sai)
      totalCalories: meals.reduce((sum, m) => sum + m.calories, 0),
      advice: _str(data.advice, 400),
    };
  }

  /** Kiểm tra thực đơn: đủ 4 mục, tổng kcal ±10% TDEE, có ≥1 món rau và ≥1 món trái cây. */
  function checkMealPlan(plan, tdee) {
    const reasons = [];
    const types = new Set((plan.meals || []).map((m) => m.type));
    if (!MEAL_TYPES.every((t) => types.has(t))) reasons.push('thiếu bữa (cần đủ Sáng, Trưa, Tối và Phụ)');
    if (tdee > 0) {
      const ratio = plan.totalCalories / tdee;
      if (ratio < 0.9 || ratio > 1.1) {
        reasons.push(`tổng ${plan.totalCalories} kcal lệch quá 10% so với TDEE ${tdee} kcal`);
      }
    }
    if (!(plan.meals || []).some((m) => (m.tags || []).includes('veg'))) reasons.push('chưa có món rau xanh');
    if (!(plan.meals || []).some((m) => (m.tags || []).includes('fruit'))) reasons.push('chưa có trái cây');
    return { ok: reasons.length === 0, reasons };
  }

  /** Gọi AI, kiểm tra; nếu không đạt thì gọi lại ĐÚNG 1 lần kèm lý do. Trả { plan, ok, reasons }. */
  async function suggestMealPlanVerified(profile, opts = {}) {
    let plan = await suggestMealPlan(profile, opts);
    let check = checkMealPlan(plan, Number(profile.tdee) || 0);
    if (!check.ok) {
      try {
        const retry = await suggestMealPlan(profile, { ...opts, feedback: check.reasons.join('; ') });
        const retryCheck = checkMealPlan(retry, Number(profile.tdee) || 0);
        if (retryCheck.ok || retry.meals.length >= plan.meals.length) { plan = retry; check = retryCheck; }
      } catch (e) { /* giữ kết quả lần đầu nếu lần thử lại lỗi */ }
    }
    return { plan, ok: check.ok, reasons: check.reasons };
  }

  /* ─── API: Sinh câu đố dinh dưỡng (kết quả thô — NF_Game kiểm tra & làm sạch trước khi dùng) ─── */

  const QUIZ_TOPICS = [
    'năng lượng và các chất sinh năng lượng', 'vitamin và khoáng chất', 'nước và đồ uống',
    'đường, muối và chất béo', 'chất xơ, rau và trái cây', 'bữa sáng và ăn uống điều độ',
    'canxi, sắt và phát triển cơ thể', 'đọc nhãn thực phẩm và đồ ăn vặt', 'BMI và cân nặng khỏe mạnh',
    'thực phẩm giàu protein', 'an toàn thực phẩm', 'ăn uống khi học thi và thể thao',
  ];

  async function generateQuiz(count = 5, opts = {}) {
    const topics = QUIZ_TOPICS.slice().sort(() => Math.random() - 0.5).slice(0, count).join('; ');
    const avoid = (opts.avoid || []).slice(0, 15).map((q) => `"${String(q).slice(0, 90)}"`).join('; ');
    const prompt = `Tạo ${count} câu hỏi trắc nghiệm tiếng Việt về dinh dưỡng học đường cho học sinh THPT (15-22 tuổi).
Mỗi câu thuộc một chủ đề khác nhau, lấy từ: ${topics}.
Yêu cầu: đúng 4 đáp án, chỉ 1 đáp án đúng; kiến thức PHỔ BIẾN và CHÍNH XÁC theo khuyến nghị của Viện Dinh dưỡng Quốc gia/WHO, tránh số liệu gây tranh cãi; câu hỏi ngắn gọn; giải thích 1-2 câu.
${avoid ? `Không lặp lại các câu đã có: ${avoid}` : ''}

CHỈ trả về JSON thuần:
{"questions":[{"q":"Câu hỏi?","options":["A","B","C","D"],"answer":0,"explain":"Giải thích ngắn"}]}
"answer" là chỉ số (0-3) của đáp án đúng trong "options".`;

    const text = await _call(prompt, null, { temperature: 0.9, maxTokens: 3500 });
    const data = _parseJSON(text);
    return Array.isArray(data.questions) ? data.questions : [];
  }

  return {
    isConfigured,
    analyzeImage,
    searchFood,
    commentOnFood,
    getCachedComment,
    suggestMealPlan,
    suggestMealPlanVerified,
    checkMealPlan,
    generateQuiz,
    getErrorMessage,
    testConnection,
    MODEL_OPTIONS,
    getSelectedModel,
    setSelectedModel,
    getModel,
  };
})();
