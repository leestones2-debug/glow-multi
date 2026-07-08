function closeM(id){ge(id).classList.remove('on')}

// ── 초기화 ──

// 어드민 크레딧 요청
async function requestCredit(){
  var amount=ge('crAmount').value,note=ge('crNote').value;
  if(!amount||parseFloat(amount)<=0){toast('금액을 입력하세요','err');return}
  var d=await api('/api/admin/credit-request','POST',{amount:parseFloat(amount),note});
  if(d.error){toast(d.error,'err');return}
  toast('크레딧 요청 완료! 슈퍼관리자 승인 후 충전됩니다 ✨','ok');
  ge('crAmount').value='';ge('crNote').value='';
  loadCreditRequests();
}
async function loadCreditRequests(){
  var d=await api('/api/admin/credit-requests');
  var tb=ge('crTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="4" style="text-align:center;padding:16px;color:#9A8AB0">요청 내역이 없습니다</td></tr>';return}
  d.forEach(function(r){
    var sb={pending:'background:#FEF3C7;color:#F59E0B',approved:'background:#D1FAE5;color:#10B981',rejected:'background:#FEE2E2;color:#EF4444'};
    var sl={pending:'대기중',approved:'승인됨',rejected:'거절됨'};
    h+='<tr><td style="font-weight:700">$'+parseFloat(r.amount).toFixed(2)+'</td>'
      +'<td style="font-size:12px">'+( r.note||'-')+'</td>'
      +'<td><span class="bdg" style="'+sb[r.status]+'">'+sl[r.status]+'</span></td>'
      +'<td style="font-size:11px;color:var(--tl)">'+fd(r.created)+'</td></tr>';
  });
  tb.innerHTML=h;
}

// 슈퍼관리자 크레딧 요청 관리
async function loadSuperCreditReqs(){
  var d=await api('/api/super/credit-requests');
  var tb=ge('spCRTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:16px;color:#9A8AB0">요청 내역이 없습니다</td></tr>';return}
  d.forEach(function(r){
    var sb={pending:'background:#FEF3C7;color:#F59E0B',approved:'background:#D1FAE5;color:#10B981',rejected:'background:#FEE2E2;color:#EF4444'};
    var sl={pending:'대기중',approved:'승인됨',rejected:'거절됨'};
    h+='<tr><td style="font-weight:700;color:var(--p2)">'+r.site_name+'</td>'
      +'<td style="font-weight:700">$'+parseFloat(r.amount).toFixed(2)+'</td>'
      +'<td style="font-size:12px">'+(r.note||'-')+'</td>'
      +'<td><span class="bdg" style="'+sb[r.status]+'">'+sl[r.status]+'</span></td>'
      +'<td style="font-size:11px;color:var(--tl)">'+fd(r.created)+'</td>'
      +'<td>'+(r.status==='pending'
        ?'<button class="btn bok bxs" onclick="processCR(\''+r.id+'\',\'approve\')">✅ 승인</button> '
         +'<button class="btn ber bxs" onclick="processCR(\''+r.id+'\',\'reject\')">❌ 거절</button>'
        :'-')+'</td></tr>';
  });
  tb.innerHTML=h;
}
async function processCR(id,action){
  var d=await api('/api/super/credit-requests/process','POST',{id,action});
  if(d.error){toast(d.error,'err');return}
  toast(action==='approve'?'크레딧 승인 완료 ✨':'거절 완료','ok');
  loadSuperCreditReqs();
  loadSuperDash();
}


// ── 서비스 관리 ──
