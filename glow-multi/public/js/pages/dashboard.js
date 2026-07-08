async function enterDash(){
  showPg('pg-dash');
  ge('sbAv').textContent=(CUR.name||'U').charAt(0).toUpperCase();
  ge('sbName').textContent=CUR.name;
  ge('welName').textContent=CUR.name;

  var roleMap={superadmin:'슈퍼관리자 👑',관리자:'관리자',일반회원:'일반 회원'};
  ge('sbRole').textContent=roleMap[CUR.role]||'-';

  // 메뉴 권한
  var isAdmin=['admin','partner','superadmin'].includes(CUR.role);
  var isSuper=CUR.role==='superadmin';
  var isPartner=CUR.role==='partner';
  ge('si-admin').style.display=isAdmin?'flex':'none';
  ge('bni-admin').style.display=isAdmin?'flex':'none';
  ge('si-super').style.display=isSuper?'flex':'none';
  ge('bni-super').style.display=isSuper?'flex':'none';

  updBal();
  await loadSvcs();
  renderQCards();renderSfBar();
  loadOrders();loadChargeHis();loadOrders();loadChargeHis();loadBankInfo();
  goTab('home');
}
function updBal(){
  var b=gf(CUR.balance||0);
  ['hBal','mBal','stBal','chBal'].forEach(function(id){var el=ge(id);if(el)el.textContent=b});
}
async function refreshMe(){
  var d=await api('/api/me');
  if(d&&d.id){CUR=Object.assign({},CUR,d);updBal()}
}

function goTab(tab){
  if(tab==='admin'&&(!CUR||!['admin','partner','superadmin'].includes(CUR.role))){toast('접근 권한이 없습니다','err');return}
  if(tab==='super'&&(!CUR||CUR.role!=='superadmin')){toast('슈퍼관리자 전용입니다','err');return}
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on')});
  document.querySelectorAll('.si').forEach(function(s){s.classList.remove('on')});
  document.querySelectorAll('.bni').forEach(function(b){b.classList.remove('on')});
  var t=ge('tab-'+tab);if(t)t.classList.add('on');
  var s=ge('si-'+tab);if(s)s.classList.add('on');
  var b=ge('bni-'+tab);if(b)b.classList.add('on');
  var ti={home:'대시보드',order:'서비스 주문',orders:'주문 내역',charge:'잔액 충전',관리자:'관리자',super:'슈퍼관리자'};
  var dh=ge('dhTitle');if(dh)dh.textContent=ti[tab]||'';
  if(tab==='orders')loadOrders();
  if(tab==='charge'){refreshMe();loadChargeHis()}
  if(tab==='admin')loadAdmDash();
  if(tab==='super')loadSuperDash();
  window.scrollTo(0,0);
}

// ── 서비스 ──
