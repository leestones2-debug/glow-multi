async function loadSuperDash(){
  var d=await api('/api/super/dashboard');
  ge('sTotalUsers').textContent=d.totalUsers||0;
  ge('sTotalOrders').textContent=d.totalOrders||0;
  ge('sTotalRevenue').textContent=gf(d.totalRevenue||0);
  ge('sTotalPending').textContent=d.pendingCharges||0;
  if(ge('sApiBalance'))ge('sApiBalance').textContent=d.apiBalance?'$'+d.apiBalance:'-';
  if(ge('sMyProfit'))ge('sMyProfit').textContent=gf(d.myProfit||0);
  renderSiteList(d.sites||[]);

  // 글로벌 설정 로드
  var s=await api('/api/admin/settings');
  if(s){
    var sk=ge('spApiKey'),st=ge('spTgToken'),sc=ge('spTgChat'),sm=ge('spSuperMargin'),se=ge('spGlobalExrate');
    if(sk)sk.value=s.apikey||'';
    if(st)st.value=s.tg_token||'';
    if(sc)sc.value=s.tg_chat||'';
    if(sm)sm.value=s.super_margin||'50';
    if(se){se.value=s.global_exrate||'1500';updateExratePreview();}
  }
}
function goSuperTab(tab,el){
  document.querySelectorAll('.admtab').forEach(function(t){t.classList.remove('on')});
  document.querySelectorAll('.apanel').forEach(function(p){p.classList.remove('on')});
  el.classList.add('on');ge('sp-'+tab).classList.add('on');
  if(tab==='allorders')loadSuperOrders();
  if(tab==='allcharges')loadSuperCharges();
  if(tab==='creditreqs')loadSuperCreditReqs();
  if(tab==='services')loadSuperServices();
  if(tab==='pricecalc')calcPriceTable();
}
function renderSiteList(sites){
  var el=ge('siteList');if(!el)return;
  if(!sites.length){el.innerHTML='<div style="text-align:center;padding:28px;color:#9A8AB0">사이트가 없습니다</div>';return}
  el.innerHTML=sites.map(function(s){
    return'<div class="site-card">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
      +'<div>'
      +'<div style="font-size:16px;font-weight:800;margin-bottom:3px">'+s.logo+' '+s.name+'</div>'
      +'<div style="font-size:12px;color:var(--tl)">'+s.domain+'</div>'
      +'</div>'
      +'<span class="bdg" style="'+(s.active?'background:#D1FAE5;color:#10B981':'background:#FEE2E2;color:#EF4444')+'">'+(s.active?'활성':'비활성')+'</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">'
      +'<div style="text-align:center;background:#f5f0ff;border-radius:8px;padding:8px"><div style="font-size:18px;font-weight:800;color:var(--p2)">'+(s.userCount||0)+'</div><div style="font-size:10px;color:var(--tl)">회원</div></div>'
      +'<div style="text-align:center;background:#f5f0ff;border-radius:8px;padding:8px"><div style="font-size:18px;font-weight:800;color:var(--p2)">'+(s.orderCount||0)+'</div><div style="font-size:10px;color:var(--tl)">주문</div></div>'
      +'<div style="text-align:center;background:#f5f0ff;border-radius:8px;padding:8px"><div style="font-size:14px;font-weight:800;color:var(--p2)">'+gf(s.revenue||0)+'</div><div style="font-size:10px;color:var(--tl)">매출</div></div>'
      +'<div style="text-align:center;background:'+(parseFloat(s.credit||0)<1?'#fef2f2':'#ecfdf5')+';border-radius:8px;padding:8px"><div style="font-size:14px;font-weight:800;color:'+(parseFloat(s.credit||0)<1?'#EF4444':'#10B981')+'">$'+parseFloat(s.credit||0).toFixed(2)+'</div><div style="font-size:10px;color:var(--tl)">크레딧</div></div>'
      +'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +'<button class="btn binf bxs" onclick="openCreditModal(\''+s.id+'\',\''+s.name+'\')">💰 크레딧 충전</button>'
      +'<button class="btn binf bxs" onclick="openEditSite(\''+s.id+'\')">' + '수정</button>'
      +'<button class="btn bpu bxs" onclick="manageAdmin(\''+s.id+'\')">👤 관리자</button>'
      +(s.id!=='default'?'<button class="btn ber bxs" onclick="deleteSite(\''+s.id+'\',\''+s.name+'\')">🗑 삭제</button>':'')
      +(s.pending충전하기>0?'<button class="btn ber bxs" style="animation:pulse 1.8s infinite">⚠ 충전 '+s.pending충전하기+'건</button>':'')
      +'</div>'
      +'</div>';
  }).join('');
}
async function loadSuperOrders(){
  var d=await api('/api/super/orders');var tb=ge('spOTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:22px;color:#9A8AB0">주문이 없습니다</td></tr>';return}
  d.forEach(function(o){
    h+='<tr><td style="font-size:11px;color:var(--p2);font-weight:600">'+(o.site_id||'-')+'</td>'
      +'<td style="font-weight:700;color:#1A1030;white-space:nowrap">'+o.uname+'</td>'
      +'<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">'+o.sname+'</td>'
      +'<td style="font-weight:600">'+(o.qty||0).toLocaleString()+'</td>'
      +'<td style="font-weight:700">'+gf(o.charge)+'</td>'
      +'<td>'+badge(o.status)+'</td>'
      +'<td style="font-size:11px;color:#9A8AB0;white-space:nowrap">'+fd(o.created)+'</td></tr>';
  });
  tb.innerHTML=h;
}
async function loadSuperCharges(){
  var d=await api('/api/super/charges');var tb=ge('spCTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:22px;color:#9A8AB0">충전 요청이 없습니다</td></tr>';return}
  d.forEach(function(c){
    h+='<tr><td style="font-size:11px;color:var(--p2);font-weight:600">'+(c.site_id||'-')+'</td>'
      +'<td style="font-weight:700;color:#1A1030;white-space:nowrap">'+c.uname+'</td>'
      +'<td style="font-weight:700;color:#B5179E">'+gf(c.amount)+'</td>'
      +'<td style="font-size:12px">'+(c.note||'-')+'</td>'
      +'<td>'+badge(c.status)+'</td>'
      +'<td style="font-size:11px;color:#9A8AB0;white-space:nowrap">'+fd(c.created)+'</td>'
      +'<td>'+(c.status==='pending'
        ?'<div style="display:flex;gap:5px"><button class="btn bok bxs" onclick="procCharge(\''+c.id+'\',\'approve\')">✓</button><button class="btn ber bxs" onclick="procCharge(\''+c.id+'\',\'reject\')">✗</button></div>'
        :'<span style="font-size:11px;color:#9A8AB0">완료</span>')+'</td></tr>';
  });
  tb.innerHTML=h;
}

