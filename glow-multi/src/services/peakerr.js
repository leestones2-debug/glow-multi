const fetch = require('node-fetch');
const { query } = require('../lib/db');
const { getGlobalSetting, setGlobalSetting, logBalance, sendTelegramToSuper } = require('../lib/utils');

async function checkPeakerrBalance() {
  try {
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return null;
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'balance' })
    });
    const data = await resp.json();
    const balance = parseFloat(data.balance || 0);
    
    // 잔액 $50 이하면 알림 (하루 최대 1번만)
    if (balance < 50) {
      const lastAlert = await getGlobalSetting('peakerr_low_balance_alert');
      const today = new Date().toDateString();
      if (lastAlert !== today) {
        await sendTelegramToSuper(`⚠️ <b>Peakerr 잔액 부족</b>\n\n현재 잔액: <b>$${balance.toFixed(2)}</b>\n\nhttps://peakerr.com 에서 충전해주세요.`);
        await setGlobalSetting('peakerr_low_balance_alert', today);
      }
    }
    return balance;
  } catch(e) { console.log('Peakerr 잔액 체크 실패:', e.message); return null; }
}

async function fetchPeakerrOrderStatus(apiKey, apiOrderId) {
  try {
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'status', order: apiOrderId })
    });
    return await resp.json();
    // { charge, start_count, status: 'Completed'/'In progress'/'Partial'/'Canceled', remains, currency }
  } catch(e) { console.log('Peakerr 상태 조회 실패:', e.message); return null; }
}

// 💸 주문 자동 환불 처리 (Peakerr 기반)
async function autoRefundOrder(order, peakerrData) {
  try {
    // Peakerr 상태 확인
    const status = (peakerrData.status || '').toLowerCase();
    const remains = parseInt(peakerrData.remains || 0);
    
    let refundPercent = 0;
    let newStatus = order.status;
    
    if (status === 'completed') {
      // 완료 → 환불 없음
      newStatus = 'completed';
    } else if (status === 'canceled' || status === 'cancelled') {
      // 취소됨 → 전액 환불
      refundPercent = 100;
      newStatus = 'refunded';
    } else if (status === 'partial') {
      // 부분 완료 → 미처리분 비례 환불
      if (remains > 0 && order.qty > 0) {
        refundPercent = Math.round((remains / order.qty) * 100);
        newStatus = refundPercent >= 100 ? 'refunded' : 'partial_refunded';
      }
    } else if (status === 'in progress' || status === 'processing' || status === 'pending') {
      newStatus = 'processing';
    } else if (status === 'error' || status === 'failed') {
      // 에러 → 전액 환불
      refundPercent = 100;
      newStatus = 'refunded';
    }
    
    // 상태 업데이트
    if (newStatus !== order.status) {
      await query(`UPDATE orders SET status=$1 WHERE id=$2`, [newStatus, order.id]);
    }
    
    // 환불 처리
    if (refundPercent > 0 && order.status !== 'refunded' && order.status !== 'partial_refunded') {
      const refundAmount = Math.round(order.charge * refundPercent / 100);
      
      // 고객 잔액 복구
      const userR = await query(`SELECT * FROM users WHERE id=$1`, [order.uid]);
      const user = userR.rows[0];
      if (user) {
        const beforeBal = user.balance || 0;
        await query(`UPDATE users SET balance=balance+$1 WHERE id=$2`, [refundAmount, order.uid]);
        const afterR = await query(`SELECT * FROM users WHERE id=$1`, [order.uid]);
        
        await logBalance(
          order.site_id, order.uid, user.name, refundAmount,
          beforeBal, afterR.rows[0]?.balance || 0,
          `자동 환불 (Peakerr ${status}) - 주문 ${order.id}`,
          'system'
        );
      }
      
      // 지인 크레딧도 복구 (default 사이트 아니면)
      if (order.site_id !== 'default') {
        // 공급가 비율로 크레딧 복구 (원가 × 슈퍼마진)
        const siteR = await query(`SELECT * FROM sites WHERE id=$1`, [order.site_id]);
        const site = siteR.rows[0];
        if (site) {
          // 대략적인 원가 비율로 크레딧 복구 (서비스 rate 조회)
          const svcR = await query(`SELECT rate FROM services WHERE id=$1`, [order.sid]);
          if (svcR.rows[0]) {
            const superMgStr = await getGlobalSetting('super_margin');
            const superMg = (site.super_margin >= 0) ? site.super_margin : parseFloat(superMgStr || '50');
            const globalSiteMgStr = await getGlobalSetting('global_site_margin');
            const globalSiteMg = parseFloat(globalSiteMgStr || '50');
            // 지인이 지불한 크레딧 = GLOW 판매가 ($)
            const creditRefund = svcR.rows[0].rate / 1000 * order.qty * (1 + superMg/100) * (1 + globalSiteMg/100) * (refundPercent / 100);
            await query(`UPDATE sites SET credit=credit+$1 WHERE id=$2`, [creditRefund, order.site_id]);
          }
        }
      }
      
      await logActivity(
        order.site_id, 'system', '자동환불',
        `자동 환불 (${refundPercent}%)`, 'order', order.id,
        `Peakerr ${status} → ₩${refundAmount.toLocaleString()} 환불`
      );
    }
    
    return { status: newStatus, refundPercent };
  } catch(e) { console.log('자동 환불 실패:', e.message); return null; }
}

