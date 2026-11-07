const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./load');
const { NF_Foods, NF_FOODS_DATA } = load(['js/data/foods.js', 'js/foods.js'], ['NF_Foods', 'NF_FOODS_DATA']);

test('CSDL có 304 món, không trùng khóa sau chuẩn hóa', () => {
  assert.strictEqual(NF_FOODS_DATA.length, 304);
  const keys = NF_FOODS_DATA.map((f) => NF_Foods.normalize(f.name));
  assert.strictEqual(new Set(keys).size, keys.length);
});

test('món đặc sản vùng miền có trường specialty theo ĐVHC mới; món phổ quát để trống', () => {
  assert.strictEqual(NF_Foods.find('Bún bò Huế')?.specialty, 'Huế');
  assert.strictEqual(NF_Foods.find('Bánh canh Trảng Bàng')?.specialty, 'Tây Ninh');
  assert.strictEqual(NF_Foods.find('Phở gà')?.specialty, '');
});

test('khớp đúng tên, bất kể hoa/thường, khoảng trắng, dấu', () => {
  for (const q of ['Cơm trắng', 'cơm trắng', '  CƠM   TRẮNG ', 'com trang', 'Cơm trắng\u200b'.replace('\u200b', '')]) {
    assert.strictEqual(NF_Foods.find(q)?.name, 'Cơm trắng', q);
  }
  assert.strictEqual(NF_Foods.find('Trà sữa trân châu size M')?.name, 'Trà sữa trân châu (size M)');
  assert.strictEqual(NF_Foods.find('tra sua tran chau (size l)')?.name, 'Trà sữa trân châu (size L)');
});

test('không khớp một phần / gần đúng → null (đi theo AI)', () => {
  for (const q of ['Phở bò tái sốt vang', 'Cơm', 'phở', 'Trà sữa trân châu', 'Cơm trắng nhiều', 'Bún', '', '   ', null, undefined]) {
    assert.strictEqual(NF_Foods.find(q), null, String(q));
  }
});

test('NF_Foods không lộ danh sách món ra ngoài', () => {
  assert.deepStrictEqual(Object.keys(NF_Foods).sort(), ['find', 'normalize']);
});

test('bản ghi trả về bị đóng băng (AI/giao diện không ghi đè được số liệu gốc)', () => {
  const hit = NF_Foods.find('Cơm trắng');
  assert.throws(() => { 'use strict'; hit.calories = 1; });
  assert.strictEqual(NF_Foods.find('Cơm trắng').calories, 345);
});

test('thẻ nhóm rau/trái cây đúng cho game', () => {
  assert.deepStrictEqual([...NF_Foods.find('Rau muống luộc').tags], ['veg']);
  assert.deepStrictEqual([...NF_Foods.find('Chuối').tags], ['fruit']);
  assert.deepStrictEqual([...NF_Foods.find('Phở bò').tags], []);
});
