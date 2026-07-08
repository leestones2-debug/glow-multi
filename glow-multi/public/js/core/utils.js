async function api(url,method,body){
  var opts={method:method||'GET',headers:{'Content-Type':'application/json'}};
  var token=localStorage.getItem('glow_token');
  if(token)opts.headers['Authorization']='Bearer '+token;
  if(body)opts.body=JSON.stringify(body);
  var res=await fetch(url,opts);
  if(res.status===401){localStorage.removeItem('glow_token');CUR=null;showPg('pg-land');return {error:'로그인 필요'};}
  return res.json();
}
function gf(v){return'₩'+Math.round(v||0).toLocaleString()}
function fd(s){return s?String(s).slice(0,16).replace('T',' '):'-'}
function ge(id){return document.getElementById(id)}
function toast(msg,type){
  var t=ge('toast');t.textContent=msg;
  var s={ok:'background:#ecfdf5;color:#10B981;border:1px solid rgba(16,185,129,.3)',err:'background:#fef2f2;color:#EF4444;border:1px solid rgba(239,68,68,.3)',warn:'background:#fffbeb;color:#F59E0B;border:1px solid rgba(245,158,11,.3)'};
  t.style.cssText=(s[type]||s.ok)+';position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(0);z-index:9999;padding:12px 22px;border-radius:100px;font-size:13px;font-weight:600;box-shadow:0 8px 28px rgba(0,0,0,.15);opacity:1;white-space:nowrap;max-width:90vw';
  clearTimeout(t._t);t._t=setTimeout(function(){t.style.opacity='0'},3000);
}
function badge(s){
  var m={pending:'background:#FEF3C7;color:#F59E0B',processing:'background:rgba(114,9,183,.1);color:#B5179E',completed:'background:#D1FAE5;color:#10B981',cancelled:'background:#FEE2E2;color:#EF4444',canceled:'background:#FEE2E2;color:#EF4444',refunded:'background:#DBEAFE;color:#3B82F6',partial_refunded:'background:#FEF3C7;color:#F59E0B',failed:'background:#FEE2E2;color:#EF4444',approved:'background:#D1FAE5;color:#10B981',rejected:'background:#FEE2E2;color:#EF4444'};
  var l={pending:'대기',processing:'처리중',completed:'완료',cancelled:'취소',canceled:'취소',refunded:'환불완료',partial_refunded:'부분환불',failed:'실패',approved:'승인',rejected:'거절'};
  var k=(s||'').toLowerCase();
  return'<span class="bdg" style="'+(m[k]||m.pending)+'">'+(l[k]||s||'-')+'</span>';
}
function showPg(id){
  ['pg-land','pg-auth','pg-dash'].forEach(function(p){var el=ge(p);if(el){el.classList.remove('on');el.style.display='none'}});
  var el=ge(id);if(!el)return;
  el.classList.add('on');
  if(id==='pg-dash')el.style.display='flex';
  else if(id==='pg-auth')el.style.display='flex';
  else el.style.display='block';
  window.scrollTo(0,0);
}
