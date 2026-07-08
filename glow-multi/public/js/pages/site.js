async function loadSiteConfig(){
  var d=await api('/api/site-config');
  if(d.error)return;
  SITE_CONFIG=d;

  // CSS 변수 동적 업데이트
  // 테마 적용 - JSON 조합 테마 or 기본 glow
  var themeRaw=d.theme||'glow';
  var themeData=null;
  try{ if(themeRaw.startsWith('{'))themeData=JSON.parse(themeRaw); }catch(e){}
  var r=document.documentElement;
  if(themeData){
    // 랜덤 조합 테마 - CSS 변수 직접 주입
    r.removeAttribute('data-theme');
    r.style.setProperty('--p1', themeData.p1);
    r.style.setProperty('--p2', themeData.p2);
    r.style.setProperty('--p3', themeData.p3);
    r.style.setProperty('--bg', themeData.bg);
    r.style.setProperty('--w',  themeData.w);
    r.style.setProperty('--tx', themeData.tx);
    r.style.setProperty('--tm', themeData.tm);
    r.style.setProperty('--tl', themeData.tl);
    r.style.setProperty('--bd', themeData.bd);
    r.style.setProperty('--bd2',themeData.bd2);
    r.style.setProperty('--g',  'linear-gradient(135deg,'+themeData.p1+','+themeData.p2+','+themeData.p3+')');
    // 폰트/버튼/카드 스타일
    document.body.style.fontFamily=themeData.font||'inherit';
    // 버튼 둥글기
    var styleId='theme-dynamic';
    var old=document.getElementById(styleId);if(old)old.remove();
    var st=document.createElement('style');st.id=styleId;
    var rad=themeData.radius||'12px';
    var cardShadow='';
    if(themeData.cardStyle==='shadow') cardShadow='.card{box-shadow:0 4px 24px rgba(0,0,0,.18)!important}';
    else if(themeData.cardStyle==='glow') cardShadow='.card{box-shadow:0 0 20px '+themeData.p1+'33!important}';
    else if(themeData.cardStyle==='border') cardShadow='.card{border-width:2px!important}';
    else cardShadow='.card{box-shadow:none!important}';
    st.textContent='.bp,.bo,.ber,.bok,.bsm,.bpf{border-radius:'+rad+'!important}.card{border-radius:'+rad+'!important}'+cardShadow;
    document.head.appendChild(st);
  } else if(themeRaw==='glow'||!themeRaw){
    r.removeAttribute('data-theme');
    r.style.setProperty('--p3',d.primaryColor);
    r.style.setProperty('--p2',d.primaryColor);
    r.style.setProperty('--p1',d.accentColor);
  } else {
    // 고정 테마명 (dark/minimal 등)
    r.setAttribute('data-theme', themeRaw);
    r.style.removeProperty('--p1');r.style.removeProperty('--p2');r.style.removeProperty('--p3');
    r.style.removeProperty('--bg');r.style.removeProperty('--w');r.style.removeProperty('--tx');
  }

  // 브랜드 이름/로고 업데이트
  var logo=d.logo||'✨',name=d.name||'GLOW';
  document.title=name+' — 채널 성장 플랫폼';
  ['navLogo','authLogo','sbLogo','tbLogo'].forEach(function(id){var el=ge(id);if(el)el.textContent=logo});
  ['navName','authName','sbName2','tbName'].forEach(function(id){var el=ge(id);if(el)el.textContent=name});
  var fn=ge('footerName');if(fn)fn.textContent=logo+' '+name;

  // 커스텀 텍스트 적용
  var hb=ge('heroBadge');if(hb)hb.textContent=d.heroBadge||'채널 성장 · 마케팅 플랫폼';
  var hs=ge('heroSloganSpan');if(hs)hs.textContent=d.slogan||'빛나도록';
  var hss=ge('heroSloganSub');if(hss)hss.textContent=d.sloganSub||'우리가 성장시킵니다';
  var hd=ge('heroDesc');if(hd)hd.textContent=d.description||'유튜브·인스타·틱톡부터 아마존·쿠팡까지, 모든 채널의 성장을 지원합니다';
  var ft=ge('footerText');if(ft)ft.textContent=d.footerText||'각 플랫폼과 공식 제휴된 서비스가 아닙니다.';

  // 통계 숫자
  var s1n=ge('stat1Num');if(s1n)s1n.textContent=d.stat1Num||'10K+';
  var s1l=ge('stat1Label');if(s1l)s1l.textContent=d.stat1Label||'서비스 종류';
  var s2n=ge('stat2Num');if(s2n)s2n.textContent=d.stat2Num||'24H';
  var s2l=ge('stat2Label');if(s2l)s2l.textContent=d.stat2Label||'빠른 처리';
  var s3n=ge('stat3Num');if(s3n)s3n.textContent=d.stat3Num||'50%+';
  var s3l=ge('stat3Label');if(s3l)s3l.textContent=d.stat3Label||'마진 보장';
  var s4n=ge('stat4Num');if(s4n)s4n.textContent=d.stat4Num||'100%';
  var s4l=ge('stat4Label');if(s4l)s4l.textContent=d.stat4Label||'안전 보장';

  // 공지사항
  if(d.notice){
    var nb=ge('noticeBanner');
    if(!nb){
      nb=document.createElement('div');nb.id='noticeBanner';
      nb.style.cssText='background:linear-gradient(90deg,var(--p2),var(--p1));color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:600;position:sticky;top:0;z-index:200';
      var pg=ge('pg-land');if(pg)pg.insertBefore(nb,pg.firstChild);
    }
    nb.textContent='📢 '+d.notice;
    nb.style.display='block';
  }

  // 로그인/회원가입 문구 저장 (switchAuth에서 사용)
  window._siteLoginWelcome=d.loginWelcome||'다시 만나서 반가워요';
  window._siteLoginSub=d.loginSub||'계정에 로그인하세요';
  window._siteRegisterWelcome=d.registerWelcome||'지금 시작하세요';
  window._siteRegisterSub=d.registerSub||'무료로 계정을 만들어보세요';
  window._siteChargeGuide=d.chargeGuide||'입금 후 아래 양식을 작성해주세요.';
  window._siteOrderGuide=d.orderGuide||'주문 후 취소가 어려울 수 있습니다.';
  window._siteKakaoBtnText=d.kakaoBtnText||'카카오톡 문의';

  // 카카오 버튼 텍스트
  document.querySelectorAll('.kakao-btn-text').forEach(function(el){el.textContent=d.kakaoBtnText||'카카오톡 문의'});
}
