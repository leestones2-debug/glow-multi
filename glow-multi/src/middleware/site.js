const { query } = require('../lib/db');

function siteMiddleware() {
  return async (req, res, next) => {
    host = host.split(':')[0];
    try {
      let r = await query(`SELECT * FROM sites WHERE domain=$1 AND active=1`, [host]);
      let site = r.rows[0];
      if (!site) {
        // www 제거 후 재시도 (예: www.no9story.com → no9story.com)
        const bareHost = host.replace(/^www\./, '');
        if (bareHost !== host) {
          r = await query(`SELECT * FROM sites WHERE domain=$1 AND active=1`, [bareHost]);
          site = r.rows[0];
        }
      }
      if (!site) {
        // 매칭 실패 시 default 사이트 사용 (도메인 덮어쓰기 제거)
        r = await query(`SELECT * FROM sites WHERE id='default'`);
        site = r.rows[0];
      }
      req.site = site;
      req.siteId = site ? site.id : 'default';
    } catch(e) {
      req.site = null;
      req.siteId = 'default';
    }
    next();
  };
}

module.exports = { siteMiddleware };
