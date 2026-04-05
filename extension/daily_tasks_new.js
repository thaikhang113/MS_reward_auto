export async function runDailyTasks() {
  log(`[Daily Tasks] Bắt đầu tự động làm nhiệm vụ hàng ngày...`);
  let tabId = null;
  let totalCompleted = 0;
  let apiUrls = [];

  try {
    // 🔥 TẢI DỮ LIỆU SUPER ACCURATE JSON QUA API (Ẩn hoàn toàn khỏi giao diện)
    log('🤖 [API] Đang tải Database JSON cực kỳ chính xác từ Microsoft Server...');
    const apiRes = await fetch("https://rewards.bing.com/api/getuserinfo?type=1");
    if (apiRes.ok) {
      const dbData = await apiRes.json();
      const dashboard = dbData.dashboard || {};

      const extractTasks = (promoList) => {
        if (!promoList) return;
        for (const task of promoList) {
          if (!task.complete && task.destinationUrl && !task.destinationUrl.includes('referandearn')) {
            apiUrls.push(task.destinationUrl);
          }
        }
      };

      // 1. Quét Daily Set
      extractTasks(dashboard.dailySetPromotions);
      // 2. Quét More Promotions (Keep Earning)
      extractTasks(dashboard.morePromotions);
      // 3. Quét PunchCards (Quests đa bước)
      if (dashboard.punchCards) {
        dashboard.punchCards.forEach(pc => {
          if (pc.parentPromotion && pc.parentPromotion.promotions) {
            extractTasks(pc.parentPromotion.promotions);
          }
        });
      }

      // Khử trùng lặp URL
      apiUrls = [...new Set(apiUrls)];
      log(`🔥 [API] Thành công! Tìm thấy chính xác ${apiUrls.length} nhiệm vụ cần làm.`);
    }
  } catch (e) {
    log(`[API Error] Lỗi khi kéo Database: ${e.message}`);
  }

  try {
    if (apiUrls.length > 0) {
      // ═══════════════════════════════════════════════════════
      // PHASE 1: TỰ ĐỘNG MỞ URL ĐƯỢC CHỈ ĐỊNH TỪ JSON API
      // ═══════════════════════════════════════════════════════
      log(`[API Task] Bắt đầu xử lý ${apiUrls.length} nhiệm vụ...`);
      for (const url of apiUrls) {
        let taskTab = null;
        try {
          if (url.includes('microsoft.com/en-us/edge') || url.includes('bing.com/explore')) continue;

          log(`🎯 Mở task: ${url.substring(0, 50)}...`);
          taskTab = await createTab(url, false);
          await waitForTabLoad(taskTab.id);
          await sleep(4000);

          // Tự động dismiss các modal/dialog rác có thể xuất hiện trên trang đích
          await injectScript(taskTab.id, () => {
            window.alert = () => { }; window.confirm = () => false; window.prompt = () => null;
            const cancels = document.querySelectorAll('button[class*="cancel"], button[class*="close"]');
            cancels.forEach(c => { try { c.click(); } catch (e) { } });
          });

          await sleep(1500);
          await closeTab(taskTab.id);
          totalCompleted++;
          await sleep(2000);
        } catch (e) {
          if (taskTab) await closeTab(taskTab.id);
        }
      }
      log(`✅ Đã xong toàn bộ ${totalCompleted} nhiệm vụ theo API.`);
    } else {
      log(`⚠️ API API không báo còn nhiệm vụ nào chưa làm.`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: DASHBOARD / ONBOARDING MODAL
    // Cái này vẫn sẽ cần chạy để tắt các bảng xếp hạng rác
    // ═══════════════════════════════════════════════════════
    log('📋 [Phase 3] Checking Dashboard tasks / extra views...');
    let dashTab = null;
    try {
      dashTab = await createTab('https://rewards.bing.com/', false);
      await waitForTabLoad(dashTab.id);
      await sleep(5000);

      const clickedViews = await injectScript(dashTab.id, () => {
        return (async function () {
          const delay = ms => new Promise(r => setTimeout(r, ms));
          for (let i = 0; i < 3; i++) {
            window.scrollBy({ top: 300, behavior: 'smooth' });
            await delay(500);
          }
          window.scrollTo(0, 0);
          await delay(1000);

          let counts = 0;
          const viewBtns = document.querySelectorAll('[class*="hero"] button, [class*="hero"] a, carousel button, carousel a');
          for (const btn of viewBtns) {
            const txt = (btn.textContent || '').trim().toLowerCase();
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && (txt === 'view' || txt === 'xem' || txt === 'nhận')) {
              try { btn.click(); counts++; await delay(2000); } catch (e) { }
            }
          }
          return counts;
        })();
      });

      if (clickedViews > 0) {
        log(`   ✅ Dashboard: clicked ${clickedViews} extra actions`);
      } else {
        log(`   📦 Dashboard: No pending tasks`);
      }
      await sleep(1500);
      await closeTab(dashTab.id);
    } catch (e) {
      if (dashTab) await closeTab(dashTab.id);
    }

  } catch (error) {
    log(`[Daily Tasks Error] ${error.message}`, 'error');
  }

  log(`✅ Daily tasks complete! Total API actions processed: ${totalCompleted}`, 'success');
}
