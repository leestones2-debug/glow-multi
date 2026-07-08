const fetch = require('node-fetch');
const { query } = require('./db');

async function getGlobalSetting(key) {
  const r = await query(`SELECT value FROM global_settings WHERE key=$1`, [key]);
  return r.rows[0] ? r.rows[0].value : '';
}
async function setGlobalSetting(key, value) {
  await query(`INSERT INTO global_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2`, [key, value]);
}

// 🛡️ ── 보안 & 검증 유틸 ──

// 📝 활동 로그 기록
async function logActivity(siteId, adminId, adminName, action, targetType, targetId, details) {
  try {
    await query(
      `INSERT INTO activity_logs(site_id, admin_id, admin_name, action, target_type, target_id, details) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [siteId || 'default', adminId || '', adminName || '', action, targetType || '', targetId || '', details || '']
    );
  } catch(e) { console.log('로그 기록 실패:', e.message); }
}

// 💰 잔액 변동 로그
async function logBalance(siteId, userId, userName, delta, beforeBalance, afterBalance, reason, adminId) {
  try {
    await query(
      `INSERT INTO balance_logs(site_id, user_id, user_name, delta, before_balance, after_balance, reason, admin_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [siteId || 'default', userId, userName || '', delta, beforeBalance || 0, afterBalance || 0, reason || '', adminId || '']
    );
  } catch(e) { console.log('잔액 로그 실패:', e.message); }
}

// 🚦 Rate Limit 체크 (분당 요청 수 제한)
async function checkRateLimit(key, maxPerMinute = 60) {
  try {
    const now = new Date();
    const r = await query(`SELECT * FROM rate_limits WHERE key=$1`, [key]);
    if (!r.rows[0]) {
      await query(`INSERT INTO rate_limits(key, count, window_start) VALUES($1, 1, $2) ON CONFLICT(key) DO UPDATE SET count=1, window_start=$2`, [key, now]);
      return { ok: true };
    }
    const row = r.rows[0];
    const windowStart = new Date(row.window_start);
    const diffSec = (now - windowStart) / 1000;
    
    if (diffSec > 60) {
      // 윈도우 리셋
      await query(`UPDATE rate_limits SET count=1, window_start=$1 WHERE key=$2`, [now, key]);
      return { ok: true };
    }
    
    if (row.count >= maxPerMinute) {
      return { ok: false, retry: Math.ceil(60 - diffSec) };
    }
    
    await query(`UPDATE rate_limits SET count=count+1 WHERE key=$1`, [key]);
    return { ok: true };
  } catch(e) { 
    console.log('Rate limit 체크 실패:', e.message);
    return { ok: true }; // 오류 시 통과 (서비스 중단 방지)
  }
}

// 🔗 URL 검증 (플랫폼별)
function validateUrl(url, platform) {
  if (!url || typeof url !== 'string') return { ok: false, error: 'URL을 입력해주세요' };
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, '').toLowerCase();
    
    const validDomains = {
      youtube: ['youtube.com', 'youtu.be', 'm.youtube.com'],
      instagram: ['instagram.com', 'instagr.am'],
      tiktok: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
      twitter: ['twitter.com', 'x.com'],
      facebook: ['facebook.com', 'fb.com', 'fb.watch', 'm.facebook.com'],
      telegram: ['t.me', 'telegram.me'],
      threads: ['threads.com', 'threads.net'],
      spotify: ['spotify.com', 'open.spotify.com'],
      twitch: ['twitch.tv'],
    };
    
    const expectedDomains = validDomains[platform];
    if (!expectedDomains) return { ok: true }; // 기타/traffic은 검증 안 함
    
    const isValid = expectedDomains.some(d => domain === d || domain.endsWith('.' + d));
    if (!isValid) {
      return { ok: false, error: `잘못된 URL입니다. ${platform} 서비스는 ${expectedDomains[0]} 링크를 입력해주세요.` };
    }
    return { ok: true };
  } catch(e) {
    return { ok: false, error: '올바른 URL 형식이 아닙니다 (예: https://...)' };
  }
}

async function sendTelegramToSuper(message) {
  try {
    const token = await getGlobalSetting('tg_token');
    const chat = await getGlobalSetting('tg_chat');
    if (!token || !chat) return false;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: message, parse_mode: 'HTML' })
    });
    return true;
  } catch(e) { console.log('텔레그램 발송 실패:', e.message); return false; }
}

module.exports = {
  getGlobalSetting, setGlobalSetting,
  logActivity, logBalance, checkRateLimit,
  validateUrl, sendTelegramToSuper
};
