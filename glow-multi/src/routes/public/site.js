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

function registerSiteRoutes(app) {
app.get('/api/site-config', (req, res) => {
  const site = req.site;
  if (!site) return res.json({ error: '사이트를 찾을 수 없습니다' });
  res.json({
    name: site.name, logo: site.logo,
    primaryColor: site.primary_color, accentColor: site.accent_color,
    kakao: site.kakao, bank: site.bank,
    margin: site.margin, exrate: site.exrate,
    superMargin: site.super_margin >= 0 ? site.super_margin : null,
    slogan: site.slogan || '콘텐츠가 빛나도록',
    sloganSub: site.slogan_sub || '우리가 성장시킵니다',
    description: site.description || '유튜브·인스타·틱톡·X까지 모든 소셜 채널의 성장을 자동화합니다',
    stat1Num: site.stat1_num || '10K+', stat1Label: site.stat1_label || '서비스 종류',
    stat2Num: site.stat2_num || '24H', stat2Label: site.stat2_label || '빠른 처리',
    stat3Num: site.stat3_num || '50%+', stat3Label: site.stat3_label || '마진 보장',
    stat4Num: site.stat4_num || '100%', stat4Label: site.stat4_label || '안전 보장',
    notice: site.notice || '',
    footerText: site.footer_text || '소셜 미디어 플랫폼과 공식 제휴된 서비스가 아닙니다.',
    loginWelcome: site.login_welcome || '다시 만나서 반가워요',
    loginSub: site.login_sub || '계정에 로그인하세요',
    registerWelcome: site.register_welcome || '지금 시작하세요',
    registerSub: site.register_sub || '무료로 계정을 만들어보세요',
    kakaoBtnText: site.kakao_btn_text || '카카오톡 문의',
    chargeGuide: site.charge_guide || '입금 후 아래 양식을 작성해주세요.',
    orderGuide: site.order_guide || '주문 후 취소가 어려울 수 있습니다.',
    heroBadge: site.hero_badge || '소셜 성장 자동화 플랫폼',
    theme: site.theme || 'glow'
  });
});

}

module.exports = { registerSiteRoutes };
