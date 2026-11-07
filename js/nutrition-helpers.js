/**
 * NutriFuture — NF_Nutrition: helper dùng chung cho Hồ sơ dị ứng + Khẩu phần.
 * Thuần logic (không đụng DOM) để dễ unit test — xem tests/nutrition-helpers.test.js.
 *
 * Phạm vi & giới hạn (đọc kỹ trước khi dùng):
 * - Cảnh báo dị ứng ở đây là BEST-EFFORT (khớp từ khóa tên món + nhãn AI tự ước
 *   tính), KHÔNG PHẢI tư vấn y tế và KHÔNG đảm bảo đầy đủ 100%. Luôn nhắc học
 *   sinh có dị ứng nghiêm trọng tự kiểm tra thành phần thực tế.
 */
const NF_Nutrition = (() => {
  'use strict';

  /* ─── Danh mục dị ứng phổ biến (id dùng chung giữa hồ sơ, AI prompt và đối chiếu) ─── */

  const ALLERGEN_CATEGORIES = [
    { id: 'peanut', label: 'Đậu phộng (lạc)', keywords: ['đậu phộng', 'lạc rang', 'lạc', 'phộng'] },
    { id: 'tree_nuts', label: 'Hạt cây (hạnh nhân, óc chó, hạt điều, mắc ca...)', keywords: ['hạnh nhân', 'óc chó', 'hạt điều', 'hạt dẻ', 'mắc ca', 'hồ đào'] },
    { id: 'shellfish', label: 'Hải sản có vỏ (tôm, cua, mực, sò, ốc...)', keywords: ['tôm', 'cua', 'mực', 'sò', 'ốc', 'ghẹ', 'hàu', 'nghêu', 'bạch tuộc'] },
    { id: 'fish', label: 'Cá và nước mắm', keywords: ['cá', 'nước mắm', 'mắm'] },
    { id: 'egg', label: 'Trứng', keywords: ['trứng'] },
    { id: 'dairy', label: 'Sữa và chế phẩm từ sữa', keywords: ['sữa', 'phô mai', 'bơ', 'yaourt', 'sữa chua'] },
    { id: 'soy', label: 'Đậu nành', keywords: ['đậu nành', 'đậu phụ', 'đậu hũ', 'tương'] },
    { id: 'gluten', label: 'Lúa mì / Gluten (bột mì, bánh mì, mì...)', keywords: ['bánh mì', 'bột mì', 'lúa mì', 'mì tôm', 'mì ý', 'mì gói', 'mì trứng'] },
    { id: 'sesame', label: 'Mè (vừng)', keywords: ['mè', 'vừng'] },
  ];

  const ALLERGEN_IDS = ALLERGEN_CATEGORIES.map((c) => c.id);

  function getAllergenLabel(id) {
    const c = ALLERGEN_CATEGORIES.find((x) => x.id === id);
    return c ? c.label : '';
  }

  /* ─── Khớp từ khóa theo TOKEN (tách theo khoảng trắng) để tránh khớp nhầm
         bên trong một từ khác (vd từ "cá" không khớp nhầm vào trong "các"). ─── */

  function _normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFC')
      .replace(/[.,;:!?()"'“”/\\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _tokens(s) {
    const n = _normalize(s);
    return n ? n.split(' ') : [];
  }

  function _containsPhrase(tokens, phrase) {
    const pTokens = _tokens(phrase);
    if (!pTokens.length || pTokens.length > tokens.length) return false;
    for (let i = 0; i <= tokens.length - pTokens.length; i++) {
      let match = true;
      for (let j = 0; j < pTokens.length; j++) {
        if (tokens[i + j] !== pTokens[j]) { match = false; break; }
      }
      if (match) return true;
    }
    return false;
  }

  /** Trả về mảng id danh mục dị ứng được PHÁT HIỆN trong tên món (chỉ xét các id trong categoryIds, hoặc tất cả nếu bỏ trống). */
  function matchAllergensByKeyword(name, categoryIds) {
    const tokens = _tokens(name);
    if (!tokens.length) return [];
    const ids = Array.isArray(categoryIds) && categoryIds.length ? categoryIds : ALLERGEN_IDS;
    const matched = [];
    for (const cat of ALLERGEN_CATEGORIES) {
      if (!ids.includes(cat.id)) continue;
      if (cat.keywords.some((kw) => _containsPhrase(tokens, kw))) matched.push(cat.id);
    }
    return matched;
  }

  /**
   * Đối chiếu một món ăn (từ CSDL hoặc AI) với danh sách dị ứng của học sinh.
   * Gộp 2 nguồn: (1) "containsAllergens" do chính AI trả về (đáng tin hơn vì AI
   * "nhìn" được thành phần món), (2) khớp từ khóa trên TÊN món (bù cho món CSDL
   * không qua AI). Trả về mảng { id, label } các danh mục TRÙNG với hồ sơ.
   */
  function crossCheckAllergyWarning(food, userAllergyIds) {
    if (!food || !Array.isArray(userAllergyIds) || !userAllergyIds.length) return [];
    const aiFlagged = Array.isArray(food.containsAllergens)
      ? food.containsAllergens.filter((id) => ALLERGEN_IDS.includes(id))
      : [];
    const keywordFlagged = matchAllergensByKeyword(food.name, userAllergyIds);
    const merged = Array.from(new Set([...aiFlagged, ...keywordFlagged]));
    return merged
      .filter((id) => userAllergyIds.includes(id))
      .map((id) => ({ id, label: getAllergenLabel(id) }))
      .filter((x) => x.label);
  }

  /** Đọc danh sách id dị ứng đã lưu trong hồ sơ (mảng rỗng nếu chưa khai báo). */
  function getUserAllergyIds() {
    if (typeof NF_Storage === 'undefined') return [];
    const p = NF_Storage.getProfile();
    return p && Array.isArray(p.allergies) ? p.allergies.filter((id) => ALLERGEN_IDS.includes(id)) : [];
  }

  /* ─── Khẩu phần Ít / Vừa / Nhiều (S/M/L) — khắc phục hạn chế AI không đo
         được chính xác khối lượng thật của phần ăn trong ảnh. ─── */

  const PORTION_SIZES = [
    { id: 's', label: 'Ít', shortLabel: 'S', multiplier: 0.7 },
    { id: 'm', label: 'Vừa', shortLabel: 'M', multiplier: 1.0 },
    { id: 'l', label: 'Nhiều', shortLabel: 'L', multiplier: 1.3 },
  ];

  function getPortionMultiplier(portionId) {
    const p = PORTION_SIZES.find((x) => x.id === portionId);
    return p ? p.multiplier : 1.0;
  }

  /** Scale lại calo/đạm/béo/carb/xơ của 1 khẩu phần GỐC theo hệ số (không đổi object gốc). */
  function scalePortion(base, multiplier) {
    const m = Number(multiplier) || 1;
    const round1 = (v) => Math.round((Number(v) || 0) * m * 10) / 10;
    const hasFiber = base && base.fiber !== null && base.fiber !== undefined;
    return {
      calories: Math.max(0, Math.round((Number(base && base.calories) || 0) * m)),
      protein: Math.max(0, round1(base && base.protein)),
      fat: Math.max(0, round1(base && base.fat)),
      carb: Math.max(0, round1(base && base.carb)),
      fiber: hasFiber ? Math.max(0, round1(base.fiber)) : (base ? base.fiber : null),
    };
  }

  return {
    ALLERGEN_CATEGORIES,
    ALLERGEN_IDS,
    getAllergenLabel,
    matchAllergensByKeyword,
    crossCheckAllergyWarning,
    getUserAllergyIds,
    PORTION_SIZES,
    getPortionMultiplier,
    scalePortion,
  };
})();
