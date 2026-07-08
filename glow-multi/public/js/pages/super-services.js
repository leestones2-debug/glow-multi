var PLK2={youtube:'유튜브',instagram:'인스타그램',tiktok:'틱톡',threads:'스레드',twitter:'트위터/X',telegram:'텔레그램',facebook:'페이스북',spotify:'Spotify',twitch:'트위치',traffic:'웹트래픽',appstore:'앱스토어',other:'기타'};

async function loadSuperServices(){
  var d=await api('/api/services');
  var tb=ge('spSvcTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:16px;color:#9A8AB0">서비스가 없습니다</td></tr>';return}
  d.forEach(function(s){
    h+='<tr>'
      +'<td><span style="font-size:11px;background:#f5f0ff;padding:2px 7px;border-radius:20px;color:var(--p2)">'+(PLK2[s.pl]||s.pl)+'</span></td>'
      +'<td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.name+'</td>'
      +'<td style="font-weight:700;color:var(--p2)">$'+parseFloat(s.rate||0).toFixed(3)+'</td>'
      +'<td style="font-size:12px">'+(s.min||0).toLocaleString()+'</td>'
      +'<td style="font-size:12px">'+(s.max||0).toLocaleString()+'</td>'
      +'<td><span class="bdg" style="'+(s.active?'background:#D1FAE5;color:#10B981':'background:#FEE2E2;color:#EF4444')+'">'+(s.active?'활성':'비활성')+'</span></td>'
      +'<td style="display:flex;gap:4px">'
      +'<button class="btn binf bxs" onclick="openEditService(\''+s.id+'\')">' + '수정</button>'
      +'<button class="btn ber bxs" onclick="deleteService(\''+s.id+'\',\'서비스\')">삭제</button>'
      +'</td></tr>';
  });
  tb.innerHTML=h;
}

function openAddService(){
  ge('mServiceTitle').textContent='서비스 추가';
  ge('svcEditId').value='';
  ge('svcName').value='';ge('svcPl').value='youtube';
  ge('svcRate').value='';ge('svcMin').value='100';
  ge('svcMax').value='1000000';ge('svcDesc').value='';
  ge('svcActive').value='1';
  ge('mService').classList.add('on');
}

var _svcCache = [];
async function openEditService(id){
  // 캐시에서 찾기
  var s = _svcCache.find(function(x){return x.id===id});
  if(!s){
    var d=await api('/api/services');
    _svcCache=d;
    s=d.find(function(x){return x.id===id});
  }
  if(!s){toast('서비스를 찾을 수 없습니다','err');return}
  editService(s);
}
function editService(s){
  ge('mServiceTitle').textContent='서비스 수정';
  ge('svcEditId').value=s.id;
  ge('svcName').value=s.name;ge('svcPl').value=s.pl;
  ge('svcRate').value=s.rate;ge('svcMin').value=s.min;
  ge('svcMax').value=s.max;ge('svcDesc').value=s.description||'';
  ge('svcActive').value=s.active?'1':'0';
  ge('mService').classList.add('on');
}

async function saveService(){
  var id=ge('svcEditId').value;
  var name=ge('svcName').value.trim();
  var pl=ge('svcPl').value;
  var rate=parseFloat(ge('svcRate').value);
  var min=parseInt(ge('svcMin').value);
  var max=parseInt(ge('svcMax').value);
  var description=ge('svcDesc').value.trim();
  var active=parseInt(ge('svcActive').value);
  if(!name||isNaN(rate)){toast('서비스명과 원가를 입력하세요','err');return}
  var url=id?'/api/super/services/update':'/api/super/services/create';
  var d=await api(url,'POST',{id,name,pl,rate,min,max,description,active});
  if(d.error){toast(d.error,'err');return}
  toast('저장 완료 ✨','ok');
  closeM('mService');loadSuperServices();
}

async function deleteService(id, name){
  if(!confirm('⚠️ 이 서비스를 삭제하시겠습니까?')) return;
  var d=await api('/api/super/services/delete','POST',{id});
  if(d.error){toast(d.error,'err');return}
  toast('삭제 완료','ok');loadSuperServices();
}



// ── 보안 모드 ──
var _secureMode = false;
function toggleSecureMode(){
  _secureMode = !_secureMode;
  var btn = ge('secureModeBtn');
  var icon = ge('secureModeIcon');
  var text = ge('secureModeText');
  if(_secureMode){
    if(btn) btn.style.background='#fef2f2';
    if(icon) icon.textContent='🔒';
    if(text) text.textContent='보안 모드 ON';
    // 모든 금액 마스킹
    document.querySelectorAll('.amount-mask').forEach(function(el){
      el.setAttribute('data-real', el.textContent);
      el.textContent='₩ ****';
    });
    toast('🔒 보안 모드 ON - 금액이 가려졌습니다','warn');
  } else {
    if(btn) btn.style.background='#f5f0ff';
    if(icon) icon.textContent='🔓';
    if(text) text.textContent='보안 모드 OFF';
    // 마스킹 해제
    document.querySelectorAll('.amount-mask').forEach(function(el){
      var real = el.getAttribute('data-real');
      if(real) el.textContent = real;
    });
    toast('🔓 보안 모드 OFF','ok');
  }
}

