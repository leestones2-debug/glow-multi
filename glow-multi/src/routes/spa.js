const path = require('path');
const fs = require('fs');

function registerSpaRoute(app) {
  app.get('*', async (req, res) => {
    try {
      // HTML 파일 매번 새로 읽기 (사이트 설정 변경 시 즉시 반영)
      const html_template = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
      let html = html_template;
      
      // 현재 요청 도메인의 사이트 정보
      const site = req.site;
      
      // 기본값 (default 사이트 또는 site 없을 경우)
      let siteName = 'GLOW';
      let siteLogo = '✨';
      let primaryColor = '#F72585';
      let accentColor = '#B5179E';
      let p3Color = '#7209B7';
      
      if (site) {
        siteName = (site.name || 'GLOW').replace(/[<>"']/g, '');
        siteLogo = (site.logo || '✨').replace(/[<>"']/g, '');
        if (site.primary_color) primaryColor = site.primary_color;
        if (site.accent_color) accentColor = site.accent_color;
      }
      
      // HTML placeholder를 실제 값으로 치환 (모든 발생 위치)
      html = html.split('__SITE_NAME__').join(siteName);
      html = html.split('__SITE_LOGO__').join(siteLogo);
      
      // 커스텀 테마 색상 주입 (기본 CSS 변수를 덮어씀)
      const customTheme = `<style id="dynamic-theme">
  :root{
    --p1:${primaryColor} !important;
    --p2:${accentColor} !important;
    --p3:${p3Color} !important;
    --g:linear-gradient(135deg,${primaryColor},${accentColor},${p3Color},#4361EE) !important;
  }
  </style>`;
      html = html.replace('<!-- __CUSTOM_THEME__ -->', customTheme);
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(html);
    } catch(e) {
      console.log('HTML 렌더 오류:', e.message);
      res.status(500).send('서버 오류');
    }
  });
}

module.exports = { registerSpaRoute };
