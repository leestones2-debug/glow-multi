function goAuth(m){showPg('pg-auth');switchAuth(m)}
function switchAuth(m){
  var on='background:#fff;color:#B5179E;font-weight:700;box-shadow:0 2px 8px rgba(114,9,183,.1)';
  var off='background:transparent;color:#9A8AB0;font-weight:500';
  // 모든 폼 숨기기
  ge('f로그인').style.display='none';
  ge('fReg').style.display='none';
  var forgotEl=ge('fForgot');if(forgotEl)forgotEl.style.display='none';
  
  if(m==='login'){
    ge('tabL').style.cssText=on;ge('tabR').style.cssText=off;
    ge('f로그인').style.display='block';
    ge('aTitle').textContent=(window._siteLoginWelcome||'다시 만나서 반가워요')+' ✨';ge('aSub').textContent=window._siteLoginSub||'계정에 로그인하세요';
  }else if(m==='forgot'){
    ge('tabL').style.cssText=on;ge('tabR').style.cssText=off;
    if(forgotEl)forgotEl.style.display='block';
    ge('aTitle').textContent='비밀번호 찾기 🔐';ge('aSub').textContent='이메일로 재설정 링크를 보내드립니다';
  }else{
    ge('tabR').style.cssText=on;ge('tabL').style.cssText=off;
    ge('fReg').style.display='block';
    ge('aTitle').textContent=(window._siteRegisterWelcome||'오신걸 환영해요')+' ✨';ge('aSub').textContent=window._siteRegisterSub||'무료로 가입하고 채널 성장을 시작하세요';
  }
}
function showForgotPassword(){switchAuth('forgot');}
async function doForgotPassword(){
  var email=ge('fpEmail').value.trim();
  if(!email){toast('이메일을 입력하세요','err');return}
  var btn=event.target;var originalText=btn.textContent;btn.textContent='전송 중...';btn.disabled=true;
  var d=await api('/api/forgot-password','POST',{email:email});
  btn.textContent=originalText;btn.disabled=false;
  if(d.error){toast(d.error,'err');return}
  toast(d.message||'재설정 링크가 전송되었습니다','ok');
  setTimeout(function(){switchAuth('login')},2000);
}
// 비밀번호 재설정 페이지 처리 (URL에 /reset-password?token=... 접속 시)
async function handleResetPasswordPage(){
  if(!location.pathname.startsWith('/reset-password'))return false;
  // 다른 페이지 모두 숨기기
  ['pg-land','pg-auth','pg-dash'].forEach(function(p){var el=ge(p);if(el){el.classList.remove('on');el.style.display='none'}});
  var pg=ge('pg-reset');if(!pg)return false;
  pg.style.display='flex';
  var params=new URLSearchParams(location.search);
  var token=params.get('token');
  if(!token){showResetError('유효하지 않은 링크입니다');return true}
  window._resetToken=token;
  try{
    var resp=await fetch('/api/reset-password/verify?token='+encodeURIComponent(token));
    var d=await resp.json();
    if(d.error){showResetError(d.error);return true}
    ge('rstLoading').style.display='none';
    ge('rstForm').style.display='block';
    ge('rstEmail').textContent=d.email;
  }catch(e){showResetError('링크 확인 중 오류 발생');}
  return true;
}
function showResetError(msg){
  ge('rstLoading').style.display='none';
  ge('rstForm').style.display='none';
  ge('rstError').style.display='block';
  ge('rstErrorMsg').textContent=msg;
}
async function doResetPassword(){
  var pw=ge('rstPw').value,pw2=ge('rstPw2').value;
  if(!pw||pw.length<6){toast('비밀번호는 6자 이상이어야 합니다','err');return}
  if(pw!==pw2){toast('비밀번호가 일치하지 않습니다','err');return}
  var d=await api('/api/reset-password','POST',{token:window._resetToken,newpw:pw});
  if(d.error){toast(d.error,'err');return}
  ge('rstForm').style.display='none';
  ge('rstSuccess').style.display='block';
}
async function doLogin(){
  var e=ge('l이메일').value.trim(),p=ge('lPw').value;
  if(!e||!p){toast('이메일과 비밀번호를 입력하세요','err');return}
  var d=await api('/api/login','POST',{email:e,pw:p});
  if(d.error){toast(d.error,'err');return}
  if(d.token)localStorage.setItem('glow_token',d.token);
  CUR=d.user;enterDash();
}
async function doRegister(){
  var n=ge('rName').value.trim(),e=ge('r이메일').value.trim(),p=ge('rPw').value;
  if(!n||!e||!p){toast('모든 항목을 입력하세요','err');return}
  var d=await api('/api/register','POST',{name:n,email:e,pw:p});
  if(d.error){toast(d.error,'err');return}
  if(d.token)localStorage.setItem('glow_token',d.token);
  if(d.token)localStorage.setItem('glow_token',d.token);
  CUR=d.user;enterDash();toast('가입 완료! 환영합니다 ✨','ok');
}
async function doLogout(){await api('/api/logout','POST');localStorage.removeItem('glow_token');CUR=null;showPg('pg-land')}