function maskAmount(val){
  if(_secureMode) return '₩ ****';
  return val;
}

// ── 단가표 Partner 뷰 처리 ──
// ── 단가표 계산기 ──
var _pcSvcs = [];
async function calcPriceTable(){
  if(!_pcSvcs.length){
    var d = await api('/api/services');
    if(Array.isArray(d)) _pcSvcs = d;
  }

  var isPartner = CUR && CUR.role === 'partner';
  var ex = parseFloat(ge('pcExrate')?.value || 1500);
  var superMg = parseFloat(ge('pcSuperMg')?.value || 50);
  var siteMg = parseFloat(ge('pcSiteMg')?.value || 50);

  var exDisplay = ge('pcExrateDisplay');
  var myMgDisplay = ge('pcMyMargin');
  if(exDisplay) exDisplay.textContent = '₩' + ex.toLocaleString();
  if(myMgDisplay) myMgDisplay.textContent = isPartner ? '-' : superMg + '%';

  var PLKlocal = {youtube:'유튜브',instagram:'인스타',tiktok:'틱톡',threads:'스레드',
    twitter:'트위터/X',telegram:'텔레그램',facebook:'페이스북',spotify:'Spotify',
    twitch:'트위치',traffic:'웹트래픽',appstore:'앱스토어',other:'기타'};

  var tbody = ge('pcTbody');
  if(!tbody) return;

  // 테이블 헤더 - partner는 원가/순수익 컬럼 숨김
  var thead = ge('pcTable')?.querySelector('thead tr');
  if(thead){
    if(isPartner){
      thead.innerHTML = '<tr style="background:#f5f0ff">'
        + '<th style="padding:8px;text-align:left;border-bottom:2px solid var(--bd2);font-weight:700">서비스명</th>'
        + '<th style="padding:8px;text-align:center;border-bottom:2px solid var(--bd2);font-weight:700">카테고리</th>'
        + '<th style="padding:8px;text-align:right;border-bottom:2px solid var(--bd2);font-weight:700;color:var(--p2)">기준 원가(₩/1K)</th>'
        + '<th style="padding:8px;text-align:right;border-bottom:2px solid var(--bd2);font-weight:700;color:#F59E0B">고객 판매가(₩/1K)</th>'
        + '</tr>';
    } else {
      thead.innerHTML = '<tr style="background:#f5f0ff">'
        + '<th style="padding:8px;text-align:left;border-bottom:2px solid var(--bd2);font-weight:700">서비스명</th>'
        + '<th style="padding:8px;text-align:center;border-bottom:2px solid var(--bd2);font-weight:700">카테고리</th>'
        + '<th style="padding:8px;text-align:right;border-bottom:2px solid var(--bd2);font-weight:700;color:var(--tl)">피커 원가($/1K)</th>'
        + '<th style="padding:8px;text-align:right;border-bottom:2px solid var(--bd2);font-weight:700;color:var(--p2)">공급가(₩/1K)</th>'
        + '<th style="padding:8px;text-align:right;border-bottom:2px solid var(--bd2);font-weight:700;color:#10B981">내 순수익(₩/1K)</th>'
        + '<th style="padding:8px;text-align:right;border-bottom:2px solid var(--bd2);font-weight:700;color:#F59E0B">고객가(₩/1K)</th>'
        + '</tr>';
    }
  }

  var rows = [];
  var minPrice = Infinity, maxPrice = 0;

  _pcSvcs.forEach(function(s){
    var costKrw = s.rate * ex;
    var myPrice = Math.round(costKrw * (1 + superMg/100));
    var myProfit = myPrice - Math.round(costKrw);
    var custPrice = Math.round(myPrice * (1 + siteMg/100));
    if(myPrice < minPrice) minPrice = myPrice;
    if(myPrice > maxPrice) maxPrice = myPrice;
    rows.push({s, costKrw, myPrice, myProfit, custPrice});
  });

  var minEl = ge('pcMinPrice'), maxEl = ge('pcMaxPrice');
  if(minEl) minEl.textContent = isPartner ? (rows.length?'₩'+rows.reduce((a,r)=>Math.min(a,r.myPrice),Infinity).toLocaleString():'-') : '₩'+minPrice.toLocaleString();
  if(maxEl) maxEl.textContent = isPartner ? (rows.length?'₩'+rows.reduce((a,r)=>Math.max(a,r.myPrice),0).toLocaleString():'-') : '₩'+maxPrice.toLocaleString();

  var h = '';
  rows.forEach(function(r){
    var profitRate = Math.round(r.myProfit / (r.s.rate * ex) * 100);
    if(isPartner){
      // Partner 뷰: 기준원가(공급가) + 고객가만 표시
      h += '<tr style="border-bottom:1px solid var(--bd)">'
        + '<td style="padding:7px 8px;font-weight:600;font-size:12px">' + r.s.name + '</td>'
        + '<td style="padding:7px 8px;text-align:center"><span style="font-size:10px;background:#f5f0ff;padding:2px 6px;border-radius:20px;color:var(--p2)">' + (PLKlocal[r.s.pl]||r.s.pl) + '</span></td>'
        + '<td style="padding:7px 8px;text-align:right;font-weight:700;color:var(--p2)">₩' + r.myPrice.toLocaleString() + '</td>'
        + '<td style="padding:7px 8px;text-align:right;font-weight:700;color:#F59E0B">₩' + r.custPrice.toLocaleString() + '</td>'
        + '</tr>';
    } else {
      // 슈퍼관리자 뷰: 전체 표시 (보안모드 마스킹 가능)
      h += '<tr style="border-bottom:1px solid var(--bd);transition:background .15s" onmouseover="this.style.background=\'#f5f0ff\'" onmouseout="this.style.background=\'\'">'
        + '<td style="padding:7px 8px;font-weight:600;font-size:12px">' + r.s.name + '</td>'
        + '<td style="padding:7px 8px;text-align:center"><span style="font-size:10px;background:#f5f0ff;padding:2px 6px;border-radius:20px;color:var(--p2)">' + (PLKlocal[r.s.pl]||r.s.pl) + '</span></td>'
        + '<td style="padding:7px 8px;text-align:right;color:var(--tl);font-size:11px" class="amount-mask">$' + r.s.rate.toFixed(3) + '</td>'
        + '<td style="padding:7px 8px;text-align:right;font-weight:700;color:var(--p2)" class="amount-mask">₩' + r.myPrice.toLocaleString() + '</td>'
        + '<td style="padding:7px 8px;text-align:right;font-weight:700;color:#10B981" class="amount-mask">₩' + r.myProfit.toLocaleString() + ' <span style="font-size:10px">(+' + profitRate + '%)</span></td>'
        + '<td style="padding:7px 8px;text-align:right;font-weight:700;color:#F59E0B">₩' + r.custPrice.toLocaleString() + '</td>'
        + '</tr>';
    }
  });
  tbody.innerHTML = h;
}