// 사이트 생성
async function createSite(){
  var domain=ge('nsDomain').value.trim(),name=ge('nsName').value.trim();
  var logo=ge('nsLogo').value||'✨';
  var primary=ge('nsPrimary').value,accent=ge('nsAccent').value;
  var email=ge('nsAdminEmail').value.trim(),pw=ge('nsAdminPw').value;
  var margin=ge('ns마진').value,credit=ge('nsCredit').value;
  if(!domain||!name||!email||!pw){toast('필수 항목을 입력하세요','err');return}
  var superMargin=ge('nsSuperMargin')?.value||50;
  var exrate=ge('nsExrate')?.value||1380;
  var adminRole=ge('nsAdminRole')?.value||'admin';
  var d=await api('/api/super/sites/create','POST',{
    domain,name,logo,primaryColor:primary,accentColor:accent,
    adminEmail:email,adminPw:pw,margin:parseFloat(margin),
    exrate:parseFloat(exrate),credit:parseFloat(credit||0),
    superMargin:parseFloat(superMargin),adminRole
  });
  if(d.error){toast(d.error,'err');return}
  toast('사이트 생성 완료! ✨','ok');
  closeM('mNewSite');
  loadSuperDash();
  // 입력 초기화
  ['nsDomain','nsName','nsLogo','nsAdminEmail','nsAdminPw'].forEach(function(id){var el=ge(id);if(el)el.value=''});
}

