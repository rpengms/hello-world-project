// Integrated from dist/app.js
// State Management
class AppState {
  constructor() {
    this.currentScreen = 'hub';
    this.userData = {};
    this.testResults = {};
    this.settings = {
      reducedMotion: false,
      darkMode: false
    };
    this.loadSettings();
    // Load in-progress game snapshots
    this.inProgress = JSON.parse(localStorage.getItem('inProgress') || '{}');
    // Initialize auth integration
    this.setupAuthIntegration();
  }

  setupAuthIntegration() {
    // Listen for auth state changes
    document.addEventListener('authStateChange', (event) => {
      this.handleAuthStateChange(event.detail);
    });

    // Update UI based on current auth state
    if (window.authService) {
      this.updateUIForAuthState();
    }
  }

  handleAuthStateChange(authData) {
    const { type, user, isAuthenticated } = authData;
    
    if (type === 'login' || type === 'register') {
      // User signed in, switch from guest to registered mode
      this.switchToRegisteredMode(user);
    } else if (type === 'logout') {
      // User signed out, switch to guest mode
      this.switchToGuestMode();
    }
  }

  switchToRegisteredMode(user) {
    // Hide guest banner
    const guestBanner = document.getElementById('guest-banner');
    if (guestBanner) guestBanner.style.display = 'none';
    
    // Update user display
    this.updateUIForAuthState();
    
    // Load server-side data
    this.loadUserDataFromServer();
  }

  switchToGuestMode() {
    // Show guest banner
    const guestBanner = document.getElementById('guest-banner');
    if (guestBanner) guestBanner.style.display = 'block';
    
    // Update user display
    this.updateUIForAuthState();
    
    // Clear any cached server data
    this.testResults = {};
  }

  updateUIForAuthState() {
    const isAuthenticated = window.authService?.isAuthenticated();
    const guestBanner = document.getElementById('guest-banner');
    
    if (isAuthenticated) {
      if (guestBanner) guestBanner.style.display = 'none';
    } else {
      if (guestBanner) guestBanner.style.display = 'block';
    }
  }

  async loadUserDataFromServer() {
    if (!window.authService?.isAuthenticated()) return;

    try {
      // Load game history
      const historyResponse = await window.authService.apiRequest('/games/history');
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        this.processServerGameHistory(historyData.history);
      }

      // Load stats
      const statsResponse = await window.authService.apiRequest('/games/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        this.processServerStats(statsData);
      }
    } catch (error) {
      console.error('Error loading user data from server:', error);
    }
  }

  processServerGameHistory(history) {
    // Convert server history to local format
    this.testResults = {};
    
    history.forEach(result => {
      if (result.detailed_results) {
        this.testResults[result.game_type] = result.detailed_results;
      }
    });
  }

  processServerStats(statsData) {
    // Update local stats with server data
    const { gameStats, problemsetStats } = statsData;
    
    // Update game stats display
    this.updateGameStatsDisplay(gameStats);
    
    // Update problemset stats
    this.updateProblemsetStatsDisplay(problemsetStats);
  }

  updateGameStatsDisplay(gameStats) {
    gameStats.forEach(stat => {
      const statusEl = document.getElementById(`status-${stat.game_type}`);
      if (statusEl) {
        statusEl.textContent = `Best: ${Math.round(stat.best_score)}/100 (${stat.plays} plays)`;
      }
    });
  }

  updateProblemsetStatsDisplay(problemsetStats) {
    // This will be used by the stats page
    this.problemsetStats = problemsetStats;
  }

  // Save data to server for registered users
  async saveToServer(endpoint, data) {
    if (!window.authService?.isAuthenticated()) {
      // Guest mode - save to localStorage as before
      return this.saveToLocalStorage(data);
    }

    try {
      const response = await window.authService.apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.ok) {
        return await response.json();
      } else {
        console.error('Failed to save to server, falling back to localStorage');
        return this.saveToLocalStorage(data);
      }
    } catch (error) {
      console.error('Error saving to server:', error);
      return this.saveToLocalStorage(data);
    }
  }

  saveToLocalStorage(data) {
    // Fallback to localStorage for guest users or server errors
    const key = data.type === 'game' ? 'testResults' :
                data.type === 'survey' ? 'surveyResults' :
                'gameData';
    
    localStorage.setItem(key, JSON.stringify(data));
    return Promise.resolve({ success: true });
  }

  saveSettings() {
    localStorage.setItem('screenSettingsSnapshot', JSON.stringify(this.settings));
  }

  loadSettings() {
    const saved = localStorage.getItem('screenSettingsSnapshot');
    if (saved) {
      this.settings = { ...this.settings, ...JSON.parse(saved) };
    }
    // Apply system preferences
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.settings.reducedMotion = true;
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.settings.darkMode = true;
    }
  }

  saveTestResults() {
    localStorage.setItem('testResults', JSON.stringify({
      userData: this.userData,
      testResults: this.testResults,
      completedAt: new Date().toISOString()
    }));
  }

  saveInProgress() {
    localStorage.setItem('inProgress', JSON.stringify(this.inProgress || {}));
  }
}

