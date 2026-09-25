(function () {
  'use strict';
  const C = globalThis.QuizCore, API = globalThis.QuizApi, $ = id => document.getElementById(id);
  let state = null, timerHandle = null, submitting = false, retryHandle = null;
  const screens = ['startScreen','quizScreen','resultScreen'];
  function show(id) { screens.forEach(x => $(x).classList.toggle('hidden', x !== id)); }
  function message(id, text = '') { const el=$(id); el.textContent=text; el.classList.toggle('hidden', !text); }
  function errorText(error) {
    const raw = `${error?.code || ''} ${error?.message || ''}`;
    if (raw.includes('CONFIG_NOT_READY')) return 'La conexión aún no está configurada.';
    if (raw.includes('invalid_code')) return 'El código no existe o está desactivado.';
    if (raw.includes('identity_mismatch')) return 'Este código está vinculado a otro nombre. Verifica la escritura exacta.';
    if (raw.includes('attempts_exhausted')) return 'Este código ya agotó sus tres intentos.';
    if (raw.includes('attempt_in_progress')) return 'Ya existe un intento activo para este código. Reanúdalo en el navegador donde comenzó.';
    if (raw.includes('Failed to fetch')) return 'No se pudo conectar. Revisa internet e inténtalo de nuevo.';
    return error?.message || 'Ocurrió un error inesperado.';
  }
  function save() { if (!state) return; C.saveDraft(localStorage, state); $('saveStatus').textContent=`Guardado local: ${new Date().toLocaleTimeString('es-NI')}`; }
  function capture() {
    if (!state || state.finished) return;
    const q=state.questions[state.index];
    if (q.type==='numeric') state.responses[q.id]=$('numericAnswer')?.value ?? '';
    else if (q.type==='multi') state.responses[q.id]=[...document.querySelectorAll('input[name=answer]:checked')].map(x=>Number(x.value));
    else { const selected=document.querySelector('input[name=answer]:checked'); state.responses[q.id]=selected?Number(selected.value):null; }
    save();
  }
  function answerInput(q) {
    const current=state.responses[q.id];
    if(q.type==='numeric') return `<div><label for="numericAnswer">Respuesta numérica</label><input id="numericAnswer" inputmode="decimal" value="${escapeHtml(current ?? '')}" placeholder="Escribe el resultado"><p class="muted small">Puedes usar coma o punto decimal.</p></div>`;
    const multiple=q.type==='multi';
    return `<fieldset class="options"><legend class="sr-only">${multiple?'Selecciona todas las correctas':'Selecciona una opción'}</legend>${q.options.map((option,index)=>{const checked=multiple?(current||[]).includes(index):current===index;return `<label class="option"><input name="answer" type="${multiple?'checkbox':'radio'}" value="${index}" ${checked?'checked':''}><span>${escapeHtml(option)}</span></label>`}).join('')}</fieldset>`;
  }
  function render() {
    const q=state.questions[state.index], total=state.questions.length;
    $('counter').textContent=`Pregunta ${state.index+1} de ${total}`;
    $('progressBar').style.width=`${Math.round((state.index/total)*100)}%`;
    $('questionArea').innerHTML=`<div class="meta"><span class="pill">${escapeHtml(q.topic)}</span><span class="pill">${escapeHtml(q.type_label || q.type)}</span><span class="pill">5 puntos</span></div><p class="stem">${escapeHtml(q.stem)}</p>${answerInput(q)}`;
    $('questionArea').querySelectorAll('input').forEach(el=>el.addEventListener('input', capture));
    $('questionNav').innerHTML=state.questions.map((item,i)=>`<button class="dot ${i===state.index?'current':''} ${C.isAnswered(state.responses[item.id])?'done':''}" data-index="${i}" aria-label="Pregunta ${i+1}">${i+1}</button>`).join('');
    $('questionNav').querySelectorAll('button').forEach(b=>b.onclick=()=>{capture();state.index=Number(b.dataset.index);save();render()});
    $('prevBtn').disabled=state.index===0;
    $('nextBtn').classList.toggle('hidden',state.index===total-1);
    $('finishBtn').classList.toggle('hidden',state.index!==total-1);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function startTimer() {
    clearInterval(timerHandle);
    const tick=()=>{
      const seconds=C.remainingSeconds(state.deadlineAt,Date.now()+(state.serverOffsetMs||0));
      $('timer').textContent=C.formatClock(seconds);
      $('timer').classList.toggle('urgent',seconds<=300);
      if(seconds<=0){ clearInterval(timerHandle); lockAndSubmit(); }
    };
    tick(); timerHandle=setInterval(tick,250);
  }
  async function begin(event) {
    event.preventDefault(); message('startError');
    const studentName=C.normalizeName($('studentName').value), code=C.normalizeCode($('accessCode').value);
    if(studentName.length<5){message('startError','Escribe tu nombre completo.');return}
    if(code.length<12){message('startError','Escribe un código individual válido.');return}
    $('startBtn').disabled=true;
    try{
      const response=await API.rpc('begin_quiz_attempt',{p_code:code,p_student_name:studentName});
      state=C.createDraft(response); save(); show('quizScreen'); render(); startTimer();
    }catch(error){message('startError',errorText(error))}finally{$('startBtn').disabled=false}
  }
  function resume() {
    state=C.loadDraft(localStorage); if(!state)return;
    if(state.finished){ showResult(state.result); return; }
    show('quizScreen'); render(); startTimer(); if(state.submitPending) lockAndSubmit();
  }
  async function lockAndSubmit() {
    if(submitting || !state || state.finished)return;
    capture(); submitting=true; state.submitPending=true; save();
    document.querySelectorAll('#quizScreen input,#quizScreen button').forEach(el=>el.disabled=true);
    $('timer').textContent='0:00'; message('submitError'); $('saveStatus').textContent='Enviando respuestas…';
    try{
      const result=await API.rpc('submit_quiz_attempt',{p_attempt_token:state.attemptToken,p_responses:state.responses});
      state.finished=true; state.submitPending=false; state.result=result; save(); clearInterval(timerHandle); clearTimeout(retryHandle); showResult(result);
    }catch(error){
      message('submitError',`Las respuestas siguen guardadas localmente. Reintento automático pendiente: ${errorText(error)}`);
      $('saveStatus').textContent='Envío pendiente; no cierres esta pestaña.';
      retryHandle=setTimeout(lockAndSubmit,15000);
    }finally{submitting=false}
  }
  function showResult(result) {
    show('resultScreen'); const topics=result.topic_breakdown||[];
    $('resultArea').innerHTML=`<p class="muted">${escapeHtml(result.student_name||state.studentName)} · intento ${result.attempt_no||state.attemptNo}</p><div class="score">${Number(result.score).toFixed(0)}/100</div><p><span class="status ${escapeHtml(result.status)}">${result.status==='timed_out'?'Finalizado por tiempo':'Envío completo'}</span> · ${result.correct_count}/${result.question_count} correctas · duración ${Math.floor(result.duration_seconds/60)} min ${result.duration_seconds%60} s</p><p>Código de verificación: <strong>${escapeHtml(result.verification_code)}</strong></p><h3>Desglose por tema</h3>${topics.map(t=>`<div class="topic"><span>${escapeHtml(t.topic)}</span><div class="bar"><span style="width:${t.total?Math.round(t.correct/t.total*100):0}%"></span></div><strong>${t.correct}/${t.total}</strong></div>`).join('')}<p class="success">El registro central fue confirmado. El panel docente puede verificarlo con el código mostrado.</p>`;
  }
  function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  $('startForm').addEventListener('submit',begin); $('resumeBtn').onclick=resume;
  $('prevBtn').onclick=()=>{capture();if(state.index>0){state.index--;save();render()}};
  $('nextBtn').onclick=()=>{capture();if(state.index<state.questions.length-1){state.index++;save();render()}};
  $('finishBtn').onclick=()=>{capture();const missing=state.questions.filter(q=>!C.isAnswered(state.responses[q.id])).length;if(!missing||confirm(`Hay ${missing} pregunta(s) sin responder. ¿Finalizar y enviar?`))lockAndSubmit()};
  $('newAttemptBtn').onclick=()=>{C.clearDraft(localStorage);state=null;location.reload()};
  $('accessCode').addEventListener('input',e=>{const pos=e.target.selectionStart;e.target.value=C.normalizeCode(e.target.value);try{e.target.setSelectionRange(pos,pos)}catch(_){}});
  addEventListener('online',()=>{if(state?.submitPending)lockAndSubmit()});
  const draft=C.loadDraft(localStorage); $('resumeBtn').classList.toggle('hidden',!draft||draft.finished);
  $('configWarning').classList.toggle('hidden',API.configuration().ready);
})();
