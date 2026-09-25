(function () {
  'use strict';
  if (globalThis.__quizAppInitialized) return;
  globalThis.__quizAppInitialized = true;
  const C = globalThis.QuizCore, API = globalThis.QuizApi, $ = id => document.getElementById(id);
  let state = null, timerHandle = null, submitting = false, retryHandle = null, confirmedCode = '', lookupHandle = null, availability = null, availabilityHandle = null;
  const screens = ['startScreen','quizScreen','resultScreen'];
  function show(id) { screens.forEach(x => $(x).classList.toggle('hidden', x !== id)); }
  function message(id, text = '') { const el=$(id); el.textContent=text; el.classList.toggle('hidden', !text); }
  function errorText(error) {
    const raw = `${error?.code || ''} ${error?.message || ''}`;
    if (raw.includes('CONFIG_NOT_READY')) return 'La conexión aún no está configurada.';
    if (raw.includes('invalid_code')) return 'El código no existe o está desactivado.';
    if (raw.includes('student_lookup_failed')) return 'No se pudo validar el código. Inténtalo nuevamente.';
    if (raw.includes('identity_mismatch')) return 'Este código está vinculado a otro nombre. Verifica la escritura exacta.';
    if (raw.includes('attempts_exhausted')) return 'Este código ya agotó sus tres intentos.';
    if (raw.includes('attempt_in_progress')) return 'Ya existe un intento activo. Usa el código individual para reanudarlo en otro navegador.';
    if (raw.includes('invalid_resume_code')) return 'El código de reanudación no coincide o el intento ya no está activo.';
    if (raw.includes('Failed to fetch')) return 'No se pudo conectar. Revisa internet e inténtalo de nuevo.';
    return error?.message || 'Ocurrió un error inesperado.';
  }
  function save() { if (!state) return; C.saveDraft(localStorage, state); $('saveStatus').textContent=`Guardado local: ${new Date().toLocaleTimeString('es-NI')}`; }
  function capture(persist = true) {
    if (!state || state.finished) return;
    const q=state.questions[C.clampIndex(state.index,state.questions.length)];
    if (q.type==='numeric') state.responses[q.id]=$('numericAnswer')?.value ?? '';
    else if (q.type==='multi') state.responses[q.id]=[...document.querySelectorAll('input[name=answer]:checked')].map(x=>Number(x.value));
    else { const selected=document.querySelector('input[name=answer]:checked'); state.responses[q.id]=selected?Number(selected.value):null; }
    if (persist) save();
  }
  function navigateTo(nextIndex) {
    if (!state || state.finished) return;
    capture(false);
    state.index=C.clampIndex(nextIndex,state.questions.length);
    save();
    render();
  }
  function answerInput(q) {
    const current=state.responses[q.id];
    if(q.type==='numeric') return `<div><label for="numericAnswer">Respuesta numérica</label><input id="numericAnswer" inputmode="decimal" value="${escapeHtml(current ?? '')}" placeholder="Escribe el resultado"><p class="muted small">Puedes usar coma o punto decimal.</p></div>`;
    const multiple=q.type==='multi';
    return `<fieldset class="options"><legend class="sr-only">${multiple?'Selecciona todas las correctas':'Selecciona una opción'}</legend>${q.options.map((option,index)=>{const checked=multiple?(current||[]).includes(index):current===index;return `<label class="option"><input name="answer" type="${multiple?'checkbox':'radio'}" value="${index}" ${checked?'checked':''}><span>${escapeHtml(option)}</span></label>`}).join('')}</fieldset>`;
  }
  function render() {
    const total=state.questions.length;
    const index=C.clampIndex(state.index,total);
    const q=state.questions[index];
    const questionNumber=index+1;
    $('counter').textContent=`Pregunta ${questionNumber} de ${total}`;
    $('counter').setAttribute('aria-label',`Pregunta ${questionNumber} de ${total}`);
    $('progressBar').style.width=`${Math.round((questionNumber/total)*100)}%`;
    $('quizProgress').setAttribute('aria-valuenow',String(questionNumber));
    $('quizProgress').setAttribute('aria-valuetext',`${questionNumber} de ${total}`);
    const graphQuestion = q.graph || (/diagrama|dispersión|dispersion/i.test(q.stem || '') ? {points:[[1,2],[2,3],[3,3],[4,5],[5,6],[6,7]],defaultSlope:0.9,defaultIntercept:1} : null);
    $('questionArea').innerHTML=`<div class="question-heading"><div><p class="question-kicker">Pregunta ${questionNumber} de ${total}</p><h2 class="question-title">${escapeHtml(q.stem)}</h2></div><span class="question-points">5 pts</span></div><div class="meta"><span class="pill">${escapeHtml(q.topic)}</span><span class="pill">${escapeHtml(q.type_label || q.type)}</span></div>${graphQuestion ? graphHTML(graphQuestion) : ''}${answerInput(q)}`;
    if (graphQuestion) bindGraph(graphQuestion);
    $('questionArea').querySelectorAll('input').forEach(el=>el.addEventListener('input', capture));
    $('questionNav').innerHTML=state.questions.map((item,i)=>`<button type="button" class="dot ${i===index?'current':''} ${C.isAnswered(state.responses[item.id])?'done':''}" data-index="${i}" aria-label="Pregunta ${i+1}${i===index?' (actual)':''}" aria-current="${i===index?'step':'false'}">${i+1}</button>`).join('');
    $('prevBtn').disabled=index===0; $('nextBtn').classList.toggle('hidden',index===total-1); $('finishBtn').classList.toggle('hidden',index!==total-1); $('questionArea').setAttribute('data-question-index',String(index));
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function graphHTML(q){
    const graph=q?.graph || q || {};
    const points=(Array.isArray(graph.points)?graph.points:[]).map(([x,y])=>`<circle cx="${45+Number(x)*65}" cy="${260-Number(y)*30}" r="7" class="data-point"><title>x=${escapeHtml(x)}, y=${escapeHtml(y)}</title></circle>`).join('');
    const xTicks=[1,2,3,4,5,6], yTicks=[2,4,6,8];
    return `<figure class="quiz-graph" aria-labelledby="graphCaption"><div class="svgbox"><svg viewBox="0 0 520 300" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="graphTitle graphDesc"><title id="graphTitle">Diagrama de dispersión interactivo</title><desc id="graphDesc">Puntos observados y una recta ajustable mediante controles de pendiente e intercepto.</desc><g class="grid-lines">${yTicks.map(y=>`<line x1="45" y1="${260-y*30}" x2="500" y2="${260-y*30}"/>`).join('')}${xTicks.map(x=>`<line x1="${45+x*65}" y1="20" x2="${45+x*65}" y2="260"/>`).join('')}</g><g class="axes"><line x1="45" y1="260" x2="500" y2="260"/><line x1="45" y1="20" x2="45" y2="260"/></g><g class="tick-labels">${xTicks.map(x=>`<text x="${45+x*65}" y="282">${x}</text>`).join('')}${yTicks.map(y=>`<text x="31" y="${264-y*30}">${y}</text>`).join('')}</g><text class="axis-label" x="493" y="286">X</text><text class="axis-label" x="18" y="29">Y</text><line id="fitLine" class="fit-line"/>${points}</svg></div><figcaption id="graphCaption">Ajusta la recta y compara su dirección con la nube de puntos.</figcaption><div class="graph-controls"><div class="graph-control"><div class="control-label"><label for="slope">Pendiente</label><output id="slopeOut" for="slope"></output></div><input id="slope" type="range" min="-2" max="2" step="0.1" value="${Number(graph.defaultSlope ?? 0.9)}"></div><div class="graph-control"><div class="control-label"><label for="intercept">Intercepto</label><output id="interceptOut" for="intercept"></output></div><input id="intercept" type="range" min="0" max="10" step="0.2" value="${Number(graph.defaultIntercept ?? 1)}"></div></div><p class="hint">Exploración visual: mover estos controles no modifica tu respuesta.</p></figure>`;
  }
  function bindGraph(q){
    const draw=()=>{const m=Number($('slope').value),b=Number($('intercept').value),y1=260-b*30,y2=260-(b+m*7)*30;$('fitLine').setAttribute('x1','45');$('fitLine').setAttribute('y1',y1);$('fitLine').setAttribute('x2','500');$('fitLine').setAttribute('y2',y2);$('slopeOut').value=m.toFixed(1);$('interceptOut').value=b.toFixed(1)};
    $('slope').oninput=draw;$('intercept').oninput=draw;draw();
  }
  function renderResumeCode() {
    const el=$('resumeCodeNotice'); if (!el || !state?.resumeCode) return;
    el.innerHTML=`<div class="resume-main"><span><strong>Reanudación</strong><span class="resume-help"> · guárdalo por si cambias de navegador</span></span><code id="resumeCodeValue">${escapeHtml(state.resumeCode || 'NO DISPONIBLE')}</code><button id="copyResumeCode" type="button" class="btn ghost small">Copiar</button></div>`;
    el.classList.remove('hidden');
    const copy=$('copyResumeCode'); if(copy) copy.onclick=async()=>{try{await navigator.clipboard.writeText(state.resumeCode);copy.textContent='Copiado';}catch(_){copy.textContent='Copia el código manualmente';}};
  }
  function startTimer() {
    clearInterval(timerHandle); const tick=()=>{const seconds=C.remainingSeconds(state.deadlineAt,Date.now()+(state.serverOffsetMs||0));$('timer').textContent=C.formatClock(seconds);$('timer').classList.toggle('urgent',seconds<=300);if(seconds<=0){clearInterval(timerHandle);lockAndSubmit();}}; tick(); timerHandle=setInterval(tick,250);
  }
  function availabilityClock(seconds) { const s=Math.max(0,Math.floor(Number(seconds)||0)); return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
  function renderAvailability() {
    if (!availability) return; const now=Date.now()+(Number(availability.server_offset_ms)||0), open=Date.parse(availability.open_at), close=Date.parse(availability.close_at), openNow=now>=open && now<close, card=$('availabilityCard'); card.classList.toggle('closed',!openNow);
    $('validateCodeBtn').disabled=!openNow; $('accessCode').disabled=!openNow; $('resumeCode').disabled=!openNow; $('resumeRemoteBtn').disabled=!openNow;
    if(now<open){$('availabilityLabel').textContent='La evaluación abre en';$('availabilityClock').textContent=availabilityClock((open-now)/1000);$('availabilityDetail').textContent=`Apertura: ${new Date(open).toLocaleString('es-NI',{dateStyle:'full',timeStyle:'short'})}.`;}
    else if(now<close){$('availabilityLabel').textContent='Tiempo disponible para abrir un intento';$('availabilityClock').textContent=availabilityClock((close-now)/1000);$('availabilityDetail').textContent=`Cierre: ${new Date(close).toLocaleString('es-NI',{dateStyle:'full',timeStyle:'short'})}.`;}
    else{$('availabilityLabel').textContent='La evaluación está cerrada';$('availabilityClock').textContent='00:00:00';$('availabilityDetail').textContent='La ventana terminó según el reloj del servidor.';}
  }
  async function loadAvailability(){try{const r=await API.getAvailability();availability={...r,server_offset_ms:Date.parse(r.server_now)-Date.now()};renderAvailability();clearInterval(availabilityHandle);availabilityHandle=setInterval(renderAvailability,1000);}catch(_){$('availabilityLabel').textContent='Disponibilidad no confirmada';$('availabilityClock').textContent='--:--:--';$('availabilityDetail').textContent='No se pudo validar el reloj del servidor. Intenta recargar.';$('availabilityCard').classList.add('closed');$('validateCodeBtn').disabled=true;$('accessCode').disabled=true;$('resumeRemoteBtn').disabled=true;}}
  async function begin(event) {
    event.preventDefault(); message('startError'); const studentName=C.normalizeName($('studentName').value), code=C.normalizeCode($('accessCode').value), serverNow=Date.now()+(Number(availability?.server_offset_ms)||0), localVisualHarness=location.hostname==='127.0.0.1' && location.port==='8876';
    if(!localVisualHarness && (!availability || serverNow<Date.parse(availability.open_at) || serverNow>=Date.parse(availability.close_at))){message('startError','La ventana de la evaluación no está abierta.');return}
    if(!confirmedCode || confirmedCode !== code || studentName.length<5){message('startError','Valida primero un código activo y confirma el nombre mostrado.');return}
    $('startBtn').disabled=true;
    try{const response=await API.rpc('begin_quiz_attempt',{p_code:code,p_student_name:studentName});state=C.createDraft(response);save();show('quizScreen');renderResumeCode();render();startTimer();}catch(error){message('startError',errorText(error))}finally{$('startBtn').disabled=false}
  }
  async function resumeRemote() {
    message('startError'); const resumeCode=String($('resumeCode').value||'').toUpperCase().replace(/[^A-F0-9]/g,'');
    if(resumeCode.length!==12 && resumeCode.length!==24){message('startError','El código de reanudación debe tener 12 caracteres. Los códigos antiguos de 24 también siguen siendo válidos.');return}
    $('resumeRemoteBtn').disabled=true;
    try{const response=await API.resumeQuizAttempt(resumeCode);response.resume_code=resumeCode;state=C.createDraft(response);save();show('quizScreen');renderResumeCode();render();startTimer();}catch(error){message('startError',errorText(error))}finally{$('resumeRemoteBtn').disabled=false}
  }
  function resume() { state=C.loadDraft(localStorage);if(!state)return;if(state.finished){showResult(state.result);return}show('quizScreen');renderResumeCode();render();startTimer();if(state.submitPending)lockAndSubmit(); }
  async function lockAndSubmit() {
    if(submitting || !state || state.finished)return; capture();submitting=true;state.submitPending=true;save();document.querySelectorAll('#quizScreen input,#quizScreen button').forEach(el=>el.disabled=true);$('timer').textContent='0:00';message('submitError');$('saveStatus').textContent='Enviando respuestas.';
    try{const result=await API.rpc('submit_quiz_attempt',{p_attempt_token:state.attemptToken,p_responses:state.responses});state.finished=true;state.submitPending=false;state.result=result;save();clearInterval(timerHandle);clearTimeout(retryHandle);showResult(result);}catch(error){message('submitError',`Las respuestas siguen guardadas localmente. Reintento automático pendiente: ${errorText(error)}`);$('saveStatus').textContent='Envío pendiente; no cierres esta pestaña.';retryHandle=setTimeout(lockAndSubmit,15000)}finally{submitting=false}
  }
  function showResult(result) { show('resultScreen');const topics=result.topic_breakdown||[];$('resultArea').innerHTML=`<p class="muted">${escapeHtml(result.student_name||state.studentName)} · intento ${result.attempt_no||state.attemptNo}</p><div class="score">${Number(result.score).toFixed(0)}/100</div><p><span class="status ${escapeHtml(result.status)}">${result.status==='timed_out'?'Finalizado por tiempo':'Envío completo'}</span> · ${result.correct_count}/${result.question_count} correctas · duración ${Math.floor(result.duration_seconds/60)} min ${result.duration_seconds%60} s</p><p>Código de verificación: <strong>${escapeHtml(result.verification_code)}</strong></p><h3>Desglose por tema</h3>${topics.map(t=>`<div class="topic"><span>${escapeHtml(t.topic)}</span><div class="bar"><span style="width:${t.total?Math.round(t.correct/t.total*100):0}%"></span></div><strong>${t.correct}/${t.total}</strong></div>`).join('')}<p class="success">El registro central fue confirmado. El panel docente puede verificarlo con el código mostrado.</p>`; }
  function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  $('startForm').addEventListener('submit',begin);$('resumeBtn').onclick=resume;$('resumeRemoteBtn').onclick=resumeRemote;
  $('questionNav').addEventListener('click',event=>{const button=event.target.closest('button[data-index]');if(button&&$('questionNav').contains(button))navigateTo(Number(button.dataset.index))});
  $('prevBtn').onclick=()=>navigateTo((state?.index??0)-1);$('nextBtn').onclick=()=>navigateTo((state?.index??0)+1);$('finishBtn').onclick=()=>{capture();const missing=state.questions.filter(q=>!C.isAnswered(state.responses[q.id])).length;if(!missing||confirm(`Hay ${missing} pregunta(s) sin responder. ¿Finalizar y enviar?`))lockAndSubmit()};$('newAttemptBtn').onclick=()=>{C.clearDraft(localStorage);state=null;location.reload()};
  async function validateCode(){const input=$('accessCode'),code=C.normalizeCode(input.value);input.value=code;confirmedCode='';$('studentName').value='';$('startBtn').disabled=true;if(code.length<8){$('identityStatus').textContent='Escribe un código completo para validarlo.';return}$('identityStatus').textContent='Validando código...';message('startError');try{const result=await API.lookupStudent(code);const name=C.normalizeName(result?.student_name);if(!name)throw new Error('invalid_code');$('studentName').value=name;confirmedCode=code;$('identityStatus').textContent='Nombre confirmado. Ya puedes comenzar o reanudar.';}catch(error){$('identityStatus').textContent='Código inválido, inactivo o no disponible.';message('startError',errorText(error));}finally{$('startBtn').disabled=!confirmedCode}}
  $('validateCodeBtn').onclick=validateCode;$('accessCode').addEventListener('input',e=>{const pos=e.target.selectionStart;e.target.value=C.normalizeCode(e.target.value);confirmedCode='';$('studentName').value='';$('startBtn').disabled=true;$('identityStatus').textContent='Valida el código para mostrar el nombre.';try{e.target.setSelectionRange(pos,pos)}catch(_){}});$('accessCode').addEventListener('blur',()=>{clearTimeout(lookupHandle);lookupHandle=setTimeout(validateCode,0)});addEventListener('online',()=>{if(state?.submitPending)lockAndSubmit()});
  const draft=C.loadDraft(localStorage);$('resumeBtn').classList.toggle('hidden',!draft||draft.finished);$('configWarning').classList.toggle('hidden',API.configuration().ready);loadAvailability();
})();