// Router
class Router {
  constructor(appState) {
    this.appState = appState;
    this.screens = document.querySelectorAll('.screen');
  }

  navigateTo(screenId, data = {}) {
    console.log(`Navigating to: ${screenId}`);
    
    const currentScreen = document.querySelector('.screen.active');
    const targetScreen = document.getElementById(screenId);
    
    if (!targetScreen) {
      console.error(`Screen not found: ${screenId}`);
      return;
    }

    // Update state
    this.appState.currentScreen = screenId;
    Object.assign(this.appState.userData, data);

  // Handle screen transition + update hidden/aria-hidden for accessibility
    const hide = (el) => { if (!el) return; el.classList.remove('active'); el.setAttribute('aria-hidden', 'true'); el.hidden = true; };
    const show = (el) => { if (!el) return; el.hidden = false; el.setAttribute('aria-hidden', 'false'); el.classList.add('active'); };
    if (currentScreen && !this.appState.settings.reducedMotion) {
      currentScreen.classList.add('fade-out');
      setTimeout(() => {
        currentScreen.classList.remove('fade-out');
        hide(currentScreen);
        targetScreen.classList.add('fade-in');
        show(targetScreen);
        setTimeout(() => {
          targetScreen.classList.remove('fade-in');
        }, 300);
      }, 300);
    } else {
      hide(currentScreen);
      show(targetScreen);
    }

  // Lock switching when entering a task/assessment screen
  const isGameScreen = screenId && screenId.startsWith('set-');
    if (isGameScreen) {
      document.body.setAttribute('data-lock', 'in-game');
    } else {
      document.body.removeAttribute('data-lock');
    }

    // Focus management
    setTimeout(() => {
  const focusTarget = targetScreen.querySelector('h1, h2, [autofocus], button, a');
      if (focusTarget) {
        focusTarget.focus();
      }
    }, 100);
  }
}

// Audio Manager
class AudioManager {
  constructor() {
    this.audioContext = null;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  async initAudio() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playTone(frequency = 440, duration = 1000) {
    return new Promise((resolve) => {
      this.initAudio().then(() => {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration / 1000);
        
        oscillator.onended = resolve;
      });
    });
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      return true;
    } catch (error) {
      console.error('Recording failed:', error);
      return false;
    }
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        this.isRecording = false;
        resolve(audioBlob);
      };
      
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    });
  }
}

