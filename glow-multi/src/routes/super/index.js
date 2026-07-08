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

function registerSuperRoutes(app) {
app.get('/api/super/credit-requests', requireSuperAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM credit_requests ORDER BY created DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/sync-orders', requireSuperAdmin, async (req, res) => {
  try {
    syncAllOrderStatuses().catch(e => console.log(e));
    res.json({ ok: true, message: '주문 동기화를 시작했습니다. 결과는 텔레그램으로 알려드립니다.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 🔄 슈퍼관리자: 수동 서비스 동기화
app.post('/api/super/sync-services', requireSuperAdmin, async (req, res) => {
  try {
    syncPeakerrServices().catch(e => console.log(e));
    res.json({ ok: true, message: '서비스 동기화를 시작했습니다. 결과는 텔레그램으로 알려드립니다.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 🆕 슈퍼관리자: 신규 서비스 스캔
app.post('/api/super/scan-new-services', requireSuperAdmin, async (req, res) => {
  try {
    scanNewServices().catch(e => console.log(e));
    res.json({ ok: true, message: '신규 서비스 스캔을 시작했습니다. 결과는 텔레그램으로 알려드립니다.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 슈퍼관리자 - 크레딧 요청 처리 (승인/거절)
app.post('/api/super/credit-requests/process', requireSuperAdmin, async (req, res) => {
  try {
    const { id, action } = req.body;
    const r = await query(`SELECT * FROM credit_requests WHERE id=$1`, [id]);
    const cr = r.rows[0];
    if (!cr) return res.json({ error: '요청을 찾을 수 없습니다' });
    if (cr.status !== 'pending') return res.json({ error: '이미 처리된 요청입니다' });
    const status = action === 'approve' ? 'approved' : 'rejected';
    await query(`UPDATE credit_requests SET status=$1 WHERE id=$2`, [status, id]);
    if (action === 'approve') {
      await query(`UPDATE sites SET credit=credit+$1 WHERE id=$2`, [cr.amount, cr.site_id]);
      // 해당 사이트 텔레그램 알림
      const siteR = await query(`SELECT * FROM sites WHERE id=$1`, [cr.site_id]);
      const site = siteR.rows[0];
      if (site?.tg_token && site?.tg_chat) {
        await fetch(`https://api.telegram.org/bot${site.tg_token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: site.tg_chat,
            text: `✅ <b>크레딧 충전 완료</b>\n💵 $${cr.amount} 충전됨\n현재 잔액 확인해주세요`,
            parse_mode: 'HTML'
          })
        });
      }
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── 서비스 CRUD (슈퍼어드민) ──
app.post('/api/super/services/create', requireSuperAdmin, async (req, res) => {
  try {
    const { name, pl, rate, min, max, description, active } = req.body;
    if (!name) return res.json({ error: '서비스명을 입력하세요' });
    const id = 'svc_' + Date.now();
    await query(`INSERT INTO services(id,name,pl,rate,min,max,description,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, name, pl||'other', parseFloat(rate||0), parseInt(min||100), parseInt(max||1000000), description||'', active?1:0]);
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/services/update', requireSuperAdmin, async (req, res) => {
  try {
    const { id, name, pl, rate, min, max, description, active } = req.body;
    if (!id) return res.json({ error: 'ID가 없습니다' });
    await query(`UPDATE services SET name=$1,pl=$2,rate=$3,min=$4,max=$5,description=$6,active=$7 WHERE id=$8`,
      [name, pl||'other', parseFloat(rate||0), parseInt(min||100), parseInt(max||1000000), description||'', active?1:0, id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/services/delete', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM services WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 슈퍼어드민 API ──
app.get('/api/super/sites', requireSuperAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM sites ORDER BY created DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/sites/create', requireSuperAdmin, async (req, res) => {
  try {
    const { domain, name, logo, primaryColor, accentColor, adminEmail, adminPw, margin, exrate, credit } = req.body;
    if (!domain || !name || !adminEmail || !adminPw)
      return res.json({ error: '필수 항목을 입력하세요' });
    const siteId = 'site_' + Date.now();
    const superMarginVal = req.body.superMargin !== undefined ? parseFloat(req.body.superMargin) : -1;

    // 자동 테마 생성 - 사이트마다 고유한 조합
    function generateUniqueTheme(seed) {
      let s = seed;
      const rnd = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return Math.abs(s) / 0xffffffff; };
      // 라이트 계열 비중 높임 (dark 25%, mid 25%, light 50%)
      const bgTypeRnd = rnd();
      const bgType = bgTypeRnd < 0.5 ? 'light' : (bgTypeRnd < 0.75 ? 'mid' : 'dark');
      const palettes = [
        {p:'#FF0080',a:'#7928CA'},{p:'#00F5FF',a:'#0050FF'},{p:'#39FF14',a:'#00CC44'},
        {p:'#FFD700',a:'#FF8C00'},{p:'#FF6B35',a:'#FF0A54'},{p:'#00E5CC',a:'#0066FF'},
        {p:'#FF85A1',a:'#C9184A'},{p:'#A855F7',a:'#6D28D9'},{p:'#F97316',a:'#DC2626'},
        {p:'#10B981',a:'#059669'},{p:'#3B82F6',a:'#1D4ED8'},{p:'#EC4899',a:'#9333EA'},
        {p:'#EAB308',a:'#D97706'},{p:'#14B8A6',a:'#0891B2'},{p:'#F43F5E',a:'#E11D48'},
        {p:'#8B5CF6',a:'#7C3AED'},{p:'#06B6D4',a:'#0284C7'},{p:'#84CC16',a:'#65A30D'},
        {p:'#FB923C',a:'#EA580C'},{p:'#E879F9',a:'#A21CAF'},
      ];
      const palette = palettes[Math.floor(rnd() * palettes.length)];
      const fonts = [
        "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "'Courier New',monospace","Georgia,serif",
        "'Helvetica Neue',Helvetica,Arial,sans-serif",
        "Verdana,Geneva,sans-serif","'Trebuchet MS',sans-serif",
      ];
      const font = fonts[Math.floor(rnd() * fonts.length)];
      const radii = ['4px','8px','12px','20px','100px'];
      const radius = radii[Math.floor(rnd() * radii.length)];
      const cardStyles = ['flat','shadow','glow','border'];
      const cardStyle = cardStyles[Math.floor(rnd() * cardStyles.length)];
      const hue = Math.floor(rnd() * 360);
      let bg, w, tx, tm, tl, bd, bd2;
      if (bgType === 'dark') {
        bg=`hsl(${hue},20%,6%)`;w=`hsl(${hue},20%,10%)`;tx=`hsl(${hue},10%,90%)`;
        tm=`hsl(${hue},10%,60%)`;tl=`hsl(${hue},10%,40%)`;
        bd=`hsla(${hue},50%,60%,.15)`;bd2=`hsla(${hue},50%,60%,.35)`;
      } else if (bgType === 'light') {
        bg=`hsl(${hue},30%,97%)`;w=`#ffffff`;tx=`hsl(${hue},40%,10%)`;
        tm=`hsl(${hue},20%,40%)`;tl=`hsl(${hue},15%,60%)`;
        bd=`hsla(${hue},40%,40%,.12)`;bd2=`hsla(${hue},40%,40%,.28)`;
      } else {
        bg=`hsl(${hue},25%,18%)`;w=`hsl(${hue},20%,24%)`;tx=`hsl(${hue},10%,92%)`;
        tm=`hsl(${hue},15%,65%)`;tl=`hsl(${hue},10%,45%)`;
        bd=`hsla(${hue},40%,70%,.18)`;bd2=`hsla(${hue},40%,70%,.38)`;
      }
      return { p1:palette.p, p2:palette.a, p3:palette.a, bg, w, tx, tm, tl, bd, bd2, font, radius, cardStyle, bgType };
    }
    const siteCountR = await query(`SELECT COUNT(*) as cnt FROM sites WHERE id != 'default'`);
    const siteCount = parseInt(siteCountR.rows[0].cnt) || 0;
    const themeData = generateUniqueTheme(siteCount * 999983 + 12345);
    // 🔧 사용자가 색상을 직접 지정했으면 그 색 사용 + theme 비워두기 (glow 기본 테마 사용)
    // 색상 미지정 시에만 자동 랜덤 테마 JSON 사용
    const userPickedColors = !!(primaryColor && accentColor);
    const autoTheme = userPickedColors ? 'glow' : JSON.stringify(themeData);
    const finalPrimary = primaryColor || themeData.p1;
    const finalAccent  = accentColor  || themeData.p2;

    await query(`INSERT INTO sites(id,domain,name,logo,primary_color,accent_color,margin,exrate,credit,super_margin,theme) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [siteId, domain, name, logo||'✨', finalPrimary, finalAccent,
        parseFloat(margin||0), parseFloat(exrate||1380), parseFloat(credit||0), superMarginVal, autoTheme]);
    const hash = bcrypt.hashSync(adminPw, 10);
    const adminRole = req.body.adminRole || 'admin';
    await query(`INSERT INTO users(id,site_id,name,email,pw,role,balance) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      ['admin_'+siteId, siteId, '관리자', adminEmail, hash, adminRole, 0]);
    // 🆕 새 사이트에 활성 서비스 전체 자동 연결 (ON 상태로 site_services 테이블에 INSERT)
    try {
      await query(`
        INSERT INTO site_services(site_id, service_id, active)
        SELECT $1, id, 1 FROM services WHERE active=1
        ON CONFLICT(site_id, service_id) DO UPDATE SET active=1
      `, [siteId]);
    } catch(e) { console.error('site_services 자동 활성화 실패:', e.message); }
    res.json({ ok: true, siteId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/sites/credit', requireSuperAdmin, async (req, res) => {
  try {
    const { siteId, amount } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.json({ error: '금액을 입력하세요' });
    await query(`UPDATE sites SET credit=credit+$1 WHERE id=$2`, [amt, siteId]);
    const r = await query(`SELECT * FROM sites WHERE id=$1`, [siteId]);
    res.json({ ok: true, credit: r.rows[0].credit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/sites/update', requireSuperAdmin, async (req, res) => {
  try {
    const { siteId, name, domain, logo, primaryColor, accentColor, margin, exrate, active } = req.body;
    const superMarginUpd = req.body.superMargin !== undefined ? parseFloat(req.body.superMargin) : -1;
    // 🔧 색상을 지정해서 변경했다면 theme을 'glow'(기본)로 설정해 사용자 색상이 표시되게 함
    await query(`UPDATE sites SET name=$1,domain=$2,logo=$3,primary_color=$4,accent_color=$5,margin=$6,exrate=$7,active=$8,super_margin=$9,theme='glow' WHERE id=$10`,
      [name, domain, logo, primaryColor, accentColor, parseFloat(margin), parseFloat(exrate), active?1:0, superMarginUpd, siteId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.post('/api/super/sites/delete', requireSuperAdmin, async (req, res) => {
  try {
    const { siteId } = req.body;
    if (!siteId || siteId === 'default') return res.json({ error: '기본 사이트는 삭제할 수 없습니다' });
    await query(`DELETE FROM orders WHERE site_id=$1`, [siteId]);
    await query(`DELETE FROM charges WHERE site_id=$1`, [siteId]);
    await query(`DELETE FROM users WHERE site_id=$1`, [siteId]);
    await query(`DELETE FROM sites WHERE id=$1`, [siteId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/settings/save', requireSuperAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = ['super_margin', 'global_exrate', 'peakerr_api_key', 'tg_token', 'tg_chat'];
    if (!allowed.includes(key)) return res.json({ error: '잘못된 설정 키' });
    await setGlobalSetting(key, value);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/super/dashboard', requireSuperAdmin, async (req, res) => {
  try {
    const sites = await query(`SELECT * FROM sites ORDER BY created DESC`);
    const totalUsers = await query(`SELECT COUNT(*) as c FROM users WHERE role='user'`);
    const totalOrders = await query(`SELECT COUNT(*) as c FROM orders`);
    const totalRevenue = await query(`SELECT SUM(charge) as s FROM orders`);
    const pendingCharges = await query(`SELECT COUNT(*) as c FROM charges WHERE status='pending'`);
    // 순수익 계산: 총매출 - API 원가 합계
    const totalApiCost = await query(`SELECT SUM(qty * rate / 1000.0) as s FROM orders o JOIN services s ON o.sid = s.id`);
    let apiBalance = null;
    try {
      const apiKey = await getGlobalSetting('peakerr_api_key');
      if (apiKey) {
        const balResp = await fetch('https://peakerr.com/api/v2', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ key: apiKey, action: 'balance' })
        });
        const balData = await balResp.json();
        if (balData.balance) apiBalance = parseFloat(balData.balance).toFixed(2);
      }
    } catch(e) {}
    const siteStats = await Promise.all(sites.rows.map(async s => {
      const uc = await query(`SELECT COUNT(*) as c FROM users WHERE site_id=$1 AND role='user'`, [s.id]);
      const oc = await query(`SELECT COUNT(*) as c FROM orders WHERE site_id=$1`, [s.id]);
      const rv = await query(`SELECT SUM(charge) as v FROM orders WHERE site_id=$1`, [s.id]);
      const pc = await query(`SELECT COUNT(*) as c FROM charges WHERE site_id=$1 AND status='pending'`, [s.id]);
      return { ...s, userCount: parseInt(uc.rows[0].c), orderCount: parseInt(oc.rows[0].c), revenue: rv.rows[0].v || 0, pendingCharge: parseInt(pc.rows[0].c) };
    }));
    const superMgForProfit = await getGlobalSetting('super_margin');
    const superMgPct = parseFloat(superMgForProfit || '50') / 100;
    const globalEx = await getGlobalSetting('global_exrate');
    const exRate = parseFloat(globalEx || '1500');
    const totalApiCostUsd = totalApiCost.rows[0].s || 0;
    const totalApiCostKrw = totalApiCostUsd * exRate;
    const myProfitKrw = totalApiCostKrw * superMgPct; // 순수익 = API원가 × 슈퍼마진율

    res.json({
      sites: siteStats,
      totalUsers: parseInt(totalUsers.rows[0].c),
      totalOrders: parseInt(totalOrders.rows[0].c),
      totalRevenue: totalRevenue.rows[0].s || 0,
      pendingCharges: parseInt(pendingCharges.rows[0].c),
      apiBalance,
      myProfit: Math.round(myProfitKrw)
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function detectPlat(n) {
  n = n.toLowerCase();
  if (n.includes('youtube')) return 'youtube';
  if (n.includes('instagram')) return 'instagram';
  if (n.includes('tiktok')) return 'tiktok';
  if (n.includes('threads')) return 'threads';
  if (n.includes('twitter') || n.includes(' x ')) return 'twitter';
  if (n.includes('telegram')) return 'telegram';
  if (n.includes('facebook')) return 'facebook';
  if (n.includes('spotify')) return 'spotify';
  if (n.includes('twitch')) return 'twitch';
  if (n.includes('discord')) return 'other';
  if (n.includes('linkedin')) return 'other';
  if (n.includes('pinterest')) return 'other';
  if (n.includes('reddit')) return 'other';
  if (n.includes('soundcloud')) return 'other';
  if (n.includes('트래픽') || n.includes('traffic') || n.includes('seo') || n.includes('검색')) return 'traffic';
  if (n.includes('appstore') || n.includes('play store') || n.includes('ios') || n.includes('android')) return 'appstore';
  return 'other';
}

app.post('/api/super/admin/resetpw', requireSuperAdmin, async (req, res) => {
  try {
    const { uid, newpw } = req.body;
    if (!newpw || newpw.length < 6) return res.json({ error: '6자 이상 입력하세요' });
    const r = await query(`SELECT * FROM users WHERE id=$1`, [uid]);
    if (!r.rows[0] || r.rows[0].role !== 'admin') return res.json({ error: '관리자만 변경 가능합니다' });
    const hash = bcrypt.hashSync(newpw, 10);
    await query(`UPDATE users SET pw=$1 WHERE id=$2`, [hash, uid]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/admin/ban', requireSuperAdmin, async (req, res) => {
  try {
    const { uid } = req.body;
    const r = await query(`SELECT * FROM users WHERE id=$1`, [uid]);
    const user = r.rows[0];
    if (!user || user.role !== 'admin') return res.json({ error: '관리자만 변경 가능합니다' });
    const newStatus = user.status === 'banned' ? 'active' : 'banned';
    await query(`UPDATE users SET status=$1 WHERE id=$2`, [newStatus, uid]);
    res.json({ ok: true, status: newStatus });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/super/admin/delete', requireSuperAdmin, async (req, res) => {
  try {
    const { uid } = req.body;
    const r = await query(`SELECT * FROM users WHERE id=$1`, [uid]);
    if (!r.rows[0] || r.rows[0].role !== 'admin') return res.json({ error: '관리자만 삭제 가능합니다' });
    await query(`DELETE FROM users WHERE id=$1`, [uid]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/super/orders', requireSuperAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM orders ORDER BY created DESC LIMIT 200`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/super/charges', requireSuperAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM charges ORDER BY created DESC LIMIT 200`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/super/users', requireSuperAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT id,site_id,name,email,role,balance,status,joined FROM users ORDER BY joined DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/services/clean', requireSuperAdmin, async (req, res) => {
  try {
    const r = await query(`DELETE FROM services WHERE id LIKE 'api_%'`);
    res.json({ ok: true, deleted: r.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
}

module.exports = { registerSuperRoutes };