// 관리자 관리
async function deleteSite(siteId, siteName){
  if(!confirm('⚠️ 정말로 [' + siteName + '] 사이트를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다!\n회원, 주문, 충전 데이터가 모두 삭제됩니다.')) return;
  var confirm2 = prompt('삭제하려면 사이트 이름을 정확히 입력하세요:\n' + siteName);
  if(confirm2 !== siteName){toast('사이트 이름이 일치하지 않습니다','err');return}
  var d=await api('/api/super/sites/delete','POST',{siteId});
  if(d.error){toast(d.error,'err');return}
  toast('사이트가 삭제되었습니다 ✨','ok');
  // 즉시 DOM에서 카드 제거
  var siteList=ge('siteList');
  if(siteList){
    var cards=siteList.querySelectorAll('.site-card');
    cards.forEach(function(card){
      if(card.innerHTML.includes(siteId)){card.remove();}
    });
  }
  // 서버에서 최신 데이터로 새로고침
  setTimeout(function(){loadSuperDash();},500);
}
async function manageAdmin(siteId){
  var d=await api('/api/super/users');
  var admin=d.find(u=>u.site_id===siteId&&u.role==='admin');
  if(!admin){toast('관리자 계정이 없습니다','err');return}
  var action=prompt('관리자: '+admin.email+'\n\n1. 비밀번호 재설정\n2. 정지/해제\n3. 삭제\n\n번호 입력:');
  if(action==='1'){
    var pw=prompt('새 비밀번호 (6자 이상):');
    if(!pw||pw.length<6){toast('6자 이상 입력하세요','err');return}
    var r=await api('/api/super/admin/resetpw','POST',{uid:admin.id,newpw:pw});
    if(r.error){toast(r.error,'err');return}
    toast('비밀번호 재설정 완료 ✨','ok');
  } else if(action==='2'){
    var r=await api('/api/super/admin/ban','POST',{uid:admin.id});
    if(r.error){toast(r.error,'err');return}
    toast(r.status==='banned'?'관리자 정지됨':'관리자 정지 해제','ok');
    loadSuperDash();
  } else if(action==='3'){
    if(!confirm('정말 삭제하시겠습니까?'))return;
    var r=await api('/api/super/admin/delete','POST',{uid:admin.id});
    if(r.error){toast(r.error,'err');return}
    toast('관리자 삭제 완료','ok');
    loadSuperDash();
  }
}

// 크레딧 충전
function openCreditModal(siteId,siteName){
  ge('creditSiteId').value=siteId;ge('creditSiteName').value=siteName;ge('credit금액').value='';
  ge('mCredit').classList.add('on');
}
async function addCredit(){
  var siteId=ge('creditSiteId').value,amount=parseFloat(ge('credit금액').value);
  if(!amount||amount<=0){toast('금액을 입력하세요','err');return}
  var d=await api('/api/super/sites/credit','POST',{siteId,amount});
  if(d.error){toast(d.error,'err');return}
  toast('크레딧 $'+amount+' 충전 완료! ✨','ok');
  closeM('mCredit');loadSuperDash();
}