// 🔄 진행중인 모든 주문 상태 동기화
async function syncAllOrderStatuses() {
  try {
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return;
    
    // 진행중 또는 pending 상태인 주문 조회 (Peakerr 주문 ID 있는 것만)
    const r = await query(`
      SELECT * FROM orders 
      WHERE api_order_id IS NOT NULL 
      AND api_order_id != ''
      AND status NOT IN ('completed', 'refunded', 'partial_refunded', 'failed')
      AND created > NOW() - INTERVAL '30 days'
      ORDER BY created DESC
      LIMIT 100
    `);
    
    if (r.rows.length === 0) return;
    console.log(`🔄 주문 상태 동기화 시작: ${r.rows.length}건`);
    
    let completed = 0, refunded = 0, errors = 0;
    for (const order of r.rows) {
      const peakerrData = await fetchPeakerrOrderStatus(apiKey, order.api_order_id);
      if (!peakerrData || peakerrData.error) { errors++; continue; }
      const result = await autoRefundOrder(order, peakerrData);
      if (result) {
        if (result.status === 'completed') completed++;
        if (result.refundPercent > 0) refunded++;
      }
      // Rate limit 회피를 위한 약간의 delay
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`✅ 동기화 완료: 완료 ${completed}건, 환불 ${refunded}건, 오류 ${errors}건`);
    
    // 슈퍼관리자에게 요약 알림 (환불 발생 시에만)
    if (refunded > 0) {
      await sendTelegramToSuper(`🔄 <b>자동 환불 처리</b>\n\n완료: ${completed}건\n환불: ${refunded}건\n오류: ${errors}건`);
    }
  } catch(e) { console.log('주문 동기화 실패:', e.message); }
}

// 🔄 Peakerr 서비스 자동 동기화 (삭제된/변경된 서비스 체크)
async function syncPeakerrServices() {
  try {
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return;
    
    // Peakerr 전체 서비스 목록 가져오기
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'services' })
    });
    const services = await resp.json();
    if (!Array.isArray(services)) return;
    
    const peakerrMap = new Map();
    services.forEach(s => peakerrMap.set(String(s.service), s));
    
    // GLOW DB의 모든 서비스 조회
    const glowR = await query(`SELECT id, name, api_id, rate, active FROM services WHERE api_id IS NOT NULL AND api_id != ''`);
    
    let disabled = 0, priceChanged = 0, checked = 0;
    const priceChangedList = [];
    
    for (const glowSvc of glowR.rows) {
      const peakerrSvc = peakerrMap.get(glowSvc.api_id);
      checked++;
      
      if (!peakerrSvc) {
        // Peakerr에서 삭제됨 → 비활성화
        if (glowSvc.active === 1) {
          await query(`UPDATE services SET active=0 WHERE id=$1`, [glowSvc.id]);
          disabled++;
          console.log(`  ⚠️ 비활성화: ${glowSvc.name}`);
        }
      } else {
        // 원가 변동 체크 (20% 이상 차이)
        const newRate = parseFloat(peakerrSvc.rate);
        const oldRate = parseFloat(glowSvc.rate);
        if (oldRate > 0 && Math.abs(newRate - oldRate) / oldRate > 0.2) {
          priceChangedList.push({
            name: glowSvc.name,
            old: oldRate,
            new: newRate,
            change: ((newRate - oldRate) / oldRate * 100).toFixed(1)
          });
          // 자동 업데이트 (안전하게: 5% 이상 변동 시)
          if (Math.abs(newRate - oldRate) / oldRate > 0.05) {
            await query(`UPDATE services SET rate=$1 WHERE id=$2`, [newRate, glowSvc.id]);
            priceChanged++;
          }
        }
      }
    }
    
    console.log(`✅ 서비스 동기화: 체크 ${checked}개, 비활성화 ${disabled}개, 가격변경 ${priceChanged}개`);
    
    // 슈퍼관리자 알림 (변경사항 있을 때만)
    if (disabled > 0 || priceChanged > 0) {
      let msg = `🔄 <b>서비스 자동 동기화</b>\n\n`;
      if (disabled > 0) msg += `⚠️ 비활성화: ${disabled}개 (Peakerr에서 삭제됨)\n`;
      if (priceChanged > 0) {
        msg += `💰 가격 업데이트: ${priceChanged}개\n`;
        priceChangedList.slice(0, 5).forEach(p => {
          msg += `  • ${p.name.substring(0, 30)}: $${p.old} → $${p.new} (${p.change}%)\n`;
        });
      }
      await sendTelegramToSuper(msg);
    }
  } catch(e) { console.log('서비스 동기화 실패:', e.message); }
}

