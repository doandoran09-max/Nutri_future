// Kiểm thử js/nutrition-helpers.js (NF_Nutrition): khớp từ khóa dị ứng theo
// token, đối chiếu hồ sơ, và scale khẩu phần Ít/Vừa/Nhiều.
// Chạy: node --test tests/nutrition-helpers.test.js
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./load');

// Mảng/đối tượng tạo trong vm khác prototype → so sánh qua JSON để deepStrictEqual không báo lệch giả
// (cùng quy ước với tests/game-engine.test.js)
const plain = (x) => JSON.parse(JSON.stringify(x));
const deepEq = (a, b, m) => assert.deepStrictEqual(plain(a), plain(b), m);

const NF_Nutrition = load(['js/nutrition-helpers.js'], ['NF_Nutrition']).NF_Nutrition;

// --- Khớp từ khóa theo token (không khớp nhầm trong từ khác) --------------

test('matchAllergensByKeyword: phát hiện "tôm" trong "Bún riêu cua" → shellfish (cua)', () => {
  const ids = NF_Nutrition.matchAllergensByKeyword('Bún riêu cua');
  assert.ok(ids.includes('shellfish'));
});

test('matchAllergensByKeyword: "Cá kho riềng" → fish, KHÔNG khớp nhầm "các" thành "cá"', () => {
  const ids = NF_Nutrition.matchAllergensByKeyword('Cá kho riềng');
  assert.ok(ids.includes('fish'));

  const idsNoMatch = NF_Nutrition.matchAllergensByKeyword('Các loại rau củ luộc');
  assert.ok(!idsNoMatch.includes('fish'), '"các" không được khớp nhầm thành từ khóa "cá"');
});

test('matchAllergensByKeyword: cụm 2 từ "đậu phộng" khớp đúng, "đậu phụ" (đậu nành) không bị coi là đậu phộng', () => {
  const peanut = NF_Nutrition.matchAllergensByKeyword('Gỏi cuốn chấm đậu phộng');
  assert.ok(peanut.includes('peanut'));

  const soy = NF_Nutrition.matchAllergensByKeyword('Đậu phụ sốt cà chua');
  assert.ok(soy.includes('soy'));
  assert.ok(!soy.includes('peanut'));
});

test('matchAllergensByKeyword: món không chứa dị ứng nào trả về mảng rỗng', () => {
  const ids = NF_Nutrition.matchAllergensByKeyword('Rau muống luộc');
  deepEq(ids, []);
});

test('matchAllergensByKeyword: chỉ xét trong danh sách categoryIds được truyền vào', () => {
  const ids = NF_Nutrition.matchAllergensByKeyword('Bún riêu cua', ['peanut']);
  deepEq(ids, []); // cua khớp "shellfish" nhưng không nằm trong danh sách lọc
});

// --- Đối chiếu hồ sơ dị ứng --------------------------------------------

test('crossCheckAllergyWarning: gộp nhãn AI (containsAllergens) + khớp từ khóa tên món, chỉ trả phần trùng hồ sơ', () => {
  const food = { name: 'Phở bò tái', containsAllergens: ['gluten'] };
  const warnings = NF_Nutrition.crossCheckAllergyWarning(food, ['gluten', 'peanut']);
  const ids = warnings.map((w) => w.id);
  assert.ok(ids.includes('gluten'));
  assert.ok(!ids.includes('peanut'));
  assert.ok(warnings.every((w) => typeof w.label === 'string' && w.label.length > 0));
});

test('crossCheckAllergyWarning: không có dị ứng trong hồ sơ → trả mảng rỗng, không ném lỗi', () => {
  deepEq(NF_Nutrition.crossCheckAllergyWarning({ name: 'Tôm rang' }, []), []);
  deepEq(NF_Nutrition.crossCheckAllergyWarning(null, ['peanut']), []);
});

test('crossCheckAllergyWarning: bỏ qua id lạ AI tự bịa ra ngoài danh mục đã định nghĩa', () => {
  const food = { name: 'Salad trộn', containsAllergens: ['khong_ton_tai'] };
  const warnings = NF_Nutrition.crossCheckAllergyWarning(food, ['khong_ton_tai']);
  deepEq(warnings, []);
});

// --- Khẩu phần Ít / Vừa / Nhiều -----------------------------------------

test('PORTION_SIZES: đúng 3 mức với hệ số S=0.7 / M=1.0 / L=1.3', () => {
  const byId = Object.fromEntries(NF_Nutrition.PORTION_SIZES.map((p) => [p.id, p.multiplier]));
  assert.strictEqual(byId.s, 0.7);
  assert.strictEqual(byId.m, 1.0);
  assert.strictEqual(byId.l, 1.3);
});

test('scalePortion: scale đúng tỉ lệ và làm tròn hợp lý', () => {
  const base = { calories: 430, protein: 26, fat: 12, carb: 54, fiber: 3 };
  const s = NF_Nutrition.scalePortion(base, 0.7);
  const l = NF_Nutrition.scalePortion(base, 1.3);

  assert.strictEqual(s.calories, Math.round(430 * 0.7));
  assert.strictEqual(l.calories, Math.round(430 * 1.3));
  assert.strictEqual(s.protein, Math.round(26 * 0.7 * 10) / 10);
  assert.ok(l.calories > base.calories && s.calories < base.calories);
});

test('scalePortion: fiber null (chưa có dữ liệu) được giữ nguyên null thay vì thành 0', () => {
  const r = NF_Nutrition.scalePortion({ calories: 100, protein: 1, fat: 1, carb: 1, fiber: null }, 1.3);
  assert.strictEqual(r.fiber, null);
});

test('getPortionMultiplier: id không hợp lệ mặc định về 1.0 (Vừa)', () => {
  assert.strictEqual(NF_Nutrition.getPortionMultiplier('xyz'), 1.0);
  assert.strictEqual(NF_Nutrition.getPortionMultiplier('l'), 1.3);
});

// --- An toàn khi NF_Storage chưa tồn tại (vd test context) ----------------

test('getUserAllergyIds: không ném lỗi khi NF_Storage không tồn tại trong context', () => {
  deepEq(NF_Nutrition.getUserAllergyIds(), []);
});
