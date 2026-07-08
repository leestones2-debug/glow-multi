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

function registerToolsRoutes(app) {
app.post('/api/admin/tg-test', requireAdmin, async (req, res) => {
  try {
    const isSuperAdmin = req.session.role === 'superadmin';
    let token, chat;
    if (isSuperAdmin) {
      token = await getGlobalSetting('tg_token');
      chat = await getGlobalSetting('tg_chat');
    } else {
      const site = req.site;
      token = site?.tg_token || '';
      chat = site?.tg_chat || '';
    }
    if (!token || !chat) return res.json({ error: '텔레그램 설정을 먼저 저장하세요' });
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: `✅ ${req.site?.name || 'GLOW'} 알림 테스트 성공! ✨` })
    });
    const data = await resp.json();
    if (data.ok) res.json({ ok: true });
    else res.json({ error: data.description });
  } catch(e) { res.json({ error: e.message }); }
});


// ── 어드민 크레딧 요청 API ──

// 어드민이 슈퍼관리자에게 크레딧 요청
app.post('/api/admin/credit-request', requireAdmin, async (req, res) => {
  try {
    const { amount, note } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.json({ error: '금액을 입력하세요' });
    const site = req.site;
    if (!site) return res.json({ error: '사이트 정보를 찾을 수 없습니다' });
    const id = 'CR' + Date.now();
    await query(`INSERT INTO credit_requests(id,site_id,site_name,amount,note,status) VALUES($1,$2,$3,$4,$5,$6)`,
      [id, site.id, site.name, amt, note || '', 'pending']);
    // 슈퍼관리자 텔레그램 알림
    const token = await getGlobalSetting('tg_token');
    const chat = await getGlobalSetting('tg_chat');
    if (token && chat) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chat,
          text: `💰 <b>크레딧 요청</b>\n🏢 ${site.name}\n💵 $${amt}\n📝 ${note || '-'}\n⏰ ${new Date().toLocaleString('ko-KR')}`,
          parse_mode: 'HTML'
        })
      });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 어드민이 본인 크레딧 요청 내역 조회
app.get('/api/admin/credit-requests', requireAdmin, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM credit_requests WHERE site_id=$1 ORDER BY created DESC`, [req.siteId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

}

module.exports = { registerToolsRoutes };
