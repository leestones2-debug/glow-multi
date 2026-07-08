const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const { initDB, query } = require('./src/lib/db');
const { checkPeakerrBalance, syncAllOrderStatuses, syncPeakerrServices, scanNewServices } = require('./src/services/peakerr');
const { getGlobalSetting } = require('./src/lib/utils');
const { siteMiddleware } = require('./src/middleware/site');
const { registerApiRoutes } = require('./src/routes');
const { registerSpaRoute } = require('./src/routes/spa');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(siteMiddleware());

registerApiRoutes(app);
registerSpaRoute(app);

app.listen(PORT, async () => {
  console.log(`✨ GLOW Multi-Tenant 서버 실행 중: http://localhost:${PORT}`);
  await initDB();

  // 텔레그램 웹훅 자동 등록
  try {
    const token = await getGlobalSetting('tg_token');
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (token && renderUrl) {
      await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${renderUrl}/api/tg-webhook` })
      });
      console.log('✅ 텔레그램 웹훅 등록 완료');
    }
  } catch(e) { console.log('웹훅 등록 실패:', e.message); }
  
  // 🧹 오래된 로그/만료 토큰 정리 (서버 시작 시 + 24시간마다)
  async function cleanup() {
    try {
      // 30일 이상 된 활동 로그 삭제
      await query(`DELETE FROM activity_logs WHERE created < NOW() - INTERVAL '30 days'`);
      // 90일 이상 된 잔액 로그 삭제
      await query(`DELETE FROM balance_logs WHERE created < NOW() - INTERVAL '90 days'`);
      // 만료된 비밀번호 토큰 삭제
      await query(`DELETE FROM password_resets WHERE expires < NOW() OR used=1`);
      // Rate limit 윈도우 오래된 것 삭제
      await query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour'`);
      console.log('🧹 로그 정리 완료');
    } catch(e) { console.log('로그 정리 실패:', e.message); }
  }
  cleanup(); // 시작 시 1회
  setInterval(cleanup, 24 * 60 * 60 * 1000); // 24시간마다
  
  // 💵 Peakerr 잔액 주기 체크 (6시간마다)
  setInterval(async () => {
    await checkPeakerrBalance().catch(() => {});
  }, 6 * 60 * 60 * 1000);
  
  // 🔄 주문 상태 자동 동기화 (30분마다)
  setInterval(async () => {
    await syncAllOrderStatuses().catch(e => console.log('주문 동기화 스케줄러 오류:', e.message));
  }, 30 * 60 * 1000);
  
  // 🔄 서비스 동기화 (24시간마다, 삭제/가격변경 체크)
  setInterval(async () => {
    await syncPeakerrServices().catch(e => console.log('서비스 동기화 스케줄러 오류:', e.message));
  }, 24 * 60 * 60 * 1000);
  
  // 🆕 신규 서비스 스캔 (일요일마다)
  setInterval(async () => {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 10) { // 일요일 오전 10시
      await scanNewServices().catch(e => console.log('신규 스캔 오류:', e.message));
    }
  }, 60 * 60 * 1000); // 매 시간 체크 (실제 실행은 일요일 10시만)
  
  // 서버 시작 후 5분 뒤 한 번 실행 (DB 준비 대기)
  setTimeout(async () => {
    console.log('🔄 서버 시작 후 자동 동기화 실행');
    await syncAllOrderStatuses().catch(() => {});
  }, 5 * 60 * 1000);
});


module.exports = app;
