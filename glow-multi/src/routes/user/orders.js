const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { query } = require('../../lib/db');
const { createToken, requireAuth, requireAdmin, requireSuperAdmin } = require('../../lib/auth');
const {
  getGlobalSetting, setGlobalSetting,
  logActivity, logBalance, checkRateLimit, validateUrl
} = require('../../lib/utils');
const {
  checkPeakerrBalance, fetchPeakerrOrderStatus, autoRefundOrder,
  syncAllOrderStatuses, syncPeakerrServices, scanNewServices,
  tgAlert, tgChargeAlert
} = require('../../services/peakerr');
const { sendEmail } = require('../../services/email');

function registerOrdersRoutes(app) {
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    // 🚦 Rate Limit: 분당 10회 주문 제한 (무차별 주문 방지)
    const rateKey = `order:${req.session.userId}`;
    const rateCheck = await checkRateLimit(rateKey, 10);
    if (!rateCheck.ok) {
      return res.json({ error: `너무 빠르게 주문하고 있습니다. ${rateCheck.retry}초 후 다시 시도해주세요.` });
    }
    
    const { sid, link, qty } = req.body;
    const svcR = await query(`SELECT * FROM services WHERE id=$1 AND active=1`, [sid]);
    const svc = svcR.rows[0];
    if (!svc) return res.json({ error: '서비스를 찾을 수 없습니다' });
    
    // 🔗 URL 검증 (플랫폼별 도메인 체크)
    const urlCheck = validateUrl(link, svc.pl);
    if (!urlCheck.ok) return res.json({ error: urlCheck.error });
    
    const qtyNum = parseInt(qty);
    if (isNaN(qtyNum) || qtyNum < svc.min || qtyNum > svc.max)
      return res.json({ error: `수량은 ${svc.min.toLocaleString()} ~ ${svc.max.toLocaleString()} 사이여야 합니다` });
    
    // 🚫 중복 주문 차단: 같은 회원이 같은 URL로 30분 내 중복 주문 방지
    const dupCheck = await query(
      `SELECT id FROM orders WHERE uid=$1 AND sid=$2 AND link=$3 AND created > NOW() - INTERVAL '30 minutes' LIMIT 1`,
      [req.session.userId, sid, link]
    );
    if (dupCheck.rows.length > 0) {
      return res.json({ error: '동일 주문이 30분 내 이미 있습니다. 중복 주문을 방지합니다.' });
    }
    
    const site = req.site;
    const siteMg = site ? (site.margin != null ? site.margin : 0) : 0;
    const globalExrate2 = await getGlobalSetting('global_exrate');
    const ex = (site && site.exrate > 0) ? site.exrate : parseFloat(globalExrate2 || '1500');
    let superMg2;
    if (site && site.super_margin >= 0) {
      superMg2 = site.super_margin;
    } else {
      const superMgStr2 = await getGlobalSetting('super_margin');
      superMg2 = parseFloat(superMgStr2 || '50');
    }
    const isDefaultSite2 = !site || site.id === 'default';
    const globalSiteMgStr2 = await getGlobalSetting('global_site_margin');
    const globalSiteMg2 = parseFloat(globalSiteMgStr2 || '50');
    
    // 🔧 결제 금액 및 크레딧 차감 계산
    // - GLOW(default): 고객 결제 = 원가 × 슈퍼 × 사이트마진
    // - 지인 사이트: 고객 결제 = GLOW 판매가 × (1 + 지인마진)
    //                크레딧 차감 = GLOW 판매가 (지인 입장의 "원가")
    let charge, apiCost;
    if (isDefaultSite2) {
      charge = svc.rate / 1000 * qtyNum * ex * (1 + superMg2 / 100) * (1 + siteMg / 100);
      apiCost = svc.rate / 1000 * qtyNum * (1 + superMg2 / 100); // 공급가($) - default는 크레딧 안 씀
    } else {
      // GLOW 판매가 = 원가 × 슈퍼마진 × 글로벌 사이트마진
      const glowPrice = svc.rate / 1000 * qtyNum * (1 + superMg2 / 100) * (1 + globalSiteMg2 / 100); // $
      // 지인 고객가 = GLOW 판매가 × (1 + 지인마진)
      charge = glowPrice * ex * (1 + siteMg / 100);
      // 지인 크레딧 차감 = GLOW 판매가 ($)
      apiCost = glowPrice;
    }
    const userR = await query(`SELECT * FROM users WHERE id=$1`, [req.session.userId]);
    const user = userR.rows[0];
    if ((user.balance || 0) < charge)
      return res.json({ error: `잔액 부족. 현재 ₩${Math.round(user.balance || 0).toLocaleString()}` });
    if (site && site.credit < apiCost && site.id !== 'default')
      return res.json({ error: '사이트 API 크레딧이 부족합니다.' });
    await query(`UPDATE users SET balance=balance-$1 WHERE id=$2`, [charge, user.id]);
    if (site && site.id !== 'default')
      await query(`UPDATE sites SET credit=GREATEST(0,credit-$1) WHERE id=$2`, [apiCost, site.id]);
    let apiOrderId = null;
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (apiKey && svc.api_id) {
      try {
        const resp = await fetch('https://peakerr.com/api/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ key: apiKey, action: 'add', service: svc.api_id, link, quantity: String(qty) })
        });
        const data = await resp.json();
        if (data.order) apiOrderId = String(data.order);
      } catch(e) { console.log('API 오류:', e.message); }
    }
    const orderId = 'O' + Date.now();
    await query(`INSERT INTO orders(id,site_id,uid,uname,sid,sname,pl,api_order_id,link,qty,charge,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [orderId, req.siteId, user.id, user.name, svc.id, svc.name, svc.pl, apiOrderId, link, qtyNum, charge, apiOrderId ? 'processing' : 'pending']);
    const updR = await query(`SELECT * FROM users WHERE id=$1`, [user.id]);
    tgAlert(`📦 <b>새 주문</b> [${site?.name || 'GLOW'}]\n👤 ${user.name}\n✦ ${svc.name}\n🔢 ${qtyNum.toLocaleString()}개\n💰 ₩${Math.round(charge).toLocaleString()}\n🔗 ${link}`, site);
    
    // 💵 Peakerr 잔액 체크 (비동기, 주문 처리와 별도로)
    checkPeakerrBalance().catch(e => console.log('잔액 체크 실패:', e.message));
    
    res.json({ ok: true, orderId, apiOrderId, balance: updR.rows[0].balance });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/my', requireAuth, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM orders WHERE uid=$1 ORDER BY created DESC`, [req.session.userId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 🔄 고객이 주문 상태 실시간 새로고침 (Peakerr에서 직접 조회)
app.post('/api/orders/refresh/:orderId', requireAuth, async (req, res) => {
  try {
    const orderR = await query(`SELECT * FROM orders WHERE id=$1 AND uid=$2`, [req.params.orderId, req.session.userId]);
    const order = orderR.rows[0];
    if (!order) return res.json({ error: '주문을 찾을 수 없습니다' });
    if (!order.api_order_id) return res.json({ error: 'API 주문 ID가 없습니다' });
    
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return res.json({ error: 'API 키 미설정' });
    
    const peakerrData = await fetchPeakerrOrderStatus(apiKey, order.api_order_id);
    if (!peakerrData || peakerrData.error) return res.json({ error: '상태 조회 실패' });
    
    const result = await autoRefundOrder(order, peakerrData);
    const updR = await query(`SELECT * FROM orders WHERE id=$1`, [order.id]);
    res.json({ ok: true, order: updR.rows[0], peakerrStatus: peakerrData.status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 🚫 고객 주문 취소 요청 (Peakerr가 아직 처리 시작 안 했으면 취소 가능)
app.post('/api/orders/cancel/:orderId', requireAuth, async (req, res) => {
  try {
    const orderR = await query(`SELECT * FROM orders WHERE id=$1 AND uid=$2`, [req.params.orderId, req.session.userId]);
    const order = orderR.rows[0];
    if (!order) return res.json({ error: '주문을 찾을 수 없습니다' });
    if (['completed', 'refunded', 'partial_refunded'].includes(order.status)) {
      return res.json({ error: '이미 완료되거나 환불된 주문입니다' });
    }
    if (!order.api_order_id) {
      // Peakerr 주문 ID 없으면 바로 취소 + 환불
      const userR = await query(`SELECT * FROM users WHERE id=$1`, [order.uid]);
      const user = userR.rows[0];
      if (user) {
        const beforeBal = user.balance || 0;
        await query(`UPDATE users SET balance=balance+$1 WHERE id=$2`, [order.charge, order.uid]);
        await logBalance(order.site_id, order.uid, user.name, order.charge, beforeBal, beforeBal + order.charge, `주문 취소 (API 미전송) - ${order.id}`, 'system');
      }
      await query(`UPDATE orders SET status='refunded' WHERE id=$1`, [order.id]);
      return res.json({ ok: true, message: '주문이 취소되고 전액 환불되었습니다' });
    }
    
    // Peakerr에 취소 요청
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return res.json({ error: 'API 키 미설정' });
    
    try {
      const resp = await fetch('https://peakerr.com/api/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ key: apiKey, action: 'cancel', orders: order.api_order_id })
      });
      const data = await resp.json();
      
      // Peakerr 상태 즉시 조회해서 환불 처리
      const statusData = await fetchPeakerrOrderStatus(apiKey, order.api_order_id);
      if (statusData) {
        const result = await autoRefundOrder(order, statusData);
        if (result && result.refundPercent > 0) {
          return res.json({ ok: true, message: `취소 완료. ${result.refundPercent}% 환불되었습니다.` });
        }
      }
      res.json({ ok: true, message: '취소 요청을 전송했습니다. 잠시 후 상태가 업데이트됩니다.' });
    } catch(e) {
      res.json({ error: '취소 요청 실패: ' + e.message });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

}

module.exports = { registerOrdersRoutes };
