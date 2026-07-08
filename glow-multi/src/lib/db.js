const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

// ── DB 초기화 ──
async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      logo TEXT DEFAULT '✨',
      primary_color TEXT DEFAULT '#7209B7',
      accent_color TEXT DEFAULT '#F72585',
      kakao TEXT DEFAULT '',
      bank TEXT DEFAULT '',
      margin REAL DEFAULT 0,
      exrate REAL DEFAULT 1380,
      credit REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      tg_token TEXT DEFAULT '',
      tg_chat TEXT DEFAULT '',
      super_margin REAL DEFAULT -1,
      slogan TEXT DEFAULT '콘텐츠가 빛나도록',
      slogan_sub TEXT DEFAULT '우리가 성장시킵니다',
      description TEXT DEFAULT '유튜브·인스타·틱톡·X까지 모든 소셜 채널의 성장을 자동화합니다',
      stat1_num TEXT DEFAULT '10K+',
      stat1_label TEXT DEFAULT '서비스 종류',
      stat2_num TEXT DEFAULT '24H',
      stat2_label TEXT DEFAULT '빠른 처리',
      stat3_num TEXT DEFAULT '50%+',
      stat3_label TEXT DEFAULT '마진 보장',
      stat4_num TEXT DEFAULT '100%',
      stat4_label TEXT DEFAULT '안전 보장',
      notice TEXT DEFAULT '',
      footer_text TEXT DEFAULT '소셜 미디어 플랫폼과 공식 제휴된 서비스가 아닙니다.',
      login_welcome TEXT DEFAULT '다시 만나서 반가워요',
      login_sub TEXT DEFAULT '계정에 로그인하세요',
      register_welcome TEXT DEFAULT '지금 시작하세요',
      register_sub TEXT DEFAULT '무료로 계정을 만들어보세요',
      kakao_btn_text TEXT DEFAULT '카카오톡 문의',
      charge_guide TEXT DEFAULT '입금 후 아래 양식을 작성해주세요. 확인 후 빠르게 처리해드립니다.',
      order_guide TEXT DEFAULT '주문 후 취소가 어려울 수 있습니다. 신중하게 주문해주세요.',
      hero_badge TEXT DEFAULT '소셜 성장 자동화 플랫폼',
      created TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      pw TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      joined TIMESTAMP DEFAULT NOW(),
      UNIQUE(site_id, email)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pl TEXT DEFAULT 'other',
      rate REAL DEFAULT 0,
      min INTEGER DEFAULT 100,
      max INTEGER DEFAULT 1000000,
      description TEXT DEFAULT '',
      api_id TEXT DEFAULT NULL,
      active INTEGER DEFAULT 1
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      uid TEXT NOT NULL,
      uname TEXT NOT NULL,
      sid TEXT NOT NULL,
      sname TEXT NOT NULL,
      pl TEXT DEFAULT 'other',
      api_order_id TEXT DEFAULT NULL,
      link TEXT NOT NULL,
      qty INTEGER NOT NULL,
      charge REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS charges (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      uid TEXT NOT NULL,
      uname TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS credit_requests (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      site_name TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created TIMESTAMP DEFAULT NOW()
    )
  `);

  // 기본 설정
  const defaults = {
    peakerr_api_key: process.env.PEAKERR_API_KEY || '',
    tg_token: process.env.TG_TOKEN || '',
    tg_chat: process.env.TG_CHAT || '',
    super_margin: '50',  // 슈퍼관리자 마진율 (%)
    global_site_margin: '50',  // 글로벌 기본 사이트 마진율 (GLOW 판매가 계산용)
    global_exrate: '1500'  // 글로벌 기본 환율
  };
  for (const [k, v] of Object.entries(defaults)) {
    await query(`INSERT INTO global_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`, [k, v]);
  }

  // 기본 사이트
  const siteExists = await query(`SELECT id FROM sites WHERE id='default'`);
  if (siteExists.rows.length === 0) {
    await query(`INSERT INTO sites(id,domain,name,logo,primary_color,accent_color,kakao,bank,margin,exrate,credit)
      VALUES('default','localhost','GLOW','✨','#7209B7','#F72585',
      'https://open.kakao.com/o/sphCuRed',
      '우리은행 1002-160-164625 (예금주: 조인호)',
      50,1380,999999999)`);
  }

  // 슈퍼어드민
  const superAdmin = await query(`SELECT id FROM users WHERE role='superadmin'`);
  if (superAdmin.rows.length === 0) {
    const hash = bcrypt.hashSync('6933', 10);
    await query(`INSERT INTO users(id,site_id,name,email,pw,role,balance) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      ['superadmin', 'default', '슈퍼관리자', 'leestones@naver.com', hash, 'superadmin', 0]);
  }

  // 기본 서비스 강제 최신화 (매 시작시 기본 서비스 삭제 후 재삽입)
  await query(`DELETE FROM services WHERE id LIKE 'api_%'`);
  await query(`DELETE FROM services WHERE id NOT LIKE 'api_%'`);
  if (true) {
    const svcs = [
      {id:'pkr8',name:'YouTube 좋아요 — 한국 (평생 보장)',pl:'youtube',rate:0.98,min:100,max:50000,description:'한국 기반 YouTube 좋아요 서비스로, 평생 보장 리필이 제공됩니다. 국내 타겟 채널에서 한국인 좋아요 비율이 높으면 국내 추천 탭과 홈 피드 노출이 증가합니다. 일 5만개 고속 처리로 빠르게 영상 참여도를 높이고 한국 시청자 대상 알고리즘 부스트 효과를 극대화합니다.',api_id:'13810'},
      {id:'pyt1',name:'YouTube 댓글 — 프리미엄 글로벌 (드롭 보상)',pl:'youtube',rate:0.84,min:10,max:5000,description:'전 세계 실계정 기반으로 제공되는 고품질 YouTube 댓글 서비스입니다. 원하는 내용으로 댓글을 작성해드려 영상 활성도를 높입니다. 댓글이 많은 영상은 알고리즘이 높은 참여도로 인식해 더 넓게 배포하며 긍정적 댓글은 신규 방문자 신뢰도를 높입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29796'},
      {id:'pyt10',name:'YouTube 조회수 — 프리미엄 글로벌 (드롭 보상)',pl:'youtube',rate:1.68,min:500,max:10000000,description:'전 세계 실계정 기반으로 제공되는 고품질 YouTube 조회수 서비스입니다. 영상 업로드 직후 조회수를 빠르게 채워 유튜브 알고리즘에 강한 신호를 보냅니다. 초기 조회수가 빠를수록 추천·홈피드 배포 확률이 높아지며 실제 사용자 패턴으로 처리되어 계정 안전성이 보장됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'24039'},
      {id:'pyt11',name:'YouTube 시청시간 — 프리미엄 글로벌 (드롭 보상)',pl:'youtube',rate:42.0,min:10,max:4000,description:'전 세계 실계정 기반으로 제공되는 고품질 YouTube 시청시간 서비스입니다. 유튜브 수익화 조건인 연간 4,000시간을 빠르게 달성하세요. 신규 채널이나 재활성화 채널의 수익화 신청 기준을 단기간에 충족할 수 있으며, 실제 시청 패턴으로 안전하게 처리됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'31339'},
      {id:'pyt12',name:'YouTube 구독자 — 프리미엄 (평생 보장) 🔥',pl:'youtube',rate:37.66,min:10,max:10000,description:'일 100명 슬로우 속도로 자연스럽게 유튜브 구독자를 늘리는 최상급 서비스입니다. 빠른 증가보다 안전한 장기 성장을 원하는 채널에 최적화되어 있으며, 평생 드롭 보장이 제공되어 한 번 쌓인 구독자가 영구적으로 유지됩니다. 유튜브 파트너 프로그램(YPP) 1천명 조건 달성과 채널 수익화 승인률을 높이는 데 가장 효과적입니다.',api_id:'27929'},
      {id:'pyt13',name:'YouTube 구독자 — 고속 성장 (30일 보장)',pl:'youtube',rate:28.0,min:10,max:50000,description:'일 500~1000명 고속 속도로 유튜브 구독자를 빠르게 확보하는 서비스입니다. 채널 개설 초기 또는 바이럴 콘텐츠 게시 후 가속 성장이 필요한 경우에 적합하며, 30일 드롭 보상이 제공되어 단기 부스트 후에도 안정적인 구독자 수를 유지합니다. 브랜드 채널이나 이벤트성 프로모션에 강력한 효과를 발휘합니다.',api_id:'28716'},
      {id:'pyt14',name:'YouTube 조회수 — 리얼 네이티브 (200K+/일) 🔥',pl:'youtube',rate:1.05,min:1000,max:10000000,description:'실제 유저 기반 프리미엄 유튜브 조회수 서비스로, 일 20만 이상 초고속 처리가 가능합니다. 리얼 네이티브 뷰로 분류되어 유튜브 알고리즘이 조회수 가치를 100% 인정해 추천 영상·인기 급상승 피드 노출에 가장 강력한 효과를 발휘합니다. 드롭 없는 평생 보장으로 영상 가치가 영구 유지됩니다.',api_id:'28692'},
      {id:'pyt15',name:'YouTube 조회수 — 안정형 슬로우 (평생 보장)',pl:'youtube',rate:2.45,min:1000,max:50000,description:'일 4~5만 조회수를 안정적으로 지속 유입시키는 슬로우 페이스 프리미엄 서비스입니다. 빠른 스파이크보다 장기적·자연스러운 조회수 곡선을 원하는 브랜드 채널에 최적화되어 있으며, 유튜브 알고리즘이 "꾸준히 인기 있는 콘텐츠"로 판단해 장기 노출 효과가 이어집니다. 평생 보장 리필 포함.',api_id:'30743'},
      {id:'pyt16',name:'YouTube 조회수 — 저가 대량형',pl:'youtube',rate:1.036,min:10000,max:10000000,description:'대량 주문에 최적화된 저가형 유튜브 조회수 서비스입니다. 실제 유저 기반이지만 최소 10,000개부터 주문 가능한 도매형 옵션으로, 영상 초기 부스팅에 필요한 방대한 조회수를 가장 비용 효율적으로 확보할 수 있습니다. 신규 채널의 급성장이나 다수 영상 동시 관리에 적합합니다.',api_id:'28695'},
      {id:'pyt2',name:'YouTube 구독자 — 프리미엄 글로벌 (평생 보장)',pl:'youtube',rate:41.99,min:50,max:100000,description:'실제 활동 중인 전 세계 유저 기반 YouTube 구독자를 일 2,500명 속도로 자연스럽게 늘립니다. 구독자 수는 채널의 권위와 신뢰도를 결정하는 가장 중요한 지표로, 광고주와 스폰서십 협상 단가에 직접적인 영향을 미칩니다. 평생 보장 리필로 드롭 걱정 없이 장기적인 채널 성장을 유지할 수 있는 프리미엄 서비스입니다.',api_id:'27905'},
      {id:'pyt3',name:'YouTube 구독자 — 미국 타겟',pl:'youtube',rate:37.51,min:100,max:1000000,description:'미국 기반 실제 YouTube 구독자를 확보하는 서비스입니다. 미국 광고 RPM이 세계 최고 수준이므로 미국 구독자 비율이 높을수록 유튜브 수익창출 단가가 크게 오릅니다. 일 1만 5천~2만명 고속 처리되며 30일 드롭 보상이 제공되어 미국 시장을 타겟으로 하는 채널 운영자에게 가장 강력한 성장 엔진입니다.',api_id:'28717'},
      {id:'pyt4',name:'YouTube 좋아요 — 프리미엄 글로벌',pl:'youtube',rate:0.25,min:10,max:20000,description:'전 세계 실계정 기반으로 제공되는 고품질 YouTube 좋아요 서비스입니다. 좋아요 비율은 유튜브 알고리즘이 영상 품질을 판단하는 핵심 지표입니다. 이 비율이 높을수록 검색 결과 상위와 추천 피드 노출 확률이 높아져 유기적 조회수 성장으로 이어집니다.',api_id:'20329'},
      {id:'pyt5',name:'YouTube 좋아요 — 태국 타겟 (드롭 보상)',pl:'youtube',rate:0.5,min:10,max:50000,description:'태국 기반 고품질 YouTube 좋아요 서비스로, 태국은 동남아 핵심 이커머스 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요 비율은 유튜브 알고리즘이 영상 품질을 판단하는 핵심 지표입니다. 이 비율이 높을수록 검색 결과 상위와 추천 피드 노출 확률이 높아져 유기적 조회수 성장으로 이어집니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'19626'},
      {id:'pyt6',name:'YouTube 라이브 좋아요 — 프리미엄 글로벌 (드롭 보상)',pl:'youtube',rate:0.45,min:10,max:50000,description:'유튜브 라이브 스트리밍 중 실시간으로 좋아요 반응을 즉시 붙여드립니다. 라이브 방송 초반 좋아요가 많이 쌓이면 유튜브 알고리즘이 해당 스트림을 인기 라이브로 인식해 추천 섹션과 홈 피드에 우선 노출시킵니다. 실시간 시청자 유입 효과가 뛰어나며, 30일 드롭 보상으로 방송 종료 후에도 좋아요가 안정적으로 유지됩니다.',api_id:'19372'},
      {id:'pyt7',name:'YouTube 쇼츠 좋아요 — 프리미엄 글로벌 (드롭 보상)',pl:'youtube',rate:4.69,min:30,max:50000,description:'전 세계 실계정 기반으로 제공되는 고품질 YouTube 쇼츠 좋아요 서비스입니다. 쇼츠 영상의 좋아요를 빠르게 늘려 알고리즘 배포를 가속화합니다. 좋아요 비율이 높은 쇼츠는 더 넓은 피드에 배포되어 조회수와 팔로워 동반 성장으로 이어집니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'27925'},
      {id:'pyt8',name:'YouTube 쇼츠 조회수 — 프리미엄 글로벌 (드롭 보상)',pl:'youtube',rate:1.68,min:100,max:1000000,description:'전 세계 실계정 기반으로 제공되는 고품질 YouTube 쇼츠 조회수 서비스입니다. 유튜브에서 지금 가장 빠르게 성장하는 쇼츠 포맷의 조회수를 늘립니다. 초기 조회수가 빠르게 쌓이면 쇼츠 피드 알고리즘의 바이럴 루프에 진입하여 수백만 조회수까지 자연 성장이 가능합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'27924'},
      {id:'pyt9',name:'YouTube 조회수 — 아랍 타겟',pl:'youtube',rate:4.69,min:500,max:100000,description:'아랍 기반 고품질 YouTube 조회수 서비스로, 중동 광고 RPM은 세계 최상위 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 영상 업로드 직후 조회수를 빠르게 채워 유튜브 알고리즘에 강한 신호를 보냅니다. 초기 조회수가 빠를수록 추천·홈피드 배포 확률이 높아지며 실제 사용자 패턴으로 처리되어 계정 안전성이 보장됩니다.',api_id:'2866'},
      {id:'pig11',name:'Instagram 노출 — 한국 타겟',pl:'instagram',rate:12.54,min:5,max:10000,description:'한국 기반 고품질 Instagram 노출 서비스로, 국내 타겟 마케팅의 핵심으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 게시물 총 노출 횟수를 늘려 캠페인 리포트의 설득력을 높입니다. 협찬 제안서 작성이나 광고 효율 보고에서 인상 수는 도달 범위를 증명하는 가장 직접적인 지표입니다.',api_id:'29158'},
      {id:'pig17',name:'Instagram 좋아요 — 한국 타겟',pl:'instagram',rate:6.45,min:10,max:20000,description:'한국 기반 고품질 Instagram 좋아요 서비스로, 국내 타겟 마케팅의 핵심으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요가 많은 게시물은 알고리즘이 인기 게시물로 분류하여 팔로워 외 사용자의 탐색 탭에도 대규모 노출됩니다. 유기적 도달 범위를 빠르게 확장하는 가장 효과적인 방법입니다.',api_id:'28306'},
      {id:'pig6',name:'Instagram 팔로워 — 한국 타겟',pl:'instagram',rate:40.32,min:10,max:20000,description:'한국 기반 고품질 Instagram 팔로워 서비스로, 국내 타겟 마케팅의 핵심으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 팔로워 수는 계정 신뢰도의 핵심 지표로, 팔로워가 많을수록 탐색 탭 노출이 증가하고 브랜드 협찬 제안 가능성이 크게 높아집니다. 자연스러운 성장 패턴으로 처리되며 드롭 시 보상받을 수 있어 장기적인 계정 자산으로 활용됩니다.',api_id:'28308'},
      {id:'pkr1',name:'Instagram 팔로워 — 한국 (30일 드롭보상) ⭐',pl:'instagram',rate:47.04,min:10,max:20000,description:'한국인 실계정 기반 Instagram 팔로워 프리미엄 서비스로, 30일간 드롭 발생 시 자동 보상이 제공됩니다. 국내 타겟 마케팅의 핵심 자산인 한국인 팔로워는 브랜드 협찬 단가와 국내 소비자 대상 마케팅 효율을 크게 높여주며, 30일 리필 보장으로 장기적인 계정 신뢰도를 안정적으로 유지할 수 있습니다.',api_id:'28309'},
      {id:'pkr2',name:'Instagram 팔로워 — 한국 (슬로우 속도)',pl:'instagram',rate:51.12,min:10,max:50000,description:'한국인 실계정 Instagram 팔로워를 일 1천명 슬로우 속도로 자연스럽게 증가시킵니다. 빠른 증가가 부담스러운 신규 계정이나 알고리즘 페널티를 피하고 싶은 계정에 최적화된 서비스입니다. 느린 속도로 쌓여 실제 유기적 성장처럼 보이며 장기 안정성이 가장 뛰어납니다.',api_id:'30227'},
      {id:'pkr3',name:'Instagram 좋아요 — 한국 (드롭보상)',pl:'instagram',rate:8.06,min:10,max:20000,description:'한국인 실계정 기반 Instagram 좋아요 서비스로, 30일간 드롭 보상이 제공됩니다. 국내 타겟 게시물의 탐색 탭 노출을 강화하며, 한국인 좋아요 비율이 높을수록 인스타그램이 국내 사용자에게 우선 노출시켜 실제 국내 고객 유입으로 이어집니다.',api_id:'28307'},
      {id:'pkr4',name:'Instagram 좋아요 — 한국 (저가형)',pl:'instagram',rate:2.38,min:50,max:1000,description:'한국인 계정 기반 Instagram 좋아요를 저렴한 가격으로 제공합니다. 국내 타겟 소규모 게시물이나 여러 게시물에 분산 주문할 때 유용하며, 한국 IP 기반 계정에서 좋아요가 발생하여 국내 탐색 탭 노출 알고리즘에 긍정적 신호를 전달합니다.',api_id:'27077'},
      {id:'pkr5',name:'Instagram 좋아요 — 한국 프리미엄 (365일 보상)',pl:'instagram',rate:1.4,min:10,max:1000000,description:'한국 기반 Instagram 좋아요 프리미엄 서비스로, 무려 365일간 드롭 보상이 제공됩니다. 1년 내 좋아요가 빠지면 자동으로 보충되어 장기적인 게시물 가치를 유지합니다. 브랜드 계정, 인플루언서 주요 게시물, 이벤트 게시물 등 장기 노출이 중요한 콘텐츠에 최적입니다.',api_id:'30711'},
      {id:'pkr6',name:'Instagram 댓글 — 한국 리얼 액티브 (10개)',pl:'instagram',rate:4.73,min:10,max:10,description:'한국 실계정 활성 사용자 10명이 자연스러운 한국어 댓글을 달아드립니다. 2시간 내 빠르게 처리되며, 실제 한국인이 다는 댓글이라 자연어 품질이 매우 높고 인스타그램 알고리즘도 국내 참여 신호로 강하게 인식합니다. 신제품 출시, 이벤트 게시물의 초기 댓글 확보에 가장 강력한 효과를 발휘합니다.',api_id:'29271'},
      {id:'pkr7',name:'Instagram 댓글 — 한국 리얼 액티브 (20개)',pl:'instagram',rate:7.45,min:20,max:20,description:'한국 실계정 활성 사용자 20명이 자연스러운 한국어 댓글을 작성합니다. 2시간 내 처리되며, 국내 인플루언서 마케팅에서 가장 중요한 "초기 댓글 군집 효과"를 만들어냅니다. 댓글 간 자연스러운 대화 흐름까지 연출되어 알고리즘이 화제의 게시물로 인식하게 만드는 프리미엄 서비스입니다.',api_id:'29272'},
      {id:'pig1',name:'Instagram 댓글 — 프리미엄 글로벌',pl:'instagram',rate:10.0,min:10,max:10000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 댓글 서비스입니다. 댓글이 많은 게시물은 알고리즘이 높은 참여도로 인식해 탐색 탭 노출을 늘립니다. 긍정적 댓글은 브랜드 이미지를 강화하고, 질문형 댓글은 추가 참여를 유발하는 연쇄 효과를 만듭니다.',api_id:'2544'},
      {id:'pig10',name:'Instagram 노출 — 프리미엄 글로벌 (드롭 보상)',pl:'instagram',rate:0.41,min:10,max:300000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 노출 서비스입니다. 게시물 총 노출 횟수를 늘려 캠페인 리포트의 설득력을 높입니다. 협찬 제안서 작성이나 광고 효율 보고에서 인상 수는 도달 범위를 증명하는 가장 직접적인 지표입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'17506'},
      {id:'pig12',name:'Instagram 노출 — 미국 타겟 (드롭 보상)',pl:'instagram',rate:0.35,min:10,max:20000,description:'미국 기반 고품질 Instagram 노출 서비스로, 미국 광고 RPM이 세계 최고 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 게시물 총 노출 횟수를 늘려 캠페인 리포트의 설득력을 높입니다. 협찬 제안서 작성이나 광고 효율 보고에서 인상 수는 도달 범위를 증명하는 가장 직접적인 지표입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29617'},
      {id:'pig13',name:'Instagram 좋아요 — 아랍 타겟',pl:'instagram',rate:0.62,min:10,max:100000,description:'아랍 기반 고품질 Instagram 좋아요 서비스로, 중동 광고 RPM은 세계 최상위 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요가 많은 게시물은 알고리즘이 인기 게시물로 분류하여 팔로워 외 사용자의 탐색 탭에도 대규모 노출됩니다. 유기적 도달 범위를 빠르게 확장하는 가장 효과적인 방법입니다.',api_id:'28283'},
      {id:'pig14',name:'Instagram 팔로워 — 터키 여성 타겟 (리얼)',pl:'instagram',rate:34.02,min:10,max:30000,description:'터키 실제 여성 사용자 기반 Instagram 팔로워 프리미엄 서비스입니다. 여성 타겟 브랜드(뷰티·패션·라이프스타일)의 국제 마케팅에 특화되어 있으며, 터키는 중동·유럽 시장 진입의 전략 요충지로 여성 중심 뷰티·패션 브랜드의 글로벌 확장에 가장 강력한 자산이 됩니다.',api_id:'29835'},
      {id:'pig15',name:'Instagram 좋아요 — 프리미엄 글로벌 (드롭 보상)',pl:'instagram',rate:0.09,min:10,max:1000000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 좋아요 서비스입니다. 좋아요가 많은 게시물은 알고리즘이 인기 게시물로 분류하여 팔로워 외 사용자의 탐색 탭에도 대규모 노출됩니다. 유기적 도달 범위를 빠르게 확장하는 가장 효과적인 방법입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'31244'},
      {id:'pig16',name:'Instagram 좋아요 — 인도 타겟 (드롭 보상)',pl:'instagram',rate:0.21,min:10,max:1000000,description:'인도 기반 고품질 Instagram 좋아요 서비스로, 인도는 글로벌 최대 사용자 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요가 많은 게시물은 알고리즘이 인기 게시물로 분류하여 팔로워 외 사용자의 탐색 탭에도 대규모 노출됩니다. 유기적 도달 범위를 빠르게 확장하는 가장 효과적인 방법입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29539'},
      {id:'pig18',name:'Instagram 좋아요 — 나이지리아 타겟 (드롭 보상)',pl:'instagram',rate:1.72,min:20,max:100000,description:'나이지리아 기반 고품질 Instagram 좋아요 서비스로, 나이지리아는 아프리카 최대 디지털 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요가 많은 게시물은 알고리즘이 인기 게시물로 분류하여 팔로워 외 사용자의 탐색 탭에도 대규모 노출됩니다. 유기적 도달 범위를 빠르게 확장하는 가장 효과적인 방법입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29759'},
      {id:'pig19',name:'Instagram 좋아요 — 터키 타겟 (드롭 보상)',pl:'instagram',rate:0.7,min:20,max:1000,description:'터키 기반 고품질 Instagram 좋아요 서비스로, 터키 사용자는 참여율이 매우 높으며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요가 많은 게시물은 알고리즘이 인기 게시물로 분류하여 팔로워 외 사용자의 탐색 탭에도 대규모 노출됩니다. 유기적 도달 범위를 빠르게 확장하는 가장 효과적인 방법입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'30040'},
      {id:'pig2',name:'Instagram 댓글 — 미국 타겟',pl:'instagram',rate:262.76,min:5,max:2500,description:'미국 기반 고품질 Instagram 댓글 서비스로, 미국 광고 RPM이 세계 최고 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 댓글이 많은 게시물은 알고리즘이 높은 참여도로 인식해 탐색 탭 노출을 늘립니다. 긍정적 댓글은 브랜드 이미지를 강화하고, 질문형 댓글은 추가 참여를 유발하는 연쇄 효과를 만듭니다.',api_id:'22623'},
      {id:'pig20',name:'Instagram 좋아요 — 미국 타겟',pl:'instagram',rate:18.77,min:50,max:9000,description:'미국 기반 고품질 Instagram 좋아요 서비스로, 미국 광고 RPM이 세계 최고 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요가 많은 게시물은 알고리즘이 인기 게시물로 분류하여 팔로워 외 사용자의 탐색 탭에도 대규모 노출됩니다. 유기적 도달 범위를 빠르게 확장하는 가장 효과적인 방법입니다.',api_id:'22626'},
      {id:'pig21',name:'Instagram 프로필 방문 — 프리미엄 글로벌',pl:'instagram',rate:0.1,min:100,max:5000000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 프로필 방문 서비스입니다. 프로필 방문 수를 늘려 계정 인지도를 높입니다. 방문자가 많은 계정은 인스타그램 알고리즘이 더 많은 사람에게 추천하며, 팔로워 전환율을 높이는 효과도 있어 신규 계정 초기 노출에 특히 효과적입니다.',api_id:'3359'},
      {id:'pig22',name:'Instagram 릴스 좋아요 — 인도 리얼',pl:'instagram',rate:0.252,min:100,max:500000,description:'인도 실제 유저 기반 Instagram 릴스 인터랙티브 좋아요입니다. 릴스는 인스타그램이 가장 공격적으로 밀고 있는 포맷으로, 좋아요가 많을수록 탐색 탭과 릴스 피드 상단 노출이 크게 증가합니다. 최대 50만개 대량 주문으로 릴스 바이럴 부스팅에 최적화된 서비스입니다.',api_id:'30671'},
      {id:'pig23',name:'Instagram 릴스 좋아요 — 인도 타겟',pl:'instagram',rate:1.61,min:10,max:30000,description:'인도 기반 고품질 Instagram 릴스 좋아요 서비스로, 인도는 글로벌 최대 사용자 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 릴스 좋아요를 빠르게 늘려 탐색 탭과 릴스 피드 상위 노출을 유도합니다. 좋아요가 많은 릴스는 알고리즘이 더 넓은 사용자층에게 배포하여 팔로워 급증 효과로 이어집니다.',api_id:'17529'},
      {id:'pig24',name:'Instagram 저장 — 프리미엄 글로벌',pl:'instagram',rate:1.84,min:100,max:10000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 저장 서비스입니다. 저장 수는 인스타그램 알고리즘에서 가장 높은 가중치를 받는 참여 지표입니다. 저장이 많은 게시물은 탐색 탭과 추천 피드에 장기간 지속 노출됩니다.',api_id:'2573'},
      {id:'pig25',name:'Instagram 공유 — 프리미엄 글로벌',pl:'instagram',rate:2.77,min:10,max:5000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 공유 서비스입니다. 공유·리포스트 수를 늘립니다. 공유가 많은 게시물은 알고리즘에서 외부 확산 신호로 평가되어 탐색 탭 노출이 강화되고 신규 팔로워 유입이 가속화됩니다.',api_id:'30758'},
      {id:'pig26',name:'Instagram 스토리 조회수 — 프리미엄 글로벌',pl:'instagram',rate:15.0,min:10,max:10000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 스토리 조회수 서비스입니다. 스토리 조회수는 계정 활성도와 팔로워 참여도를 알고리즘에 알리는 신호입니다. 조회수가 높은 스토리는 팔로워 피드 상단에 우선 표시되어 더 많은 노출을 확보합니다.',api_id:'14571'},
      {id:'pig27',name:'Instagram 조회수 — 프리미엄 글로벌',pl:'instagram',rate:3.52,min:10,max:100000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 조회수 서비스입니다. 영상 조회수가 빠르게 쌓이면 인스타그램 알고리즘의 바이럴 루프에 진입하여 탐색 탭과 팔로워 외 사용자에게도 대규모 노출됩니다. 신규 팔로워 유입의 가장 빠른 경로입니다.',api_id:'14576'},
      {id:'pig3',name:'Instagram 팔로워 — 아랍 타겟 (드롭 보상)',pl:'instagram',rate:34.58,min:20,max:50000,description:'아랍 기반 고품질 Instagram 팔로워 서비스로, 중동 광고 RPM은 세계 최상위 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 팔로워 수는 계정 신뢰도의 핵심 지표로, 팔로워가 많을수록 탐색 탭 노출이 증가하고 브랜드 협찬 제안 가능성이 크게 높아집니다. 자연스러운 성장 패턴으로 처리되며 드롭 시 보상받을 수 있어 장기적인 계정 자산으로 활용됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29762'},
      {id:'pig4',name:'Instagram 팔로워 — 브라질 타겟 (드롭 보상)',pl:'instagram',rate:8.26,min:10,max:5000000,description:'브라질 기반 고품질 Instagram 팔로워 서비스로, 브라질은 중남미 최대 콘텐츠 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 팔로워 수는 계정 신뢰도의 핵심 지표로, 팔로워가 많을수록 탐색 탭 노출이 증가하고 브랜드 협찬 제안 가능성이 크게 높아집니다. 자연스러운 성장 패턴으로 처리되며 드롭 시 보상받을 수 있어 장기적인 계정 자산으로 활용됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29691'},
      {id:'pig5',name:'Instagram 팔로워 — 프리미엄 글로벌 (드롭 보상)',pl:'instagram',rate:0.57,min:1,max:10000000,description:'전 세계 실계정 기반으로 제공되는 고품질 Instagram 팔로워 서비스입니다. 팔로워 수는 계정 신뢰도의 핵심 지표로, 팔로워가 많을수록 탐색 탭 노출이 증가하고 브랜드 협찬 제안 가능성이 크게 높아집니다. 자연스러운 성장 패턴으로 처리되며 드롭 시 보상받을 수 있어 장기적인 계정 자산으로 활용됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'30505'},
      {id:'pig7',name:'Instagram 팔로워 — 나이지리아 타겟 (드롭 보상)',pl:'instagram',rate:34.58,min:20,max:100000,description:'나이지리아 기반 고품질 Instagram 팔로워 서비스로, 나이지리아는 아프리카 최대 디지털 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 팔로워 수는 계정 신뢰도의 핵심 지표로, 팔로워가 많을수록 탐색 탭 노출이 증가하고 브랜드 협찬 제안 가능성이 크게 높아집니다. 자연스러운 성장 패턴으로 처리되며 드롭 시 보상받을 수 있어 장기적인 계정 자산으로 활용됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29756'},
      {id:'pig8',name:'Instagram 팔로워 — 터키 타겟 (드롭 보상)',pl:'instagram',rate:12.6,min:10,max:50000,description:'터키 기반 고품질 Instagram 팔로워 서비스로, 터키 사용자는 참여율이 매우 높으며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 팔로워 수는 계정 신뢰도의 핵심 지표로, 팔로워가 많을수록 탐색 탭 노출이 증가하고 브랜드 협찬 제안 가능성이 크게 높아집니다. 자연스러운 성장 패턴으로 처리되며 드롭 시 보상받을 수 있어 장기적인 계정 자산으로 활용됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'30054'},
      {id:'pig9',name:'Instagram 팔로워 — 미국 타겟',pl:'instagram',rate:48.91,min:50,max:6000,description:'미국 기반 고품질 Instagram 팔로워 서비스로, 미국 광고 RPM이 세계 최고 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 팔로워 수는 계정 신뢰도의 핵심 지표로, 팔로워가 많을수록 탐색 탭 노출이 증가하고 브랜드 협찬 제안 가능성이 크게 높아집니다. 자연스러운 성장 패턴으로 처리되며 드롭 시 보상받을 수 있어 장기적인 계정 자산으로 활용됩니다.',api_id:'22628'},
      {id:'ptt1',name:'TikTok 댓글 — 프리미엄 글로벌',pl:'tiktok',rate:0.91,min:1,max:50000,description:'전 세계 실계정 기반으로 제공되는 고품질 TikTok 댓글 서비스입니다. 댓글이 많은 영상은 알고리즘이 높은 인게이지먼트로 인식해 포유 탭 노출을 늘립니다. 질문 형태의 댓글은 다른 시청자들의 댓글 참여를 유발하는 연쇄 효과가 있어 영상 활성도를 자연스럽게 높여줍니다.',api_id:'31288'},
      {id:'ptt10',name:'TikTok 공유 — 프리미엄 글로벌',pl:'tiktok',rate:1.13,min:1,max:5000,description:'전 세계 실계정 기반으로 제공되는 고품질 TikTok 공유 서비스입니다. 공유는 틱톡에서 가장 강력한 바이럴 신호입니다. 공유가 많은 영상은 외부 트래픽을 유입시키고 알고리즘이 바이럴 콘텐츠로 판단해 대규모 배포합니다.',api_id:'30998'},
      {id:'ptt11',name:'TikTok 스토리 조회수 — 프리미엄 글로벌',pl:'tiktok',rate:0.18,min:10,max:10000000,description:'전 세계 실계정 기반으로 제공되는 고품질 TikTok 스토리 조회수 서비스입니다. 틱톡 스토리 조회수를 늘려 계정 활성도를 높입니다. 활발한 스토리 활동은 알고리즘이 활성 크리에이터로 인식하게 만들어 콘텐츠 노출 범위를 확대합니다.',api_id:'25820'},
      {id:'ptt12',name:'TikTok 조회수 — 브라질 타겟 (드롭 보상)',pl:'tiktok',rate:0.08,min:1,max:1000000,description:'브라질 기반 고품질 TikTok 조회수 서비스로, 브라질은 중남미 최대 콘텐츠 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 틱톡에서 바이럴을 만드는 가장 빠른 방법입니다. 초기 조회수가 빠르게 쌓이면 알고리즘이 영상을 더 넓은 포유 탭에 배포하며, 이 바이럴 루프에 진입하면 수백만 조회수까지 자연 성장이 가능합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'31183'},
      {id:'ptt13',name:'TikTok 조회수 — 프리미엄 글로벌 (드롭 보상)',pl:'tiktok',rate:0.44,min:10,max:1000000,description:'전 세계 실계정 기반으로 제공되는 고품질 TikTok 조회수 서비스입니다. 틱톡에서 바이럴을 만드는 가장 빠른 방법입니다. 초기 조회수가 빠르게 쌓이면 알고리즘이 영상을 더 넓은 포유 탭에 배포하며, 이 바이럴 루프에 진입하면 수백만 조회수까지 자연 성장이 가능합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'20976'},
      {id:'ptt14',name:'TikTok 공유 — 무제한 (평생 보장)',pl:'tiktok',rate:0.0182,min:100,max:1000000,description:'틱톡 게시물 공유를 무제한으로 유입시키는 평생 보장 프리미엄 서비스입니다. 공유는 틱톡 알고리즘이 "진짜 가치 있는 콘텐츠"로 판단하는 가장 강력한 신호로, 포유(For You) 탭 바이럴 확률을 급격히 높입니다. 평생 보장 리필로 장기 가치가 영구 유지됩니다.',api_id:'29453'},
      {id:'ptt15',name:'TikTok 맞춤 댓글 — 리얼 HQ 계정',pl:'tiktok',rate:2.03,min:10,max:500,description:'원하는 문구로 틱톡 댓글을 작성해주는 맞춤형 프리미엄 서비스입니다. 실제 HQ 계정이 자연스러운 댓글을 남기며, 초기 댓글 군집은 영상의 "인기 콘텐츠" 신호로 작용해 탐색 탭 노출 우선순위를 극대화합니다. 브랜드 캠페인이나 이벤트 영상의 초기 반응 유도에 가장 효과적입니다.',api_id:'27194'},
      {id:'ptt2',name:'TikTok 팔로워 — 아랍 타겟 (드롭 보상)',pl:'tiktok',rate:1.82,min:10,max:1000000,description:'아랍 기반 고품질 TikTok 팔로워 서비스로, 중동 광고 RPM은 세계 최상위 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 틱톡 팔로워는 포유(For You) 탭 배포의 기본 신뢰도 지표로, 팔로워가 많을수록 알고리즘이 새 영상을 더 넓은 범위에 먼저 배포합니다. 실계정 기반으로 계정 안전성을 유지하며 인플루언서 레벨로 성장할 기반을 만들어드립니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'26191'},
      {id:'ptt3',name:'TikTok 팔로워 — 브라질 타겟 (드롭 보상)',pl:'tiktok',rate:1.65,min:10,max:10000000,description:'브라질 기반 고품질 TikTok 팔로워 서비스로, 브라질은 중남미 최대 콘텐츠 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 틱톡 팔로워는 포유(For You) 탭 배포의 기본 신뢰도 지표로, 팔로워가 많을수록 알고리즘이 새 영상을 더 넓은 범위에 먼저 배포합니다. 실계정 기반으로 계정 안전성을 유지하며 인플루언서 레벨로 성장할 기반을 만들어드립니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'26182'},
      {id:'ptt4',name:'TikTok 팔로워 — 프리미엄 글로벌 (드롭 보상)',pl:'tiktok',rate:2.1,min:10,max:1000000,description:'전 세계 실계정 기반으로 제공되는 고품질 TikTok 팔로워 서비스입니다. 틱톡 팔로워는 포유(For You) 탭 배포의 기본 신뢰도 지표로, 팔로워가 많을수록 알고리즘이 새 영상을 더 넓은 범위에 먼저 배포합니다. 실계정 기반으로 계정 안전성을 유지하며 인플루언서 레벨로 성장할 기반을 만들어드립니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'26176'},
      {id:'ptt5',name:'TikTok 팔로워 — 미국 타겟 (드롭 보상)',pl:'tiktok',rate:3.08,min:10,max:100000,description:'미국 기반 고품질 TikTok 팔로워 서비스로, 미국 광고 RPM이 세계 최고 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 틱톡 팔로워는 포유(For You) 탭 배포의 기본 신뢰도 지표로, 팔로워가 많을수록 알고리즘이 새 영상을 더 넓은 범위에 먼저 배포합니다. 실계정 기반으로 계정 안전성을 유지하며 인플루언서 레벨로 성장할 기반을 만들어드립니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'25057'},
      {id:'ptt6',name:'TikTok 좋아요 — 브라질 타겟',pl:'tiktok',rate:0.15,min:10,max:1000000,description:'브라질 기반 고품질 TikTok 좋아요 서비스로, 브라질은 중남미 최대 콘텐츠 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요는 틱톡 알고리즘의 핵심 참여 신호입니다. 조회수 대비 좋아요 비율이 높은 영상은 포유 탭 배포가 대폭 가속화되며, 초기 알고리즘 점수를 빠르게 끌어올려 바이럴 진입 확률을 높입니다.',api_id:'23588'},
      {id:'ptt7',name:'TikTok 좋아요 — 프리미엄 글로벌 (드롭 보상)',pl:'tiktok',rate:0.09,min:10,max:50000000,description:'전 세계 실계정 기반으로 제공되는 고품질 TikTok 좋아요 서비스입니다. 좋아요는 틱톡 알고리즘의 핵심 참여 신호입니다. 조회수 대비 좋아요 비율이 높은 영상은 포유 탭 배포가 대폭 가속화되며, 초기 알고리즘 점수를 빠르게 끌어올려 바이럴 진입 확률을 높입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'26305'},
      {id:'ptt8',name:'TikTok 좋아요 — 미국 타겟 (드롭 보상)',pl:'tiktok',rate:0.21,min:100,max:100000,description:'미국 기반 고품질 TikTok 좋아요 서비스로, 미국 광고 RPM이 세계 최고 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요는 틱톡 알고리즘의 핵심 참여 신호입니다. 조회수 대비 좋아요 비율이 높은 영상은 포유 탭 배포가 대폭 가속화되며, 초기 알고리즘 점수를 빠르게 끌어올려 바이럴 진입 확률을 높입니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'25063'},
      {id:'ptt9',name:'TikTok 저장 — 프리미엄 글로벌',pl:'tiktok',rate:0.01,min:10,max:10000000,description:'전 세계 실계정 기반으로 제공되는 고품질 TikTok 저장 서비스입니다. 저장 수는 틱톡 알고리즘에서 "다시 보고 싶은 영상" 신호로 높은 가중치를 받습니다. 저장이 많은 영상은 포유 탭에 장기간 지속 노출되어 튜토리얼·정보성 콘텐츠에 특히 효과적입니다.',api_id:'25343'},
      {id:'ptw1',name:'Twitter/X 팔로워 — 아랍 타겟',pl:'twitter',rate:21.84,min:10,max:10000,description:'아랍 기반 고품질 Twitter/X 팔로워 서비스로, 중동 광고 RPM은 세계 최상위 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. X 팔로워 수는 계정 영향력의 핵심 지표이자 수익화 프로그램 조건 달성의 필수 요소입니다. 팔로워가 많을수록 트윗 도달 범위가 넓어지고 알고리즘 추천 노출이 증가합니다.',api_id:'29068'},
      {id:'ptw2',name:'Twitter/X 좋아요 — 아랍 타겟',pl:'twitter',rate:9.83,min:20,max:100000,description:'아랍 기반 고품질 Twitter/X 좋아요 서비스로, 중동 광고 RPM은 세계 최상위 수준이며 해당 시장 타겟 마케팅에 최적화되어 있습니다. 좋아요가 많은 트윗은 X 알고리즘의 추천 탭과 탐색 탭에 우선 노출됩니다. 중요한 공지·신제품·캠페인 트윗의 유기적 도달 범위를 크게 확장시키는 사회적 증명 효과도 있습니다.',api_id:'29069'},
      {id:'ptw3',name:'Twitter/X 조회수+임프레션 — 올인원',pl:'twitter',rate:0.0061,min:100,max:10000000,description:'트위터/X 게시물의 조회수와 임프레션을 동시에 증가시키는 올인원 프리미엄 서비스입니다. 조회수 대비 임프레션 비율은 X 알고리즘이 "가치 있는 트윗"을 판단하는 핵심 지표로, 주문 하나로 핵심 참여 지표 2개가 동시 개선됩니다. 취소 가능 옵션 포함.',api_id:'29865'},
      {id:'pfb1',name:'Facebook 댓글 — 브라질 타겟',pl:'facebook',rate:210.0,min:10,max:200,description:'브라질 기반 고품질 Facebook 댓글 서비스로, 브라질은 중남미 최대 콘텐츠 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 게시물에 댓글을 달아 참여도를 높입니다. 댓글이 많은 게시물은 알고리즘이 인기 콘텐츠로 분류하여 뉴스피드 상단 노출이 늘어납니다.',api_id:'28905'},
      {id:'pfb2',name:'Facebook 페이지 좋아요+팔로워 — 30일 보장 (2-in-1)',pl:'facebook',rate:1.26,min:100,max:2000000,description:'페이스북 페이지 좋아요와 팔로워가 동시에 증가하는 2-in-1 프리미엄 서비스입니다. 일 1만~2만 속도로 빠르게 성장하며 30일 드롭 보장이 제공됩니다. 하나의 주문으로 두 개 지표가 동시에 올라가 비즈니스 페이지의 신뢰도와 도달률을 한 번에 끌어올릴 수 있습니다.',api_id:'29350'},
      {id:'pfb3',name:'Facebook 팔로워 — 브라질 타겟 (드롭 보상)',pl:'facebook',rate:3.36,min:50,max:200000,description:'브라질 기반 고품질 Facebook 팔로워 서비스로, 브라질은 중남미 최대 콘텐츠 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 페이스북 페이지 좋아요·팔로워는 비즈니스 신뢰도의 핵심 지표로, 광고 집행 시 클릭률과 전환율에 직접적인 영향을 주고 방문자에게 신뢰감을 형성합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'28903'},
      {id:'pfb4',name:'Facebook 팔로워 — 프리미엄 글로벌 (드롭 보상)',pl:'facebook',rate:0.27,min:10,max:500000,description:'전 세계 실계정 기반으로 제공되는 고품질 Facebook 팔로워 서비스입니다. 페이스북 페이지 좋아요·팔로워는 비즈니스 신뢰도의 핵심 지표로, 광고 집행 시 클릭률과 전환율에 직접적인 영향을 주고 방문자에게 신뢰감을 형성합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'31397'},
      {id:'pfb5',name:'Facebook 팔로워 — 태국 타겟',pl:'facebook',rate:3.09,min:10,max:100000,description:'태국 기반 고품질 Facebook 팔로워 서비스로, 태국은 동남아 핵심 이커머스 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 페이스북 페이지 좋아요·팔로워는 비즈니스 신뢰도의 핵심 지표로, 광고 집행 시 클릭률과 전환율에 직접적인 영향을 주고 방문자에게 신뢰감을 형성합니다.',api_id:'30863'},
      {id:'pfb6',name:'Facebook 좋아요 — 브라질 타겟 (드롭 보상)',pl:'facebook',rate:4.2,min:20,max:10000,description:'브라질 기반 고품질 Facebook 좋아요 서비스로, 브라질은 중남미 최대 콘텐츠 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 게시물 좋아요로 페이스북 알고리즘 노출을 높입니다. 좋아요가 많은 게시물은 뉴스피드 상단에 우선 표시되고 친구들에게도 노출되어 유기적 도달이 크게 증가합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'28902'},
      {id:'pfb7',name:'Facebook 페이지 팔로워 — 평생 보장 (고속)',pl:'facebook',rate:0.5887,min:100,max:1000000,description:'페이스북 페이지 팔로워를 일 50만 속도로 유입시키는 평생 보장 최상급 서비스입니다. 페이지 팔로워는 비즈니스 계정의 신뢰도 척도이며, 메타 광고 매니저에서 룩어라이크 오디언스(유사 타겟) 생성의 기반이 됩니다. 평생 드롭 보장으로 오래 쌓인 자산이 영구 유지됩니다.',api_id:'22328'},
      {id:'pfb8',name:'Facebook 좋아요 — 태국 타겟',pl:'facebook',rate:1.55,min:10,max:100000,description:'태국 기반 고품질 Facebook 좋아요 서비스로, 태국은 동남아 핵심 이커머스 시장으로 해당 시장 타겟 마케팅에 최적화되어 있습니다. 게시물 좋아요로 페이스북 알고리즘 노출을 높입니다. 좋아요가 많은 게시물은 뉴스피드 상단에 우선 표시되고 친구들에게도 노출되어 유기적 도달이 크게 증가합니다.',api_id:'30865'},
      {id:'pfb9',name:'Facebook 멤버 — 프리미엄 글로벌 (드롭 보상)',pl:'facebook',rate:0.35,min:10,max:100000,description:'전 세계 실계정 기반으로 제공되는 고품질 Facebook 멤버 서비스입니다. 페이스북 그룹 멤버를 늘려 커뮤니티 규모와 활성도를 높입니다. 멤버가 많은 그룹은 신규 참여자에게 활성화된 커뮤니티로 인식되어 자연 유입이 증가합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29607'},
      {id:'ptg1',name:'Telegram 긍정 반응 👍 — 평생 보장',pl:'telegram',rate:0.0364,min:10,max:1000000,description:'텔레그램 채널 게시물에 👍 긍정 반응을 즉시 붙여드리는 평생 보장 프리미엄 서비스입니다. 반응 수가 많은 게시물은 채널 활성도의 핵심 지표로, 신규 멤버 유입 시 채널 신뢰도를 보여주는 1차 근거가 됩니다. 최대 100만개 대량 주문이 가능해 이벤트성 게시물에 특히 효과적입니다.',api_id:'23335'},
      {id:'ptg2',name:'Telegram 멤버 — 프리미엄 글로벌 (드롭 보상)',pl:'telegram',rate:0.71,min:10,max:1000000,description:'전 세계 실계정 기반으로 제공되는 고품질 Telegram 멤버 서비스입니다. 텔레그램 채널 멤버 수는 채널 신뢰도와 광고 단가에 직접 영향을 줍니다. 멤버가 많을수록 광고주 제안 단가가 올라가며 자연 유입도 가속화됩니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29546'},
      {id:'ptg4',name:'Telegram 멤버 — 리얼 (365일 보장)',pl:'telegram',rate:0.658,min:100,max:1000000,description:'텔레그램 채널 리얼 멤버를 365일 초장기 보장으로 제공하는 프리미엄 서비스입니다. 1년 내 드롭 발생 시 자동 보충되며, 실제 활성 계정 기반이라 채널 신뢰도와 활성도 지표에 긍정적으로 작용합니다. 장기 채널 성장이나 비즈니스 채널 구축에 가장 강력한 자산입니다.',api_id:'29545'},
      {id:'ptg5',name:'Telegram 멤버 — 리얼 (30일 보장, 저가)',pl:'telegram',rate:0.434,min:100,max:1000000,description:'텔레그램 채널 리얼 멤버 30일 보장 저가형 서비스입니다. 30일간 드롭 발생 시 자동 보충되며, 채널 초기 멤버 확보나 단기 프로모션에 비용 효율적입니다. 대량 주문(최대 100만)이 가능해 신규 채널 부스트에 최적화되어 있습니다.',api_id:'29541'},
      {id:'pth1',name:'Threads 팔로워 — 프리미엄 글로벌 (드롭 보상)',pl:'threads',rate:21.0,min:100,max:50000,description:'전 세계 실계정 기반으로 제공되는 고품질 Threads 팔로워 서비스입니다. 메타의 Threads 팔로워는 인스타그램과 연동되어 증가할수록 인스타그램 계정 노출에도 시너지 효과가 발생합니다. 빠르게 성장하는 플랫폼에서 초기 팔로워 확보는 장기적 경쟁 우위를 만듭니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29558'},
      {id:'pth2',name:'Threads 좋아요 — 프리미엄 글로벌 (드롭 보상)',pl:'threads',rate:12.6,min:50,max:50000,description:'전 세계 실계정 기반으로 제공되는 고품질 Threads 좋아요 서비스입니다. Threads 게시물 좋아요로 참여도를 높입니다. 좋아요가 많은 게시물은 Threads 피드 상위에 노출되어 추가 팔로워와 인게이지먼트를 유도하며, 인스타그램 연동 시너지도 발휘합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29560'},
      {id:'pth3',name:'Threads 공유 — 프리미엄 글로벌 (드롭 보상)',pl:'threads',rate:28.0,min:50,max:50000,description:'전 세계 실계정 기반으로 제공되는 고품질 Threads 공유 서비스입니다. Threads 리포스트는 강력한 확산 신호로, 리포스트가 많은 게시물은 알고리즘에서 화제 콘텐츠로 분류되어 피드 상단 노출이 크게 증가합니다. 드롭 발생 시 자동 보상되어 안정적인 장기 운영이 가능합니다.',api_id:'29562'},
      {id:'psp1',name:'Spotify 재생수 — 프리미엄 글로벌',pl:'spotify',rate:1.029,min:1000,max:1000000,description:'스포티파이 프리미엄 계정 기반 재생수를 빠르게 늘립니다. 재생수가 기준치를 넘으면 Discover Weekly·Release Radar 등 개인화 추천 플레이리스트에 포함될 가능성이 크게 높아집니다. 즉시 시작되며 일 1천 스트림 속도로 자연스럽게 처리되어 아티스트 페이지 신뢰도와 월간 리스너 수 동반 상승 효과를 만들어냅니다.',api_id:'28251'},
      {id:'psp2',name:'Spotify 재생수 — 프리 계정 (고속)',pl:'spotify',rate:0.4368,min:1000,max:1000000,description:'스포티파이 프리 계정 기반 재생수로 빠르고 저렴하게 스트림 수를 확보합니다. 일 5천 스트림 속도로 대량 처리가 가능하여 신곡 발매 초기 알고리즘 부스트 효과를 극대화할 수 있습니다. 차트 진입과 편집팀 플레이리스트 선정을 목표로 하는 아티스트에게 가장 비용 효율적인 서비스입니다.',api_id:'28250'},
      {id:'psp3',name:'Spotify 팟캐스트 재생수 — 프리미엄 글로벌',pl:'spotify',rate:0.462,min:1000,max:1000000,description:'스포티파이 팟캐스트 에피소드 재생수를 빠르게 늘립니다. 재생수가 높은 팟캐스트는 스포티파이 추천 섹션에 노출되어 새 에피소드마다 더 많은 청취자를 확보합니다. 팟캐스트 인기 순위 진입과 광고주 스폰서십 유치에 가장 직접적인 효과를 주는 서비스입니다.',api_id:'28252'},
      {id:'psp4',name:'Spotify 월간 리스너 — 프리미엄 글로벌',pl:'spotify',rate:2.45,min:1000,max:50000,description:'월간 리스너 수는 스포티파이 차트 진입의 핵심 지표이며 아티스트 페이지에 공개 표시됩니다. 수치가 높을수록 레이블·에이전시·브랜드 협업 제안 시 강력한 근거 자료가 됩니다. 스포티파이 알고리즘도 월간 리스너를 기준으로 추천 비율을 조정하여 유기적 성장 선순환을 만들어냅니다.',api_id:'28253'},
      {id:'ptv1',name:'Twitch 라이브 동시 시청자 — 60분 유지',pl:'twitch',rate:2.4696,min:10,max:1000,description:'트위치 라이브 방송 동시 시청자 수를 60분간 안정적으로 유지해드립니다. 시청자가 많은 채널은 트위치 디렉토리 상위에 노출되어 신규 시청자 유입이 크게 증가합니다. 실제 동시 접속자처럼 자연스럽게 처리되어 채널 파트너십 조건 충족과 스폰서십 단가 상승에 가장 직접적인 효과를 주는 서비스입니다.',api_id:'21850'},
      {id:'ptv2',name:'Twitch 라이브 동시 시청자 — 120분 유지',pl:'twitch',rate:4.7417,min:10,max:1000,description:'트위치 라이브 방송 동시 시청자 수를 120분간 안정적으로 유지합니다. 장시간 방송에 최적화된 서비스로, 중장시간 스트리밍에서 꾸준히 높은 시청자 수를 유지하여 트위치 알고리즘의 인기 채널 우선 배포 혜택을 받을 수 있습니다.',api_id:'21851'},
      {id:'ptv3',name:'Twitch 라이브 동시 시청자 — 180분 유지',pl:'twitch',rate:7.1126,min:10,max:1000,description:'트위치 라이브 방송 동시 시청자 수를 180분간 유지하는 장시간 프리미엄 서비스입니다. 대회·이벤트·특별 방송 등 3시간 이상 진행되는 콘텐츠에 최적화되어 있으며, 긴 시간 동안 높은 동시 시청자 수를 유지하여 트위치 파트너 승급과 스폰서십 유치에 가장 강력한 효과를 발휘합니다.',api_id:'21852'},
      {id:'ptv4',name:'Twitch 라이브 동시 시청자 — 6시간 유지',pl:'twitch',rate:14.225,min:10,max:1000,description:'트위치 라이브 방송 동시 시청자를 6시간(360분) 동안 유지하는 최상급 서비스입니다. 장시간 스트리밍 대회나 24시간 챌린지 등 대형 이벤트에 최적화되어 있으며, 긴 시간 동안 안정적인 시청자 수 유지로 트위치 메인 페이지 피처링과 고액 스폰서십 유치에 결정적인 역할을 합니다.',api_id:'21854'},
      {id:'ptr1',name:'웹사이트 직접 방문 트래픽 — 글로벌',pl:'traffic',rate:0.1596,min:1000,max:1000000,description:'웹사이트에 직접 방문 트래픽을 글로벌로 유입시킵니다. 방문자 수가 많을수록 구글 애널리틱스 지표가 개선되고 광고 수익과 브랜드 신뢰도가 높아집니다. 직접 트래픽 증가는 도메인 신뢰도를 높여 검색 엔진에서 더 높은 권위 점수를 받는 데도 기여하며, 즉시 시작되어 SEO 부스트 효과를 빠르게 확인할 수 있습니다.',api_id:'9125'},
      {id:'ptr2',name:'구글 검색 유입 트래픽 (SEO 강화)',pl:'traffic',rate:0.266,min:1000,max:1000000,description:'구글 검색 결과를 통한 오가닉 트래픽을 웹사이트로 유입시킵니다. 키워드 설정이 가능하여 특정 검색어에 대한 클릭률(CTR)이 올라가고, 구글 알고리즘이 해당 페이지를 검색 의도에 맞는 페이지로 평가하게 됩니다. 광고 없이 지속적인 무료 트래픽을 만들어내는 SEO 강화의 가장 효과적인 방법입니다.',api_id:'13996'},
      {id:'ptr3',name:'소셜미디어 유입 트래픽 — 글로벌',pl:'traffic',rate:0.2793,min:1000,max:10000000,description:'페이스북·트위터·인스타그램 등 소셜 네트워크를 통한 웹사이트 유입 트래픽을 늘립니다. 소셜 미디어 레퍼러(referrer)가 기록되어 구글 애널리틱스에서 소셜 유입 지표가 개선되며, 다양한 트래픽 소스 분포는 SEO 관점에서 자연스러운 도메인 프로필을 만들어 검색 엔진 신뢰도 향상에 기여합니다.',api_id:'9116'},
      {id:'ptr4',name:'니치 키워드 타겟 트래픽',pl:'traffic',rate:0.2793,min:1000,max:1000000,description:'특정 니치 키워드에 관심 있는 사용자 기반의 타겟 트래픽을 유입시킵니다. 무차별 트래픽과 달리 방문자 관심사가 웹사이트 주제와 일치하여 이탈률(Bounce Rate)이 낮고, 체류 시간이 길어져 구글 알고리즘의 품질 점수가 개선됩니다. 전문 블로그·쇼핑몰의 구매 전환율 향상에 특히 효과적입니다.',api_id:'9117'},
      {id:'ptr5',name:'국가별 타겟 구글 오가닉 트래픽',pl:'traffic',rate:0.5187,min:1000,max:10000000,description:'원하는 국가 타겟으로 구글 오가닉 검색 트래픽을 유입시킵니다. 특정 시장을 공략하는 웹사이트에 최적화되어 있으며, 지역 기반 SEO 강화와 현지 검색 순위 향상에 효과적입니다. 해당 국가 사용자의 클릭과 체류 시간이 쌓이면 구글이 그 지역의 검색 결과에서 페이지를 우선 노출시키는 효과가 나타납니다.',api_id:'9120'},
      {id:'pli1',name:'LinkedIn 좋아요 — 프리미엄 글로벌',pl:'other',rate:35.69,min:5,max:100000,description:'전 세계 실계정 기반으로 제공되는 고품질 LinkedIn 좋아요 서비스입니다. 링크드인 게시물 좋아요를 늘려 비즈니스 네트워크 내 노출을 강화합니다. 좋아요가 많은 게시물은 링크드인 피드 상단에 노출되어 더 많은 비즈니스 관계자에게 도달합니다.',api_id:'20938'},
      {id:'pli2',name:'LinkedIn 공유 — 프리미엄 글로벌',pl:'other',rate:48.04,min:5,max:100000,description:'전 세계 실계정 기반으로 제공되는 고품질 LinkedIn 공유 서비스입니다. 링크드인 게시물 공유는 B2B 네트워크에서 가장 강력한 확산 지표입니다. 공유가 많은 게시물은 업계 전문가들에게 대규모 도달하여 개인 브랜딩과 회사 인지도를 동시에 강화합니다.',api_id:'20944'},
    ];

    for (const s of svcs) {
      await query(`INSERT INTO services(id,name,pl,rate,min,max,description,api_id,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, pl=EXCLUDED.pl, rate=EXCLUDED.rate, min=EXCLUDED.min, max=EXCLUDED.max, api_id=EXCLUDED.api_id`,
        [s.id, s.name, s.pl, s.rate, s.min, s.max, s.description||'', s.api_id||null, 1]);
    }
  }

  // 마이그레이션
  try { await query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS tg_token TEXT DEFAULT ''`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS super_margin REAL DEFAULT -1`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS tg_chat TEXT DEFAULT ''`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS slogan TEXT DEFAULT '콘텐츠가 빛나도록'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS slogan_sub TEXT DEFAULT '우리가 성장시킵니다'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '유튜브·인스타·틱톡·X까지 모든 소셜 채널의 성장을 자동화합니다'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat1_num TEXT DEFAULT '10K+'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat1_label TEXT DEFAULT '서비스 종류'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat2_num TEXT DEFAULT '24H'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat2_label TEXT DEFAULT '빠른 처리'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat3_num TEXT DEFAULT '50%+'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat3_label TEXT DEFAULT '마진 보장'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat4_num TEXT DEFAULT '100%'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS stat4_label TEXT DEFAULT '안전 보장'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS notice TEXT DEFAULT ''`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS footer_text TEXT DEFAULT '소셜 미디어 플랫폼과 공식 제휴된 서비스가 아닙니다.'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS login_welcome TEXT DEFAULT '다시 만나서 반가워요'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS login_sub TEXT DEFAULT '계정에 로그인하세요'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS register_welcome TEXT DEFAULT '지금 시작하세요'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS register_sub TEXT DEFAULT '무료로 계정을 만들어보세요'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS kakao_btn_text TEXT DEFAULT '카카오톡 문의'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS charge_guide TEXT DEFAULT '입금 후 아래 양식을 작성해주세요. 확인 후 빠르게 처리해드립니다.'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS order_guide TEXT DEFAULT '주문 후 취소가 어려울 수 있습니다. 신중하게 주문해주세요.'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS hero_badge TEXT DEFAULT '소셜 성장 자동화 플랫폼'`); } catch(e) {}
  try { await query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'glow'`); } catch(e) {}
  // 사이트별 서비스 활성화 설정
  try { await query(`CREATE TABLE IF NOT EXISTS site_services (
    site_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    PRIMARY KEY(site_id, service_id)
  )`); } catch(e) {}

  try { await query(`CREATE TABLE IF NOT EXISTS credit_requests (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, site_name TEXT NOT NULL, amount REAL NOT NULL, note TEXT DEFAULT '', status TEXT DEFAULT 'pending', created TIMESTAMP DEFAULT NOW())`); } catch(e) {}
  
  // 🔐 비밀번호 재설정 토큰 테이블
  try { await query(`CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    used INTEGER DEFAULT 0,
    created TIMESTAMP DEFAULT NOW()
  )`); } catch(e) {}
  
  // 📝 관리자 활동 로그
  try { await query(`CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    site_id TEXT NOT NULL,
    admin_id TEXT NOT NULL,
    admin_name TEXT DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT DEFAULT '',
    target_id TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created TIMESTAMP DEFAULT NOW()
  )`); } catch(e) {}
  
  // 💰 잔액 변동 로그
  try { await query(`CREATE TABLE IF NOT EXISTS balance_logs (
    id SERIAL PRIMARY KEY,
    site_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT DEFAULT '',
    delta REAL NOT NULL,
    before_balance REAL DEFAULT 0,
    after_balance REAL DEFAULT 0,
    reason TEXT DEFAULT '',
    admin_id TEXT DEFAULT '',
    created TIMESTAMP DEFAULT NOW()
  )`); } catch(e) {}
  
  // 🚦 Rate Limit 추적
  try { await query(`CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    window_start TIMESTAMP DEFAULT NOW()
  )`); } catch(e) {}
  
  console.log('✅ DB 초기화 완료');
}

module.exports = { pool, query, initDB };
