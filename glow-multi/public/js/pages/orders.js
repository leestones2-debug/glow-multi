async function loadSvcs(){
  var d=await api('/api/services');
  if(Array.isArray(d)){SVCS=d;window._svcs=d;renderSvcList();renderQCards()}
}
function renderSfBar(){
  var plats=['all','youtube','instagram','tiktok','twitter','facebook','telegram','threads','spotify','twitch','traffic','other'];
  var lbl={all:'전체',youtube:'▶ YouTube',instagram:'📷 Instagram',tiktok:'🎵 TikTok',twitter:'𝕏 Twitter/X',facebook:'f Facebook',telegram:'✈ Telegram',threads:'🧵 Threads',spotify:'♫ Spotify',twitch:'🎮 Twitch',traffic:'🌐 트래픽',other:'📡 기타'};
  ge('sfBar').innerHTML=plats.map(function(p){
    return'<button class="sf'+(FLT===p?' on':'')+'" onclick="setFlt(\''+p+'\',this)">'+lbl[p]+'</button>';
  }).join('');
}
function setFlt(f,el){FLT=f;document.querySelectorAll('#sfBar .sf').forEach(function(b){b.classList.remove('on')});el.classList.add('on');renderSvcList()}
function renderSvcList(){
  var q=(ge('svcSearch')&&ge('svcSearch').value||'').toLowerCase();
  var svcs=SVCS.filter(function(s){
    var matchPl=FLT==='all'||s.pl===FLT;
    var isPartnerView = CUR && CUR.role === 'partner';
    var matchQ=!q||s.name.toLowerCase().includes(q)||(s.description&&s.description.toLowerCase().includes(q));
    return matchPl&&matchQ;
  });
  var el=ge('svcList');if(!el)return;
  if(!svcs.length){el.innerHTML='<div style="text-align:center;padding:28px;color:#9A8AB0">서비스가 없습니다</div>';return}
  el.innerHTML=svcs.map(function(s){
    var isSel=SEL&&SEL.id===s.id;
    return'<div class="srow'+(isSel?' sel':'')+'" onclick="selSvc(\''+s.id+'\')">'
      +'<div class="spi" style="background:'+PLC[s.pl]+'">'+PLI[s.pl]+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:14px;font-weight:700;color:var(--tx);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+s.name+'</div>'
      +'<div style="font-size:12px;color:var(--tm);line-height:1.6;font-weight:300;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:5px">'+s.description+'</div>'
      +'<div style="font-size:11px;color:var(--tl)">최소 '+(s.min||0).toLocaleString()+' ~ 최대 '+(s.max||0).toLocaleString()+'개</div>'
      +'</div>'
      +'<div style="flex-shrink:0;text-align:right;padding-left:10px">'
      +'<div class="gt" style="font-size:14px;font-weight:800;white-space:nowrap">'+gf(Math.round(s.sell*1000))+'</div>'
      +'<div style="font-size:10px;color:#9A8AB0">/ 1,000개</div>'
      +'</div></div>';
  }).join('');
}
function selSvc(id){
  SEL=null;for(var i=0;i<SVCS.length;i++){if(SVCS[i].id===id){SEL=SVCS[i];break}}
  if(!SEL)return;
  ge('selName').innerHTML='<strong style="font-size:14px">'+PLI[SEL.pl]+' '+SEL.name+'</strong>'
    +'<div style="font-size:12px;color:#5A4A7A;font-weight:300;margin-top:5px;line-height:1.6">'+SEL.description+'</div>';
  ge('qHint').textContent='최소 '+(SEL.min||0).toLocaleString()+' / 최대 '+(SEL.max||0).toLocaleString()+'개';
  ge('linkHint').textContent=HINTS[SEL.pl]||'서비스 대상 URL';
  ge('o수량').min=SEL.min||1;
  calcPrice();renderSvcList();
  var ofc=document.querySelector('.ofc');
  if(ofc&&window.innerWidth<900)ofc.scrollIntoView({behavior:'smooth',block:'start'});
}
function calcPrice(){
  if(!SEL||!CUR)return;
  var qty=parseInt(ge('o수량').value)||0;
  ge('oBal').textContent=gf(CUR.balance||0);
  ge('oTotal').textContent=qty?gf(SEL.sell*qty):'₩0';
}
function renderQCards(){
  var el=ge('qCards');if(!el)return;
  var svcs=SVCS.slice(0,4);
  el.innerHTML=svcs.map(function(s){
    return'<div class="card" style="cursor:pointer" onclick="goTab(\'order\');setTimeout(function(){selSvc(\''+s.id+'\')},50)">'
      +'<div style="font-size:22px;margin-bottom:8px">'+PLI[s.pl]+'</div>'
      +'<div style="font-size:13px;font-weight:700;margin-bottom:3px;color:#1A1030">'+s.name+'</div>'
      +'<div style="font-size:11px;color:#9A8AB0;margin-bottom:8px;font-weight:300;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+s.description+'</div>'
      +'<div class="gt" style="font-size:13px;font-weight:800">'+gf(Math.round(s.sell*1000))+'/1K</div></div>';
  }).join('');
}

