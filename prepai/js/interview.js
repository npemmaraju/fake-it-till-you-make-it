/* ═══════════════════════════════════════════
   INTERVIEW.JS — Core interview flow orchestration
   Handles: question presentation, answer submission,
   adaptive follow-up, scoring, session wrap-up
═══════════════════════════════════════════ */

/* ── Initialize interview screen UI ── */
function initInterview() {
  // Populate session info
  document.getElementById('iv-company').textContent      = S.company;
  document.getElementById('iv-role').textContent         = S.role;
  document.getElementById('iv-round').textContent        = ROUND_NAMES[S.round];
  document.getElementById('iv-round-tag').textContent    = ROUND_NAMES[S.round];
  document.getElementById('iv-mode-tag').textContent     = S.mode === 'real' ? 'Real Sim' : 'Learning';
  document.getElementById('iv-company-title').textContent = S.company + ' · AI Interview';

  // Timer
  clearInterval(S.timerInt);
  S.timerInt = setInterval(tickTimer, 1000);

  // BL panel toggle button initial state
  const blBtn = document.getElementById('iv-bl-toggle');
  if (blBtn) { blBtn.textContent = 'Hide Analysis'; blBtn.classList.add('active'); }

  // Initialize speech recognition
  initSpeechRecognition();

  // Render empty sidebar
  renderQSidebar();
  updateProgress();
}

/* ── Present a question ── */
async function presentQuestion(userAnswer = '') {
  if (S.currentQ >= S.totalQ) {
    wrapUp();
    return;
  }

  S.waitingAnswer = false;
  setListeningState(false);
  S.currentTranscript = '';
  S.speechTimestamps = [];
  S.lastInterimLength = 0;
  updateTranscriptDisplay('');

  document.getElementById('feedback-strip')?.classList.remove('visible');
  const subBtn = document.getElementById('zoom-submit-btn');
  if (subBtn) { subBtn.disabled = true; subBtn.classList.remove('ready'); }

  // Run adaptive follow-up analysis on the previous answer
  if (userAnswer && S.currentQ > 0) {
    await analyzeForFollowUp(userAnswer, S.qHistory[S.currentQ - 1]?.q || '');
  }

  setAiStatus('thinking');

  let question;

  // Check follow-up queue first (depth questions don't increment currentQ)
  if (S.followUpQueue.length > 0 && S.currentQDepth < 2) {
    question = S.followUpQueue.shift();
    S.currentQDepth++;
    // Add to conversation history but don't increment currentQ
    if (userAnswer) S.conversationHistory.push({ role: 'user', parts: [{ text: userAnswer }] });
    S.conversationHistory.push({ role: 'model', parts: [{ text: question }] });
  } else {
    // Normal question — get from Gemini or fallback
    S.currentQDepth = 0;
    if (S.apiKey) {
      question = await getGeminiQuestion(userAnswer);
    } else {
      const idx = Math.min(S.currentQ, S.questions.length - 1);
      question = S.questions[idx] || 'Do you have any questions for me?';
      if (userAnswer) S.conversationHistory.push({ role: 'user', parts: [{ text: userAnswer }] });
    }
  }

  // Display question with transition
  const isLast = S.currentQ === S.totalQ - 1 && S.followUpQueue.length === 0;
  const qt = document.getElementById('question-text');
  qt.classList.add('hidden');
  setTimeout(() => {
    qt.textContent = question;
    qt.classList.remove('hidden');
  }, 350);

  document.getElementById('q-num-label').textContent =
    isLast ? 'Final Question' : `Question ${S.currentQ + 1} of ${S.totalQ}`;

  setAiStatus('speaking');

  // Simulate speaking time, then allow user to respond
  const speakDuration = Math.min(3000, 1200 + question.length * 18);
  setTimeout(() => {
    setAiStatus('waiting');
    S.waitingAnswer = true;
  }, speakDuration);

  // Track question (only if not a depth follow-up)
  if (S.currentQDepth === 0 || S.currentQ === 0) {
    S.qHistory.push({ q: question, answer: '', score: 'pending' });
    S.currentQ++;
    renderQSidebar();
    updateProgress();
  } else {
    // Depth follow-up — update the current question text only
    if (S.qHistory.length > 0) {
      S.qHistory[S.qHistory.length - 1].followUps = S.qHistory[S.qHistory.length - 1].followUps || [];
      S.qHistory[S.qHistory.length - 1].followUps.push(question);
    }
  }
}

