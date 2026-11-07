#!/usr/bin/env python3
"""[CŨ — không còn là nguồn sinh js/data/foods.js hiện tại, giữ lại để tham khảo lịch sử]
Sinh js/data/foods.js từ bảng "GIÁ TRỊ DINH DƯỠNG THỰC PHẨM" trong plan.docx.
Chạy:  python3 tools/build-foods.py plan.txt > js/data/foods.js
(plan.txt = pandoc plan.docx -t plain --wrap=none)

CSDL hiện tại (304 món, có trường "specialty" = đặc sản tỉnh/thành theo 34 ĐVHC mới 2025)
được sinh bằng tools/build-foods-v2.py từ tools/food-specialty-table.tsv — dùng script đó
khi cần thêm/sửa món."""
import re, sys, json, unicodedata

GROUPS = {
  1: ("Tinh bột", "starch", []),
  2: ("Đạm động vật", "protein", []),
  3: ("Rau củ", "veg", ["veg"]),
  4: ("Trái cây", "fruit", ["fruit"]),
  5: ("Sữa và chế phẩm từ sữa", "dairy", []),
  6: ("Món nước", "dish", []),
  7: ("Đồ ăn nhanh và ăn vặt", "fastfood", []),
  8: ("Đồ uống", "drink", []),
  9: ("Mì cay", "dish", []),
}
num = lambda s: float(s.replace(',', '.'))
rows, cur = [], None
for line in open(sys.argv[1], encoding='utf-8'):
    line = line.strip()
    m = re.match(r'NHÓM (\d+):', line)
    if m: cur = int(m.group(1)); continue
    m = re.match(r'^(.+?) (\d+) kcal ([\d,]+)g ([\d,]+)g ([\d,]+)g$', line)
    if not m or cur is None: continue
    pre, kcal, p, f, c = m.groups()
    ms = re.search(r'(\d+ \S+ \(\d+(?:g|ml)\)|\d+g)$', pre)
    name, serving = pre[:ms.start()].strip(), ms.group(1)
    gname, gid, tags = GROUPS[cur]
    rows.append(dict(name=name, serving=serving, calories=int(kcal), protein=num(p),
                     fat=num(f), carb=num(c), group=gname, category=gid, tags=tags))
print(len(rows), file=sys.stderr)
out = ["/**",
 " * NutriFuture — CSDL dinh dưỡng nội bộ (ẨN: không hiển thị ở bất kỳ đâu trên giao diện).",
 " * Sinh tự động từ bảng trong plan.docx bằng tools/build-foods.py — KHÔNG sửa tay số liệu ở đây,",
 " * hãy sửa nguồn rồi chạy lại. Chỉ chứa dữ liệu; logic khớp tên nằm ở js/foods.js.",
 " */",
 "const NF_FOODS_DATA = ["]
for r in rows:
    out.append("  " + json.dumps(r, ensure_ascii=False) + ",")
out.append("];")
print("\n".join(out))