// ── 주문 ──
async function placeOrder(){
  if(!SEL){toast('서비스를 선택하세요','err');return}
  var link=ge('o링크').value.trim(),qty=parseInt(ge('o수량').value);
  if(!link){toast('링크를 입력하세요','err');return}
  var btn=ge('orderBtn');btn.disabled=true;btn.innerHTML='<span class="spin"></span>처리 중...';
  var d=await api('/api/orders','POST',{sid:SEL.id,link:link,qty:qty});
  btn.disabled=false;btn.innerHTML='✨ 주문하기';
  if(d.error){toast(d.error,'err');return}
  toast(d.apiOrderId?'✨ 주문완료! #'+d.apiOrderId:'✨ 주문접수!','ok');
  ge('o링크').value='';ge('o수량').value='';
  CUR.balance=d.balance;updBal();loadOrderStats();
}
async function loadOrders(){
  var d=await api('/api/orders/my');var tb=ge('ordersTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:26px;color:#9A8AB0">주문 내역이 없습니다</td></tr>';return}
  d.forEach(function(o){
    var canCancel = ['pending','processing'].includes(o.status) && o.api_order_id;
    var actionBtns = '<button onclick="refreshOrder(\''+o.id+'\')" style="background:rgba(114,9,183,.1);color:var(--p2);border:none;border-radius:6px;padding:4px 8px;font-size:10px;cursor:pointer;margin-right:4px" title="Peakerr에서 실시간 상태 확인">🔄</button>';
    if(canCancel) {
      actionBtns += '<button onclick="cancelOrder(\''+o.id+'\')" style="background:rgba(220,20,60,.1);color:#DC143C;border:none;border-radius:6px;padding:4px 8px;font-size:10px;cursor:pointer" title="주문 취소 요청">✕</button>';
    }
    h+='<tr><td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:#1A1030">'+PLI[o.pl]+' '+o.sname+'</td>'
      +'<td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="'+o.link+'" target="_blank" style="color:#B5179E;text-decoration:none;font-size:12px">'+o.link+'</a></td>'
      +'<td style="font-weight:600">'+(o.qty||0).toLocaleString()+'</td>'
      +'<td style="font-weight:700">'+gf(o.charge)+'</td>'
      +'<td>'+badge(o.status)+'</td>'
      +'<td style="font-size:11px;color:#9A8AB0;white-space:nowrap">'+fd(o.created)+'</td>'
      +'<td style="white-space:nowrap">'+actionBtns+'</td></tr>';
  });
  tb.innerHTML=h;
  ge('stTotal').textContent=d.length;
  ge('stPend').textContent=d.filter(function(o){return o.status==='pending'||o.status==='processing'}).length;
  ge('stDone').textContent=d.filter(function(o){return o.status==='completed'}).length;
}

// 🔄 주문 상태 실시간 새로고침 (Peakerr에서 가져옴)
async function refreshOrder(orderId){
  toast('상태 확인 중...','ok');
  var d=await api('/api/orders/refresh/'+orderId,'POST');
  if(d.error){toast(d.error,'err');return}
  toast('상태 업데이트 완료: '+(d.peakerrStatus||'확인됨'),'ok');
  loadOrders();
  updBal();
}

// 🚫 주문 취소 요청
async function cancelOrder(orderId){
  if(!confirm('이 주문을 취소하시겠어요?\n\nPeakerr가 아직 처리하지 않았다면 환불됩니다.\n이미 처리가 시작된 경우 취소가 불가할 수 있습니다.'))return;
  var d=await api('/api/orders/cancel/'+orderId,'POST');
  if(d.error){toast(d.error,'err');return}
  toast(d.message||'취소 처리되었습니다','ok');
  loadOrders();
  updBal();
}
async function loadOrderStats(){
  var d=await api('/api/orders/my');if(!Array.isArray(d))return;
  ge('stTotal').textContent=d.length;
  ge('stPend').textContent=d.filter(function(o){return o.status==='pending'||o.status==='processing'}).length;
  ge('stDone').textContent=d.filter(function(o){return o.status==='completed'}).length;
}

// ── 충전 ──
async function loadBankInfo(){
  var d=await api('/api/site-config');
  if(d.bank){var bi=ge('bankInfo');if(bi)bi.innerHTML='✦ <strong style="color:#B5179E">'+d.bank+'</strong><br><span style="font-size:11px;color:#9A8AB0">입금 후 카카오톡으로 입금자명+금액 알려주시면 즉시 충전됩니다.</span>'}
  if(d.kakao)window._kakao=d.kakao;
