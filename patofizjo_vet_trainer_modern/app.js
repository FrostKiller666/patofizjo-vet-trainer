(function(){
  'use strict';
  const DATA = window.PATOFIZJO_DATA;
  const KEY = 'patofizjo.vettrainer.modern.v2';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  if(!DATA || !Array.isArray(DATA.items) || DATA.items.length === 0){
    document.body.innerHTML = '<div style="padding:30px;font-family:Arial"><h1>Brak danych</h1><p>Nie załadował się plik data.js. Upewnij się, że index.html, app.js, style.css i data.js są w jednym folderze.</p></div>';
    return;
  }

  const state = {
    view: 'dashboard',
    selectedId: DATA.items[0].id,
    mcqIndex: 0,
    exam: null,
    progress: loadProgress(),
    orderSelected: null,
    baseOpen: false,
    practiceOpen: {order:false, cloze:false, mcq:false}
  };

  function loadProgress(){
    try { return JSON.parse(localStorage.getItem(KEY)) || {items:{}, exams:[], createdAt:new Date().toISOString()}; }
    catch(e){ return {items:{}, exams:[], createdAt:new Date().toISOString()}; }
  }
  function saveProgress(){ localStorage.setItem(KEY, JSON.stringify(state.progress)); updateProgressUI(); }
  function itemById(id){ return DATA.items.find(x => Number(x.id) === Number(id)) || DATA.items[0]; }
  function pItem(id){
    id = String(id);
    if(!state.progress.items[id]) state.progress.items[id] = {score:0, attempts:0, correct:0, wrong:0, last:null, modes:{base:0,order:0,cloze:0,mcq:0,exam:0}};
    const p = state.progress.items[id];
    if(!p.smart) p.smart = {bestReward:{}, keys:{}};
    if(!p.smart.bestReward) p.smart.bestReward = {};
    if(!p.smart.keys) p.smart.keys = {};
    return state.progress.items[id];
  }
  function clamp(n,min=0,max=100){ return Math.max(min, Math.min(max, Number.isFinite(n)?n:0)); }
  function updateScore(id, delta, mode, ok, opts={}){
    const p = pItem(id);
    let applied = Math.round(Number(delta) || 0);
    if(opts.updateProgress === false) applied = 0;
    else if(opts.once && opts.key){
      const key = `${mode}:${opts.key}`;
      if(p.smart.keys[key] != null) applied = 0;
      else p.smart.keys[key] = applied;
    } else if(opts.key){
      const key = `${mode}:${opts.key}`;
      const previous = Number(p.smart.keys[key] || 0);
      applied = applied - previous;
      p.smart.keys[key] = Math.round(Number(delta) || 0);
    } else if(mode && opts.accuracy != null){
      if(applied > 0){
        const previousBest = Number(p.smart.bestReward[mode] || 0);
        applied = Math.max(0, applied - previousBest);
        p.smart.bestReward[mode] = Math.max(previousBest, Math.round(Number(delta) || 0));
      } else if(applied < 0){
        const key = `${mode}:first-miss`;
        if(p.smart.keys[key] != null) applied = 0;
        else p.smart.keys[key] = applied;
      }
    }
    p.score = clamp(Math.round(p.score + applied));
    p.attempts += 1;
    p.last = new Date().toISOString();
    if(ok) p.correct += 1; else p.wrong += 1;
    if(mode) p.modes[mode] = (p.modes[mode] || 0) + 1;
    saveProgress();
    return applied;
  }
  function overall(){
    const arr = DATA.items.map(x => pItem(x.id).score);
    return Math.round(arr.reduce((a,b)=>a+b,0) / Math.max(1, arr.length));
  }
  function scoreLabel(score){
    if(score >= 91) return ['umiem egzaminacyjnie','good'];
    if(score >= 76) return ['umiem dobrze','good'];
    if(score >= 51) return ['umiem częściowo','warn'];
    if(score >= 26) return ['kojarzę','warn'];
    return ['nie umiem','bad'];
  }
  function updateProgressUI(){
    const o = overall();
    $('#sideProgress').style.width = o + '%';
    $('#sideProgressText').textContent = o + '%';
  }
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._x); t._x=setTimeout(()=>t.classList.remove('show'),2300); }
  function fmtDelta(delta){ return delta > 0 ? `+${delta}%` : `${delta}%`; }
  function deltaBadge(delta){
    const cls = delta > 0 ? 'good' : delta < 0 ? 'bad' : 'warn';
    const note = delta === 0 ? 'wynik już zapisany' : 'zmiana progresu';
    return `<span class="pill ${cls}">${note}: ${fmtDelta(delta)}</span>`;
  }
  function shuffle(a){ const x=a.slice(); for(let i=x.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]]; } return x; }
  function norm(s){
    s = String(s || '').trim().toLowerCase();
    const sub='₀₁₂₃₄₅₆₇₈₉', sup='⁰¹²³⁴⁵⁶⁷⁸⁹';
    for(let i=0;i<10;i++){ s=s.replaceAll(sub[i], String(i)).replaceAll(sup[i], String(i)); }
    return s.replaceAll('⁺','+').replaceAll('⁻','-').replaceAll('α','alfa').replaceAll('β','beta').replaceAll('κ','kappa')
      .replace(/[^a-z0-9ąćęłńóśźż+\- ]+/g,'').replace(/\s+/g,' ').trim();
  }
  function normLoose(s){ return norm(s).replace(/[\s-]+/g,''); }
  function matchesBlank(input, blank){
    const got = norm(input);
    if(!got) return false;
    const accepted = (blank.accept || []).concat([blank.answer]);
    return accepted.some(x => norm(x) === got || normLoose(x) === normLoose(got));
  }
  function clozeOrder(cloze){
    const seen = new Set(), order = [];
    String(cloze.template || '').replace(/\{\{(\d+)\}\}/g, (_, n) => {
      n = Number(n);
      if(Number.isInteger(n) && cloze.blanks[n] && !seen.has(n)){ seen.add(n); order.push(n); }
      return '';
    });
    cloze.blanks.forEach((_, i) => { if(!seen.has(i)) order.push(i); });
    return order;
  }
  function clozeTemplateHtml(cloze, opts={}){
    const order = clozeOrder(cloze);
    const visual = new Map(order.map((idx, pos) => [idx, pos + 1]));
    const values = opts.values || {};
    const disabled = opts.disabled ? ' disabled' : '';
    const extraClass = opts.extraClass ? ' ' + opts.extraClass : '';
    const used = new Set();
    let html = esc(cloze.template).replace(/\{\{(\d+)\}\}/g, (_, raw) => {
      const idx = Number(raw), b = cloze.blanks[idx], n = visual.get(idx) || idx + 1;
      used.add(idx);
      const value = values[idx] != null ? ` value="${esc(values[idx])}"` : '';
      return `<input class="cloze-input${extraClass}" data-i="${idx}" data-n="${n}" autocomplete="off" placeholder="luka ${n}"${value}${disabled} />`;
    });
    order.forEach(idx => {
      if(used.has(idx)) return;
      const n = visual.get(idx) || idx + 1;
      const value = values[idx] != null ? ` value="${esc(values[idx])}"` : '';
      html += ` <input class="cloze-input${extraClass}" data-i="${idx}" data-n="${n}" autocomplete="off" placeholder="luka ${n}"${value}${disabled} />`;
    });
    return {html, order};
  }
  function clozeRevealButtons(cloze, order, revealed){
    return `<div class="cloze-tools"><span>Odsłoń lukę:</span>${order.map((idx, pos) => {
      const done = revealed.has(idx);
      return `<button class="mini-btn" data-reveal-blank="${idx}" ${done?'disabled':''}>${pos + 1}</button>`;
    }).join('')}</div>`;
  }
  function isPracticeMode(mode){ return mode === 'order' || mode === 'cloze' || mode === 'mcq'; }
  function closePracticeMode(mode){ state.practiceOpen[mode] = false; renderView(mode); }
  function openPracticeMode(mode){ state.practiceOpen[mode] = true; setView(mode); }
  function randomItem(filter='all'){
    let pool = DATA.items;
    if(filter === 'weak') pool = DATA.items.filter(x => pItem(x.id).score < 76);
    if(!pool.length) pool = DATA.items;
    return pool[Math.floor(Math.random()*pool.length)];
  }

  const viewTitles = {
    dashboard:['Dashboard','Szybki podgląd postępu i najpilniejsze powtórki.'],
    base:['Pełna baza','Pytania 1:1 i pełne finalne odpowiedzi.'],
    order:['Ułóż mechanizm','Układasz ciąg: przyczyna → mechanizm → skutek. Działa klikaniem, strzałkami i drag&drop.'],
    cloze:['Uzupełnij luki','Wpisujesz realne terminy z odpowiedzi: hormony, jony, mediatory, RKZ.'],
    mcq:['ABCD','Bez fałszywych faktów: poprawna opcja jest z danego pytania, dystraktory z innych pytań.'],
    exam:['Rozpocznij próbny egzamin','Mieszany tryb z automatycznym liczeniem wyniku.'],
    weak:['Słabe pytania','System wybiera pytania z najniższym opanowaniem.'],
    settings:['Progres / eksport','LocalStorage, eksport/import i kontrola techniczna danych.']
  };

  const mobileMenuMq = window.matchMedia('(max-width: 640px)');

  function syncViewButtons(view){
    $$('button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  }
  function closeMobileMenu(){
    const menu = $('#mobileMenuFloat'), toggle = $('#mobileMenuToggle');
    if(!menu || !toggle) return;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  function updateMobileMenuVisibility(){
    const menu = $('#mobileMenuFloat');
    if(!menu) return;
    const sidebar = $('.sidebar');
    const modalOpen = !!$('.modal-backdrop');
    const pastTopNav = sidebar ? sidebar.getBoundingClientRect().bottom <= 16 : window.scrollY > 160;
    const visible = mobileMenuMq.matches && (modalOpen || (window.scrollY > 80 && pastTopNav));
    menu.classList.toggle('is-modal-open', mobileMenuMq.matches && modalOpen);
    menu.classList.toggle('is-visible', visible);
    menu.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if(!visible) closeMobileMenu();
  }
  function scrollCurrentViewIntoPlace(view=state.view){
    if(!mobileMenuMq.matches) return;
    const go = y => {
      y = Math.max(0, Math.round(y));
      window.scrollTo({top:y, behavior:'auto'});
      document.documentElement.scrollTop = y;
      document.body.scrollTop = y;
    };
    if(view === 'dashboard'){
      go(0);
      return;
    }
    const topbar = $('.topbar');
    if(!topbar) return;
    go(topbar.offsetTop - 8);
  }
  function scheduleMobileViewScroll(view){
    if(!mobileMenuMq.matches) return;
    const run = () => scrollCurrentViewIntoPlace(view);
    requestAnimationFrame(run);
    setTimeout(run, 80);
    if(view === 'dashboard') setTimeout(run, 220);
  }
  function initMobileMenu(){
    const menu = $('#mobileMenuFloat'), toggle = $('#mobileMenuToggle'), panel = $('#mobileMenuPanel');
    if(!menu || !toggle || !panel) return;
    panel.innerHTML = $$('#nav button').map(btn => `<button type="button" data-view="${esc(btn.dataset.view)}">${btn.innerHTML}</button>`).join('');
    syncViewButtons(state.view);
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const open = !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if(!b) return;
      setView(b.dataset.view);
    });
    document.addEventListener('click', e => {
      if(menu.classList.contains('is-open') && !menu.contains(e.target)) closeMobileMenu();
    });
    document.addEventListener('keydown', e => { if(e.key === 'Escape') closeMobileMenu(); });
    let ticking = false;
    const scheduleVisibility = () => {
      if(ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; updateMobileMenuVisibility(); });
    };
    window.addEventListener('scroll', scheduleVisibility, {passive:true});
    window.addEventListener('resize', scheduleVisibility);
    if(mobileMenuMq.addEventListener) mobileMenuMq.addEventListener('change', scheduleVisibility);
    else mobileMenuMq.addListener(scheduleVisibility);
    updateMobileMenuVisibility();
  }

  function setView(view){
    state.view = view;
    if(view !== 'base') state.baseOpen = false;
    Object.keys(state.practiceOpen).forEach(k => { if(k !== view || !isPracticeMode(view)) state.practiceOpen[k] = false; });
    syncViewButtons(view);
    closeMobileMenu();
    $$('.view').forEach(v => v.classList.toggle('active', v.id === view));
    $('#viewTitle').textContent = viewTitles[view][0];
    $('#viewHint').textContent = viewTitles[view][1];
    renderView(view);
    requestAnimationFrame(() => {
      updateMobileMenuVisibility();
      scheduleMobileViewScroll(view);
    });
  }

  function tile(item){
    const p = pItem(item.id); const [lab, cls] = scoreLabel(p.score);
    return `<button class="q-tile ${Number(item.id)===Number(state.selectedId)?'active':''}" data-id="${item.id}">
      <div class="q-num"><span>Pyt. ${item.id}</span><span class="pill ${cls}">${p.score}%</span></div>
      <p>${esc(item.question).slice(0,190)}${item.question.length>190?'…':''}</p>
      <div class="footer-note">${lab}</div>
    </button>`;
  }

  function picker(mode){
    const topics = Array.from(new Set(DATA.items.flatMap(x => x.tags || []))).sort();
    return `<div class="toolbar card">
      <input class="search" placeholder="Szukaj: numer, słowo, temat…" />
      <select class="topic"><option value="">Wszystkie tematy</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select>
      <select class="status"><option value="">Wszystkie statusy</option><option value="weak">Słabe / do powtórki</option><option value="new">Nietknięte</option><option value="strong">Umiem dobrze</option></select>
    </div><div class="question-grid" data-picker="${mode}"></div>`;
  }
  function bindPicker(root, mode){
    const search = $('.search', root), topic = $('.topic', root), status = $('.status', root), grid = $('[data-picker]', root);
    if(!search || !topic || !status || !grid) return;
    const render = () => {
      const q = search.value.trim().toLowerCase(), top = topic.value, st = status.value;
      const items = DATA.items.filter(it => {
        const p = pItem(it.id);
        const hay = `${it.id} ${it.question} ${it.answer} ${(it.tags||[]).join(' ')}`.toLowerCase();
        if(q && !hay.includes(q)) return false;
        if(top && !(it.tags || []).includes(top)) return false;
        if(st==='weak' && p.score >= 51) return false;
        if(st==='new' && p.attempts > 0) return false;
        if(st==='strong' && p.score < 76) return false;
        return true;
      });
      grid.innerHTML = items.map(tile).join('') || '<div class="empty">Brak wyników.</div>';
    };
    search.addEventListener('input', render); topic.addEventListener('change', render); status.addEventListener('change', render);
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.q-tile'); if(!btn) return;
      state.selectedId = Number(btn.dataset.id); state.mcqIndex = 0;
      if(mode === 'base') state.baseOpen = true;
      if(isPracticeMode(mode)) state.practiceOpen[mode] = true;
      renderView(mode);
    });
    render();
  }

  function dashboard(){
    const scores = DATA.items.map(x => pItem(x.id).score);
    const mastered = scores.filter(s=>s>=76).length, weak = scores.filter(s=>s<51).length, fresh = scores.filter(s=>s===0).length;
    const last = (state.progress.exams || []).at(-1);
    const weakList = DATA.items.slice().sort((a,b)=>pItem(a.id).score - pItem(b.id).score).slice(0,8);
    $('#dashboard').innerHTML = `<div class="grid stats">
      <div class="card stat"><b>${overall()}%</b><span>progres całości</span></div>
      <div class="card stat"><b>${mastered}</b><span>opanowane</span></div>
      <div class="card stat"><b>${weak}</b><span>słabe / do powtórki</span></div>
      <div class="card stat"><b>${last ? last.score+'%' : '—'}</b><span>ostatni próbny egzamin</span></div>
    </div>
    <div class="split" style="margin-top:16px">
      <div class="card"><h3>🔥 Najpilniejsze do powtórki</h3><div class="list">${weakList.map(tile).join('')}</div></div>
      <div class="card"><h3>Jak pracować teraz?</h3><p class="small">Najbezpieczniej: przeczytaj pełną odpowiedź, ułóż mechanizm, uzupełnij luki, zrób ABCD i dopiero próbny egzamin.</p>
        <div class="btn-row"><button class="primary" data-go="weak">Ucz słabe</button><button class="ghost" data-go="exam">Rozpocznij próbny egzamin</button><button class="ghost" data-go="order">Ułóż mechanizm</button></div>
        <p class="footer-note">Nietknięte pytania: <b>${fresh}</b>. Wszystko działa offline.</p></div>
    </div>`;
    $('#dashboard').addEventListener('click', e => {
      const go=e.target.closest('[data-go]'); if(go) return setView(go.dataset.go);
      const q=e.target.closest('.q-tile'); if(q){ state.selectedId=Number(q.dataset.id); state.baseOpen=true; setView('base'); }
    }, {once:true});
  }

  function fullBase(){
    const it = itemById(state.selectedId); const p=pItem(it.id); const [lab,cls]=scoreLabel(p.score);
    const readDone = (p.modes.base || 0) > 0;
    const root = $('#base');
    root.innerHTML = `${picker('base')}${state.baseOpen ? `<div class="modal-backdrop" id="baseModal">
      <article class="base-modal" role="dialog" aria-modal="true">
        <button class="modal-close" id="closeBase" title="Zamknij">×</button>
        <div class="modal-head">
          <span class="pill ${cls}">${p.score}% — ${lab}</span>
          <h3 class="question-title">${esc(it.question)}</h3>
        </div>
        <div id="answerBox" class="answer">${esc(it.answer)}</div>
        <div class="answer-toolbar">
          <button class="btn primary" id="toggleAnswer">Ukryj odpowiedź</button>
          <button class="btn ok" id="markRead" ${readDone?'disabled':''}>${readDone?'Czytanie już zapisane':'Zaliczone czytanie +2%'}</button>
          <button class="btn secondary" data-jump="order">Ułóż mechanizm</button>
          <button class="btn secondary" data-jump="cloze">Luki</button>
          <button class="btn secondary" data-jump="mcq">ABCD</button>
        </div>
      </article>
    </div>` : ''}`;
    bindPicker(root,'base');
    if(!state.baseOpen) return;
    $('#closeBase').onclick = () => { state.baseOpen=false; fullBase(); };
    $('#baseModal').onclick = e => { if(e.target.id === 'baseModal'){ state.baseOpen=false; fullBase(); } };
    $('#toggleAnswer').onclick = () => { const a=$('#answerBox'); a.classList.toggle('hidden'); $('#toggleAnswer').textContent = a.classList.contains('hidden') ? 'Pokaż pełną odpowiedź' : 'Ukryj odpowiedź'; };
    $('#markRead').onclick = () => {
      if(readDone) return;
      const applied = updateScore(it.id,2,'base',true,{key:'read', once:true});
      toast(`Czytanie zapisane: ${fmtDelta(applied)}`);
      fullBase();
    };
    root.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
      state.baseOpen=false;
      if(isPracticeMode(b.dataset.jump)) return openPracticeMode(b.dataset.jump);
      setView(b.dataset.jump);
    });
  }

  function orderView(){
    const it=itemById(state.selectedId); state.orderSelected=null;
    let checked = false, patternOpen = false, penaltyApplied = false;
    let currentOrder = shuffle(it.order.map((text,i)=>({text,i})));
    const root=$('#order');
    if(!state.practiceOpen.order){ root.innerHTML = picker('order'); bindPicker(root,'order'); return; }
    root.innerHTML = `${picker('order')}<div class="modal-backdrop" id="orderModal">
      <article class="base-modal task-modal" role="dialog" aria-modal="true">
        <button class="modal-close" id="closeOrder" title="Zamknij">×</button>
        <div class="modal-head">
          <h3 class="question-title">${esc(it.question)}</h3>
          <p class="small">Ustaw bloki w kolejności. Możesz używać strzałek ↑ ↓, kliknąć dwa bloki aby je zamienić, albo przeciągać myszą.</p>
        </div>
        <div class="segments" id="segments">${currentOrder.map(orderBlock).join('')}</div>
        <div class="btn-row"><button class="primary" id="checkOrder">Sprawdź kolejność</button><button class="ghost" id="showOrder">Pokaż wzór</button><button class="ghost" id="nextOrder">Losuj kolejne</button></div>
        <div id="orderResult" class="footer-note"></div>
      </article>
    </div>`;
    bindPicker(root,'order'); bindOrderList($('#segments'));
    $('#closeOrder').onclick = () => closePracticeMode('order');
    $('#orderModal').onclick = e => { if(e.target.id === 'orderModal') closePracticeMode('order'); };
    const renderPracticeOrder = () => {
      state.orderSelected = null;
      currentOrder = shuffle(it.order.map((text,i)=>({text,i})));
      $('#segments').innerHTML = currentOrder.map(orderBlock).join('');
      bindOrderList($('#segments'));
      $('#checkOrder').disabled = checked;
      $('#showOrder').textContent = 'Pokaż wzór';
      patternOpen = false;
    };
    const renderPattern = () => {
      state.orderSelected = null;
      $('#segments').innerHTML = it.order.map((t,i)=>`<div class="segment correct" data-i="${i}"><span class="handle">${i+1}</span><span>${esc(t)}</span><div></div></div>`).join('');
      $('#checkOrder').disabled = true;
      $('#showOrder').textContent = 'Układaj sam';
      patternOpen = true;
    };
    $('#checkOrder').onclick = () => {
      if(checked || patternOpen) return;
      checked = true;
      checkOrder(it, '#segments', '#orderResult', 'order');
      $('#checkOrder').disabled = true;
    };
    $('#showOrder').onclick = () => {
      if(patternOpen){ renderPracticeOrder(); toast('Możesz układać samodzielnie'); return; }
      renderPattern();
      if(!checked && !penaltyApplied){
        const applied = updateScore(it.id,-3,'order',false,{key:'pattern', once:true});
        penaltyApplied = true;
        toast(`Wzór odsłonięty: ${fmtDelta(applied)}`);
      }
    };
    $('#nextOrder').onclick = () => { state.selectedId=randomItem().id; state.practiceOpen.order = true; orderView(); };
  }
  function orderBlock(x, opts={}){
    if(!opts || typeof opts !== 'object') opts = {};
    const checkedClass = opts.checked ? (Number(x.i) === Number(opts.position) ? ' correct' : ' wrong') : '';
    const locked = opts.locked ? 'true' : 'false';
    const controls = opts.locked ? '<div></div>' : '<div class="move"><button data-move="up" title="w górę">↑</button><button data-move="down" title="w dół">↓</button></div>';
    return `<div class="segment${checkedClass}" draggable="${locked==='true'?'false':'true'}" data-i="${x.i}"><span class="handle">${opts.checked ? (Number(opts.position)+1) : '☰'}</span><span>${esc(x.text)}</span>${controls}</div>`;
  }
  function bindOrderList(list){
    if(!list || list._orderBound) return;
    list._orderBound = true;
    let drag=null;
    const animateOrderChange = mutate => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(reduceMotion){ mutate(); return; }
      const before = new Map($$('.segment', list).map(el => [el, el.getBoundingClientRect()]));
      mutate();
      $$('.segment', list).forEach(el => {
        const prev = before.get(el);
        if(!prev) return;
        const next = el.getBoundingClientRect();
        const dx = prev.left - next.left, dy = prev.top - next.top;
        if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.getAnimations().forEach(anim => anim.cancel());
        el.classList.add('moving');
        const anim = el.animate([
          {transform:`translate(${dx}px, ${dy}px)`, boxShadow:'0 18px 34px rgba(37,99,235,.16)'},
          {transform:'translate(0, 0)', boxShadow:''}
        ], {duration:280, easing:'cubic-bezier(.2,.8,.2,1)'});
        anim.addEventListener('finish', () => el.classList.remove('moving'));
        anim.addEventListener('cancel', () => el.classList.remove('moving'));
      });
    };
    list.addEventListener('click', e => {
      if(list._suppressClickUntil && Date.now() < list._suppressClickUntil){ e.preventDefault(); return; }
      const mv=e.target.closest('[data-move]');
      if(mv){
        const seg=mv.closest('.segment');
        if(mv.dataset.move==='up' && seg.previousElementSibling) animateOrderChange(() => list.insertBefore(seg, seg.previousElementSibling));
        if(mv.dataset.move==='down' && seg.nextElementSibling) animateOrderChange(() => list.insertBefore(seg.nextElementSibling, seg));
        return;
      }
      const seg=e.target.closest('.segment'); if(!seg) return;
      if(!state.orderSelected){ state.orderSelected=seg; seg.classList.add('selected'); return; }
      if(state.orderSelected === seg){ seg.classList.remove('selected'); state.orderSelected=null; return; }
      const a=state.orderSelected, b=seg, marker=document.createElement('div');
      animateOrderChange(() => { list.insertBefore(marker,a); list.insertBefore(a,b); list.insertBefore(b,marker); marker.remove(); });
      a.classList.remove('selected'); state.orderSelected=null;
    });
    list.addEventListener('dragstart', e => { const seg=e.target.closest('.segment'); if(seg){drag=seg; seg.classList.add('selected');} });
    list.addEventListener('dragend', () => { if(drag) drag.classList.remove('selected'); drag=null; });
    list.addEventListener('dragover', e => {
      e.preventDefault();
      if(!drag) return;
      const seg=e.target.closest('.segment');
      if(!seg || seg===drag) return;
      const box=seg.getBoundingClientRect();
      const ref=(e.clientY-box.top)>box.height/2 ? seg.nextSibling : seg;
      if(ref === drag || drag.nextSibling === ref) return;
      animateOrderChange(() => list.insertBefore(drag, ref));
    });
    let touchDrag=null;
    let autoSortFrame=null;
    const allowTouchSort = e => e.pointerType === 'touch' || e.pointerType === 'pen';
    const getTouchSortScroller = () => list.closest('.base-modal') || document.scrollingElement;
    const stopTouchAutoScroll = () => {
      if(autoSortFrame) cancelAnimationFrame(autoSortFrame);
      autoSortFrame=null;
    };
    const edgeScrollSpeed = y => {
      const scroller = getTouchSortScroller();
      if(!scroller) return 0;
      const box = scroller === document.scrollingElement ? {top:0,bottom:window.innerHeight} : scroller.getBoundingClientRect();
      const edge = 92;
      if(y < box.top + edge) return -Math.ceil(((box.top + edge - y) / edge) * 30);
      if(y > box.bottom - edge) return Math.ceil(((y - (box.bottom - edge)) / edge) * 30);
      return 0;
    };
    const insertTouchSorted = y => {
      const blocks = $$('.segment', list).filter(el => el !== touchDrag.seg);
      const before = blocks.find(el => {
        const box = el.getBoundingClientRect();
        return y < box.top + box.height / 2;
      });
      const ref = before || null;
      if(ref === touchDrag.seg || touchDrag.seg.nextSibling === ref) return;
      animateOrderChange(() => {
        if(ref) list.insertBefore(touchDrag.seg, ref);
        else list.appendChild(touchDrag.seg);
      });
    };
    const runTouchAutoScroll = () => {
      autoSortFrame=null;
      if(!touchDrag) return;
      const scroller = getTouchSortScroller();
      if(!scroller) return;
      const speed = edgeScrollSpeed(touchDrag.lastY);
      if(!speed) return;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const next = Math.max(0, Math.min(max, scroller.scrollTop + speed));
      if(next === scroller.scrollTop) return;
      scroller.scrollTop = next;
      touchDrag.moved = true;
      insertTouchSorted(touchDrag.lastY);
      autoSortFrame = requestAnimationFrame(runTouchAutoScroll);
    };
    const updateTouchSortPosition = y => {
      if(!touchDrag) return;
      touchDrag.lastY = y;
      insertTouchSorted(y);
      if(edgeScrollSpeed(y)){
        if(!autoSortFrame) autoSortFrame = requestAnimationFrame(runTouchAutoScroll);
      } else {
        stopTouchAutoScroll();
      }
    };
    const finishTouchSort = e => {
      if(!touchDrag || e.pointerId !== touchDrag.pointerId) return;
      if(touchDrag.moved) list._suppressClickUntil = Date.now() + 350;
      touchDrag.seg.classList.remove('dragging','selected');
      list.classList.remove('touch-sorting');
      if(touchDrag.handle.releasePointerCapture) touchDrag.handle.releasePointerCapture(e.pointerId);
      stopTouchAutoScroll();
      touchDrag=null;
      state.orderSelected=null;
    };
    const startTouchSort = (handle, seg, pointerId, y) => {
      touchDrag={seg,handle,pointerId,startY:y,lastY:y,moved:false};
      $$('.segment.selected', list).forEach(x => x.classList.remove('selected'));
      seg.classList.add('dragging','selected');
      list.classList.add('touch-sorting');
    };
    const finishMouseTouchSort = () => {
      if(!touchDrag || touchDrag.pointerId !== 'mouse') return;
      if(touchDrag.moved) list._suppressClickUntil = Date.now() + 350;
      touchDrag.seg.classList.remove('dragging','selected');
      list.classList.remove('touch-sorting');
      stopTouchAutoScroll();
      touchDrag=null;
      state.orderSelected=null;
    };
    list.addEventListener('pointerdown', e => {
      const handle=e.target.closest('.handle'), seg=e.target.closest('.segment');
      if(!handle || !seg || seg.getAttribute('draggable') === 'false' || !allowTouchSort(e)) return;
      startTouchSort(handle, seg, e.pointerId, e.clientY);
      if(handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    list.addEventListener('pointermove', e => {
      if(!touchDrag || e.pointerId !== touchDrag.pointerId) return;
      e.preventDefault();
      if(Math.abs(e.clientY - touchDrag.startY) > 5) touchDrag.moved = true;
      updateTouchSortPosition(e.clientY);
    });
    list.addEventListener('pointerup', finishTouchSort);
    list.addEventListener('pointercancel', finishTouchSort);
    list.addEventListener('mousedown', e => {
      if(!mobileMenuMq.matches || touchDrag) return;
      const handle=e.target.closest('.handle'), seg=e.target.closest('.segment');
      if(!handle || !seg || seg.getAttribute('draggable') === 'false') return;
      startTouchSort(handle, seg, 'mouse', e.clientY);
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if(!touchDrag || touchDrag.pointerId !== 'mouse') return;
      e.preventDefault();
      if(Math.abs(e.clientY - touchDrag.startY) > 5) touchDrag.moved = true;
      updateTouchSortPosition(e.clientY);
    });
    document.addEventListener('mouseup', finishMouseTouchSort);
  }
  function checkOrder(it, listSel, resultSel, mode, opts={}){
    const list=$$(listSel+' .segment'); let ok=0;
    list.forEach((el,idx)=>{ const good=Number(el.dataset.i)===idx; if(good) ok++; el.classList.remove('correct','wrong'); el.classList.add(good?'correct':'wrong'); });
    const acc=ok/Math.max(1,it.order.length); const delta=acc===1?10:acc>=.7?5:acc>=.45?1:-8;
    const applied = opts.updateProgress !== false ? updateScore(it.id,delta,mode,acc>=.7,{accuracy:acc}) : 0;
    $(resultSel).innerHTML = `<span class="pill ${acc>=.7?'good':'bad'}">Wynik: ${Math.round(acc*100)}% (${ok}/${it.order.length})</span> ${opts.updateProgress === false ? '' : deltaBadge(applied)}`;
    const detail = {acc, ok, total:it.order.length, delta, appliedDelta:applied};
    return opts.detail ? detail : acc;
  }

  function clozeView(){
    const it=itemById(state.selectedId), cl=it.cloze; const root=$('#cloze');
    let checked = false;
    let hintUsed = false;
    const revealed = new Set();
    const rendered = clozeTemplateHtml(cl);
    if(!state.practiceOpen.cloze){ root.innerHTML = picker('cloze'); bindPicker(root,'cloze'); return; }
    root.innerHTML = `${picker('cloze')}<div class="modal-backdrop" id="clozeModal">
      <article class="base-modal task-modal" role="dialog" aria-modal="true">
        <button class="modal-close" id="closeCloze" title="Zamknij">×</button>
        <div class="modal-head"><h3 class="question-title">${esc(it.question)}</h3></div>
        <div class="cloze-text">${rendered.html}</div>
        ${clozeRevealButtons(cl, rendered.order, revealed)}
        <div class="btn-row"><button class="primary" id="checkCloze">Sprawdź luki</button><button class="ghost" id="hintCloze">Pokaż podpowiedzi</button><button class="ghost" id="nextCloze">Losuj kolejne</button></div>
        <div id="clozeResult" class="footer-note"></div>
      </article>
    </div>`;
    bindPicker(root,'cloze');
    $('#closeCloze').onclick = () => closePracticeMode('cloze');
    $('#clozeModal').onclick = e => { if(e.target.id === 'clozeModal') closePracticeMode('cloze'); };
    $('#checkCloze').onclick = () => {
      if(checked) return;
      checked = true;
      checkCloze(it, '.cloze-input', '#clozeResult', 'cloze');
      $('#checkCloze').disabled = true;
    };
    $('#hintCloze').onclick = () => {
      $('#clozeResult').innerHTML = rendered.order.map((idx,pos)=>{
        const b=cl.blanks[idx];
        return `<span class="hint-chip">${pos+1}: ${esc(String(b.answer)[0]||'?')}… (${String(b.answer).length} zn.)</span>`;
      }).join('');
      if(!hintUsed && !checked){
        const applied = updateScore(it.id,-2,'cloze',false,{key:'hint', once:true});
        hintUsed = true;
        toast(`Podpowiedzi: ${fmtDelta(applied)}`);
      }
      $('#hintCloze').disabled = true;
    };
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-reveal-blank]');
      if(!btn) return;
      const idx = Number(btn.dataset.revealBlank);
      const b = cl.blanks[idx], inp = root.querySelector(`.cloze-input[data-i="${idx}"]`);
      if(!b || !inp || revealed.has(idx)) return;
      revealed.add(idx);
      inp.value = b.answer;
      inp.classList.add('bad','revealed');
      inp.dataset.revealed = '1';
      btn.disabled = true;
      const applied = !checked ? updateScore(it.id,-1,'cloze',false,{key:`reveal:${idx}`, once:true}) : 0;
      toast(`Odsłonięto lukę ${inp.dataset.n}: ${fmtDelta(applied)}`);
    });
    $('#nextCloze').onclick = () => { state.selectedId=randomItem().id; state.practiceOpen.cloze = true; clozeView(); };
  }
  function checkCloze(it, inputSel, resultSel, mode, opts={}){
    const cl=it.cloze; let ok=0;
    $$(inputSel).forEach(inp => {
      const i=Number(inp.dataset.i); const b=cl.blanks[i]; const got=norm(inp.value);
      const good=inp.dataset.revealed !== '1' && matchesBlank(got, b);
      inp.classList.remove('ok','bad'); inp.classList.add(good?'ok':'bad'); if(good) ok++;
    });
    const acc=ok/Math.max(1,cl.blanks.length); const delta=acc===1?9:acc>=.7?5:acc>=.45?1:-7;
    const applied = opts.updateProgress !== false ? updateScore(it.id,delta,mode,acc>=.7,{accuracy:acc}) : 0;
    $(resultSel).innerHTML = `<span class="pill ${acc>=.7?'good':'bad'}">Wynik: ${Math.round(acc*100)}% (${ok}/${cl.blanks.length})</span> ${opts.updateProgress === false ? '' : deltaBadge(applied)}`;
    const detail = {acc, ok, total:cl.blanks.length, delta, appliedDelta:applied};
    return opts.detail ? detail : acc;
  }

  function mcqView(){
    const it=itemById(state.selectedId); const qIndex = state.mcqIndex % it.mcq.length; const q=it.mcq[qIndex]; const root=$('#mcq');
    if(!state.practiceOpen.mcq){ root.innerHTML = picker('mcq'); bindPicker(root,'mcq'); return; }
    root.innerHTML = `${picker('mcq')}<div class="modal-backdrop" id="mcqModal">
      <article class="base-modal task-modal" role="dialog" aria-modal="true">
        <button class="modal-close" id="closeMcq" title="Zamknij">×</button>
        <div class="modal-head">
          <h3 class="question-title">${esc(it.question)}</h3>
          <p><b>${esc(q.prompt)}</b></p>
        </div>
        <div id="options">${q.options.map((o,i)=>`<button class="option" data-i="${i}"><b>${String.fromCharCode(65+i)}.</b> ${esc(o)}</button>`).join('')}</div>
        <div class="btn-row"><button class="ghost" id="nextMcqSame">Kolejne ABCD z tego pytania</button><button class="ghost" id="nextMcq">Losuj inne pytanie</button></div>
        <div id="mcqResult" class="footer-note"></div>
      </article>
    </div>`;
    bindPicker(root,'mcq');
    $('#closeMcq').onclick = () => closePracticeMode('mcq');
    $('#mcqModal').onclick = e => { if(e.target.id === 'mcqModal') closePracticeMode('mcq'); };
    $('#options').onclick = e => {
      const btn=e.target.closest('.option'); if(!btn) return;
      const i=Number(btn.dataset.i), good=i===Number(q.answerIndex);
      $$('#options .option').forEach(o=>o.disabled=true);
      btn.classList.add(good?'correct':'wrong'); $$('#options .option')[q.answerIndex].classList.add('correct');
      const applied = updateScore(it.id, good?7:-7, 'mcq', good, {key:`set:${qIndex}`});
      $('#mcqResult').innerHTML = `<span class="pill ${good?'good':'bad'}">${good?'Dobrze':'Błąd'}</span> ${deltaBadge(applied)} <span class="footer-note">${esc(q.explanation)}</span>`;
    };
    $('#nextMcqSame').onclick = () => { state.mcqIndex++; state.practiceOpen.mcq = true; mcqView(); };
    $('#nextMcq').onclick = () => { state.selectedId=randomItem().id; state.mcqIndex=0; state.practiceOpen.mcq = true; mcqView(); };
  }

  function examView(){
    if(!state.exam) return examStartScreen();
    renderExamTask();
  }
  function examHistoryHtml(limit=8){
    const exams = (state.progress.exams || []).map((ex,index)=>({ex,index})).reverse().slice(0, limit);
    if(!exams.length) return '<div class="exam-history"><div class="empty">Brak zapisanych egzaminów.</div></div>';
    return `<div class="exam-history">${exams.map(({ex,index}) => {
      const d = ex.date ? new Date(ex.date) : null;
      const date = d && !Number.isNaN(d.getTime()) ? d.toLocaleString('pl-PL') : 'brak daty';
      const weak = (ex.weak || []).slice(0,8);
      return `<button class="history-row" data-exam-detail="${index}" title="Podejrzyj egzamin">
        <div><b>${ex.score}%</b><span>${date}</span></div>
        <div><span>${ex.tasks || (ex.details || []).length || '?'} zadań</span>${weak.length ? `<small>Do poprawy: ${weak.map(id=>`Pyt. ${id}`).join(', ')}${(ex.weak||[]).length>8?'…':''}</small>` : '<small>Brak słabych pytań</small>'}</div>
      </button>`;
    }).join('')}</div>`;
  }
  function examTaskDetail(task){
    const it = itemById(task.id);
    const detail = {id:task.id, mode:task.mode, points:task.points, done:task.done, question:it.question};
    if(task.mode === 'mcq'){
      const qIndex = Number(task.state.qIndex || 0);
      const q = it.mcq[qIndex % it.mcq.length];
      detail.prompt = q.prompt;
      detail.options = q.options;
      detail.selected = task.state.selected ?? null;
      detail.answerIndex = q.answerIndex;
      detail.explanation = q.explanation;
    }
    if(task.mode === 'cloze'){
      const values = task.state.values || {};
      detail.blanks = clozeOrder(it.cloze).map((idx,pos) => {
        const b = it.cloze.blanks[idx], got = values[idx] || '';
        return {n:pos+1, got, answer:b.answer, ok:matchesBlank(got,b)};
      });
    }
    if(task.mode === 'order'){
      const order = task.state.order || it.order.map((_,i)=>i);
      detail.order = order.map((idx,pos)=>({n:pos+1, text:it.order[idx], ok:Number(idx)===pos}));
      detail.correctOrder = it.order.map((text,pos)=>({n:pos+1,text}));
    }
    return detail;
  }
  function examDetailHtml(ex){
    const d = ex.date ? new Date(ex.date) : null;
    const date = d && !Number.isNaN(d.getTime()) ? d.toLocaleString('pl-PL') : 'brak daty';
    const details = ex.details || [];
    return `<div class="modal-backdrop" id="examDetailModal"><article class="base-modal exam-detail-modal" role="dialog" aria-modal="true">
      <button class="modal-close" id="closeExamDetail" title="Zamknij">×</button>
      <div class="modal-head"><span class="pill blue">${date}</span><h3>Podgląd egzaminu: ${ex.score}%</h3><p class="small">${ex.tasks || details.length || '?'} zadań. Ten podgląd pokazuje, co było dobrze, a co do poprawy.</p></div>
      <div class="exam-detail-list">${details.length ? details.map((t,i)=>examTaskDetailHtml(t,i)).join('') : '<div class="empty">Ten starszy zapis nie ma szczegółów odpowiedzi. Szczegóły będą widoczne dla nowych egzaminów.</div>'}</div>
    </article></div>`;
  }
  function examTaskDetailHtml(t, i){
    const scoreCls = t.points >= 7 ? 'good' : 'bad';
    let body = '';
    if(t.mode === 'mcq' && Array.isArray(t.options)){
      body = `<div class="review-options">${t.options.map((o,idx)=>{
        const cls = idx === t.answerIndex ? 'correct' : idx === t.selected ? 'wrong' : '';
        const mark = idx === t.answerIndex ? 'poprawna' : idx === t.selected ? 'Twoja' : '';
        return `<div class="review-option ${cls}"><b>${String.fromCharCode(65+idx)}.</b> ${esc(o)}${mark?` <span>${mark}</span>`:''}</div>`;
      }).join('')}</div><p class="small">${esc(t.explanation || '')}</p>`;
    } else if(t.mode === 'cloze' && Array.isArray(t.blanks)){
      body = `<div class="review-grid">${t.blanks.map(b=>`<div class="review-line ${b.ok?'correct':'wrong'}"><b>Luka ${b.n}</b><span>Twoja: ${esc(b.got || '—')}</span><span>Poprawna: ${esc(b.answer)}</span></div>`).join('')}</div>`;
    } else if(t.mode === 'order' && Array.isArray(t.order)){
      body = `<h4>Twoja kolejność</h4><div class="review-grid">${t.order.map(x=>`<div class="review-line ${x.ok?'correct':'wrong'}"><b>${x.n}</b><span>${esc(x.text)}</span></div>`).join('')}</div><h4>Wzór</h4><div class="review-grid">${(t.correctOrder||[]).map(x=>`<div class="review-line correct"><b>${x.n}</b><span>${esc(x.text)}</span></div>`).join('')}</div>`;
    } else {
      body = '<p class="small">Ten wpis pochodzi ze starszej wersji historii i nie ma zapisanych szczegółów odpowiedzi.</p>';
    }
    return `<section class="exam-detail-item"><div class="exam-detail-head"><span class="pill blue">Zadanie ${i+1}</span><span class="pill warn">${String(t.mode || '').toUpperCase()}</span><span class="pill ${scoreCls}">${t.points}/10 pkt</span></div><h3 class="question-title">${esc(t.question || ('Pytanie ' + t.id))}</h3>${body}</section>`;
  }
  function openExamDetail(index){
    const ex = (state.progress.exams || [])[Number(index)];
    if(!ex) return;
    $('#examDetailModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', examDetailHtml(ex));
    $('#closeExamDetail').onclick = () => $('#examDetailModal')?.remove();
    $('#examDetailModal').onclick = e => { if(e.target.id === 'examDetailModal') $('#examDetailModal')?.remove(); };
  }
  function bindExamHistory(root){
    root.querySelectorAll('[data-exam-detail]').forEach(btn => btn.onclick = () => openExamDetail(btn.dataset.examDetail));
  }
  function examStartScreen(){
    $('#exam').innerHTML = `<div class="card task-card"><h3>🎓 Rozpocznij próbny egzamin</h3><p class="small">System miesza ABCD, luki i układanie mechanizmu. Wynik zapisuje się w historii egzaminów i nie cofa progresu nauki.</p><div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><button class="btn primary" data-exam="10">10 pytań</button><button class="btn secondary" data-exam="15">15 pytań</button><button class="btn ghost" data-exam="weak">Tryb hard: słabe</button></div></div><div class="card task-card"><h3>Historia egzaminów</h3>${examHistoryHtml(10)}</div>`;
    $('#exam').onclick = e => { const b=e.target.closest('[data-exam]'); if(b) startExam(b.dataset.exam); };
    bindExamHistory($('#exam'));
  }
  function startExam(kind){
    const n=kind==='15'?15:10; let pool=kind==='weak'?DATA.items.filter(x=>pItem(x.id).score<76):DATA.items;
    if(!pool.length) pool=DATA.items;
    const chosen=shuffle(pool).slice(0,n), modes=['mcq','cloze','order'];
    state.exam={startedAt:new Date().toISOString(), index:0, tasks:chosen.map((it,i)=>({id:it.id, mode:modes[i%modes.length], points:0, done:false, state:{}}))};
    renderExamTask();
  }
  function captureExamDraft(task){
    if(!task || task.done) return;
    if(task.mode === 'cloze'){
      const values = {};
      $$('.exam-cloze').forEach(inp => values[Number(inp.dataset.i)] = inp.value);
      task.state = Object.assign({}, task.state, {values});
    }
    if(task.mode === 'order' && $('#examSegments')){
      task.state = Object.assign({}, task.state, {order: $$('#examSegments .segment').map(el => Number(el.dataset.i))});
    }
  }
  function renderExamTask(){
    const ex=state.exam; if(ex.index >= ex.tasks.length) return finishExam();
    const task=ex.tasks[ex.index], it=itemById(task.id); let body='';
    if(task.mode==='mcq'){
      const q=it.mcq[ex.index % it.mcq.length];
      task.state.qIndex = ex.index % it.mcq.length;
      body = `<p><b>${esc(q.prompt)}</b></p><div id="examOptions">${q.options.map((o,i)=>{
        const selected = Number(task.state.selected) === i;
        const good = i === q.answerIndex;
        const cls = task.done ? (good ? ' correct' : selected ? ' wrong' : '') : '';
        return `<button class="option${cls}" data-i="${i}" data-good="${good}" ${task.done?'disabled':''}><b>${String.fromCharCode(65+i)}.</b> ${esc(o)}</button>`;
      }).join('')}</div>`;
    } else if(task.mode==='cloze'){
      const rendered = clozeTemplateHtml(it.cloze, {extraClass:'exam-cloze', values:task.state.values || {}, disabled:task.done});
      body = `<div class="cloze-text">${rendered.html}</div>${task.done?'':'<button class="btn primary" id="examCheckCloze">Sprawdź luki</button>'}`;
    } else {
      if(!task.state.order) task.state.order = shuffle(it.order.map((_,i)=>i));
      const blocks = task.state.order.map(i => ({text:it.order[i], i}));
      body = `<p class="small">Strzałki lub kliknięcie dwóch bloków zamienia kolejność.</p><div class="segments" id="examSegments">${blocks.map((x,pos)=>orderBlock(x,{checked:task.done, position:pos, locked:task.done})).join('')}</div>${task.done?'':'<button class="btn primary" id="examCheckOrder">Sprawdź kolejność</button>'}`;
    }
    const feedback = task.done ? `<div id="examFeedback" class="footer-note"><span class="pill ${task.points>=7?'good':'bad'}">${task.feedback || 'Odpowiedź zapisana'}</span></div>` : `<div id="examFeedback" class="footer-note"></div>`;
    $('#exam').innerHTML = `<div class="card task-card"><div class="exam-head"><span class="pill blue">Zadanie ${ex.index+1}/${ex.tasks.length}</span><span class="pill warn">${task.mode.toUpperCase()}</span></div><h3 class="question-title">${esc(it.question)}</h3>${body}<div class="btn-row exam-nav">${ex.index>0?'<button class="ghost" id="examBack">Wstecz</button>':''}${task.done?`<button class="primary" id="examNext">${ex.index === ex.tasks.length-1?'Zakończ egzamin':'Dalej'}</button>`:'<button class="ghost" id="examSkip">Pomiń</button>'}</div>${feedback}</div>`;
    if($('#examBack')) $('#examBack').onclick = () => { captureExamDraft(task); ex.index--; renderExamTask(); };
    if($('#examSkip')) $('#examSkip').onclick = () => { captureExamDraft(task); ex.index++; renderExamTask(); };
    if($('#examNext')) $('#examNext').onclick = () => { captureExamDraft(task); ex.index++; renderExamTask(); };
    if(task.mode==='mcq'){
      const q=it.mcq[task.state.qIndex];
      $('#examOptions').onclick = e => {
        if(task.done) return;
        const btn=e.target.closest('.option'); if(!btn) return;
        const selected = Number(btn.dataset.i), good=btn.dataset.good==='true';
        task.state.selected = selected;
        task.done = true;
        task.points = good ? 10 : 0;
        task.feedback = `ABCD: ${good?'dobrze':'błąd'} — ${q.explanation}`;
        renderExamTask();
      };
    }
    if(task.mode==='cloze'){
      if(task.done){
        $$('.exam-cloze').forEach(inp => {
          const b = it.cloze.blanks[Number(inp.dataset.i)];
          inp.classList.add(matchesBlank(inp.value, b) ? 'ok' : 'bad');
        });
      } else {
        $('#examCheckCloze').onclick = () => {
          const values = {};
          $$('.exam-cloze').forEach(inp => values[Number(inp.dataset.i)] = inp.value);
          const result=checkCloze(it,'.exam-cloze','#examFeedback','exam',{updateProgress:false, detail:true});
          task.state.values = values;
          task.done = true;
          task.points=Math.round(result.acc*10);
          task.feedback = `Luki: ${Math.round(result.acc*100)}% (${result.ok}/${result.total})`;
          renderExamTask();
        };
      }
    }
    if(task.mode==='order') {
      if(!task.done){
        bindOrderList($('#examSegments'));
        $('#examCheckOrder').onclick = () => {
          task.state.order = $$('#examSegments .segment').map(el => Number(el.dataset.i));
          const result=checkOrder(it,'#examSegments','#examFeedback','exam',{updateProgress:false, detail:true});
          task.done = true;
          task.points=Math.round(result.acc*10);
          task.feedback = `Kolejność: ${Math.round(result.acc*100)}% (${result.ok}/${result.total})`;
          renderExamTask();
        };
      }
    }
  }
  function finishExam(){
    const ex=state.exam; const max=ex.tasks.length*10; const score=Math.round(ex.tasks.reduce((a,t)=>a+t.points,0)/max*100); const weak=ex.tasks.filter(t=>t.points<7).map(t=>t.id);
    state.progress.exams = state.progress.exams || [];
    state.progress.exams.push({date:new Date().toISOString(),score,tasks:ex.tasks.length,weak,details:ex.tasks.map(examTaskDetail)});
    saveProgress(); state.exam=null;
    $('#exam').innerHTML = `<div class="card task-card"><h3>Wynik próbnego egzaminu</h3><div class="score-big">${score}%</div><p>${score>=80?'Bardzo dobrze. Teraz utrwal słabsze punkty.':score>=60?'Jest baza, ale są luki do domknięcia.':'Ryzyko na egzaminie jest jeszcze duże — powtórz słabe pytania.'}</p><span class="pill blue">Egzamin zapisany w historii, bez cofania progresu nauki</span><h3>Pytania do poprawy</h3><div class="list">${weak.map(id=>tile(itemById(id))).join('') || '<span class="pill good">Brak słabych w tym egzaminie</span>'}</div><div class="btn-row"><button class="primary" id="examAgain">Jeszcze raz</button><button class="ghost" id="examWeak">Ucz słabe</button><button class="ghost" id="examHistoryBtn">Historia egzaminów</button></div></div>`;
    $('#examAgain').onclick=()=>examStartScreen(); $('#examWeak').onclick=()=>setView('weak'); $('#exam').querySelectorAll('.q-tile').forEach(b=>b.onclick=()=>{state.selectedId=Number(b.dataset.id);state.baseOpen=true;setView('base');});
    $('#examHistoryBtn').onclick=()=>examStartScreen();
  }

  function weakView(){
    const weak=DATA.items.slice().sort((a,b)=>pItem(a.id).score-pItem(b.id).score).slice(0,35);
    $('#weak').innerHTML = `<div class="card"><h3>🔥 Słabe pytania</h3><p class="small">Kliknięcie zaczyna od układania mechanizmu, bo to najmocniej sprawdza rozumienie.</p><div class="list">${weak.map(tile).join('')}</div></div>`;
    $('#weak').onclick = e => { const q=e.target.closest('.q-tile'); if(q){state.selectedId=Number(q.dataset.id);openPracticeMode('order');} };
  }
  function settingsView(){
    const report = selfTest(false);
    $('#settings').innerHTML = `<div class="card"><h3>⚙️ Progres i kontrola</h3><p class="small">Progres jest zapisany w localStorage tej przeglądarki. Eksportuj kopię po nauce.</p><div class="btn-row"><button class="primary" id="exportProgress">Eksportuj progres JSON</button><label class="ghost">Importuj progres <input id="importProgress" type="file" accept="application/json" hidden></label><button class="danger" id="resetProgress">Resetuj progres</button><button class="ghost" id="runSelfTest">Uruchom autotest</button></div><h3 style="margin-top:20px">Historia egzaminów</h3>${examHistoryHtml(12)}<h3 style="margin-top:20px">Raport techniczny</h3><div id="selfTestBox" class="answer">${esc(report.text)}</div></div>`;
    bindExamHistory($('#settings'));
    $('#exportProgress').onclick = () => { const blob=new Blob([JSON.stringify(state.progress,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='patofizjo_progres.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); };
    $('#importProgress').onchange = e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{state.progress=JSON.parse(r.result); saveProgress(); toast('Zaimportowano progres'); settingsView();}catch(err){toast('Nieprawidłowy JSON');} }; r.readAsText(f); };
    $('#resetProgress').onclick = () => { if(confirm('Na pewno usunąć cały progres?')){localStorage.removeItem(KEY);state.progress=loadProgress();saveProgress();settingsView();} };
    $('#runSelfTest').onclick = () => { const r=selfTest(true); $('#selfTestBox').textContent=r.text; toast(r.ok?'Autotest OK':'Autotest wykrył problem'); };
  }

  function renderView(v){
    if(v==='dashboard') dashboard();
    if(v==='base') fullBase();
    if(v==='order') orderView();
    if(v==='cloze') clozeView();
    if(v==='mcq') mcqView();
    if(v==='exam') examView();
    if(v==='weak') weakView();
    if(v==='settings') settingsView();
    requestAnimationFrame(updateMobileMenuVisibility);
  }

  function selfTest(verbose){
    const errors=[]; let mcq=0, cloze=0, order=0;
    DATA.items.forEach(it => {
      if(!it.id || !it.question || !it.answer) errors.push(`Pytanie ${it.id||'?'}: brak id/pytania/odpowiedzi`);
      if(!Array.isArray(it.order) || it.order.length < 2) errors.push(`Pytanie ${it.id}: zbyt mało bloków mechanizmu`); else order++;
      if(!it.cloze || !Array.isArray(it.cloze.blanks) || it.cloze.blanks.length < 3) errors.push(`Pytanie ${it.id}: zbyt mało luk`); else {
        cloze++;
        it.cloze.blanks.forEach((b,i)=>{ if(!b.answer || !it.cloze.template.includes(`{{${i}}}`)) errors.push(`Pytanie ${it.id}: luka ${i+1} niespójna`); });
      }
      if(!Array.isArray(it.mcq) || it.mcq.length < 1) errors.push(`Pytanie ${it.id}: brak ABCD`); else {
        it.mcq.forEach((q,j)=>{ if(!Array.isArray(q.options)||q.options.length!==4) errors.push(`Pytanie ${it.id} ABCD ${j+1}: musi mieć 4 opcje`); if(q.answerIndex<0 || q.answerIndex>3) errors.push(`Pytanie ${it.id} ABCD ${j+1}: zły answerIndex`); if(!q.options[q.answerIndex]) errors.push(`Pytanie ${it.id} ABCD ${j+1}: brak poprawnej opcji`); else mcq++; });
      }
    });
    const text = `${errors.length?'BŁĘDY':'OK'}\nPytania: ${DATA.items.length}\nMechanizmy: ${order}/${DATA.items.length}\nLuki: ${cloze}/${DATA.items.length}\nABCD zestawy: ${mcq}\n${errors.length?'\n'+errors.slice(0,50).join('\n'):'\nNie wykryto błędów strukturalnych w danych trybów.'}`;
    if(verbose) console.log(text);
    return {ok:errors.length===0,text};
  }
  window.__patofizjoSelfTest = () => selfTest(true);

  initMobileMenu();
  $('#nav').addEventListener('click', e => { const b=e.target.closest('[data-view]'); if(b) setView(b.dataset.view); });
  $('#examQuickBtn').onclick = () => setView('exam');
  $('#randomWeakBtn').onclick = () => { state.selectedId=randomItem('weak').id; state.baseOpen=true; setView('base'); };
  updateProgressUI(); setView('dashboard');
})();
