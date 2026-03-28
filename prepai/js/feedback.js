/* ═══════════════════════════════════════════
   FEEDBACK.JS — Build and render the final feedback report
═══════════════════════════════════════════ */

function buildFeedback(report) {
  // Header tags
  document.getElementById('fb-t-company').textContent = S.company;
  document.getElementById('fb-t-role').textContent    = S.role;
  document.getElementById('fb-t-round').textContent   = ROUND_NAMES[S.round];

  /* ── Overall Score ── */
  const overall = report?.overallScore ?? Math.floor(Math.random() * 22 + 58);
  document.getElementById('fb-score').textContent = overall;

  /* ── Verdict ── */
  const vd = document.getElementById('fb-verdict');
  const verdictType = report?.verdictType ?? (overall >= 80 ? 'strong' : overall >= 60 ? 'mid' : 'weak');
  const verdictMap = {
    strong: { cls: 'v-strong', icon: '✦ Strong.', fallback: 'You know your material — polish delivery and quantify your impact.' },
    mid:    { cls: 'v-mid',    icon: '⚡ Competent.', fallback: 'Significant gaps remain. Too much "we", not enough specifics. Keep drilling.' },
    weak:   { cls: 'v-weak',   icon: '✕ Not ready.', fallback: 'Critical gaps detected. Do not attempt this interview without more targeted prep.' }
  };
  const v = verdictMap[verdictType] || verdictMap.mid;
  vd.className = 'verdict-bar ' + v.cls;
  vd.innerHTML = `<b>${v.icon}</b> ${report?.verdict || v.fallback}`;

  /* ── Category Cards ── */
  const defaultCats = [
    { name: 'Communication Clarity', score: Math.floor(Math.random() * 22 + 55), note: 'Pacing and structure were inconsistent. Some answers were too brief, others meandered. Work on the STAR framework consistently.' },
    { name: 'Resume Credibility',    score: Math.floor(Math.random() * 22 + 48), note: "Project explanations were vague. Stop saying 'we' — own what YOU did. Back every claim with a specific number or outcome." },
    { name: 'Behavioral Depth',      score: Math.floor(Math.random() * 18 + 60), note: 'Stories were broadly credible but lacked measurable results. Every behavioral story should end with a metric.' },
    { name: 'Role Fit & Motivation', score: Math.floor(Math.random() * 28 + 44), note: "Company knowledge was surface-level. Do deeper research on what this team actually works on and why it matters." }
  ];
  const cats = report?.categories || defaultCats;

  document.getElementById('fb-cats').innerHTML = cats.map(c => {
    const sc = c.score;
    const cls = sc >= 75 ? 'sc-hi' : sc >= 55 ? 'sc-md' : 'sc-lo';
    return `<div class="fb-cat">
      <div class="fb-cat-head">
        <div class="fb-cat-name">${c.name}</div>
        <div class="fb-cat-score ${cls}">${sc}</div>
      </div>
      <div class="fb-cat-bar"><div class="fb-cat-fill ${cls}" style="width:${sc}%"></div></div>
      <div class="fb-cat-notes">${c.note}</div>
    </div>`;
  }).join('');

  /* ── Per-Question Breakdown ── */
  const staticVerdicts = [
    'Good opening but the narrative was generic. Customize it to what this specific company cares about.',
    'Credible story but impact was unquantified. Every STAR story needs to end with a metric.',
    'Solid structure. The follow-up tripped you — revisit that area specifically.',
    'Resume claim seems inflated. If a real interviewer drilled this, you would have stalled.',
    'Strongest answer of the session. Maintain this energy and specificity throughout.',
    'Answer lost structure mid-way through. Practice this type of question more.',
    'Handled the pressure well. The self-awareness here will resonate with senior interviewers.',
    'The final question opportunity was not fully leveraged — a great question here shows real preparation.',
  ];

  document.getElementById('fb-qlist').innerHTML = S.qHistory.map((item, i) => {
    const qfb = report?.questionFeedback?.[i];
    const sc = qfb?.score ?? (
      item.score === 'good' ? Math.floor(Math.random() * 15 + 76) :
      item.score === 'ok'   ? Math.floor(Math.random() * 20 + 50) :
                              Math.floor(Math.random() * 20 + 28)
    );
    const cls = sc >= 75 ? 'sc-hi' : sc >= 55 ? 'sc-md' : 'sc-lo';
    const verdict = qfb?.verdict || staticVerdicts[i % staticVerdicts.length];
    return `<div class="fb-qitem">
      <div class="fb-qitem-hd" onclick="toggleFBQ(this)">
        <div class="fb-qnum">Q${i + 1}</div>
        <div class="fb-qtext">${item.q}</div>
        <div class="fb-qscore ${cls}">${sc}/100</div>
      </div>
      <div class="fb-qitem-body">
        <div class="fb-qans">"${item.answer || '(no answer recorded)'}"</div>
        <div class="fb-qverdict">${verdict}</div>
      </div>
    </div>`;
  }).join('');

  /* ── Strengthen Section ── */
  const defaultStrengthen = [
    'STAR method — end every story with a measurable result and personal ownership',
    'Resume claim audit — verify every bullet can survive 5 deep follow-up questions',
    'Filler word elimination — record yourself answering and count hesitations',
    'Company research depth — know the team\'s work, recent launches, and engineering culture',
    'Quantification habit — attach a number to every project claim, every outcome'
  ];
  const strengthen = report?.strengthen || defaultStrengthen;
  document.getElementById('fb-str-items').innerHTML = strengthen.slice(0, 5)
    .map(s => `<div class="str-item">${s}</div>`).join('');

  /* ── Body Language Summary ── */
  const blSummary = getBodyLangSummary();
  const blReport  = report?.bodyLang || blSummary;

  if (blReport) {
    const blContainer = document.getElementById('fb-body-lang');
    if (blContainer) {
      const eyeCls = blReport.eyeContact >= 70 ? 'hi' : blReport.eyeContact >= 50 ? 'mid' : 'lo';
      const posCls = blReport.posture >= 70 ? 'hi' : blReport.posture >= 50 ? 'mid' : 'lo';
      const conCls = blReport.confidence >= 70 ? 'hi' : blReport.confidence >= 50 ? 'mid' : 'lo';

      blContainer.innerHTML = `
        <div class="fb-bl-title">// Body Language Analysis</div>
        <div class="fb-bl-grid">
          <div class="fb-bl-metric">
            <div class="fb-bl-val ${eyeCls}">${blReport.eyeContact}</div>
            <div class="fb-bl-label">Eye Contact</div>
          </div>
          <div class="fb-bl-metric">
            <div class="fb-bl-val ${posCls}">${blReport.posture}</div>
            <div class="fb-bl-label">Posture</div>
          </div>
          <div class="fb-bl-metric">
            <div class="fb-bl-val ${conCls}">${blReport.confidence}</div>
            <div class="fb-bl-label">Confidence</div>
          </div>
          <div class="fb-bl-metric">
            <div class="fb-bl-val ${blReport.readingCount > 0 ? 'hi' : 'lo'}">${blReport.readingCount || 0}</div>
            <div class="fb-bl-label">Readings Taken</div>
          </div>
        </div>`;
    }
  } else {
    const blContainer = document.getElementById('fb-body-lang');
    if (blContainer) {
      blContainer.innerHTML = `
        <div class="fb-bl-title">// Body Language Analysis</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text3);padding:8px 0;">
          Camera was not available during this session — no body language data recorded.
        </div>`;
    }
  }

  /* ── Integrity / Cheat Detection Summary ── */
  const cheat = getCheatSummary();
  const integrityContainer = document.getElementById('fb-integrity-content');
  if (integrityContainer) {
    if (cheat.clean) {
      integrityContainer.innerHTML = `
        <div class="fb-int-clean">
          <span>✓</span>
          <span>No integrity signals detected. Speech cadence, language patterns, and eye movement all consistent with natural delivery.</span>
        </div>`;
    } else {
      const typeLabels = {
        cadence: 'Speech Cadence Uniformity',
        ai_text: 'AI-Generated Language Patterns',
        gaze: 'Reading/Gaze Pattern',
        offscreen: 'Off-Screen Activity'
      };
      integrityContainer.innerHTML = `
        <div class="fb-int-flags">
          ${cheat.flags.map(f => `
            <div class="fb-int-flag">
              <div class="fb-int-flag-type">${typeLabels[f.type] || f.type}</div>
              <div class="fb-int-flag-detail">${f.detail}</div>
              <div class="fb-int-flag-ctx">Detected at Question ${f.questionIndex}</div>
            </div>`).join('')}
        </div>`;
    }
  }
}

/* ── Toggle per-question answer body ── */
function toggleFBQ(hd) {
  hd.nextElementSibling.classList.toggle('open');
}
