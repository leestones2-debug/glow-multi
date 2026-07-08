window.addEventListener('DOMContentLoaded',async function(){
  loadSiteConfig();
  // 🔐 비밀번호 재설정 링크 접속 처리
  var isResetPage=await handleResetPasswordPage();
  if(isResetPage)return;
  var token=localStorage.getItem('glow_token');
  if(token){
    api('/api/me').then(function(d){
      if(d&&d.id){CUR=d;enterDash()}
    }).catch(function(){});
  }
});
