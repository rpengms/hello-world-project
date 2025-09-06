(function(){
  const THEME_KEY = 'dw-theme';
  function applyTheme(t){
    const body=document.body;
    body.dataset.theme = t;
    body.classList.toggle('dark', t === 'dark');
    const btn = document.getElementById('toggle-theme');
    if(btn){
      const next = t === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', `Switch to ${next} theme`);
      btn.title = `Switch to ${next} theme`;
    }
  }
  function init(){
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
    const btn = document.getElementById('toggle-theme');
    if(btn){
      btn.addEventListener('click', function(){
        const next = (document.body.dataset.theme === 'dark') ? 'light' : 'dark';
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
      });
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
