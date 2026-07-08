async function loadAdmDash(){
  var d=await api('/api/admin/stats');
  if(!d||d.error){return;}
  if(ge('aSU'))ge('aSU').textContent=d.users||0;
  if(ge('aSO'))ge('aSO').textContent=d.orders||0;
  if(ge('aSR'))ge('aSR').textContent=gf(d.revenue||0);
  if(ge('aSC'))ge('aSC').textContent=d.pendingCharges||0;

  // 크레딧 표시 (일반 어드민만)
  if(CUR.role==='admin'&&d.credit!==undefined){
    var ci=ge('creditInfo');if(ci)ci.style.display='block';
    var cb=ge('creditBal');if(cb)cb.textContent='$'+parseFloat(d.credit||0).toFixed(2);
  }

  loadAdmOrders(); loadAdmCharges();
  var s=await api('/api/admin/settings');
  if(s){
    var isSuperAdmin=s.isSuperAdmin;
    // API 설정 - 슈퍼어드민만
    var apiCard=ge('apiCard');
    if(apiCard)apiCard.style.display=isSuperAdmin?'block':'none';
    // 텔레그램 - 모든 관리자 가능 (슈퍼어드민은 글로벌, 일반어드민은 사이트별)
    var tgBadge=ge('tgBadge');if(tgBadge)tgBadge.style.display='none';
    var tgSec=ge('tgSection');if(tgSec)tgSec.style.display='block';
    // 마진 - 모든 관리자 가능 / 환율 - 슈퍼어드민만
    var priceSec=ge('priceSection');if(priceSec)priceSec.style.display='block';
    var exSec=ge('exrateSection');if(exSec)exSec.style.display=isSuperAdmin?'block':'none';
    // 관리자용 마진 미리보기 초기화
    window._adminSupplyData={exrate:s.exrate||1500,isSuperAdmin:isSuperAdmin,supplyExamples:s.supplyExamples||[]};
    setTimeout(previewMargin,100);

    var sm=ge('stMg'),se=ge('stEx'),sk=ge('stKakao'),sb=ge('stBank');
    var sn=ge('st사이트Name');
    if(sn)sn.value=s.name||'';
    if(sk)sk.value=s.kakao||'';if(sb)sb.value=s.bank||'';
    if(sm)sm.value=s.margin;if(se)se.value=s.exrate;
    var ak=ge('stApiKey');if(ak)ak.value=s.apikey||'';
    var tt=ge('stTgToken'),tc=ge('stTgChat');
    // 슈퍼어드민은 글로벌, 일반어드민은 사이트별
    if(tt)tt.value=(isSuperAdmin?s.tg_token:s.site_tg_token)||'';
    if(tc)tc.value=(isSuperAdmin?s.tg_chat:s.site_tg_chat)||'';
  }
}
function goAdm(tab,el){
  document.querySelectorAll('.admtab').forEach(function(t){t.classList.remove('on')});
  document.querySelectorAll('.apanel').forEach(function(p){p.classList.remove('on')});
  el.classList.add('on');ge('ap-'+tab).classList.add('on');
  if(tab==='orders')loadAdmOrders();
  if(tab==='users')loadAdmUsers();
  if(tab==='creditreq')loadCreditRequests();
  if(tab==='svcmgmt')loadSvcMgmt();
  if(tab==='charges')loadAdmCharges();
}
async function loadAdmOrders(){
  var d=await api('/api/admin/orders');var tb=ge('aOTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:22px;color:#9A8AB0">주문이 없습니다</td></tr>';return}
  d.forEach(function(o){
    h+='<tr><td style="font-weight:700;color:#1A1030;white-space:nowrap">'+o.uname+'</td>'
      +'<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">'+o.sname+'</td>'
      +'<td style="font-weight:600">'+(o.qty||0).toLocaleString()+'</td>'
      +'<td style="font-weight:700">'+gf(o.charge)+'</td>'
      +'<td>'+badge(o.status)+'</td>'
      +'<td style="font-size:11px;color:#9A8AB0;white-space:nowrap">'+fd(o.created)+'</td>'
      +'<td><select onchange="chgOSt(\''+o.id+'\',this.value)" style="font-size:12px;padding:5px 8px;width:80px;background:#f5f0ff;border:1px solid rgba(114,9,183,.2);border-radius:6px">'
      +['pending','processing','completed','cancelled'].map(function(s){return'<option value="'+s+'"'+(o.status===s?' selected':'')+'>'+{pending:'대기',processing:'처리중',completed:'완료',cancelled:'취소'}[s]+'</option>'}).join('')
      +'</select></td></tr>';
  });
  tb.innerHTML=h;
}
async function chgOSt(id,st){await api('/api/admin/orders/status','POST',{id:id,status:st});toast('상태 변경 완료','ok')}
async function _loadAdmUsersInline(){
  var d=await api('/api/admin/users');var tb=ge('aUTb'),h='';if(!Array.isArray(d))return;
  d.forEach(function(u){
    var is정지=u.status==='banned';
    var isAdmin=['admin','partner','superadmin'].includes(u.role);
    h+='<tr style="'+(is정지?'opacity:.5':'')+'">'
      +'<td style="font-weight:700;color:#1A1030;white-space:nowrap">'+u.name+(isAdmin?' <span class="bdg" style="background:rgba(114,9,183,.1);color:#B5179E;font-size:10px">'+u.role+'</span>':'')+'</td>'
      +'<td style="font-size:12px;color:#5A4A7A">'+u.email+'</td>'
      +'<td style="font-weight:700;color:#B5179E">'+gf(u.balance||0)+'</td>'
      +'<td><span class="bdg" style="'+(is정지?'background:#FEE2E2;color:#EF4444':'background:#D1FAE5;color:#10B981')+'">'+(is정지?'정지':'정상')+'</span></td>'
      +'<td style="font-size:11px;color:#9A8AB0">'+(u.joined?u.joined.slice(0,10):'-')+'</td>'
      +'<td><div style="display:flex;gap:4px;flex-wrap:wrap">'
      +'<button class="btn binf bxs" onclick="openBalM(this)" data-uid="'+u.id+'" data-uname="'+u.name+'" data-bal="'+(u.balance||0)+'">잔액</button>'
      +'<button class="btn binf bxs" onclick="openUserDetail(\''+u.id+'\')">상세</button>'
      +(!isAdmin?(is정지
        ?'<button class="btn bok bxs" onclick="banUser(\''+u.id+'\',\''+u.name+'\')">해제</button>'
        :'<button class="btn ber bxs" onclick="banUser(\''+u.id+'\',\''+u.name+'\')">정지</button>'
        )+'<button class="btn ber bxs" onclick="deleteUser(\''+u.id+'\',\''+u.name+'\')">탈퇴</button>':'')
      +'</div></td></tr>';
  });
  ge('aUTb').innerHTML=h;
}
async function loadAdmCharges(){
  var d=await api('/api/admin/charges');var tb=ge('aCTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:22px;color:#9A8AB0">충전 요청이 없습니다</td></tr>';return}
  d.forEach(function(c){
    h+='<tr><td style="font-weight:700;color:#1A1030;white-space:nowrap">'+c.uname+'</td>'
      +'<td style="font-weight:700;color:#B5179E">'+gf(c.amount)+'</td>'
      +'<td style="font-size:12px">'+(c.note||'-')+'</td>'
      +'<td>'+badge(c.status)+'</td>'
      +'<td style="font-size:11px;color:#9A8AB0;white-space:nowrap">'+fd(c.created)+'</td>'
      +'<td>'+(c.status==='pending'
        ?'<div style="display:flex;gap:5px"><button class="btn bok bxs" onclick="procCharge(\''+c.id+'\',\'approve\')">✓ 승인</button><button class="btn ber bxs" onclick="procCharge(\''+c.id+'\',\'reject\')">✗ 거절</button></div>'
        :'<span style="font-size:11px;color:#9A8AB0">완료</span>')+'</td></tr>';
  });
  tb.innerHTML=h;
}
async function procCharge(id,action){
  var d=await api('/api/admin/charges/process','POST',{id:id,action:action});
  if(d.error){toast(d.error,'err');return}
  toast(action==='approve'?'충전 승인 완료 ✨':'충전 거절','ok');
  loadAdmCharges();loadAdmDash();
}