var _sitesCache = [];
async function openEditSite(id){
  if(!_sitesCache.length){
    var d=await api('/api/super/sites');
    _sitesCache=Array.isArray(d)?d:[];
  }
  var s=_sitesCache.find(function(x){return x.id===id});
  if(!s){toast('사이트 정보를 찾을 수 없습니다','err');return}
  editSite(s);
}
function editSite(s){
  // 간단한 편집 모달 생성
  var modalId='siteEditModal';
  var old=document.getElementById(modalId);if(old)old.remove();
  var m=document.createElement('div');
  m.id=modalId;
  m.className='mbg on';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  m.innerHTML = '<div style="background:var(--w);border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto">' +
    '<h3 style="margin-bottom:16px">✏️ 사이트 편집: '+s.name+'</h3>' +
    '<div class="fg"><label>사이트 이름</label><input id="seName" value="'+(s.name||'').replace(/"/g,'&quot;')+'"/></div>' +
    '<div class="fg"><label>도메인</label><input id="seDomain" value="'+(s.domain||'').replace(/"/g,'&quot;')+'"/></div>' +
    '<div class="fg"><label>로고 이모지</label><input id="seLogo" value="'+(s.logo||'✨').replace(/"/g,'&quot;')+'" maxlength="4"/></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
    '<div class="fg"><label>메인 컬러</label><input type="color" id="sePrimary" value="'+(s.primary_color||'#7209B7')+'"/></div>' +
    '<div class="fg"><label>포인트 컬러</label><input type="color" id="seAccent" value="'+(s.accent_color||'#F72585')+'"/></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
    '<div class="fg"><label>슈퍼마진 (%)</label><input type="number" id="seSuperMg" value="'+(s.super_margin>=0?s.super_margin:50)+'"/></div>' +
    '<div class="fg"><label>사이트마진 (%)</label><input type="number" id="seMg" value="'+(s.margin||0)+'"/></div>' +
    '</div>' +
    '<div class="fg"><label>환율</label><input type="number" id="seEx" value="'+(s.exrate||1500)+'"/></div>' +
    '<div style="display:flex;gap:10px;margin-top:16px">' +
    '<button class="bo bpf" onclick="document.getElementById(\'siteEditModal\').remove()">취소</button>' +
    '<button class="bp bpf" onclick="saveSiteEdit(\''+s.id+'\')">💾 저장</button>' +
    '</div></div>';
  document.body.appendChild(m);
}
function saveSiteEdit(siteId){
  var body={
    siteId:siteId,
    name:ge('seName').value,
    domain:ge('seDomain').value,
    logo:ge('seLogo').value||'✨',
    primaryColor:ge('sePrimary').value,
    accentColor:ge('seAccent').value,
    margin:parseFloat(ge('seMg').value)||0,
    exrate:parseFloat(ge('seEx').value)||1500,
    active:1,
    superMargin:parseFloat(ge('seSuperMg').value)
  };
  api('/api/super/sites/update','POST',body).then(function(d){
    if(d.error){toast(d.error,'err');return}
    document.getElementById('siteEditModal').remove();
    _sitesCache=[];
    toast('수정 완료! ✨','ok');
    loadSuperDash();
  });
}

async function loadAdmUsers(){
  var d=await api('/api/admin/users');
  var tb=ge('aUTb');
  if(!Array.isArray(d))return;
  tb.innerHTML='';
  d.forEach(function(u){
    var isBanned=u.status==='banned';
    var isAdmin=['admin','partner','superadmin'].includes(u.role);
    var tr=document.createElement('tr');
    if(isBanned)tr.style.opacity='0.5';
    var roleBadge=isAdmin?(' <span class="bdg" style="background:rgba(114,9,183,.1);color:#B5179E;font-size:10px">'+u.role+'</span>'):'';
    var statusBadge='<span class="bdg" style="'+(isBanned?'background:#FEE2E2;color:#EF4444':'background:#D1FAE5;color:#10B981')+'">'+(isBanned?'정지':'정상')+'</span>';
    tr.innerHTML='<td style="font-weight:700;color:#1A1030;white-space:nowrap">'+u.name+roleBadge+'</td>'
      +'<td style="font-size:12px;color:#5A4A7A">'+u.email+'</td>'
      +'<td style="font-weight:700;color:#B5179E">'+gf(u.balance||0)+'</td>'
      +'<td>'+statusBadge+'</td>'
      +'<td style="font-size:11px;color:#9A8AB0">'+(u.joined?u.joined.slice(0,10):'-')+'</td>'
      +'<td><div class="ubtn_wrap"></div></td>';
    var btnDiv=tr.querySelector('.ubtn_wrap');
    var balBtn=document.createElement('button');
    balBtn.className='btn binf bxs';
    balBtn.textContent='잔액';
    balBtn.setAttribute('data-uid',u.id);
    balBtn.setAttribute('data-uname',u.name);
    balBtn.setAttribute('data-bal',u.balance||0);
    balBtn.onclick=function(){openBalM(this)};
    btnDiv.appendChild(balBtn);
    var detBtn=document.createElement('button');
    detBtn.className='btn binf bxs';
    detBtn.textContent='상세';
    detBtn.onclick=(function(uid){return function(){openUserDetail(uid)}})(u.id);
    btnDiv.appendChild(detBtn);
    if(!isAdmin){
      var banBtn=document.createElement('button');
      banBtn.className=isBanned?'btn bok bxs':'btn ber bxs';
      banBtn.textContent=isBanned?'해제':'정지';
      banBtn.onclick=(function(uid,uname){return function(){banUser(uid,uname)}})(u.id,u.name);
      btnDiv.appendChild(banBtn);
      var delBtn=document.createElement('button');
      delBtn.className='btn ber bxs';
      delBtn.textContent='탈퇴';
      delBtn.onclick=(function(uid,uname){return function(){deleteUser(uid,uname)}})(u.id,u.name);
      btnDiv.appendChild(delBtn);
    }
    tb.appendChild(tr);
  });
}
