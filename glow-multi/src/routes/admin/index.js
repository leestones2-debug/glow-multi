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

function registerAdminRoutes(app) {
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const siteId = req.session.role === 'superadmin' ? null : req.siteId;
    let users, orders, revenue, pending;
    if (siteId) {
      users   = await query(`SELECT COUNT(*) as c FROM users WHERE role=$1 AND site_id=$2`, ['user', siteId]);
      orders  = await query(`SELECT COUNT(*) as c FROM orders WHERE site_id=$1`, [siteId]);
      revenue = await query(`SELECT SUM(charge) as s FROM orders WHERE site_id=$1`, [siteId]);
      pending = await query(`SELECT COUNT(*) as c FROM charges WHERE status=$1 AND site_id=$2`, ['pending', siteId]);
    } else {
      users   = await query(`SELECT COUNT(*) as c FROM users WHERE role=$1`, ['user']);
      orders  = await query(`SELECT COUNT(*) as c FROM orders`);
      revenue = await query(`SELECT SUM(charge) as s FROM orders`);
      pending = await query(`SELECT COUNT(*) as c FROM charges WHERE status=$1`, ['pending']);
    }
    const credit = req.session.role === 'superadmin' ? null : (req.site?.credit || 0);
    res.json({
      users: parseInt(users.rows[0].c),
      orders: parseInt(orders.rows[0].c),
      revenue: revenue.rows[0].s || 0,
      pendingCharges: parseInt(pending.rows[0].c),
      credit
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const siteId = req.session.role === 'superadmin' ? null : req.siteId;
    const r = siteId
      ? await query(`SELECT * FROM orders WHERE site_id=$1 ORDER BY created DESC`, [siteId])
      : await query(`SELECT * FROM orders ORDER BY created DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/orders/status', requireAdmin, async (req, res) => {
  try {
    const { id, status } = req.body;
    await query(`UPDATE orders SET status=$1 WHERE id=$2`, [status, id]);
    await logActivity(req.siteId, req.session.userId, '', '주문 상태 변경', 'order', id, `상태: ${status}`);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 💸 주문 환불 (고객 잔액 복구 + 주문 상태 변경)
app.post('/api/admin/orders/refund', requireAdmin, async (req, res) => {
  try {
    const { id, refundPercent } = req.body;
    const pct = Math.min(Math.max(parseFloat(refundPercent) || 100, 0), 100);
    
    const orderR = await query(`SELECT * FROM orders WHERE id=$1`, [id]);
    const order = orderR.rows[0];
    if (!order) return res.json({ error: '주문을 찾을 수 없습니다' });
    if (order.status === 'refunded') return res.json({ error: '이미 환불된 주문입니다' });
    
    // 사이트 권한 체크
    if (req.session.role !== 'superadmin' && order.site_id !== req.siteId) {
      return res.json({ error: '다른 사이트 주문은 환불할 수 없습니다' });
    }
    
    // 환불 금액 계산
    const refundAmount = Math.round(order.charge * pct / 100);
    
    // 잔액 복구
    const userR = await query(`SELECT * FROM users WHERE id=$1`, [order.uid]);
    const user = userR.rows[0];
    if (user) {
      const beforeBal = user.balance || 0;
      await query(`UPDATE users SET balance=balance+$1 WHERE id=$2`, [refundAmount, order.uid]);
      const afterR = await query(`SELECT * FROM users WHERE id=$1`, [order.uid]);
      const afterBal = afterR.rows[0].balance || 0;
      
      await logBalance(
        order.site_id, order.uid, user.name, refundAmount,
        beforeBal, afterBal,
        `주문 환불 (${pct}%) - 주문 ${id}`,
        req.session.userId
      );
    }
    
    // 주문 상태 변경
    const newStatus = pct >= 100 ? 'refunded' : 'partial_refunded';
    await query(`UPDATE orders SET status=$1 WHERE id=$2`, [newStatus, id]);
    
    await logActivity(
      req.siteId, req.session.userId, '',
      '주문 환불', 'order', id,
      `${pct}% 환불 (₩${refundAmount.toLocaleString()})`
    );
    
    res.json({ ok: true, refundAmount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const siteId = req.session.role === 'superadmin' ? null : req.siteId;
    const r = siteId
      ? await query(`SELECT * FROM users WHERE site_id=$1 AND role!='superadmin' ORDER BY joined DESC`, [siteId])
      : await query(`SELECT * FROM users WHERE role!='superadmin' ORDER BY joined DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/balance', requireAdmin, async (req, res) => {
  try {
    const { uid, delta, reason } = req.body;
    const deltaNum = parseFloat(delta);
    if (isNaN(deltaNum)) return res.json({ error: '올바른 금액을 입력하세요' });
    if (Math.abs(deltaNum) > 10000000) return res.json({ error: '한 번에 천만원 이상 조정은 불가합니다. 분할 진행해주세요.' });
    
    // 변경 전 잔액 조회
    const beforeR = await query(`SELECT * FROM users WHERE id=$1`, [uid]);
    const beforeUser = beforeR.rows[0];
    if (!beforeUser) return res.json({ error: '회원을 찾을 수 없습니다' });
    const beforeBal = beforeUser.balance || 0;
    
    await query(`UPDATE users SET balance=GREATEST(0,balance+$1) WHERE id=$2`, [deltaNum, uid]);
    const r = await query(`SELECT * FROM users WHERE id=$1`, [uid]);
    const afterBal = r.rows[0].balance || 0;
    
    // 💰 잔액 변동 로그 기록
    await logBalance(
      req.siteId, uid, beforeUser.name, deltaNum, 
      beforeBal, afterBal, 
      reason || '관리자 수동 조정', 
      req.session.userId
    );
    await logActivity(
      req.siteId, req.session.userId, '',
      '잔액 조정', 'user', uid,
      `${deltaNum > 0 ? '+' : ''}${deltaNum.toLocaleString()}원 (사유: ${reason || '없음'})`
    );
    
    res.json({ ok: true, balance: afterBal });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/ban', requireAdmin, async (req, res) => {
  try {
    const { uid } = req.body;
    const r = await query(`SELECT * FROM users WHERE id=$1`, [uid]);
    const user = r.rows[0];
    if (!user || user.role === 'superadmin') return res.json({ error: '처리할 수 없습니다' });
    const newStatus = user.status === 'banned' ? 'active' : 'banned';
    await query(`UPDATE users SET status=$1 WHERE id=$2`, [newStatus, uid]);
    res.json({ ok: true, status: newStatus });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/delete', requireAdmin, async (req, res) => {
  try {
    const { uid } = req.body;
    const r = await query(`SELECT * FROM users WHERE id=$1`, [uid]);
    const user = r.rows[0];
    if (!user || ['admin','superadmin'].includes(user.role)) return res.json({ error: '삭제할 수 없습니다' });
    await query(`DELETE FROM users WHERE id=$1`, [uid]);
    await query(`DELETE FROM orders WHERE uid=$1`, [uid]);
    await query(`DELETE FROM charges WHERE uid=$1`, [uid]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/resetpw', requireAdmin, async (req, res) => {
  try {
    const { uid, newpw } = req.body;
    if (!newpw || newpw.length < 6) return res.json({ error: '6자 이상 입력하세요' });
    const hash = bcrypt.hashSync(newpw, 10);
    await query(`UPDATE users SET pw=$1 WHERE id=$2`, [hash, uid]);
    // 활동 로그
    await logActivity(req.siteId, req.session.userId, '', '비밀번호 리셋', 'user', uid, '관리자가 비밀번호 변경');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/role', requireAdmin, async (req, res) => {
  try {
    const { uid, role } = req.body;
    if (uid === req.session.userId) return res.json({ error: '본인 등급은 변경 불가' });
    await query(`UPDATE users SET role=$1 WHERE id=$2`, [role, uid]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users/:uid/detail', requireAdmin, async (req, res) => {
  try {
    const userR = await query(`SELECT id,name,email,role,balance,status,joined FROM users WHERE id=$1`, [req.params.uid]);
    if (!userR.rows[0]) return res.json({ error: '회원을 찾을 수 없습니다' });
    const orders = await query(`SELECT * FROM orders WHERE uid=$1 ORDER BY created DESC`, [req.params.uid]);
    const charges = await query(`SELECT * FROM charges WHERE uid=$1 ORDER BY created DESC`, [req.params.uid]);
    // 💰 잔액 변동 로그 포함
    const balanceLogs = await query(`SELECT * FROM balance_logs WHERE user_id=$1 ORDER BY created DESC LIMIT 50`, [req.params.uid]);
    res.json({ user: userR.rows[0], orders: orders.rows, charges: charges.rows, balanceLogs: balanceLogs.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 📝 관리자 활동 로그 조회 (슈퍼관리자 또는 해당 사이트 관리자)
app.get('/api/admin/activity-logs', requireAdmin, async (req, res) => {
  try {
    const isSuper = req.session.role === 'superadmin';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const r = isSuper
      ? await query(`SELECT * FROM activity_logs ORDER BY created DESC LIMIT $1`, [limit])
      : await query(`SELECT * FROM activity_logs WHERE site_id=$1 ORDER BY created DESC LIMIT $2`, [req.siteId, limit]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 💰 잔액 변동 로그 조회
app.get('/api/admin/balance-logs', requireAdmin, async (req, res) => {
  try {
    const isSuper = req.session.role === 'superadmin';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const r = isSuper
      ? await query(`SELECT * FROM balance_logs ORDER BY created DESC LIMIT $1`, [limit])
      : await query(`SELECT * FROM balance_logs WHERE site_id=$1 ORDER BY created DESC LIMIT $2`, [req.siteId, limit]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/charges', requireAdmin, async (req, res) => {
  try {
    const siteId = req.session.role === 'superadmin' ? null : req.siteId;
    const r = siteId
      ? await query(`SELECT * FROM charges WHERE site_id=$1 ORDER BY created DESC`, [siteId])
      : await query(`SELECT * FROM charges ORDER BY created DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/charges/process', requireAdmin, async (req, res) => {
  try {
    const { id, action } = req.body;
    const r = await query(`SELECT * FROM charges WHERE id=$1`, [id]);
    const charge = r.rows[0];
    if (!charge) return res.json({ error: '충전 요청을 찾을 수 없습니다' });
    const status = action === 'approve' ? 'approved' : 'rejected';
    await query(`UPDATE charges SET status=$1 WHERE id=$2`, [status, id]);
    if (action === 'approve') {
      // 잔액 변동 로그
      const beforeR = await query(`SELECT * FROM users WHERE id=$1`, [charge.uid]);
      const beforeBal = beforeR.rows[0]?.balance || 0;
      await query(`UPDATE users SET balance=balance+$1 WHERE id=$2`, [charge.amount, charge.uid]);
      const afterR = await query(`SELECT * FROM users WHERE id=$1`, [charge.uid]);
      const afterBal = afterR.rows[0]?.balance || 0;
      
      await logBalance(
        charge.site_id, charge.uid, charge.uname, charge.amount,
        beforeBal, afterBal,
        `충전 승인 (${charge.memo || '메모 없음'})`,
        req.session.userId
      );
      tgAlert(`✅ 충전승인 [${req.site?.name}]\n👤 ${charge.uname}\n💰 ₩${Math.round(charge.amount).toLocaleString()}`, req.site);
    }
    await logActivity(req.siteId, req.session.userId, '', `충전 ${action === 'approve' ? '승인' : '거절'}`, 'charge', id, `₩${Math.round(charge.amount).toLocaleString()}`);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 관리자 서비스 활성화 목록 조회
app.get('/api/admin/site-services', requireAdmin, async (req, res) => {
  try {
    const siteId = req.siteId;
    if (siteId === 'default') return res.json({ error: '슈퍼관리자는 서비스 관리 탭을 이용하세요' });
    // 사이트 정보 가져오기
    const siteR = await query(`SELECT * FROM sites WHERE id=$1`, [siteId]);
    const site = siteR.rows[0];
    // 환율/슈퍼마진/글로벌 사이트마진
    const globalExrate = await getGlobalSetting('global_exrate');
    const ex = (site && site.exrate > 0) ? site.exrate : parseFloat(globalExrate || '1500');
    let superMg;
    if (site && site.super_margin >= 0) {
      superMg = site.super_margin;
    } else {
      const superMgStr = await getGlobalSetting('super_margin');
      superMg = parseFloat(superMgStr || '50');
    }
    const globalSiteMgStr = await getGlobalSetting('global_site_margin');
    const globalSiteMg = parseFloat(globalSiteMgStr || '50');
    const siteMg = site ? (site.margin != null ? site.margin : 0) : 0;
    
    // 전체 서비스 + 이 사이트의 활성화 여부
    const r = await query(`
      SELECT s.id, s.name, s.pl, s.rate, s.min, s.max, s.active as global_active,
        COALESCE(ss.active, 1) as site_active
      FROM services s
      LEFT JOIN site_services ss ON s.id = ss.service_id AND ss.site_id = $1
      WHERE s.active = 1
      ORDER BY s.pl, s.rate ASC
    `, [siteId]);
    
    // 🔒 지인 보호: Peakerr 원가(rate) 숨기고 GLOW 판매가를 "원가"로 노출
    const hiddenServices = r.rows.map(s => {
      // GLOW 판매가 = 원가 × 슈퍼마진 × 글로벌사이트마진 (= 지인 입장의 "원가")
      const glowPricePer1000 = s.rate * ex * (1 + superMg / 100) * (1 + globalSiteMg / 100);
      const sellPer1000 = glowPricePer1000 * (1 + siteMg / 100);
      const baseCostPer1K = Math.max(Math.round(glowPricePer1000), 1);
      const sellPricePer1K = Math.max(Math.round(sellPer1000), 1);
      return {
        id: s.id, name: s.name, pl: s.pl, min: s.min, max: s.max,
        global_active: s.global_active, site_active: s.site_active,
        baseCost: baseCostPer1K,  // GLOW 판매가 (지인 입장의 원가, ₩/1K)
        sellPrice: sellPricePer1K  // 지인의 고객가 (₩/1K)
        // ⚠️ s.rate (Peakerr 진짜 원가)는 절대 내보내지 않음
      };
    });
    res.json(hiddenServices);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 관리자 서비스 켜기/끄기
app.post('/api/admin/site-services/toggle', requireAdmin, async (req, res) => {
  try {
    const siteId = req.siteId;
    if (siteId === 'default') return res.json({ error: '슈퍼관리자는 서비스 관리 탭을 이용하세요' });
    const { serviceId, active } = req.body;
    await query(`
      INSERT INTO site_services(site_id, service_id, active)
      VALUES($1, $2, $3)
      ON CONFLICT(site_id, service_id) DO UPDATE SET active=$3
    `, [siteId, serviceId, active ? 1 : 0]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 관리자 서비스 전체 켜기/끄기
app.post('/api/admin/site-services/toggle-all', requireAdmin, async (req, res) => {
  try {
    const siteId = req.siteId;
    if (siteId === 'default') return res.json({ error: '슈퍼관리자 전용' });
    const { active } = req.body;
    // 전체 서비스에 대해 site_services 레코드 생성/업데이트
    const allSvcs = await query(`SELECT id FROM services WHERE active=1`);
    for (const s of allSvcs.rows) {
      await query(`
        INSERT INTO site_services(site_id, service_id, active)
        VALUES($1, $2, $3)
        ON CONFLICT(site_id, service_id) DO UPDATE SET active=$3
      `, [siteId, s.id, active ? 1 : 0]);
    }
    res.json({ ok: true, count: allSvcs.rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 슈퍼관리자 - 서비스 자동 정리 (카테고리별 베스트만 남기기)
app.post('/api/super/services/auto-clean', requireSuperAdmin, async (req, res) => {
  try {
    // 1. 전체 비활성화
    await query(`UPDATE services SET active=0`);
    // 2. 카테고리별 베스트 선별 기준:
    //    - HQ, Real, Instant, 🔥 키워드 우선
    //    - 가격 적정 (rate > 0.01)
    //    - 카테고리별 최대 25개
    const categories = ['instagram','tiktok','youtube','facebook','telegram','twitter','threads','spotify','twitch','traffic','travel','other'];
    let totalActivated = 0;
    for (const pl of categories) {
      // 좋은 키워드 포함된 것 우선
      const good = await query(`
        SELECT id FROM services
        WHERE pl=$1 AND rate > 0.01
        AND (
          name ILIKE '%HQ%' OR name ILIKE '%Real%' OR name ILIKE '%Instant%'
          OR name ILIKE '%🔥%' OR name ILIKE '%Refill%' OR name ILIKE '%Non Drop%'
          OR name ILIKE '%High Quality%' OR name ILIKE '%Organic%'
        )
        ORDER BY rate ASC
        LIMIT 15
      `, [pl]);
      // 나머지도 저렴한 순으로 채우기
      const goodIds = good.rows.map(r => r.id);
      const rest = await query(`
        SELECT id FROM services
        WHERE pl=$1 AND rate > 0.01
        AND id != ALL($2)
        ORDER BY rate ASC
        LIMIT $3
      `, [pl, goodIds.length ? goodIds : [''], 25 - goodIds.length]);
      const allIds = [...goodIds, ...rest.rows.map(r => r.id)];
      if (allIds.length > 0) {
        await query(`UPDATE services SET active=1 WHERE id = ANY($1)`, [allIds]);
        totalActivated += allIds.length;
      }
    }
    res.json({ ok: true, activated: totalActivated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const site = req.site;
    const isSuperAdmin = req.session.role === 'superadmin';
    const apikey = await getGlobalSetting('peakerr_api_key');
    const global_tg_token = await getGlobalSetting('tg_token');
    const global_tg_chat = await getGlobalSetting('tg_chat');
    const super_margin = await getGlobalSetting('super_margin');
    const global_exrate = await getGlobalSetting('global_exrate');

    // 관리자용: 원가 샘플 계산 (지인에게는 GLOW 판매가가 "원가"로 보임)
    let supplyExamples = [];
    if (!isSuperAdmin) {
      try {
        const ex = (site && site.exrate > 0) ? site.exrate : parseFloat(global_exrate || '1500');
        const superMgStr = super_margin || '50';
        const superMg = (site && site.super_margin >= 0) ? site.super_margin : parseFloat(superMgStr);
        const globalSiteMgStr = await getGlobalSetting('global_site_margin');
        const globalSiteMg = parseFloat(globalSiteMgStr || '50');
        const svcs = await query(`SELECT id, name, rate, pl FROM services WHERE active=1 ORDER BY rate ASC LIMIT 5`);
        supplyExamples = svcs.rows.map(s => ({
          name: s.name,
          pl: s.pl,
          // 🔒 지인에게 노출되는 "원가" = GLOW 판매가 (진짜 원가 + 슈퍼마진 + 글로벌 사이트마진)
          supplyPer1000: Math.round(s.rate * ex * (1 + superMg / 100) * (1 + globalSiteMg / 100)),
        }));
      } catch(e) {}
    }

    res.json({
      name: site?.name || '', kakao: site?.kakao || '',
      bank: site?.bank || '', margin: site?.margin ?? 0,
      exrate: site?.exrate || 1380, credit: site?.credit || 0,
      apikey: isSuperAdmin ? (apikey ? '••••(설정됨)' : '') : '(슈퍼관리자 전용)',
      tg_token: isSuperAdmin ? (global_tg_token ? '••••(설정됨)' : '') : (site?.tg_token ? '••••(설정됨)' : ''),
      tg_chat: isSuperAdmin ? global_tg_chat : (site?.tg_chat || ''),
      site_tg_token: site?.tg_token || '',
      site_tg_chat: site?.tg_chat || '',
      super_margin: isSuperAdmin ? (super_margin || '50') : undefined,
      global_exrate: isSuperAdmin ? (global_exrate || '1500') : undefined,
      isSuperAdmin,
      supplyExamples  // 관리자용 공급가 샘플
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/settings/save', requireAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    const isSuperAdmin = req.session.role === 'superadmin';
    const superOnly = ['peakerr_api_key', 'tg_token', 'tg_chat'];
    if (superOnly.includes(key)) {
      if (isSuperAdmin) {
        await setGlobalSetting(key, value);
        return res.json({ ok: true });
      }
      // 일반 어드민은 사이트별 tg 저장
      if (key === 'tg_token') {
        await query(`UPDATE sites SET tg_token=$1 WHERE id=$2`, [value, req.siteId]);
        return res.json({ ok: true });
      }
      if (key === 'tg_chat') {
        await query(`UPDATE sites SET tg_chat=$1 WHERE id=$2`, [value, req.siteId]);
        return res.json({ ok: true });
      }
      return res.json({ error: '슈퍼관리자 전용 설정입니다' });
    }
    const siteFields = ['name','kakao','bank','margin','exrate','super_margin','primary_color','accent_color','logo','slogan','slogan_sub','description','stat1_num','stat1_label','stat2_num','stat2_label','stat3_num','stat3_label','stat4_num','stat4_label','notice','footer_text','login_welcome','login_sub','register_welcome','register_sub','kakao_btn_text','charge_guide','order_guide','hero_badge'];
    if (siteFields.includes(key)) {
      // 🛡️ 숫자 필드 검증
      if (key === 'margin') {
        const mg = parseFloat(value);
        if (isNaN(mg)) return res.json({ error: '올바른 숫자를 입력하세요' });
        if (mg < 0) return res.json({ error: '마진율은 0% 이상이어야 합니다 (공급가 이하 판매 시 손해)' });
        if (mg > 500) return res.json({ error: '마진율이 너무 높습니다 (최대 500%)' });
      }
      if (key === 'super_margin') {
        const sm = parseFloat(value);
        if (isNaN(sm)) return res.json({ error: '올바른 숫자를 입력하세요' });
        if (sm < -1 || sm > 500) return res.json({ error: '슈퍼마진은 -1(글로벌) 또는 0~500 범위여야 합니다' });
      }
      if (key === 'exrate') {
        const ex = parseFloat(value);
        if (isNaN(ex) || ex < 500 || ex > 3000) return res.json({ error: '환율은 500~3000 범위여야 합니다' });
      }
      // 문자 필드 길이 제한
      if (typeof value === 'string' && value.length > 10000) {
        return res.json({ error: '입력값이 너무 깁니다 (10000자 이하)' });
      }
      await query(`UPDATE sites SET ${key}=$1 WHERE id=$2`, [value, req.siteId]);
      // 활동 로그
      await logActivity(req.siteId, req.session.userId, '', '설정 변경', 'site', req.siteId, `${key} = ${String(value).substring(0, 100)}`);
      return res.json({ ok: true });
    }
    res.json({ error: '잘못된 설정 키' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/api-test', requireSuperAdmin, async (req, res) => {
  try {
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return res.json({ error: 'API 키가 설정되지 않았습니다' });
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'balance' })
    });
    const data = await resp.json();
    if (data.balance !== undefined) res.json({ ok: true, balance: data.balance });
    else res.json({ error: JSON.stringify(data) });
  } catch(e) { res.json({ error: e.message }); }
});

app.get('/api/admin/api-sync', requireSuperAdmin, async (req, res) => {
  try {
    const apiKey = await getGlobalSetting('peakerr_api_key');
    if (!apiKey) return res.json({ error: 'API 키가 설정되지 않았습니다' });
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'services' })
    });
    const data = await resp.json();
    if (!Array.isArray(data)) return res.json({ error: 'API 응답 오류' });
    await query(`DELETE FROM services`);
    for (const s of data) {
      await query(`INSERT INTO services(id,name,pl,rate,min,max,description,api_id,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
        ['api_'+s.service, s.name, detectPlat(s.name+' '+(s.category||'')),
          parseFloat(s.rate||0), parseInt(s.min||100), parseInt(s.max||1000000),
          s.type||'', String(s.service), 1]);
    }
    res.json({ ok: true, count: data.length });
  } catch(e) { res.json({ error: e.message }); }
});

}

module.exports = { registerAdminRoutes };
