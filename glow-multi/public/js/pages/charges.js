// 충전 관련 함수
function submitCharge(){
  var a=parseInt(ge('chAmt').value);if(!a||a<5000){toast('최소 ₩5,000 이상','err');return}
  var note=ge('chNote').value.trim();
  if(!note){toast('입금자명을 메모에 입력해주세요','err');ge('chNote').focus();return}
  ge('confirmAmt').textContent=gf(a);
  ge('confirmNote').textContent=note;
  ge('mChargeConfirm').classList.add('on');
}
// (아래 submitCharge는 직접 요청용)
async function doSubmitCharge(){
  var a=parseInt(ge('chAmt').value);
  var note=ge('chNote').value.trim();
  closeM('mChargeConfirm');
  var d=await api('/api/charges','POST',{amount:a,note:note});
  if(d.error){toast(d.error,'err');return}
  toast('충전 요청 접수! ✨','ok');
  ge('chAmt').value='';ge('chNote').value='';
  document.querySelectorAll('.ci').forEach(function(ci){ci.classList.remove('on')});
  loadChargeHis();
  if(window._kakao)window.open(window._kakao,'_blank');
}
async function cancelCharge(id){
  if(!confirm('충전 요청을 취소하시겠습니까?'))return;
  var d=await api('/api/charges/cancel','POST',{id:id});
  if(d.error){toast(d.error,'err');return}
  toast('충전 요청이 취소되었습니다','ok');
  loadChargeHis();
}
async function loadChargeHis(){
  var d=await api('/api/charges/my');var tb=ge('chHisTb'),h='';
  if(!Array.isArray(d)||!d.length){tb.innerHTML='<tr><td colspan="4" style="text-align:center;padding:14px;color:#9A8AB0">내역 없음</td></tr>';return}
  d.forEach(function(r){
    h+='<tr>'
      +'<td style="font-weight:700;color:#B5179E">'+gf(r.amount)+'</td>'
      +'<td style="font-size:12px;color:#5A4A7A">'+(r.note||'-')+'</td>'
      +'<td>'+badge(r.status)+'</td>'
      +'<td>'+(r.status==='pending'
        ?('<button class="btn ber bxs" onclick="cancelCharge(\'' + r.id + '\')">취소</button>')
        :'<span style="font-size:11px;color:#9A8AB0">'+fd(r.created)+'</span>')
      +'</td></tr>';
  });
  tb.innerHTML=h;
}