// Task Handlers
class TaskHandlers {
  constructor(appState, router, audioManager) {
    this.appState = appState;
    this.router = router;
    this.audioManager = audioManager;
  this.gameData = { unscramble: [], phoneme: [], flash: [] };
  this.history = JSON.parse(localStorage.getItem('gameHistory')||'[]');
    this.currentRun = null;
    this.hubInitialized = false;
    this.surveys = { cognitive: null, dyslexia: null, mental: null };
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Welcome -> hubs
    document.getElementById('go-game-hub')?.addEventListener('click',()=> this.router.navigateTo('hub'));
    document.getElementById('go-survey-hub')?.addEventListener('click',()=> this.router.navigateTo('survey-hub'));
    // generic delegated nav for any [data-route]
    document.body.addEventListener('click', (e)=>{
      const target = e.target && e.target.closest && e.target.closest('[data-route]');
      if(target){
        const route = target.getAttribute('data-route');
        if(route){ e.preventDefault(); this.router.navigateTo(route); }
      }
    });
  // hubs & assessments
  this.setupHub();
  this.setupHistory();
  this.setupAssessment();
  // surveys
  this.setupSurveys();

    // top nav links (already delegated, but ensure hash updates)
    document.querySelectorAll('.nav-link').forEach(a=>{
      a.addEventListener('click',(e)=>{
        e.preventDefault();
        const id=a.getAttribute('data-route');
        if(id){ history.pushState({}, '', '#'+id); this.router.navigateTo(id); }
      });
    });
  }
  setupHub(){ if(this.hubInitialized) return; this.hubInitialized=true;
    const viewHist=document.getElementById('open-history-btn');
    const backBtn=document.getElementById('back-to-hub');
    const openSurveys=document.getElementById('open-surveys');

    const refreshStatuses=()=>{
      const forms=['k2c','k2d','g28c','g28d'];
      forms.forEach(k=>{
        const el=document.getElementById(`status-${k}`);
        if(!el) return;
        const ip=(this.appState.inProgress||{})[k];
        if(ip && Number.isFinite(ip.index)){
          const pct = Math.round(((ip.index+1)/Math.max(1, ip.total||0))*100);
          el.textContent = `In progress · ${isFinite(pct)?pct:0}%`;
        } else {
          // find last history entry
          const last = (Array.isArray(this.history)?this.history:[]).find(h=> h.game===k);
          el.textContent = last? `Last: ${new Date(last.when).toLocaleDateString()}` : 'Not started';
        }
      });
    };

    document.getElementById('start-k2c')?.addEventListener('click',()=>{ this.beginForm('k2c'); this.router.navigateTo('set-assessment'); });
    document.getElementById('start-k2d')?.addEventListener('click',()=>{ this.beginForm('k2d'); this.router.navigateTo('set-assessment'); });
    document.getElementById('start-g28c')?.addEventListener('click',()=>{ this.beginForm('g28c'); this.router.navigateTo('set-assessment'); });
    document.getElementById('start-g28d')?.addEventListener('click',()=>{ this.beginForm('g28d'); this.router.navigateTo('set-assessment'); });

    viewHist?.addEventListener('click',()=>{ this.renderHistory('all'); this.router.navigateTo('history'); });
    backBtn?.addEventListener('click',()=> this.router.navigateTo('hub'));
    openSurveys?.addEventListener('click',()=> this.router.navigateTo('survey-hub'));

    const hubEl=document.getElementById('hub');
    const obs=new MutationObserver(m=>m.forEach(mu=>{ if(mu.target.classList.contains('active')&& mu.target.id==='hub'){ refreshStatuses(); const surveysStatus=document.getElementById('surveys-status'); const s=this.appState.surveyResults; const done = s && s.cognitive && s.dyslexia && s.mental; surveysStatus && (surveysStatus.textContent = done? 'Surveys complete':'Surveys optional'); } }));
    hubEl && obs.observe(hubEl,{attributes:true,attributeFilter:['class']});
    this.refreshHubStatuses=refreshStatuses;
  }

  // --- Assessment runner (Forms) ---
  setupAssessment(){
    const prevBtn=document.getElementById('as-prev');
    const nextBtn=document.getElementById('as-next');
    const saveBtn=document.getElementById('as-save');
    const cancelBtn=document.getElementById('as-cancel');
    const exitBtn=document.getElementById('as-exit');
    const submitBtn=document.getElementById('as-submit');
    prevBtn?.addEventListener('click', ()=> this.asPrev());
    nextBtn?.addEventListener('click', ()=> this.asNext());
    saveBtn?.addEventListener('click', ()=> this.saveProgress());
    cancelBtn?.addEventListener('click', ()=> this.cancelProgress());
    exitBtn?.addEventListener('click', ()=> this.exitToHub());
    submitBtn?.addEventListener('click', ()=> this.submitAssessment());

    // When screen shows, if we have an existing session, render; otherwise, try restore from inProgress based on last clicked? No-op here.
  }

