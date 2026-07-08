const fetch = require('node-fetch');

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log('⚠️ RESEND_API_KEY 미설정 - 이메일 발송 스킵'); return false; }
  try {
    const from = process.env.EMAIL_FROM || 'noreply@glow-multi.onrender.com';
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html })
    });
    const data = await resp.json();
    if (!resp.ok) { console.log('❌ 이메일 발송 실패:', data); return false; }
    return true;
  } catch(e) { console.log('❌ 이메일 오류:', e.message); return false; }
}

module.exports = { sendEmail };
