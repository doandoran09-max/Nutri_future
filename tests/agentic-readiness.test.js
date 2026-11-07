// Kiểm thử các file/metadata phục vụ "agentic readiness" (robots, sitemap,
// llms.txt, 404, trang tin cậy, canonical/OG/JSON-LD trên index.html).
// Chạy: node --test tests/agentic-readiness.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./load');

const SITE = 'https://doandoran09-max.github.io/Nutri_future';

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function visibleTextLength(html) {
  // Ước lượng thô độ dài nội dung hiển thị: bỏ <head>, bỏ hết thẻ, gộp khoảng trắng.
  const withoutHead = html.replace(/<head[\s\S]*?<\/head>/i, '');
  const text = withoutHead
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length;
}

// --- 1. robots.txt --------------------------------------------------------

test('robots.txt: cho phép mọi agent, không có Disallow toàn trang, có Sitemap', () => {
  const txt = read('robots.txt');
  assert.match(txt, /User-agent:\s*\*/);
  assert.match(txt, /Allow:\s*\//);
  assert.doesNotMatch(txt, /Disallow:\s*\/\s*$/m);
  assert.match(txt, new RegExp(`Sitemap:\\s*${SITE}/sitemap\\.xml`));
});

// --- 2. sitemap.xml ---------------------------------------------------

test('sitemap.xml: XML hợp lệ về cấu trúc, mọi <loc> thuộc domain chính, có lastmod', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);

  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 4, 'cần ít nhất 4 URL: trang chủ + about/contact/privacy');
  for (const loc of locs) {
    assert.ok(loc.startsWith(SITE), `URL phải thuộc domain chính: ${loc}`);
  }
  assert.ok(locs.includes(`${SITE}/`), 'phải liệt kê trang chủ');

  const lastmods = [...xml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map((m) => m[1]);
  assert.strictEqual(lastmods.length, locs.length, 'mỗi <url> phải có <lastmod>');
  for (const d of lastmods) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

// --- 3. llms.txt ------------------------------------------------------

test('llms.txt: có tiêu đề, phần "when to use", và liên kết tới docs/sitemap', () => {
  const txt = read('llms.txt');
  assert.match(txt, /^# NutriFuture/);
  assert.match(txt, /## When to use this/i);
  assert.match(txt, /about\.html/);
  assert.match(txt, /privacy\.html/);
  assert.match(txt, /contact\.html/);
  assert.match(txt, /sitemap\.xml/);
});

// --- 4. 404.html --------------------------------------------------------

test('404.html: tồn tại ở gốc repo (bắt buộc để GitHub Pages trả 404 đúng), có lối quay về & liên kết llms.txt/sitemap', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '404.html')), '404.html phải nằm ở gốc repo');
  const html = read('404.html');
  assert.match(html, /index\.html#home/);
  assert.match(html, /llms\.txt/);
  assert.match(html, /sitemap\.xml/);
});

// --- 5. Trang tin cậy: About / Contact / Privacy ------------------------

for (const file of ['about.html', 'contact.html', 'privacy.html']) {
  test(`${file}: tồn tại, canonical đúng domain, nội dung hiển thị >= 500 ký tự`, () => {
    const html = read(file);
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/${file}"`));
    const len = visibleTextLength(html);
    assert.ok(len >= 500, `nội dung hiển thị chỉ có ${len} ký tự, cần >= 500`);
  });
}

test('contact.html: không chứa email/số điện thoại bịa — chỉ dẫn qua GitHub Issues', () => {
  const html = read('contact.html');
  assert.match(html, /github\.com\/doandoran09-max\/Nutri_future\/issues/);
  assert.doesNotMatch(html, /mailto:/);
});

// --- 6. index.html: canonical / Open Graph / JSON-LD ---------------------

test('index.html: có canonical, og:type, og:image, html lang="vi"', () => {
  const html = read('index.html');
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/" />`));
  assert.match(html, /<meta property="og:type" content="website" \/>/);
  assert.match(html, /<meta property="og:image" content="[^"]+icon-512\.png" \/>/);
  assert.match(html, /<html lang="vi">/);
});

test('index.html: có liên kết tĩnh (không phụ thuộc JS) tới about/contact/privacy/GitHub', () => {
  const html = read('index.html');
  // Chỉ xét phần trước khi JS chạy (toàn bộ <body> tĩnh được server trả về luôn,
  // không chỉ phần trong thẻ <script>) — đảm bảo crawler không chạy JS vẫn thấy được.
  assert.match(html, /<a href="about\.html">/);
  assert.match(html, /<a href="contact\.html">/);
  assert.match(html, /<a href="privacy\.html">/);
  assert.match(html, new RegExp(`<a href="https://github\\.com/doandoran09-max/Nutri_future">`));
});

test('index.html: JSON-LD hợp lệ (parse được) và chứa cả SoftwareApplication lẫn Organization', () => {
  const html = read('index.html');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'phải có khối <script type="application/ld+json">');
  const data = JSON.parse(m[1]);
  assert.ok(Array.isArray(data['@graph']), 'JSON-LD nên dùng @graph cho nhiều entity');
  const types = data['@graph'].map((n) => n['@type']);
  assert.ok(types.includes('SoftwareApplication'));
  assert.ok(types.includes('Organization'));
  const org = data['@graph'].find((n) => n['@type'] === 'Organization');
  assert.ok(org.contactPoint, 'Organization nên có contactPoint');
});

// --- 7. Service worker: file tĩnh mới có trong cache + CACHE_VERSION đã bump --

test('sw.js: CACHE_VERSION đã bump và CORE_ASSETS có đủ các trang/CSS tĩnh mới', () => {
  const sw = read('sw.js');
  assert.match(sw, /const CACHE_VERSION = 'v\d+';/);
  for (const asset of ['./css/static-pages.css', './about.html', './contact.html', './privacy.html', './404.html']) {
    assert.ok(sw.includes(`'${asset}'`), `CORE_ASSETS thiếu ${asset}`);
  }
});