// 🆕 새로운 고품질 서비스 추천 알림 (주간)
async function scanNewServices() {
  try {
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return;
    
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'services' })
    });
    const services = await resp.json();
    if (!Array.isArray(services)) return;
    
    // 현재 GLOW에 있는 api_id 목록
    const existingR = await query(`SELECT api_id FROM services WHERE api_id IS NOT NULL`);
    const existing = new Set(existingR.rows.map(r => String(r.api_id)));
    
    // 고품질 신규 서비스 필터
    const candidates = [];
    for (const s of services) {
      if (existing.has(String(s.service))) continue;
      const name = (s.name || '').toLowerCase();
      const cat = (s.category || '').toLowerCase();
      if (cat.includes('testing')) continue;
      if (name.includes('bot') || name.includes('fake')) continue;
      
      let score = 0;
      if (/\bhq\b|high quality/.test(name)) score += 100;
      if (/\breal\b/.test(name)) score += 80;
      if (name.includes('non drop') || name.includes('non-drop')) score += 60;
      if (name.includes('lifetime')) score += 50;
      if (s.refill) score += 30;
      if (name.includes('premium')) score += 20;
      if (name.includes('monetiz')) score += 80;
      
      if (score >= 150) {
        candidates.push({ ...s, qs: score });
      }
    }
    
    candidates.sort((a, b) => b.qs - a.qs);
    const top5 = candidates.slice(0, 5);
    
    if (top5.length > 0) {
      let msg = `🆕 <b>Peakerr 신규 고품질 서비스</b>\n\n`;
      top5.forEach((s, i) => {
        msg += `${i+1}. ${(s.name || '').substring(0, 50)}\n`;
        msg += `   💰 $${s.rate}/1K, Q${s.qs}\n\n`;
      });
      msg += `슈퍼관리자에서 추가할지 검토해주세요.`;
      await sendTelegramToSuper(msg);
    }
  } catch(e) { console.log('신규 서비스 스캔 실패:', e.message); }
}

async function tgAlert(msg, site) {
  // 슈퍼관리자(전역)에게 항상 알림 전송
  const superToken = await getGlobalSetting('tg_token');
  const superChat = await getGlobalSetting('tg_chat');
  
  // 사이트별 관리자 텔레그램 (설정된 경우)
  const siteToken = site?.tg_token || '';
  const siteChat = site?.tg_chat || '';
  
  // 중복 방지: 사이트 텔레그램이 슈퍼와 같으면 한 번만
  const sendList = [];
  if (superToken && superChat) {
    sendList.push({ token: superToken, chat: superChat, label: 'super' });
  }
  if (siteToken && siteChat && 
      (siteToken !== superToken || siteChat !== superChat)) {
    sendList.push({ token: siteToken, chat: siteChat, label: 'site' });
  }
  
  // 병렬 전송
  await Promise.all(sendList.map(async ({ token, chat }) => {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: msg, parse_mode: 'HTML' })
      });
    } catch(e) { console.log('TG 오류:', e.message); }
  }));
}

async function tgChargeAlert(chargeId, userName, amount, note, site) {
  const siteName = typeof site === 'object' ? site.name : site;
  const msg = `💳 <b>충전 요청</b> [${siteName}]\n👤 ${userName}\n💰 ₩${Math.round(amount).toLocaleString()}\n📝 ${note || '-'}\n⏰ ${new Date().toLocaleString('ko-KR')}`;
  
  // 슈퍼관리자에게 항상 전송
  const superToken = await getGlobalSetting('tg_token');
  const superChat = await getGlobalSetting('tg_chat');
  
  // 사이트별 관리자 (설정된 경우)
  const siteToken = (typeof site === 'object' ? site.tg_token : '') || '';
  const siteChat = (typeof site === 'object' ? site.tg_chat : '') || '';
  
  const sendList = [];
  if (superToken && superChat) {
    sendList.push({ token: superToken, chat: superChat });
  }
  if (siteToken && siteChat && 
      (siteToken !== superToken || siteChat !== superChat)) {
    sendList.push({ token: siteToken, chat: siteChat });
  }
  
  const body = {
    text: msg, parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ 승인', callback_data: `approve_${chargeId}` },
        { text: '❌ 거절', callback_data: `reject_${chargeId}` }
      ]]
    }
  };
  
  await Promise.all(sendList.map(async ({ token, chat }) => {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, ...body })
      });
    } catch(e) { console.log('TG 오류:', e.message); }
  }));
}

module.exports = {
  checkPeakerrBalance,
  fetchPeakerrOrderStatus, autoRefundOrder,
  syncAllOrderStatuses, syncPeakerrServices, scanNewServices,
  tgAlert, tgChargeAlert
};