  getFormSpec(kind){
    const k2Base = [
      { section: 'Phonological Awareness', text: 'Which two words rhyme?', choices:[{id:'a',text:'cat – dog'},{id:'b',text:'bat – hat'},{id:'c',text:'sun – sit'}], correctId:'b' },
      { section: 'Initial Sound', text: 'Which word starts with /m/?', choices:[{id:'a',text:'sun'},{id:'b',text:'map'},{id:'c',text:'dog'}], correctId:'b' },
      { section: 'Syllables', text: 'How many syllables in "banana"?', choices:[{id:'a',text:'2'},{id:'b',text:'3'},{id:'c',text:'4'}], correctId:'b' },
      { section: 'Letter–Sound', text: 'Which letter makes the /k/ sound?', choices:[{id:'a',text:'C'},{id:'b',text:'M'},{id:'c',text:'S'}], correctId:'a' },
      { section: 'Decoding', text: 'Pick the real word.', choices:[{id:'a',text:'mip'},{id:'b',text:'lap'},{id:'c',text:'tog'}], correctId:'b' },
    ];
    const g28Base = [
      { section: 'Word Reading', text: 'Choose the correctly spelled word.', choices:[{id:'a',text:'definately'},{id:'b',text:'definitely'},{id:'c',text:'definetly'}], correctId:'b' },
      { section: 'Pseudoword', text: 'Which pronunciation matches "glorp"?', choices:[{id:'a',text:'gl-or-p'},{id:'b',text:'g-lop'},{id:'c',text:'gl-rop'}], correctId:'a' },
      { section: 'Comprehension', text: 'A main idea is…', choices:[{id:'a',text:'a detail supporting the topic'},{id:'b',text:'what the text is mostly about'},{id:'c',text:'the author’s name'}], correctId:'b' },
      { section: 'Spelling', text: 'Pick the correct spelling.', choices:[{id:'a',text:'accomodate'},{id:'b',text:'accommodate'},{id:'c',text:'acommodate'}], correctId:'b' },
    ];
    const clone = (arr)=> arr.map(x=> ({...x, choices: x.choices.map(c=>({...c}))}));
    switch(kind){
      case 'k2c': return { title:'K–2 (Form C)', questions: clone(k2Base) };
      case 'k2d': return { title:'K–2 (Form D)', questions: this.shuffle(clone(k2Base)) };
      case 'g28c': return { title:'Grades 2–8 (Form C)', questions: clone(g28Base) };
      case 'g28d': return { title:'Grades 2–8 (Form D)', questions: this.shuffle(clone(g28Base)) };
      default: return null;
    }
  }

  beginForm(kind){
    const spec = this.getFormSpec(kind);
    if(!spec) return;
    const ip = (this.appState.inProgress||{})[kind];
    this.assessment = {
      kind,
      title: spec.title,
      questions: spec.questions,
      index: ip?.index ?? 0,
      answers: ip?.answers ? {...ip.answers} : {},
      max: spec.questions.length,
    };
    this.renderQuestion();
  }

  renderQuestion(){
    const s=this.assessment; if(!s) return;
    const q=s.questions[s.index]; if(!q) return;
    document.getElementById('assessment-title')?.replaceChildren(document.createTextNode(s.title));
    document.getElementById('as-section-title')?.replaceChildren(document.createTextNode(q.section));
    document.getElementById('as-progress')?.replaceChildren(document.createTextNode(`Question ${s.index+1} of ${s.questions.length}`));
    document.getElementById('as-question')?.replaceChildren(document.createTextNode(q.text));
    const wrap=document.getElementById('as-choices'); if(wrap){ wrap.innerHTML=''; q.choices.forEach(ch=>{ const b=document.createElement('button'); b.className='btn'; b.textContent=ch.text; b.dataset.id=ch.id; if(s.answers[s.index]===ch.id){ b.classList.add('selected'); }
      b.addEventListener('click', ()=> this.selectChoice(ch.id)); wrap.appendChild(b); }); }
    const submitBtn=document.getElementById('as-submit'); if(submitBtn) submitBtn.hidden = (s.index !== s.questions.length-1);
    const fb=document.getElementById('as-feedback'); if(fb) fb.textContent='';
    this.persistProgress();
  }

  selectChoice(choiceId){
    const s=this.assessment; if(!s) return;
    s.answers[s.index]=choiceId;
    const fb=document.getElementById('as-feedback'); if(fb) fb.textContent='Saved';
    // Re-render to reflect selection
    this.renderQuestion();
  }

  asPrev(){ const s=this.assessment; if(!s) return; if(s.index>0){ s.index--; this.renderQuestion(); } }
  asNext(){ const s=this.assessment; if(!s) return; if(s.index < s.questions.length-1){ s.index++; this.renderQuestion(); } }

  submitAssessment(){
    const s=this.assessment; if(!s) return;
    let score=0; s.questions.forEach((q,i)=>{ if(s.answers[i]===q.correctId) score++; });
    const payload={ score: score, summary: `${score}/${s.max} correct` };
    this.pushHistory(s.kind, payload);
    // Clear in-progress for this form
    if(this.appState.inProgress){ delete this.appState.inProgress[s.kind]; this.appState.saveInProgress(); }
    this.assessment=null; this.router.navigateTo('history');
  }

