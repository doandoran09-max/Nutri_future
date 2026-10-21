/**
 * NutriFuture — App Controller & Router
 * Điều phối định tuyến (Hash-based router), vòng đời ứng dụng và trạng thái toàn cục.
 */
const NF_App = (() => {
  'use strict';

  const routes = {
    '#home': NF_PageHome,
    '#camera': NF_PageCamera,
    '#lookup': NF_PageLookup,
    '#profile': NF_PageProfile,
    '#diary': NF_PageDiary,
    '#history': NF_PageHistory,
    '#game': NF_PageGame,
  };

  // Thứ tự tab ở thanh điều hướng → quyết định hướng trượt khi chuyển trang (Lịch sử / Hồ sơ là trang phụ → trồi lên)
  const TAB_ORDER = ['#home', '#lookup', '#camera', '#diary', '#game'];
  const LEAVE_MS = 130;
  let navToken = 0;        // mỗi lần điều hướng +1: nếu người dùng bấm tiếp trong lúc trang cũ đang mờ đi, chỉ lần bấm cuối được dựng
  let leaving = null;      // { anim, promise } khi trang cũ đang mờ đi

  let currentRoute = null;
  let lastProfileMode = null;   // true = đang ở chế độ nhập hồ sơ bắt buộc (onboarding)
  let gateNoticeShown = false;  // thông báo chặn (modal) chỉ hiện 1 lần mỗi lần tải trang

  function init() {
    console.log('[NutriFuture] Initializing application...');

    // Tự động di chuyển dữ liệu cũ v1 nếu có
    NF_Storage.migrateFromV1();

    // Đồng bộ icon + gắn sự kiện cho nút chuyển giao diện sáng/tối
    NF_UI.initThemeToggle();

    // Vòng lặp nhắc nhở chỉ chạy khi đã có hồ sơ hợp lệ (nếu chưa, sẽ được khởi động sau khi lưu hồ sơ)
    if (NF_Storage.hasValidProfile() && typeof NF_Notifications !== 'undefined') {
      NF_Notifications.init();
    }

    // Lắng nghe sự kiện đổi hash
    window.addEventListener('hashchange', handleRoute);

    // Xử lý các click vào bottom nav
    setupNav();

    // Điều hướng lần đầu — chưa có hồ sơ hợp lệ thì luôn vào Hồ sơ trước
    if (!window.location.hash) {
      window.location.hash = NF_Storage.hasValidProfile() ? '#home' : '#profile?onboarding=1';
    } else {
      handleRoute();
    }

    // Đóng modal bằng ESC — trừ modal "persistent" (thông báo bắt buộc nhập hồ sơ)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !NF_UI.isModalPersistent()) {
        NF_UI.closeModal();
      }
    });
  }

  /** Thông báo yêu cầu nhập hồ sơ: modal không đóng được (1 lần/lần tải trang), sau đó dùng toast. */
  function notifyProfileRequired() {
    if (gateNoticeShown) {
      NF_UI.showToast('Hãy nhập thông tin cá nhân trước khi dùng các mục khác', 'warning');
      return;
    }
    gateNoticeShown = true;
    const needsUpdate = !!NF_Storage.getProfile();
    NF_UI.showModal(`
      <div class="confirm-dialog">
        <div class="confirm-dialog__icon"><i class="fa-solid fa-user-pen"></i></div>
        <p class="confirm-dialog__msg">${needsUpdate
          ? 'Hồ sơ của bạn cần được cập nhật để tiếp tục'
          : 'Hãy nhập thông tin cá nhân để bắt đầu'}</p>
        <div class="confirm-dialog__actions">
          <button class="btn btn--primary" id="gate-notice-ok">Nhập thông tin ngay</button>
        </div>
      </div>
    `, { persistent: true });
    const ok = document.getElementById('gate-notice-ok');
    if (ok) {
      ok.onclick = () => {
        NF_UI.closeModal();
        const first = document.querySelector('#prof-name');
        if (first) first.focus();
      };
    }
  }

  /** Cổng chặn: chưa có hồ sơ hợp lệ thì chỉ được vào #profile. Trả về true nếu được đi tiếp. */
  function guard(path) {
    if (path === '#profile' || NF_Storage.hasValidProfile()) return true;
    notifyProfileRequired();
    window.location.hash = '#profile?onboarding=1';
    return false;
  }

  const prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** Hướng chuyển trang: 'fwd' | 'back' (giữa các tab) | 'up' (trang phụ) | null (lần đầu / cùng trang) */
  function transitionDir(from, to) {
    if (!from || from === to) return null;
    const a = TAB_ORDER.indexOf(from), b = TAB_ORDER.indexOf(to);
    if (a === -1 || b === -1) return 'up';
    return b > a ? 'fwd' : 'back';
  }

  /** Trang cũ mờ đi và lệch nhẹ ngược hướng trong ~130ms. Trả về { anim, promise }. */
  function startLeave(container, dir) {
    const dx = dir === 'fwd' ? -26 : dir === 'back' ? 26 : 0;
    const dy = dir === 'up' ? 8 : 0;
    const anim = container.animate(
      [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: `translate3d(${dx}px, ${dy}px, 0)` }],
      { duration: LEAVE_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
    );
    // Dự phòng: máy chậm / tab đang ẩn có thể khiến animation không chạy → tối đa chờ thêm ~220ms rồi vẫn chuyển trang
    const timeout = new Promise((resolve) => setTimeout(resolve, LEAVE_MS + 220));
    return { anim, promise: Promise.race([anim.finished.catch(() => {}), timeout]) };
  }

  function handleRoute() {
    const rawHash = window.location.hash || '#home';
    let [path, queryStr] = rawHash.split('?');

    if (!guard(path)) return;

    const contentContainer = document.getElementById('app-content');
    if (!contentContainer) return;

    // Ở #profile, chế độ onboarding do TRẠNG THÁI hồ sơ quyết định (không phụ thuộc ?onboarding=1),
    // để bấm tab "Hồ sơ" khi chưa có dữ liệu vẫn thấy banner chào mừng và tự về Trang chủ sau khi lưu.
    const profileMode = !NF_Storage.hasValidProfile();
    if (path === '#profile' && currentRoute === '#profile' && lastProfileMode === profileMode) {
      return; // đã ở đúng trang này — không dựng lại form (tránh mất dữ liệu đang gõ)
    }

    const token = ++navToken;
    const dir = transitionDir(currentRoute, path);
    const canAnimate = dir && !prefersReduced() && !document.hidden && typeof contentContainer.animate === 'function' && contentContainer.firstElementChild;

    if (!canAnimate && !leaving) {
      renderRoute(path, queryStr, profileMode, dir, contentContainer);
      return;
    }

    // Có trang đang hiển thị → cho nó mờ đi rồi mới dựng trang mới (bấm liên tiếp: chỉ lần cuối được dựng)
    if (!leaving) leaving = startLeave(contentContainer, dir);
    const current = leaving;
    current.promise.then(() => {
      if (token !== navToken) return;          // đã có điều hướng mới hơn
      leaving = null;
      try {
        renderRoute(path, queryStr, profileMode, dir, contentContainer);
      } finally {
        current.anim.cancel();                 // luôn hiện lại nội dung, kể cả khi dựng trang gặp lỗi
      }
    });
  }

  function renderRoute(path, queryStr, profileMode, dir, contentContainer) {
    const pageHandler = routes[path] || routes['#home'];

    // Dừng camera nếu rời khỏi trang camera
    if (currentRoute === '#camera' && path !== '#camera') {
      if (NF_PageCamera && typeof NF_PageCamera.stopCamera === 'function') {
        NF_PageCamera.stopCamera();
      }
    }

    currentRoute = path;
    updateNavActive(path);

    // Hướng trượt của trang mới (CSS: css/level-fx-add.css); bỏ đi sau khi xong để không lặp lại khi trang tự dựng lại
    if (dir) contentContainer.dataset.nfDir = dir; else delete contentContainer.dataset.nfDir;
    clearTimeout(renderRoute._t);
    renderRoute._t = setTimeout(() => { delete contentContainer.dataset.nfDir; }, 520);

    // Xử lý tham số query (ví dụ: ?date=YYYY-MM-DD)
    let queryParams = {};
    if (queryStr) {
      const pairs = queryStr.split('&');
      pairs.forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) queryParams[k] = decodeURIComponent(v);
      });
    }

    // Cuộn lên đầu trang khi chuyển tab
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Render trang tương ứng
    if (path === '#diary') {
      pageHandler.render(contentContainer, queryParams.date || null);
    } else if (path === '#profile') {
      lastProfileMode = profileMode;
      pageHandler.render(contentContainer, { onboarding: profileMode });
    } else {
      pageHandler.render(contentContainer);
    }

    // Chuyển động vào trang (CSS thuần, xem js/motion.js)
    // (dùng typeof: `const NF_Motion` ở phạm vi script KHÔNG tạo thuộc tính window.NF_Motion)
    if (typeof NF_Motion !== 'undefined') {
      NF_Motion.animatePage(contentContainer);
    }
    // Hiệu ứng đếm số khi vào trang (js/fx.js) — chỉ trang trí, tự bỏ qua nếu bật "Reduce motion"
    if (typeof NF_Fx !== 'undefined') {
      NF_Fx.enhancePage(contentContainer);
    }
  }

  function setupNav() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetHash = btn.getAttribute('data-target');
        if (targetHash) {
          window.location.hash = targetHash;
        }
      });
    });
  }

  function updateNavActive(path) {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      const targetHash = btn.getAttribute('data-target');
      if (targetHash === path) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Hồ sơ không còn nằm trong thanh nav dưới (đã chuyển lên icon góc trên phải)
    // — vẫn cần phản hồi trực quan khi đang ở trang đó.
    const profileLink = document.querySelector('a[href="#profile"].header-date');
    if (profileLink) profileLink.classList.toggle('active', path === '#profile');
  }

  return {
    init
  };
})();

// Khởi chạy khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', NF_App.init);