/* ── Submit voice answer ── */
async function submitVoiceAnswer() {
  const txt = S.currentTranscript.trim();
  if (!txt || !S.waitingAnswer) {
    if (!txt) showToast('No answer detected — press Speak and talk!');
    return;
  }

  S.waitingAnswer = false;
  setListeningState(false);

  document.getElementById('transcript-bar')?.classList.remove('visible');
  const subBtn = document.getElementById('zoom-submit-btn');
  if (subBtn) { subBtn.disabled = true; subBtn.classList.remove('ready'); }

  const idx = S.qHistory.length - 1;
  if (idx >= 0) {
    S.qHistory[idx].answer = txt;
    S.qHistory[idx].score  = scoreText(txt);
  }

  // Run cheat detection on this answer
  const durationMs = S.answerStartTime ? Date.now() - S.answerStartTime : 30000;
  runCheatAnalysis(txt, durationMs);

  renderQSidebar();

  if (S.mode === 'learning' && idx >= 0) {
    setAiStatus('thinking');
    const fb = await getGeminiFeedback(S.qHistory[idx].q, txt);
    showInlineFeedback(idx, fb);
    // Wait for user to read feedback, then continue
    setTimeout(() => presentQuestion(txt), 3500);
  } else {
    setTimeout(() => presentQuestion(txt), 400);
  }
}

/* ── AI status states ── */
function setAiStatus(state) {
  const sb       = document.getElementById('speaking-bar');
  const lbl      = document.getElementById('ai-status-label');
  const identity = document.querySelector('.ai-identity');
  const dot      = document.getElementById('zoom-status-dot');
  const txt      = document.getElementById('zoom-status-text');
  const speakBtn = document.getElementById('zoom-speak-btn');

  sb?.classList.remove('active');
  identity?.classList.remove('ai-speaking');

  if (state === 'thinking') {
    if (lbl) lbl.textContent = 'Alex is thinking...';
    if (dot) dot.className = 'zoom-status-dot think';
    if (txt) txt.textContent = 'Alex is thinking...';
    speakBtn?.classList.add('disabled-state');
  } else if (state === 'speaking') {
    sb?.classList.add('active');
    if (lbl) lbl.textContent = 'Alex is asking...';
    identity?.classList.add('ai-speaking');
    if (dot) dot.className = 'zoom-status-dot think';
    if (txt) txt.textContent = 'Listen carefully';
    speakBtn?.classList.add('disabled-state');
  } else {
    // 'waiting'
    if (lbl) lbl.textContent = 'Your turn — press Speak';
    if (dot) dot.className = 'zoom-status-dot ready';
    if (txt) txt.textContent = 'Your turn to answer';
    speakBtn?.classList.remove('disabled-state');
  }
}

/* ── Inline feedback strip (learning mode) ── */
function showInlineFeedback(idx, fb) {
  const strip  = document.getElementById('feedback-strip');
  const chips  = document.getElementById('fb-chips');
  const detail = document.getElementById('fb-detail');
  const qRef   = document.getElementById('fb-q-ref');

  if (qRef) qRef.textContent = `Q${idx + 1}`;
  if (chips) chips.innerHTML = (fb.chips || []).map(c => `<div class="fb-chip ${c.c}">${c.t}</div>`).join('');
  if (detail) detail.textContent = fb.detail || '';
  strip?.classList.add('visible');
}

/* ── Question sidebar ── */
function renderQSidebar() {
  const list = document.getElementById('iv-q-list');
  if (!list) return;
  list.innerHTML = '';

  S.qHistory.forEach((item, i) => {
    const isCur = i === S.currentQ - 1;
    const dotCls = isCur ? 'live' : (item.score === 'pending' ? '' : item.score);
    const el = document.createElement('div');
    el.className = 'qitem' + (isCur ? ' current' : '');
    el.innerHTML = `
      <div class="qitem-num">Q${i + 1}</div>
      <div class="qitem-text">${item.q.slice(0, 52)}${item.q.length > 52 ? '…' : ''}</div>
      <div class="qitem-dot ${dotCls}"></div>`;
    list.appendChild(el);
  });
}

/* ── Progress bar ── */
function updateProgress() {
  const pct = Math.round((S.currentQ / S.totalQ) * 100);
  const pbar = document.getElementById('iv-pbar');
  if (pbar) pbar.style.width = pct + '%';
  const ptxt = document.getElementById('iv-prog-txt');
  if (ptxt) ptxt.textContent = `${S.currentQ} / ${S.totalQ}`;
}

/* ── Timer ── */
function tickTimer() {
  S.timerSec++;
  const el = document.getElementById('iv-timer');
  if (el) {
    el.textContent = formatTime(S.timerSec);
    el.classList.toggle('warn', S.timerSec > 1800);
  }
}

/* ── Wrap up session ── */
async function wrapUp() {
  S.waitingAnswer = false;
  setListeningState(false);
  clearInterval(S.timerInt);
  stopBodyLanguageAnalysis();

  const qt = document.getElementById('question-text');
  if (qt) qt.textContent = 'Session complete. Generating your report...';
  setAiStatus('thinking');

  showOverlay('Generating Report', [
    'Evaluating all answers',
    'Analyzing behavioral patterns',
    'Cross-referencing JD alignment',
    'Writing ruthless feedback'
  ]);
  for (let i = 0; i < 4; i++) setOverlayStep(i, 'active');

  const report = await getGeminiEndReport();

  // Step through overlay steps
  for (let i = 0; i < 4; i++) {
    setOverlayStep(i, 'done');
    await sleep(200);
  }

  setTimeout(() => {
    hideOverlay();
    buildFeedback(report);
    hideSelfTile();
    show('s-feedback');
  }, 600);
}