  persistProgress(){
    const s=this.assessment; if(!s) return;
    this.appState.inProgress = this.appState.inProgress || {};
    this.appState.inProgress[s.kind] = { index: s.index, total: s.questions.length, answers: s.answers, title: s.title };
    this.appState.saveInProgress();
    this.refreshHubStatuses?.();
  }
  saveProgress(){ this.persistProgress(); const fb=document.getElementById('as-feedback'); if(fb) fb.textContent='Progress saved'; }
  cancelProgress(){ if(!this.assessment) return; if(!confirm('Discard unsaved changes and revert to last saved state?')) return; const ip=(this.appState.inProgress||{})[this.assessment.kind]; if(ip){ this.assessment.index=ip.index||0; this.assessment.answers={...ip.answers}; this.renderQuestion(); } else { this.assessment=null; this.router.navigateTo('hub'); } }
  exitToHub(){ this.persistProgress(); this.router.navigateTo('hub'); }

  shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

  // (Legacy game setups removed)

  // (Speed & Sense removed)

  // --- History List and Filters ---
  setupHistory(){
    const container = document.getElementById('history-content');
    const tabs = document.querySelectorAll('#history .tabs .tab');
    if(!container) return;
    tabs.forEach(tab=>{
      tab.addEventListener('click', ()=>{
        tabs.forEach(t=>{ t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
        tab.classList.add('active'); tab.setAttribute('aria-selected','true');
        const f = tab.getAttribute('data-filter')||'all';
        this.renderHistory(f);
      });
    });
    const historyScreen = document.getElementById('history');
    const obs=new MutationObserver(m=>m.forEach(mu=>{ if(mu.target.classList.contains('active') && mu.target.id==='history'){
      const activeTab = document.querySelector('#history .tabs .tab.active');
      const f = activeTab?.getAttribute('data-filter')||'all';
      this.renderHistory(f);
    }}));
    historyScreen && obs.observe(historyScreen,{attributes:true,attributeFilter:['class']});
  }

  async pushHistory(game, payload){
    const entry = { id: Date.now(), when: new Date().toISOString(), game, ...payload };
    this.history = Array.isArray(this.history)? this.history : [];
    this.history.unshift(entry);
    // cap to 50
    if(this.history.length>50) this.history.length = 50;
    localStorage.setItem('gameHistory', JSON.stringify(this.history));

    // Save to server for registered users
    if (window.authService?.isAuthenticated()) {
      try {
        await this.appState.saveToServer('/games/history', {
          game_type: game,
          score: payload.score || null,
          summary: payload.summary || null,
          completed_at: entry.when
        });
      } catch (error) {
        console.error('Failed to save game history to server:', error);
      }
    }
  }

  renderHistory(filter='all'){
    const container = document.getElementById('history-content'); if(!container) return;
    const ip = this.appState.inProgress || {};
    const entries = (Array.isArray(this.history)? this.history : []).slice();
    let view = entries;
    if(filter==='inprogress'){
      // render from inProgress only
      container.innerHTML='';
      const keys = Object.keys(ip);
      if(keys.length===0){ container.innerHTML='<p class="empty">No games in progress.</p>'; return; }
      keys.forEach(k=>{
        const row=document.createElement('div'); row.className='history-row';
        const lab=document.createElement('div'); lab.className='label'; lab.textContent=labelForGame(k);
        const meta=document.createElement('div'); meta.className='meta';
        const snap = ip[k];
        const count = snap?.items? (snap.items.length||0) : (snap?.answers? Object.keys(snap.answers).length : 0);
        meta.textContent = `Saved ${count} responses`;
        row.appendChild(lab); row.appendChild(meta);
        container.appendChild(row);
      });
      return;
    }
    if(filter!=='all'){
      view = entries.filter(e=> e.game===filter);
    }
    container.innerHTML='';
    if(view.length===0){ container.innerHTML='<p class="empty">No history yet.</p>'; return; }
    view.forEach(e=>{
      const row=document.createElement('div'); row.className='history-row';
      const lab=document.createElement('div'); lab.className='label'; lab.textContent=labelForGame(e.game);
      const meta=document.createElement('div'); meta.className='meta'; meta.textContent=`${new Date(e.when).toLocaleString()}${e.score!=null? ' · Score '+e.score: ''}${e.summary? ' · '+e.summary: ''}`;
      row.appendChild(lab); row.appendChild(meta);
      container.appendChild(row);
    });
    function labelForGame(g){
      switch(g){
        case 'k2c': return 'K–2 (Form C)';
        case 'k2d': return 'K–2 (Form D)';
        case 'g28c': return 'Grades 2–8 (Form C)';
        case 'g28d': return 'Grades 2–8 (Form D)';
        case 'soundlab': return 'Sound Lab';
        case 'wordmachine': return 'Word Machine';
        case 'voicetest': return 'Voice Test';
        default: return g;
      }
    }
  }

  // --- Surveys (minimal implementation to wire UI) ---
  setupSurveys(){
    const hub=document.getElementById('survey-hub');
    if(!hub) return;
    const sections=[
      {key:'cognitive', start:'start-cog', screen:'survey-cog', form:'survey-cog-form', save:'survey-cog-save', submit:'survey-cog-submit', back:'survey-cog-back', status:'survey-cog-status'},
      {key:'dyslexia', start:'start-dys', screen:'survey-dys', form:'survey-dys-form', save:'survey-dys-save', submit:'survey-dys-submit', back:'survey-dys-back', status:'survey-dys-status'},
      {key:'mental', start:'start-men', screen:'survey-men', form:'survey-men-form', save:'survey-men-save', submit:'survey-men-submit', back:'survey-men-back', status:'survey-men-status'},
    ];
    const bank={
      cognitive:[
        'Remembers sequences easily', 'Can follow multi-step directions', 'Finds it easy to learn new words', 'Keeps focus during tasks', 'Understands patterns'
      ],
      dyslexia:[
        'Confuses similar letters (b/d/p)', 'Struggles with rhymes', 'Avoids reading aloud', 'Forgetful with spellings', 'Slow to sound out words'
      ],
      mental:[
        'Seems anxious during reading', 'Gets easily frustrated', 'Avoids school tasks', 'Reports low confidence', 'Has trouble starting work'
      ]
    };
    const likerts=['Never','Rarely','Sometimes','Often','Always'];
    const render=(key, formId)=>{
      const form=document.getElementById(formId); if(!form) return;
      form.innerHTML=''; bank[key].forEach((q,qi)=>{
        const row=document.createElement('div'); row.className='question-row';
        const p=document.createElement('p'); p.textContent=(qi+1)+'. '+q; row.appendChild(p);
        const opts=document.createElement('div'); opts.className='choice-row';
        likerts.forEach((lbl,li)=>{
          const b=document.createElement('button'); b.className='btn'; b.type='button'; b.textContent=lbl; b.addEventListener('click',()=>{
            row.dataset.value=li; row.querySelectorAll('button').forEach(x=>x.classList.remove('selected')); b.classList.add('selected');
          }); opts.appendChild(b);
        });
        row.appendChild(opts); form.appendChild(row);
      });
    };
    const scoreIt=(key, formId)=>{
      const form=document.getElementById(formId); const rows=[...form.querySelectorAll('.question-row')];
      let score=0; rows.forEach(r=>{ score += Number(r.dataset.value ?? 0); }); const max=rows.length*4; const pct=Math.round((score/max)*100);
      const interpret = pct<30? 'Low concern': pct<60? 'Monitor': 'Elevated';
      this.appState.surveyResults = this.appState.surveyResults || {}; this.appState.surveyResults[key]={ score, max, pct, interpret };
      return this.appState.surveyResults[key];
    };
    // wire hub
    document.getElementById('survey-hub-back')?.addEventListener('click',()=> this.router.navigateTo('hub'));
    document.getElementById('survey-finalize-all')?.addEventListener('click',()=>{ this.router.navigateTo('survey-results'); this.renderSurveyResults?.(); });
    // start buttons
    sections.forEach(s=>{
      document.getElementById(s.start)?.addEventListener('click',()=>{ render(s.key, s.form); this.router.navigateTo(s.screen); });
      document.getElementById(s.back)?.addEventListener('click',()=> this.router.navigateTo('survey-hub'));
      document.getElementById(s.save)?.addEventListener('click',()=>{ const res=scoreIt(s.key, s.form); const st=document.getElementById(s.status); if(st) st.textContent=`Saved: ${res.score}/${res.max}`; });
      document.getElementById(s.submit)?.addEventListener('click',async ()=>{
        const res=scoreIt(s.key, s.form);
        const st=document.getElementById(s.status);
        if(st) st.textContent=`Submitted: ${res.pct}% · ${res.interpret}`;
        
        // Save to server for registered users
        if (window.authService?.isAuthenticated()) {
          try {
            await this.appState.saveToServer('/surveys/save', {
              surveyType: s.key,
              responses: res,
              score: res.score,
              interpretation: res.interpret
            });
          } catch (error) {
            console.error('Failed to save survey results to server:', error);
          }
        }
        
        this.router.navigateTo('survey-hub');
      });
    });
    // update hub status when active
    const obs=new MutationObserver(m=>m.forEach(mu=>{ if(mu.target.classList.contains('active') && mu.target.id==='survey-hub'){ const s=this.appState.surveyResults||{}; const set=(id,txt)=>{ const el=document.getElementById(id); if(el) el.textContent=txt; }; set('status-cog', s.cognitive? `Done (${s.cognitive.pct}%)`:'Not started'); set('status-dys', s.dyslexia? `Done (${s.dyslexia.pct}%)`:'Not started'); set('status-men', s.mental? `Done (${s.mental.pct}%)`:'Not started'); } }));
    hub && obs.observe(hub,{attributes:true,attributeFilter:['class']});
    // survey results renderer
    this.renderSurveyResults=()=>{
      const s=this.appState.surveyResults||{}; const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
      if(s.cognitive){ set('cog-score', s.cognitive.score); set('cog-interpret', s.cognitive.interpret); }
      if(s.dyslexia){ set('dys-score', s.dyslexia.score); set('dys-interpret', s.dyslexia.interpret); }
      if(s.mental){ set('men-score', s.mental.score); set('men-interpret', s.mental.interpret); }
      document.getElementById('survey-results-home')?.addEventListener('click',()=> this.router.navigateTo('hub'));
      document.getElementById('survey-results-back')?.addEventListener('click',()=> this.router.navigateTo('survey-hub'));
    };
  }

  // (Results screen removed)
}

// Accessibility Manager
class AccessibilityManager {
  constructor(appState) {
    this.appState = appState;
    this.setupAccessibilityControls();
  }

  setupAccessibilityControls() {
    const reduceMotionBtn = document.getElementById('reduce-motion');
    const toggleThemeBtn = document.getElementById('toggle-theme');

    reduceMotionBtn?.addEventListener('click', () => {
      this.appState.settings.reducedMotion = !this.appState.settings.reducedMotion;
      this.applyMotionSettings();
      this.appState.saveSettings();
    });

    toggleThemeBtn?.addEventListener('click', () => {
      this.appState.settings.darkMode = !this.appState.settings.darkMode;
      this.applyThemeSettings();
      this.appState.saveSettings();
    });

    // Apply initial settings
    this.applyMotionSettings();
    this.applyThemeSettings();
  }

  applyMotionSettings() {
    if (this.appState.settings.reducedMotion) {
      document.body.setAttribute('data-motion', 'reduced');
    } else {
      document.body.removeAttribute('data-motion');
    }
  }

  applyThemeSettings() {
    if (this.appState.settings.darkMode) {
      document.body.setAttribute('data-theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
    }
  }
}

// App Initialization
class DyslexiaScreenerApp {
  constructor() {
    this.appState = new AppState();
    this.router = new Router(this.appState);
    this.audioManager = new AudioManager();
    this.taskHandlers = new TaskHandlers(this.appState, this.router, this.audioManager);
    this.accessibilityManager = new AccessibilityManager(this.appState);
    
    this.init();
  }

  init() {
    console.log('Dyslexia Screener App initialized');
  // Default to hub view on load
  this.router.navigateTo('hub');
    
    // Handle keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Allow escape to go back or close modals
        const detailsPanel = document.getElementById('details-panel');
        if (detailsPanel?.classList.contains('expanded')) {
          document.getElementById('details-toggle')?.click();
          e.preventDefault();
        }
      }
    });

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.audioManager.isRecording) {
        // Stop recording if page becomes hidden
        this.audioManager.stopRecording();
      }
    });

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      const id = (location.hash || '').slice(1);
      if (id && document.getElementById(id)) {
        this.router.navigateTo(id);
      } else {
        this.router.navigateTo('hub');
      }
    });
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DyslexiaScreenerApp();
});
