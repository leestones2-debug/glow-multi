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

function registerServicesRoutes(app) {
app.get('/api/services', async (req, res) => {
  try {
    const site = req.site;
    const siteMg = site ? (site.margin != null ? site.margin : 0) : 0;
    // 환율: 사이트별 → 글로벌 순으로 적용
    const globalExrate = await getGlobalSetting('global_exrate');
    const ex = (site && site.exrate > 0) ? site.exrate : parseFloat(globalExrate || '1500');
    // 슈퍼마진: 사이트별 → 글로벌 순으로 적용
    let superMg;
    if (site && site.super_margin >= 0) {
      superMg = site.super_margin;
    } else {
      const superMgStr = await getGlobalSetting('super_margin');
      superMg = parseFloat(superMgStr || '50');
    }
    // 사이트별 서비스 필터링 (default 사이트는 전체, 다른 사이트는 site_services 기준)
    let serviceRows;
    if (site && site.id !== 'default') {
      const ssR = await query(`
        SELECT s.* FROM services s
        INNER JOIN site_services ss ON s.id = ss.service_id
        WHERE s.active=1 AND ss.site_id=$1 AND ss.active=1
        ORDER BY s.id
      `, [site.id]);
      serviceRows = ssR.rows;
      // site_services 설정이 없으면 전체 보여줌 (초기 설정 전)
      if (serviceRows.length === 0) {
        const allR = await query(`SELECT * FROM services WHERE active=1 ORDER BY id`);
        serviceRows = allR.rows;
      }
    } else {
      const allR = await query(`SELECT * FROM services WHERE active=1 ORDER BY id`);
      serviceRows = allR.rows;
    }
    const isPartner = req.session && req.session.role === 'partner';
    const isDefaultSite = !site || site.id === 'default';
    
    // 🎯 플랫폼 우선순위 정렬 (한국 사용자 선호도 기반)
    // YouTube, Instagram, TikTok 먼저 → Twitter, Threads → 기타
    const platformOrder = {
      youtube: 1, instagram: 2, tiktok: 3,
      threads: 4, twitter: 5, spotify: 6,
      twitch: 7, facebook: 8, telegram: 9,
      traffic: 10, travel: 11, other: 99,
    };
    serviceRows.sort((a, b) => {
      const oa = platformOrder[a.pl] || 50;
      const ob = platformOrder[b.pl] || 50;
      if (oa !== ob) return oa - ob;
      return (a.id > b.id ? 1 : -1); // 같은 플랫폼 내에서는 id 순
    });
    
    // 글로벌 기본 사이트 마진 (GLOW의 사이트 마진)
    const globalSiteMgStr = await getGlobalSetting('global_site_margin');
    const globalSiteMg = parseFloat(globalSiteMgStr || '50');
    
    res.json(serviceRows.map(s => {
      // 🔧 가격 계산 구조:
      // - GLOW(default): 원가 × 슈퍼마진 × 사이트마진 = 판매가
      // - 지인 사이트: GLOW 판매가 × (1 + 지인마진) = 지인 고객가
      //   → 지인 입장에서는 GLOW 판매가가 "원가"처럼 보임
      
      const origPer1000 = s.rate * ex; // Peakerr 원가 (원화/1000)
      const supplyPer1000 = origPer1000 * (1 + superMg / 100); // 공급가 (원가 + 슈퍼마진)
      
      // GLOW 판매가 = 공급가 × (1 + 글로벌 사이트마진) - 지인에게는 이게 "원가"
      const glowPricePer1000 = supplyPer1000 * (1 + globalSiteMg / 100);
      
      let sellPer1000;
      let baseCostPer1000; // 지인 입장의 "원가"
      
      if (isDefaultSite) {
        // GLOW 본사: 원가 × 슈퍼 × 사이트마진
        sellPer1000 = supplyPer1000 * (1 + siteMg / 100);
        baseCostPer1000 = supplyPer1000; // 공급가
      } else {
        // 지인 사이트: GLOW 판매가 × (1 + 지인마진)
        sellPer1000 = glowPricePer1000 * (1 + siteMg / 100);
        baseCostPer1000 = glowPricePer1000; // 지인에게는 GLOW 판매가가 원가
      }
      
      // 1개당 환산 (최소 1원 보장)
      const originalCost = Math.max(Math.round(origPer1000 / 1000), 1);
      const supplyCost = Math.max(Math.round(supplyPer1000 / 1000), 1);
      const sellPrice = Math.max(Math.round(sellPer1000 / 1000), 1);
      const baseCost = Math.max(Math.round(baseCostPer1000 / 1000), 1);
      
      if (isPartner || !isDefaultSite) {
        // 지인/파트너: GLOW 판매가를 원가로 보여줌 (실제 Peakerr 원가 숨김)
        return { ...s, sell: sellPrice, baseCost, isPartnerView: true };
      }
      // GLOW 본사(슈퍼관리자): 모든 정보 공개
      return { ...s, sell: sellPrice, originalCost, supplyCost, myProfit: supplyCost - originalCost };
    }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

}

module.exports = { registerServicesRoutes };