// 회원 관리
function openBalM(el){
  var uid=el.getAttribute('data-uid'),uname=el.getAttribute('data-uname'),bal=el.getAttribute('data-bal')||0;
  ge('balUid').value=uid;ge('balUname').value=uname+' (현재: '+gf(parseFloat(bal))+')';ge('balDelta').value='';ge('mBalModal').classList.add('on');
}
async function applyBal(){
  var d=parseFloat(ge('balDelta').value);if(isNaN(d)){toast('금액을 입력하세요','err');return}
  var r=await api('/api/admin/users/balance','POST',{uid:ge('balUid').value,delta:d});
  if(r.error){toast(r.error,'err');return}
  closeM('mBalModal');loadAdmUsers();toast('잔액 수정 완료 ✨','ok');
}
async function banUser(uid,uname){
  if(!confirm(uname+'님을 정지/해제하시겠습니까?'))return;
  var d=await api('/api/admin/users/ban','POST',{uid:uid});
  if(d.error){toast(d.error,'err');return}
  toast(d.status==='banned'?uname+'님 정지됨':uname+'님 정지 해제','ok');
  loadAdmUsers();
}
async function deleteUser(uid,uname){
  if(!confirm(uname+'님을 강제 탈퇴시키겠습니까?\n모든 주문/충전 내역이 삭제됩니다!'))return;
  var d=await api('/api/admin/users/delete','POST',{uid:uid});
  if(d.error){toast(d.error,'err');return}
  toast(uname+'님 탈퇴 처리 완료','ok');
  loadAdmUsers();loadAdmDash();
}
async function openUserDetail(uid){
  var d=await api('/api/admin/users/'+uid+'/detail');
  if(d.error){toast(d.error,'err');return}
  var u=d.user,orders=d.orders||[];
  var html='<div style="padding:20px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    +'<div style="font-size:16px;font-weight:800">👤 '+u.name+'</div>'
    +'<button onclick="closeM(\'mDetail\')" style="width:28px;height:28px;border-radius:50%;background:#f5f0ff;border:1px solid var(--bd);cursor:pointer;font-size:15px">✕</button>'
    +'</div>'
    +'<div class="card" style="margin-bottom:12px">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">'
    +'<div><span style="color:var(--tl);font-size:11px">이메일</span><br><strong>'+u.email+'</strong></div>'
    +'<div><span style="color:var(--tl);font-size:11px">잔액</span><br><strong style="color:var(--p2)">'+gf(u.balance||0)+'</strong></div>'
    +'<div><span style="color:var(--tl);font-size:11px">상태</span><br><strong style="color:'+(u.status==='banned'?'#EF4444':'#10B981')+'">'+(u.status==='banned'?'정지':'정상')+'</strong></div>'
    +'<div><span style="color:var(--tl);font-size:11px">총 주문</span><br><strong>'+orders.length+'건</strong></div>'
    +'</div></div>'
    +'<div class="card" style="margin-bottom:12px">'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">비밀번호 초기화</div>'
    +'<div style="display:flex;gap:8px"><input type="text" id="newPwInput" placeholder="새 비밀번호 (6자 이상)" style="flex:1"/>'
    +'<button class="bp bsm" style="white-space:nowrap;padding:10px 14px" onclick="resetPw(\''+u.id+'\')">초기화</button></div>'
    +'</div>'
    +'<div class="card" style="margin-bottom:12px">'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:10px">등급 변경</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="bp bsm" style="padding:9px 14px" onclick="changeRole(\''+u.id+'\',\'admin\')">관리자로</button>'
    +'<button class="bo bsm" onclick="changeRole(\''+u.id+'\',\'user\')">일반회원으로</button>'
    +'</div></div>'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:8px">최근 주문 ('+orders.length+'건)</div>'
    +'<div class="tw"><table><thead><tr><th>서비스</th><th>수량</th><th>금액</th><th>상태</th></tr></thead><tbody>'
    +orders.slice(0,5).map(function(o){
      return'<tr><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">'+o.sname+'</td>'
        +'<td style="font-size:12px">'+(o.qty||0).toLocaleString()+'</td>'
        +'<td style="font-size:12px;font-weight:700">'+gf(o.charge)+'</td>'
        +'<td>'+badge(o.status)+'</td></tr>';
    }).join('')+(orders.length===0?'<tr><td colspan="4" style="text-align:center;padding:14px;color:#9A8AB0">주문 없음</td></tr>':'')
    +'</tbody></table></div></div>';
  ge('mDetailContent').innerHTML=html;
  ge('mDetail').classList.add('on');
}
async function resetPw(uid){
  var pw=ge('newPwInput').value.trim();
  if(!pw||pw.length<6){toast('6자 이상 입력하세요','err');return}
  var d=await api('/api/admin/users/resetpw','POST',{uid:uid,newpw:pw});
  if(d.error){toast(d.error,'err');return}
  toast('비밀번호 초기화 완료','ok');ge('newPwInput').value='';
}
async function changeRole(uid,role){
  if(!confirm(role==='admin'?'관리자로 변경?':'일반회원으로 변경?'))return;
  var d=await api('/api/admin/users/role','POST',{uid:uid,role:role});
  if(d.error){toast(d.error,'err');return}
  toast('등급 변경 완료','ok');closeM('mDetail');loadAdmUsers();
}

// 설정 저장

async function saveCustomTexts(){
  var fields={
    hero_badge:ge('stHeroBadge')?.value,
    slogan:ge('stSlogan')?.value,
    slogan_sub:ge('stSloganSub')?.value,
    description:ge('stDesc')?.value,
    notice:ge('stNotice')?.value,
    stat1_num:ge('stStat1Num')?.value,stat1_label:ge('stStat1Label')?.value,
    stat2_num:ge('stStat2Num')?.value,stat2_label:ge('stStat2Label')?.value,
    stat3_num:ge('stStat3Num')?.value,stat3_label:ge('stStat3Label')?.value,
    stat4_num:ge('stStat4Num')?.value,stat4_label:ge('stStat4Label')?.value,
    login_welcome:ge('stLoginWelcome')?.value,
    login_sub:ge('stLoginSub')?.value,
    register_welcome:ge('stRegWelcome')?.value,
    register_sub:ge('stRegSub')?.value,
    kakao_btn_text:ge('stKakaoBtnText')?.value,
    charge_guide:ge('stChargeGuide')?.value,
    order_guide:ge('stOrderGuide')?.value,
    footer_text:ge('stFooterText')?.value
  };
  var errors=[];
  for(var key in fields){
    if(fields[key]===undefined||fields[key]===null)continue;
    var d=await api('/api/admin/settings/save','POST',{key,value:fields[key]});
    if(d.error)errors.push(d.error);
  }
  if(errors.length){toast('일부 저장 실패: '+errors[0],'err');return;}
  toast('저장 완료! 페이지를 새로고침하면 적용됩니다 ✨','ok');
  await loadSiteConfig();
}

// ── 관리자 서비스 관리 ──
var SITE_SVCS=[];
var SITE_SVC_FLT='all';

async function loadSvcMgmt(){
  var d=await api('/api/admin/site-services');
  if(!Array.isArray(d)){toast(d.error||'오류','err');return;}
  SITE_SVCS=d;
  renderSvcMgmtFilter();
  renderSvcMgmtList();
}

function renderSvcMgmtFilter(){
  var pls=[...new Set(SITE_SVCS.map(function(s){return s.pl;}))];
  pls.unshift('all');
  var lbl={all:'전체',youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok',twitter:'Twitter/X',facebook:'Facebook',telegram:'Telegram',threads:'Threads',spotify:'Spotify',twitch:'Twitch',traffic:'웹트래픽',appstore:'앱스토어',other:'기타'};
  var el=ge('svcMgmtFilter');
  if(!el)return;
  el.innerHTML=pls.map(function(p){
    return'<button class="sf'+(SITE_SVC_FLT===p?' on':'')+'" onclick="setSvcMgmtFlt(\''+p+'\')">'+(lbl[p]||p)+'</button>';
  }).join('');
}

function setSvcMgmtFlt(f){
  SITE_SVC_FLT=f;
  renderSvcMgmtFilter();
  renderSvcMgmtList();
}

function renderSvcMgmtList(){
  var el=ge('svcMgmtList');if(!el)return;
  var list=SITE_SVCS.filter(function(s){return SITE_SVC_FLT==='all'||s.pl===SITE_SVC_FLT;});
  if(!list.length){el.innerHTML='<div style="text-align:center;color:var(--tl);padding:20px">서비스 없음</div>';return;}
  el.innerHTML=list.map(function(s){
    var on=s.site_active==1;
    // 🔒 서버에서 내려준 baseCost(원가)/sellPrice(판매가) 사용 - Peakerr 원가 숨김
    var baseCost=s.baseCost||0;
    var sellPrice=s.sellPrice||baseCost;
    return'<div style="display:flex;align-items:center;gap:10px;background:var(--w);border:1px solid var(--bd);border-radius:10px;padding:10px 12px">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+s.name+'</div>'
      +'<div style="font-size:11px;color:var(--tl);margin-top:2px">원가 ₩'+baseCost.toLocaleString()+'/1000 → 판매가 ₩'+sellPrice.toLocaleString()+'</div>'
      +'</div>'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0">'
      +'<input type="checkbox" '+(on?'checked':'')+' onchange="toggleSiteService(this.dataset.id,this.checked)" data-id="'+s.id+'" style="width:16px;height:16px;cursor:pointer"/>'
      +'<span style="font-size:12px;color:'+(on?'var(--ok)':'var(--tl)')+'">'+( on?'판매중':'미판매')+'</span>'
      +'</label>'
      +'</div>';
  }).join('');
}

async function toggleSiteService(svcId, active){
  var d=await api('/api/admin/site-services/toggle','POST',{serviceId:svcId,active:active});
  if(d.error){toast(d.error,'err');return;}
  // 로컬 업데이트
  var s=SITE_SVCS.find(function(x){return x.id===svcId;});
  if(s)s.site_active=active?1:0;
  renderSvcMgmtList();
}

async function toggleAllSiteServices(active){
  var d=await api('/api/admin/site-services/toggle-all','POST',{active:active});
  if(d.error){toast(d.error,'err');return;}
  toast((active?'전체 활성화':'전체 비활성화')+' 완료 ✨','ok');
  loadSvcMgmt();
}

// 슈퍼관리자 서비스 자동 정리
async function autoCleanServices(){
  if(!confirm('카테고리별 베스트 서비스만 남기고 나머지를 비활성화합니다. 계속하시겠습니까?'))return;
  toast('정리 중...','ok');
  var d=await api('/api/super/services/auto-clean','POST',{});
  if(d.error){toast(d.error,'err');return;}
  toast('완료! '+d.activated+'개 서비스 활성화됨 ✨','ok');
  loadSuperSvcs&&loadSuperSvcs();
}

function previewMargin(){
  var preview=ge('marginPreview');
  var smEl=ge('stMg');
  if(!smEl||!preview)return;
  var mg=parseFloat(smEl.value)||0;
  var d=window._adminSupplyData||{};

  // 서버에서 받은 실제 공급가 우선 사용
  var supplyPer1000=0;
  var svcName='서비스';
  if(d.supplyExamples&&d.supplyExamples.length>0){
    // 가장 저렴한 공급가 서비스
    var cheapest=d.supplyExamples.reduce(function(a,b){return a.supplyPer1000<b.supplyPer1000?a:b;});
    supplyPer1000=cheapest.supplyPer1000;
    svcName=cheapest.name;
  } else {
    // fallback: 로컬 계산
    var exrate=d.exrate||1500;
    var minRate=0.15;
    if(window._svcs&&window._svcs.length>0){
      var rates=window._svcs.map(function(s){return parseFloat(s.rate)||9999;}).filter(function(r){return r>0;});
      if(rates.length)minRate=Math.min.apply(null,rates);
    }
    supplyPer1000=Math.round(minRate*exrate);
  }

  var finalPer1000=Math.round(supplyPer1000*(1+mg/100));
  var profitPer1000=finalPer1000-supplyPer1000;

  var mpS=ge('mpSupply'),mpM=ge('mpMarginAmt'),mpF=ge('mpFinal'),mpP=ge('mpProfit'),mpPct=ge('mpMgPct');
  var mpNote=preview.querySelector('.mp-note');
  if(mpS)mpS.textContent='₩'+supplyPer1000.toLocaleString();
  if(mpM)mpM.textContent='+₩'+profitPer1000.toLocaleString();
  if(mpF)mpF.textContent='₩'+finalPer1000.toLocaleString();
  if(mpP)mpP.textContent='₩'+profitPer1000.toLocaleString();
  if(mpPct)mpPct.textContent=mg;
  if(mpNote)mpNote.textContent='* '+svcName+' 기준 (1000개)';
  preview.style.display=mg>0?'block':'none';
}

async function saveSiteSettings(){
  var sn=ge('st사이트Name'),sk=ge('stKakao'),sb=ge('stBank'),sm=ge('stMg'),se=ge('stEx');
  try {
    if(sn&&sn.value){var r=await api('/api/admin/settings/save','POST',{key:'name',value:sn.value});if(r.error){toast(r.error,'err');return;}}
    if(sk){var r=await api('/api/admin/settings/save','POST',{key:'kakao',value:sk.value});if(r.error){toast(r.error,'err');return;}}
    if(sb){var r=await api('/api/admin/settings/save','POST',{key:'bank',value:sb.value});if(r.error){toast(r.error,'err');return;}}
    if(sm&&sm.value){var r=await api('/api/admin/settings/save','POST',{key:'margin',value:sm.value});if(r.error){toast(r.error,'err');return;}}
    if(se&&se.value){var r=await api('/api/admin/settings/save','POST',{key:'exrate',value:se.value});if(r.error){toast(r.error,'err');return;}}
    await loadSiteConfig();await loadSvcs();
    toast('설정 저장 완료 ✨','ok');
  } catch(e) { toast('저장 실패: '+e.message,'err'); }
}
async function saveTgSettings(){
  var tt=ge('stTgToken'),tc=ge('stTgChat');
  if(tt&&tt.value&&!tt.value.includes('설정됨'))await api('/api/admin/settings/save','POST',{key:'tg_token',value:tt.value});
  if(tc)await api('/api/admin/settings/save','POST',{key:'tg_chat',value:tc.value});
  if(tt)tt.value='••••(설정됨)';
  toast('텔레그램 저장 완료 ✨','ok');
}
async function saveApiKey(){
  var ak=ge('stApiKey');
  if(!ak||!ak.value||ak.value.includes('설정됨')){toast('API 키를 입력하세요','err');return}
  var d=await api('/api/admin/settings/save','POST',{key:'peakerr_api_key',value:ak.value});
  if(d.error){toast(d.error,'err');return}
  ak.value='••••(설정됨)';toast('API 키 저장 완료 ✨','ok');
}
async function saveGlobalSetting(key,inputId){
  var v=ge(inputId).value.trim();
  if(!v||v.includes('설정됨')){toast('값을 입력하세요','err');return}
  var d=await api('/api/admin/settings/save','POST',{key:key,value:v});
  if(d.error){toast(d.error,'err');return}
  ge(inputId).value='••••(설정됨)';toast('저장 완료 ✨','ok');
}
async function saveSuperMargin(){
  var val=ge('spSuperMargin').value;
  if(!val||isNaN(val)){toast('올바른 마진율을 입력하세요','err');return}
  var d=await api('/api/super/settings/save','POST',{key:'super_margin',value:String(parseFloat(val))});
  if(d.error){toast(d.error,'err');return}
  toast('슈퍼 마진율 저장 완료 ✨','ok');
}
async function saveGlobalExrate(){
  var val=ge('spGlobalExrate').value;
  if(!val||isNaN(val)||parseFloat(val)<100){toast('올바른 환율을 입력하세요 (100 이상)','err');return}
  var d=await api('/api/super/settings/save','POST',{key:'global_exrate',value:String(parseFloat(val))});
  if(d.error){toast(d.error,'err');return}
  toast('환율 저장 완료 ✨ 서비스 가격이 업데이트됩니다','ok');
  updateExratePreview();
}
function updateExratePreview(){
  var ex=parseFloat(ge('spGlobalExrate')?.value||1500);
  var sm=parseFloat(ge('spSuperMargin')?.value||50);
  var preview=ge('exratePreview');
  if(preview){
    var ex_result=Math.round(0.5*ex*(1+sm/100)/1000*1000);
    preview.textContent='예: YouTube 조회수 1,000개 기준 → 슈퍼가 ₩'+ex_result.toLocaleString();
  }
}
async function saveGlobalTg(){
  var tt=ge('spTgToken'),tc=ge('spTgChat');
  if(tt&&tt.value&&!tt.value.includes('설정됨'))await api('/api/admin/settings/save','POST',{key:'tg_token',value:tt.value});
  if(tc)await api('/api/admin/settings/save','POST',{key:'tg_chat',value:tc.value});
  if(tt)tt.value='••••(설정됨)';
  toast('텔레그램 저장 완료 ✨','ok');
}
async function testApi(){
  var res=ge('apiRes')||ge('spApiRes');if(res)res.innerHTML='<span class="spin spin2"></span>확인 중...';
  var d=await api('/api/admin/api-test');
  var msg=d.ok?'<span style="color:#10B981">✅ 연결 성공! 잔액: $'+parseFloat(d.balance).toFixed(4)+'</span>':'<span style="color:#EF4444">❌ 실패: '+d.error+'</span>';
  if(res)res.innerHTML=msg;
}
async function syncSvcs(){
  if(!confirm('⚠️ 서비스 동기화 시 외부 API 서비스로 교체됩니다.\n현재 70개 서비스를 유지하려면 취소하세요.\n\n계속하시겠습니까?'))return;
  var res=ge('apiRes')||ge('spApiRes');if(res)res.innerHTML='<span class="spin spin2"></span>동기화 중...';
  var d=await api('/api/admin/api-sync');
  var msg=d.ok?'<span style="color:#10B981">✅ '+d.count+'개 동기화 완료!</span>':'<span style="color:#EF4444">❌ '+d.error+'</span>';
  if(res)res.innerHTML=msg;
  if(d.ok){loadSvcs();toast('서비스 '+d.count+'개 동기화 ✨','ok')}
}
async function testTg(){
  var res=ge('tgRes')||ge('spTgRes');if(res)res.innerHTML='<span class="spin spin2"></span>테스트 중...';
  var d=await api('/api/admin/tg-test','POST');
  var msg=d.ok?'<span style="color:#10B981">✅ 성공! 텔레그램 확인해보세요</span>':'<span style="color:#EF4444">❌ '+d.error+'</span>';
  if(res)res.innerHTML=msg;
}

// 🔄 수동 주문 동기화
async function manualSyncOrders(){
  if(!confirm('모든 진행중 주문의 상태를 Peakerr에서 확인하고 자동 환불 처리합니다.\n계속하시겠어요?'))return;
  var res=ge('manualSyncRes');if(res)res.innerHTML='<span class="spin spin2"></span>동기화 시작...';
  var d=await api('/api/super/sync-orders','POST');
  if(d.error){if(res)res.innerHTML='<span style="color:#EF4444">❌ '+d.error+'</span>';return}
  if(res)res.innerHTML='<span style="color:#10B981">✅ '+d.message+'</span>';
  toast('주문 동기화 시작됨 ✨','ok');
}

// 🔄 수동 서비스 체크
async function manualSyncServices(){
  if(!confirm('Peakerr에서 삭제된 서비스를 자동 비활성화하고, 가격 변동된 서비스를 업데이트합니다.\n계속하시겠어요?'))return;
  var res=ge('manualSyncRes');if(res)res.innerHTML='<span class="spin spin2"></span>체크 중...';
  var d=await api('/api/super/sync-services','POST');
  if(d.error){if(res)res.innerHTML='<span style="color:#EF4444">❌ '+d.error+'</span>';return}
  if(res)res.innerHTML='<span style="color:#10B981">✅ '+d.message+'</span>';
  toast('서비스 체크 시작됨 ✨','ok');
}

// 🆕 신규 서비스 스캔
async function manualScanNewServices(){
  var res=ge('manualSyncRes');if(res)res.innerHTML='<span class="spin spin2"></span>스캔 중...';
  var d=await api('/api/super/scan-new-services','POST');
  if(d.error){if(res)res.innerHTML='<span style="color:#EF4444">❌ '+d.error+'</span>';return}
  if(res)res.innerHTML='<span style="color:#10B981">✅ '+d.message+'</span>';
  toast('신규 서비스 스캔 시작됨 ✨','ok');
}

// ── 슈퍼관리자 ──
