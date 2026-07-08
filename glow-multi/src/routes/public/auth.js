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

function registerAuthRoutes(app) {
app.post('/api/login', async (req, res) => {
  try {
    // 🚦 로그인 시도 제한: IP+이메일 기준 분당 5회
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const { email, pw } = req.body;
    if (!email || !pw) return res.json({ error: '이메일과 비밀번호를 입력하세요' });
    
    const rateCheck = await checkRateLimit(`login:${ip}:${email}`, 5);
    if (!rateCheck.ok) {
      return res.json({ error: `로그인 시도가 너무 많습니다. ${rateCheck.retry}초 후 다시 시도해주세요.` });
    }
    
    let r = await query(`SELECT * FROM users WHERE site_id=$1 AND email=$2`, [req.siteId, email]);
    let targetUser = r.rows[0];
    if (!targetUser) {
      r = await query(`SELECT * FROM users WHERE role='superadmin' AND email=$1`, [email]);
      targetUser = r.rows[0];
    }
    if (!targetUser || !bcrypt.compareSync(pw, targetUser.pw))
      return res.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    if (targetUser.status === 'banned')
      return res.json({ error: '정지된 계정입니다. 관리자에게 문의하세요.' });
    const token = createToken({ userId: targetUser.id, role: targetUser.role, siteId: req.siteId });
    res.json({ ok: true, token, user: { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role, balance: targetUser.balance }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
  try {
    // 🚦 회원가입 스팸 방지: IP 기준 분당 3회
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const rateCheck = await checkRateLimit(`register:${ip}`, 3);
    if (!rateCheck.ok) {
      return res.json({ error: `회원가입 시도가 너무 많습니다. ${rateCheck.retry}초 후 다시 시도해주세요.` });
    }
    
    const { name, email, pw } = req.body;
    if (!name || !email || !pw) return res.json({ error: '모든 항목을 입력하세요' });
    if (pw.length < 6) return res.json({ error: '비밀번호는 6자 이상이어야 합니다' });
    // 이메일 형식 검증
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json({ error: '올바른 이메일 형식이 아닙니다' });
    // 이름 길이 제한 (봇 스팸 방지)
    if (name.length < 2 || name.length > 50) return res.json({ error: '이름은 2~50자 사이여야 합니다' });
    
    const exists = await query(`SELECT id FROM users WHERE site_id=$1 AND email=$2`, [req.siteId, email]);
    if (exists.rows.length > 0) return res.json({ error: '이미 사용 중인 이메일입니다' });
    const hash = bcrypt.hashSync(pw, 10);
    const id = 'u' + Date.now();
    await query(`INSERT INTO users(id,site_id,name,email,pw,role,balance) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.siteId, name, email, hash, 'user', 0]);
    const token = createToken({ userId: id, role: 'user', siteId: req.siteId });
    res.json({ ok: true, token, user: { id, name, email, role: 'user', balance: 0 }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', (req, res) => { res.json({ ok: true }); });

// ═══════════════════════════════════════
// 🔐 비밀번호 재설정 (이메일 기반)
// ═══════════════════════════════════════


// Step 1: 비밀번호 재설정 요청 (이메일 입력)
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ error: '이메일을 입력하세요' });
    // 현재 사이트 기준 사용자 찾기
    const siteId = req.siteId || 'default';
    const userR = await query(`SELECT * FROM users WHERE site_id=$1 AND email=$2`, [siteId, email]);
    const user = userR.rows[0];
    
    // 보안: 사용자 존재 여부와 상관없이 동일한 메시지 반환 (이메일 존재 유출 방지)
    if (!user) {
      return res.json({ ok: true, message: '해당 이메일로 재설정 링크를 보냈습니다. 메일함을 확인해주세요.' });
    }
    
    // 토큰 생성 (30분 유효)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30분
    await query(`INSERT INTO password_resets(token, user_id, site_id, email, expires) VALUES($1,$2,$3,$4,$5)`,
      [token, user.id, siteId, email, expires]);
    
    // 사이트 정보 가져오기
    const siteR = await query(`SELECT * FROM sites WHERE id=$1`, [siteId]);
    const site = siteR.rows[0];
    const siteName = site?.name || 'GLOW';
    const siteDomain = site?.domain || 'glow-multi.onrender.com';
    const resetUrl = `https://${siteDomain}/reset-password?token=${token}`;
    
    // HTML 이메일 템플릿
    const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>비밀번호 재설정</title></head>
    <body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px;margin:0">
      <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:40px 30px;box-shadow:0 2px 10px rgba(0,0,0,0.08)">
        <h1 style="color:#7209B7;margin:0 0 24px 0;font-size:24px">🔐 ${siteName} 비밀번호 재설정</h1>
        <p style="color:#333;font-size:15px;line-height:1.7">안녕하세요 <strong>${user.name || '고객'}</strong>님,</p>
        <p style="color:#333;font-size:15px;line-height:1.7">비밀번호 재설정 요청을 받았습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정해주세요.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${resetUrl}" style="background:linear-gradient(135deg,#7209B7,#F72585);color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block">비밀번호 재설정하기</a>
        </div>
        <p style="color:#666;font-size:13px;line-height:1.6;background:#f9f9f9;padding:16px;border-radius:8px">
          ⚠️ <strong>이 링크는 30분 동안만 유효</strong>합니다.<br>
          만약 본인이 요청하지 않았다면 이 메일을 무시하셔도 안전합니다.
        </p>
        <p style="color:#999;font-size:12px;text-align:center;margin-top:32px;line-height:1.6">
          링크가 열리지 않을 경우 아래 주소를 복사해서 브라우저에 붙여넣으세요:<br>
          <span style="word-break:break-all;color:#7209B7">${resetUrl}</span>
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
        <p style="color:#aaa;font-size:11px;text-align:center">이 메일은 ${siteName}에서 자동 발송되었습니다.</p>
      </div>
    </body>
    </html>`;
    
    const sent = await sendEmail(email, `[${siteName}] 비밀번호 재설정 안내`, html);
    if (!sent) {
      return res.json({ error: '이메일 발송에 실패했습니다. 사이트 관리자에게 문의해주세요.' });
    }
    res.json({ ok: true, message: '해당 이메일로 재설정 링크를 보냈습니다. 메일함을 확인해주세요.' });
  } catch(e) { console.log('forgot-password 오류:', e); res.status(500).json({ error: e.message }); }
});

// Step 2: 토큰 검증 (리셋 페이지 접속 시)
app.get('/api/reset-password/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.json({ error: '유효하지 않은 링크입니다' });
    const r = await query(`SELECT * FROM password_resets WHERE token=$1`, [token]);
    const reset = r.rows[0];
    if (!reset) return res.json({ error: '유효하지 않은 링크입니다' });
    if (reset.used) return res.json({ error: '이미 사용된 링크입니다' });
    if (new Date(reset.expires) < new Date()) return res.json({ error: '링크가 만료되었습니다 (30분 경과). 다시 요청해주세요.' });
    res.json({ ok: true, email: reset.email });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Step 3: 새 비밀번호 설정
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, newpw } = req.body;
    if (!token || !newpw) return res.json({ error: '모든 정보를 입력해주세요' });
    if (newpw.length < 6) return res.json({ error: '비밀번호는 6자 이상이어야 합니다' });
    
    const r = await query(`SELECT * FROM password_resets WHERE token=$1`, [token]);
    const reset = r.rows[0];
    if (!reset) return res.json({ error: '유효하지 않은 링크입니다' });
    if (reset.used) return res.json({ error: '이미 사용된 링크입니다' });
    if (new Date(reset.expires) < new Date()) return res.json({ error: '링크가 만료되었습니다' });
    
    // 비밀번호 변경
    const hash = bcrypt.hashSync(newpw, 10);
    await query(`UPDATE users SET pw=$1 WHERE id=$2`, [hash, reset.user_id]);
    // 토큰 사용 처리
    await query(`UPDATE password_resets SET used=1 WHERE token=$1`, [token]);
    
    res.json({ ok: true, message: '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
}

module.exports = { registerAuthRoutes };
