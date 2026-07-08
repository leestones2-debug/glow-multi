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

function registerTelegramRoutes(app) {
app.post('/api/tg-webhook', async (req, res) => {
  try {
    const data = req.body;
    if (!data.callback_query) return res.json({ ok: true });
    const cbData = data.callback_query.data;
    const msgId = data.callback_query.message.message_id;
    const chatId = data.callback_query.message.chat.id;
    const token = await getGlobalSetting('tg_token');
    if (!token) return res.json({ ok: true });
    const parts = cbData.split('_');
    const action = parts[0];
    const chargeId = parts.slice(1).join('_');
    const r = await query(`SELECT * FROM charges WHERE id=$1`, [chargeId]);
    const charge = r.rows[0];
    if (!charge || charge.status !== 'pending') {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: data.callback_query.id, text: '이미 처리된 요청입니다' })
      });
      return res.json({ ok: true });
    }
    if (action === 'approve') {
      await query(`UPDATE charges SET status='approved' WHERE id=$1`, [chargeId]);
      await query(`UPDATE users SET balance=balance+$1 WHERE id=$2`, [charge.amount, charge.uid]);
      await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } })
      });
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `✅ 승인 완료!\n👤 ${charge.uname}\n💰 ₩${Math.round(charge.amount).toLocaleString()} 충전됨`, parse_mode: 'HTML' })
      });
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: data.callback_query.id, text: '✅ 승인 완료!' })
      });
    } else if (action === 'reject') {
      await query(`UPDATE charges SET status='rejected' WHERE id=$1`, [chargeId]);
      await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } })
      });
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `❌ 거절 완료!\n👤 ${charge.uname}\n💰 ₩${Math.round(charge.amount).toLocaleString()}`, parse_mode: 'HTML' })
      });
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: data.callback_query.id, text: '❌ 거절 완료!' })
      });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

}

module.exports = { registerTelegramRoutes };