function copyPriceTable(){
  var ex = ge('pcExrate')?.value || 1500;
  var superMg = ge('pcSuperMg')?.value || 50;
  var siteMg = ge('pcSiteMg')?.value || 50;
  var rows = ge('pcTbody')?.querySelectorAll('tr') || [];
  var text = '=== 단가표 (환율 ₩' + parseInt(ex).toLocaleString() + ') ===\n';
  text += '서비스명 | 내 판매가(/1K) | 내 순수익(/1K) | 고객가(/1K)\n';
  text += '-'.repeat(60) + '\n';
  rows.forEach(function(r){
    var cells = r.querySelectorAll('td');
    if(cells.length >= 6){
      text += cells[0].textContent.trim() + ' | ';
      text += cells[3].textContent.trim() + ' | ';
      text += cells[4].textContent.trim() + ' | ';
      text += cells[5].textContent.trim() + '\n';
    }
  });
  navigator.clipboard.writeText(text).then(function(){
    toast('단가표 복사 완료! 📋','ok');
  });
}

function downloadPriceTable(){
  var ex = ge('pcExrate')?.value || 1500;
  var rows = ge('pcTbody')?.querySelectorAll('tr') || [];
  var csv = '서비스명,카테고리,원가($/1K),내판매가(₩/1K),내순수익(₩/1K),고객가(₩/1K)\n';
  rows.forEach(function(r){
    var cells = r.querySelectorAll('td');
    if(cells.length >= 6){
      csv += '"' + cells[0].textContent.trim() + '",';
      csv += '"' + cells[1].textContent.trim() + '",';
      csv += '"' + cells[2].textContent.trim() + '",';
      csv += '"' + cells[3].textContent.trim() + '",';
      csv += '"' + cells[4].textContent.trim() + '",';
      csv += '"' + cells[5].textContent.trim() + '"\n';
    }
  });
  var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '단가표_환율' + ex + '.csv';
  a.click(); URL.revokeObjectURL(url);
  toast('단가표 다운로드 완료! ⬇','ok');
}
