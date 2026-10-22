'use strict';

// -------------------------------------------------------------
// ProSolv Core Application Logic & State Management
// -------------------------------------------------------------

const DOMAINS = window.PROSOLV_DOMAINS_DEF || [];
const PROBLEMS_RAW = window.PROSOLV_PROBLEMS_RAW || [];

const PROBLEMS = PROBLEMS_RAW.map((t, idx) => ({
  id: 'p' + (idx + 1),
  d: t[0],
  t: t[1],
  s: t[2],
  causes: t[3].split('|'),
  people: t[4],
  ideas: t[5].split('|'),
  df: t[6],
  ty: t[7],
  cost: t[8],
  tags: [t[0], t[7].toLowerCase(), 'prosolv']
}));

const STAGE_NAMES = [
  'Understand',
  'Root causes',
  'Affected people',
  'Constraints',
  'Ideas',
  'Compare',
  'Choose',
  'Plan',
  'Test & improve'
];

const STAGE_MASCOT_MOODS = ['happy', 'think', 'happy', 'think', 'cheer', 'think', 'cheer', 'happy', 'cheer'];

const STAGE_PROMPTS = [
  [
    'In your own words: what is happening, and for whom?',
    'What would "solved" look like in one sentence?',
    'What is one critical fact you do not know yet?'
  ],
  [
    'Is that a symptom or the root cause? Keep asking "why?".',
    'Which single cause, if addressed, would have the largest impact?',
    'How could you verify on the ground that this cause is real?'
  ],
  [
    'Who is affected most, and who is easily overlooked?',
    'How does this problem look from their daily point of view?',
    'What workarounds do people currently use to cope?'
  ],
  [
    'Which constraint is fixed, and which can be bent?',
    'What local resources or community skills are already available?',
    'Which assumption could break your solution if wrong?'
  ],
  [
    'Aim for distinct approaches: low-cost, community-led, or tech-enabled.',
    'What has worked for a similar problem in another region?',
    'Can you combine two simple ideas into a stronger hybrid?'
  ],
  [
    'Does your best idea change if budget is cut in half?',
    'Which idea can be tested within 48 hours for the least cost?',
    'What trade-off between speed, cost, and impact are you accepting?'
  ],
  [
    'Why is this idea superior to the alternatives?',
    'What is the single riskiest assumption in it?',
    'What unanswered question must you test first?'
  ],
  [
    'What is the smallest step you can complete this week?',
    'Who is responsible for what, and by when?',
    'What minimal materials or tools do you need to begin?'
  ],
  [
    'What measurable result will prove your solution works?',
    'What would a failed test teach you about user needs?',
    'What specific change will you make after the first user feedback?'
  ]
];

const PHILOSOPHY_QUOTES = [
  'Great solvers ask better questions.',
  'Slow down: understanding first, ideas second.',
  'A wrong guess is just data for your next test.',
  'Small, fast tests beat heavy, untested plans.',
  'Your thinking is the real solution in progress.'
];

const PROJECT_STAGES = ['Problem', 'Analysis', 'Solution', 'Prototype', 'Testing', 'Improvements'];
const STORAGE_KEY = 'prosolv.workspace.v1';

const DEFAULT_STATE = {
  v: 1,
  name: 'Problem Solver',
  theme: 'auto',
  pts: 0,
  sess: {},
  proj: {},
  cust: [],
  act: []
};

let store = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && raw.v === 1 && typeof raw.sess === 'object' && typeof raw.proj === 'object') {
      return Object.assign({}, DEFAULT_STATE, raw);
    }
  } catch (e) {
    console.warn('Could not parse stored session:', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
})();

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Storage write error:', e);
  }
}

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const allProblems = () => PROBLEMS.concat(store.cust);
const getProblem = id => allProblems().find(p => p.id === id);
const getDomain = code => DOMAINS.find(d => d[0] === code) || DOMAINS[19];
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const logActivity = msg => {
  store.act.unshift({ t: Date.now(), m: msg });
  store.act = store.act.slice(0, 30);
};

let filterState = { q: '', d: '', df: '', ty: '', so: 'rec' };
let nudgeIndexMap = {};
let activeModalCb = null;

// Mascot BLU SVG Generator
function renderBluMascot(mood = 'happy', size = 56) {
  const mouthPaths = {
    happy: 'M24 41q8 7 16 0',
    think: 'M26 43h12',
    cheer: 'M22 38q10 13 20 0'
  };
  const mouth = mouthPaths[mood] || mouthPaths.happy;
  return `
    <svg class="blu" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="BLU, your AI assistant">
      <path d="M32 6v8" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"/>
      <circle cx="32" cy="6" r="3.5" fill="#22d3ee"/>
      <ellipse cx="32" cy="38" rx="25" ry="22" fill="#38bdf8"/>
      <ellipse cx="32" cy="44" rx="18" ry="12" fill="#7dd3fc"/>
      <circle cx="23" cy="33" r="4.2" fill="#0b2545"/>
      <circle cx="41" cy="33" r="4.2" fill="#0b2545"/>
      <circle cx="24.5" cy="31.5" r="1.4" fill="#fff"/>
      <circle cx="42.5" cy="31.5" r="1.4" fill="#fff"/>
      <path d="${mouth}" stroke="#0b2545" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>
  `;
}

// Toast & Modal Helpers
function showToast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.style.display = 'none';
  }, 2400);
}

function openModal(html, cb) {
  const box = $('#mb');
  const modal = $('#md');
  if (!box || !modal) return;
  box.innerHTML = html;
  activeModalCb = cb;
  modal.style.display = 'grid';
  const firstInput = box.querySelector('input, button');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  const modal = $('#md');
  if (modal) modal.style.display = 'none';
  activeModalCb = null;
}

function confirmModal(msg, onOk) {
  openModal(`
    <p style="margin-top:0">${esc(msg)}</p>
    <div class="row" style="margin-top:16px">
      <button class="btn d" data-a="mok">Yes, continue</button>
      <button class="btn g" data-a="mno">Cancel</button>
    </div>
  `, onOk);
}

function promptModal(label, defaultVal, onOk) {
  openModal(`
    <label for="modal-input">${esc(label)}</label>
    <input type="text" id="modal-input" value="${esc(defaultVal)}">
    <div class="row" style="margin-top:14px">
      <button class="btn" data-a="mok">Save</button>
      <button class="btn g" data-a="mno">Cancel</button>
    </div>
  `, onOk);
}

// Stage Completion Check
function isStageComplete(answers = {}, idx) {
  switch (idx) {
    case 0: return (answers.own || '').trim().length >= 10;
    case 1: return (answers.causes || []).length > 0;
    case 2: return (answers.people || '').trim().length >= 5;
    case 3: return (answers.cons || '').trim().length >= 5 || (answers.res || []).length > 0;
    case 4: return (answers.ideas || []).filter(s => s && s.trim()).length >= 2;
    case 5: return Object.keys(answers.rate || {}).length > 0;
    case 6: return Boolean(answers.pick && (answers.reason || '').trim());
    case 7: return (answers.plan || '').trim().length >= 10;
    case 8: return Boolean((answers.success || '').trim() || (answers.test || '').trim());
    default: return false;
  }
}

function countCompletedStages(session) {
  return STAGE_NAMES.filter((_, idx) => isStageComplete(session.a, idx)).length;
}

function calculateWeightedScore(answers, idea) {
  const rates = (answers.rate || {})[idea] || {};
  const weights = answers.w || {};
  const criteria = ['f', 'c', 'i', 'a', 's'];
  let total = 0;
  let weightSum = 0;
  criteria.forEach(key => {
    const w = weights[key] || 1;
    const r = rates[key] || 3;
    // For Cost (c): lower cost is better, so invert 6 - r
    const scoreVal = key === 'c' ? (6 - r) : r;
    total += w * scoreVal;
    weightSum += w;
  });
  return (total / (weightSum || 1)).toFixed(1);
}

// -------------------------------------------------------------
// Views
// -------------------------------------------------------------

function renderProblemCard(prob) {
  const domain = getDomain(prob.d);
  return `
    <button class="card k" data-a="go" data-v="problem/${prob.id}">
      <span class="tag">${domain[2]} ${esc(domain[1])}</span>
      <h3 style="font-size:16px;margin:4px 0 6px">${esc(prob.t)}</h3>
      <div class="mut sm" style="line-height:1.45;flex:1">${esc(prob.s)}</div>
      <div class="sm mut" style="margin-top:10px;display:flex;gap:8px">
        <span><b>${esc(prob.df)}</b></span>
        <span>·</span>
        <span>${esc(prob.ty)}</span>
      </div>
    </button>
  `;
}

function viewHome() {
  const sessions = Object.values(store.sess).sort((a, b) => b.upd - a.upd);
  const activeSession = sessions.find(s => !s.fin);
  const completedCount = sessions.filter(s => s.fin).length;
  const projects = Object.values(store.proj).sort((a, b) => b.upd - a.upd);

  const daySeed = Math.floor(Date.now() / 86400000);
  const featured = PROBLEMS[daySeed % PROBLEMS.length];
  const recommended = allProblems().filter((_, i) => (i + daySeed) % 3 === 0).slice(0, 3);

  return `
    <div class="hero">
      ${renderBluMascot('cheer', 88)}
      <div style="flex:1;min-width:240px">
        <h1 style="margin:0 0 8px">Hi, ${esc(store.name)}! Welcome to ProSolv.</h1>
        <p style="margin:0 0 16px;line-height:1.5">
          ${PHILOSOPHY_QUOTES[daySeed % PHILOSOPHY_QUOTES.length]} I'm <b>BLU</b>, your AI thinking partner. I guide your problem-solving step by step.
        </p>
        <div class="row">
          <button class="btn" data-a="go" data-v="explore">Explore Problems</button>
          ${activeSession ? `<button class="btn g" data-a="go" data-v="solve/${activeSession.id}">Continue Session</button>` : ''}
          <button class="btn g" data-a="go" data-v="build">Build Lab</button>
        </div>
      </div>
    </div>

    <!-- Clean, Focused Metrics without fake streaks -->
    <div class="grid" style="margin-top:16px;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr))">
      <div class="card stat">
        <b>${sessions.length}</b>
        <span>Problem Sessions</span>
      </div>
      <div class="card stat">
        <b>${completedCount}</b>
        <span>Completed Solutions</span>
      </div>
      <div class="card stat">
        <b>${projects.length}</b>
        <span>Build Lab Projects</span>
      </div>
    </div>

    <h2>Featured Challenge</h2>
    ${renderProblemCard(featured)}

    <h2>Recommended for You</h2>
    <div class="grid">${recommended.map(renderProblemCard).join('')}</div>

    <h2>Explore Domains</h2>
    <div style="margin-bottom:8px">
      ${DOMAINS.slice(0, 10).map(d => `
        <button class="chip" data-a="dom" data-v="${d[0]}">${d[2]} ${d[1]}</button>
      `).join('')}
      <button class="chip on" data-a="go" data-v="explore">View All 20 Domains →</button>
    </div>

    <h2>Recent Work</h2>
    ${sessions.length || projects.length ? `
      <div class="grid">
        ${sessions.slice(0, 2).map(s => `
          <button class="card k" data-a="go" data-v="solve/${s.id}">
            <b>${esc(s.title)}</b>
            <div class="sm mut" style="margin-top:6px">
              Session · Stage ${s.step + 1} of 9 · ${s.fin ? '✓ Completed' : 'In Progress'}
            </div>
            <div class="sm mut">${fmtDate(s.upd)}</div>
          </button>
        `).join('')}
        ${projects.slice(0, 2).map(p => `
          <button class="card k" data-a="go" data-v="build/${p.id}">
            <b>${esc(p.name)}</b>
            <div class="sm mut" style="margin-top:6px">
              Project · Stage: ${esc(p.stage)} · ${p.check.filter(t => t.d).length}/${p.check.length} tasks
            </div>
            <div class="sm mut">${fmtDate(p.upd)}</div>
          </button>
        `).join('')}
      </div>
    ` : `
      <div class="card mut">No saved work yet. Pick any challenge above to begin your first guided 9-step analysis.</div>
    `}
  `;
}

function filterProblems() {
  let list = allProblems().filter(p => {
    const matchesDomain = !filterState.d || p.d === filterState.d;
    const matchesDiff = !filterState.df || p.df === filterState.df;
    const matchesType = !filterState.ty || p.ty === filterState.ty;
    const searchTarget = (p.t + ' ' + p.s + ' ' + p.tags.join(' ') + ' ' + getDomain(p.d)[1]).toLowerCase();
    const matchesQuery = !filterState.q || searchTarget.includes(filterState.q.toLowerCase());
    return matchesDomain && matchesDiff && matchesType && matchesQuery;
  });

  if (filterState.so === 'az') {
    list.sort((a, b) => a.t.localeCompare(b.t));
  } else if (filterState.so === 'rec') {
    list = list.slice().reverse();
  }

  return list.length
    ? list.map(renderProblemCard).join('')
    : '<div class="card mut">No problems match your current filters. Try resetting filters or add your own problem below.</div>';
}

function viewExplore() {
  const selectOpt = (cur, val, label) => `<option value="${val}" ${cur === val ? 'selected' : ''}>${label}</option>`;
  return `
    <h1>Explore Real-World Problems</h1>
    <p class="mut">Browse real challenges across 20 impact domains, or submit your own custom problem.</p>

    <label for="q">Search by problem, keyword, or domain</label>
    <input type="text" id="q" data-m="f.q" value="${esc(filterState.q)}" placeholder="e.g. water, clinic, solar, safety, farm">

    <div class="row" style="margin-bottom:18px">
      <select aria-label="Filter by Domain" data-m="f.d" style="flex:1;min-width:160px">
        ${selectOpt(filterState.d, '', 'All 20 Domains')}
        ${DOMAINS.map(d => selectOpt(filterState.d, d[0], `${d[2]} ${d[1]}`)).join('')}
      </select>
      <select aria-label="Filter by Difficulty" data-m="f.df" style="width:140px">
        ${selectOpt(filterState.df, '', 'Any Difficulty')}
        ${['Beginner', 'Intermediate', 'Advanced'].map(d => selectOpt(filterState.df, d, d)).join('')}
      </select>
      <select aria-label="Filter by Type" data-m="f.ty" style="width:130px">
        ${selectOpt(filterState.ty, '', 'Any Type')}
        ${['Campus', 'Community', 'Tech', 'Custom'].map(t => selectOpt(filterState.ty, t, t)).join('')}
      </select>
      <select aria-label="Sort" data-m="f.so" style="width:140px">
        ${selectOpt(filterState.so, 'rec', 'Recommended')}
        ${selectOpt(filterState.so, 'az', 'A–Z')}
        ${selectOpt(filterState.so, 'new', 'Original')}
      </select>
    </div>

    <h2>Domains</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));margin-bottom:24px">
      ${DOMAINS.map(d => `
        <button class="card k" style="${filterState.d === d[0] ? 'border-color:var(--pri);background:var(--pri2)' : ''}" data-a="dom" data-v="${d[0]}">
          <div style="font-size:30px;margin-bottom:4px">${d[2]}</div>
          <b class="sm">${d[1]}</b>
          <div class="sm mut">${allProblems().filter(p => p.d === d[0]).length} problem(s)</div>
        </button>
      `).join('')}
    </div>

    <h2>Problems & Challenges</h2>
    <div class="grid" id="problem-list-container">${filterProblems()}</div>

    <h2>Bring Your Own Problem</h2>
    <div class="card" style="margin-top:12px">
      <p class="mut sm" style="margin-top:0">Have a real issue in your school, neighbourhood, or town? Define it here and work through the 9-step analysis.</p>
      <label for="ct">Problem title</label>
      <input type="text" id="ct" placeholder="e.g. Broken water purifier in science lab">

      <label for="cd">What is happening, and who is affected?</label>
      <textarea id="cd" placeholder="Describe the situation, what makes it challenging, and who is impacted..."></textarea>

      <label for="cdm">Impact Domain</label>
      <select id="cdm">
        ${DOMAINS.map(d => `<option value="${d[0]}">${d[2]} ${d[1]}</option>`).join('')}
      </select>

      <div id="ce" class="sm" style="color:#dc2626;margin-bottom:8px" role="alert"></div>
      <button class="btn" data-a="cust">Start 9-Step Guided Session</button>
    </div>
  `;
}

function viewProblemDetail(id) {
  const prob = getProblem(id);
  if (!prob) {
    return `
      <div class="card">
        Problem not found.
        <div style="margin-top:12px"><button class="btn g" data-a="go" data-v="explore">← Back to Explore</button></div>
      </div>
    `;
  }
  const domain = getDomain(prob.d);
  return `
    <button class="chip" data-a="go" data-v="explore">← All Problems</button>
    <h1 style="margin-top:10px">${esc(prob.t)}</h1>
    <div style="margin-bottom:14px">
      <span class="tag">${domain[2]} ${esc(domain[1])}</span>
      <span class="tag">${esc(prob.df)}</span>
      <span class="tag">${esc(prob.ty)}</span>
    </div>

    <div class="card" style="margin-bottom:18px">
      <p style="font-size:16px;margin-top:0">${esc(prob.s)}</p>
      <h3 style="margin-top:16px">Key Facts & Context</h3>
      <ul style="padding-left:20px;margin:8px 0;line-height:1.6">
        <li><b>Issue:</b> ${esc(prob.s)}</li>
        ${prob.people ? `<li><b>People affected:</b> ${esc(prob.people)}</li>` : ''}
        ${prob.causes && prob.causes.length ? `<li><b>Identified factors:</b> ${prob.causes.map(esc).join('; ')}</li>` : ''}
      </ul>

      <h3 style="margin-top:16px">What needs investigation in your area?</h3>
      <ul style="padding-left:20px;margin:8px 0;line-height:1.6">
        <li>How does this problem specifically manifest in your local community or school?</li>
        <li>What solutions or workarounds have people already tried, and why did they fall short?</li>
      </ul>
    </div>

    <div class="row">
      <button class="btn" data-a="start" data-v="${prob.id}">
        Start 9-Step Analysis with BLU →
      </button>
      <button class="btn g" data-a="go" data-v="explore">Browse Others</button>
    </div>
  `;
}

// -------------------------------------------------------------
// 9-Step Analysis Session View & Interactivity
// -------------------------------------------------------------

function viewSolveSession(sessionId) {
  const session = store.sess[sessionId];
  if (!session) {
    return `
      <div class="card">
        Session not found.
        <div style="margin-top:12px"><button class="btn g" data-a="go" data-v="lab">Open My Lab</button></div>
      </div>
    `;
  }

  const prob = getProblem(session.pid) || { t: session.title, s: '', causes: [], people: '', ideas: [] };
  const answers = session.a;
  const currentStep = session.step;
  const key = sessionId + '-' + currentStep;
  const nudgeIdx = nudgeIndexMap[key] || 0;
  const currentPrompt = nudgeIdx ? STAGE_PROMPTS[currentStep][(nudgeIdx - 1) % 3] : (
    currentStep === 0
      ? "Hi! I won't just hand you answers. I'll ask questions to help you think deeply and build a practical solution."
      : "Ready when you are! Need a thinking nudge for this step?"
  );

  return `
    <div class="row sp" style="margin-bottom:4px">
      <div>
        <span class="mut sm">9-Step Analysis Session</span>
        <h2 style="margin:2px 0 0;font-size:20px">${esc(session.title)}</h2>
      </div>
      <span class="sm mut">
        Stage <b>${currentStep + 1} of 9</b> · ${countCompletedStages(session)}/9 completed
      </span>
    </div>

    <div class="bar" style="margin:8px 0 16px">
      <b style="width:${((currentStep + 1) / 9) * 100}%"></b>
    </div>

    <!-- Step Navigation Pills -->
    <div class="steps" role="tablist">
      ${STAGE_NAMES.map((name, idx) => {
        const done = isStageComplete(answers, idx);
        return `
          <button class="st ${idx === currentStep ? 'on' : ''} ${done ? 'dn' : ''}" data-a="stage" data-v="${idx}">
            ${done ? '✓ ' : ''}${idx + 1}. ${name}
          </button>
        `;
      }).join('')}
    </div>

    <!-- Workspace Layout: Left Content, Right BLU Assistant -->
    <div class="ws" style="margin-top:14px">
      <!-- Main Step Card -->
      <div class="card">
        <h3 style="font-size:18px;margin-top:0">${currentStep + 1}. ${STAGE_NAMES[currentStep]}</h3>
        ${renderStepContent(session, prob, currentStep)}

        <div class="row sp" style="margin-top:20px;border-top:1px solid var(--bd);padding-top:14px">
          <button class="btn g" data-a="stage" data-v="${currentStep - 1}" ${currentStep === 0 ? 'disabled' : ''}>
            ← Back
          </button>
          <div class="row">
            <button class="btn g" data-a="ssave">Save</button>
            <button class="btn g" data-a="sexit">Save & Exit</button>
            ${currentStep < 8 ? `
              <button class="btn" data-a="stage" data-v="${currentStep + 1}">Next Stage →</button>
            ` : `
              <button class="btn" data-a="finish">Finish Session 🎉</button>
            `}
          </div>
        </div>
      </div>

      <!-- BLU Assistant Panel -->
      <div class="card" style="border-left:4px solid var(--teal)">
        <div class="row" style="gap:10px">
          ${renderBluMascot(STAGE_MASCOT_MOODS[currentStep], 50)}
          <div>
            <b>BLU Assistant</b>
            <div class="sm mut">Socratic AI Guide</div>
          </div>
        </div>

        <div class="bub" id="blu-speech" aria-live="polite">
          ${esc(currentPrompt)}
        </div>

        <div class="row" style="margin-top:10px">
          <button class="btn g sm" data-a="hint">💡 Give me a nudge</button>
          <button class="btn g sm" data-a="ans">Tell me the answer</button>
        </div>

        <div id="blu-answer-box" style="margin-top:8px"></div>

        <!-- Optional Interactive Live AI Query -->
        <div class="live-chat-box">
          <label for="live-chat-input" class="sm mut" style="font-weight:600">Ask BLU anything about this step:</label>
          <div class="row" style="margin-top:4px">
            <input type="text" id="live-chat-input" placeholder="e.g. How do I measure feasibility?" style="flex:1;margin:0">
            <button class="btn sm" id="live-chat-btn" data-a="askblu">Ask</button>
          </div>
          <div id="live-chat-reply" style="margin-top:8px"></div>
        </div>
      </div>
    </div>
  `;
}

function renderStepContent(session, prob, step) {
  const ans = session.a;
  const makeTextarea = (id, label, placeholder = '') => `
    <label for="${id}" style="margin-top:12px;display:block">${esc(label)}</label>
    <textarea id="${id}" data-m="a.${id}" placeholder="${esc(placeholder)}">${esc(ans[id])}</textarea>
  `;

  // Step 1: Understand
  if (step === 0) {
    return `
      <p class="mut sm" style="margin-top:0">Review the initial problem description, then rewrite it in your own words.</p>
      <div style="background:var(--pri2);padding:10px 14px;border-radius:10px;margin-bottom:12px">
        <b>Original Problem Statement:</b><br>${esc(prob.s)}
      </div>
      ${makeTextarea('own', 'Explain in your own words: what is happening, who is affected, and why does it matter?', 'Write your understanding here...')}
    `;
  }

  // Step 2: Root Causes
  if (step === 1) {
    const selectedCauses = ans.causes || [];
    const allCauses = [...new Set([...(prob.causes || []), ...selectedCauses])];
    return `
      <p class="mut sm" style="margin-top:0">Distinguish symptoms from root causes. Tap to select the causes you believe drive this problem, or add your own.</p>
      <div>
        ${allCauses.map(c => `
          <button class="chip ${selectedCauses.includes(c) ? 'on' : ''}" data-a="cause" data-v="${esc(c)}">
            ${selectedCauses.includes(c) ? '✓ ' : '+ '} ${esc(c)}
          </button>
        `).join('')}
      </div>
      <div class="row" style="margin:12px 0 6px">
        <input type="text" id="nc" placeholder="Add a custom root cause..." style="flex:1;margin:0">
        <button class="btn g" data-a="addc">+ Add Cause</button>
      </div>
      ${makeTextarea('why', 'Why is your most important root cause critical to address?', 'Explain which root cause if solved unlocks the most progress...')}
    `;
  }

  // Step 3: Affected People
  if (step === 2) {
    return `
      <p class="mut sm" style="margin-top:0">
        ${prob.people ? `Identified stakeholders: <b>${esc(prob.people)}</b>. ` : ''}
        Think about who suffers most, and who is easy to overlook.
      </p>
      ${makeTextarea('people', 'Who is affected, and what are their specific daily struggles or coping habits?', 'Detail the people, their constraints, and their perspective...')}
    `;
  }

  // Step 4: Constraints & Resources
  if (step === 3) {
    const selectedRes = ans.res || [];
    const resourceOptions = ['Time', 'Money / Budget', 'Materials', 'Local Skills', 'Existing Infrastructure', 'Community Support'];
    return `
      <p class="mut sm" style="margin-top:0">Identify what resources you can realistically tap into, and what hard constraints exist.</p>
      <div>
        ${resourceOptions.map(r => `
          <button class="chip ${selectedRes.includes(r) ? 'on' : ''}" data-a="res" data-v="${r}">
            ${selectedRes.includes(r) ? '✓ ' : '+ '} ${r}
          </button>
        `).join('')}
      </div>
      ${makeTextarea('cons', 'Constraints and boundaries (e.g. max budget ₹2,000, no smartphone access, monsoon weather)', 'List budget limits, regulatory rules, or technical limits...')}
    `;
  }

  // Step 5: Ideas
  if (step === 4) {
    const ideas = ans.ideas || [];
    return `
      <p class="mut sm" style="margin-top:0">Brainstorm distinct solution ideas. Aim for at least 3 directions (e.g. low-cost, community-led, or tech-based).</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${ideas.map((idea, idx) => `
          <div class="row">
            <input type="text" style="flex:1;margin:0" aria-label="Idea ${idx + 1}" data-m="i.${idx}" value="${esc(idea)}" placeholder="Idea ${idx + 1}...">
            <button class="btn d" data-a="rmi" data-v="${idx}" aria-label="Remove idea ${idx + 1}">✕</button>
          </div>
        `).join('')}
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn g" data-a="addi">+ Add Another Idea</button>
        <button class="btn g" data-a="spark">💡 Show Sample Direction Sparks</button>
      </div>
      <div id="sp" style="margin-top:10px"></div>
    `;
  }

  // Step 6: Compare
  if (step === 5) {
    const validIdeas = (ans.ideas || []).filter(i => i && i.trim());
    if (validIdeas.length < 2) {
      return `
        <div class="card" style="background:var(--bg)">
          <p>Please enter at least <b>two ideas</b> in Stage 5 (Ideas) before comparing trade-offs.</p>
          <button class="btn g" data-a="stage" data-v="4">← Go to Stage 5</button>
        </div>
      `;
    }

    const weights = ans.w || {};
    const criteria = [
      ['f', 'Feasibility'],
      ['c', 'Cost (Low is best)'],
      ['i', 'Impact'],
      ['a', 'Accessibility'],
      ['s', 'Sustainability']
    ];

    return `
      <p class="mut sm" style="margin-top:0">
        Rate each idea 1–5 across key dimensions. Use the top row to adjust weight priorities (1–3). 
        <i>Trade-offs: a low-cost idea may require more community effort.</i>
      </p>
      <div class="sc">
        <table>
          <thead>
            <tr>
              <th style="min-width:140px">Idea Direction</th>
              ${criteria.map(c => `<th>${c[1]}</th>`).join('')}
              <th style="text-align:center">Score</th>
            </tr>
            <tr style="background:var(--pri2)">
              <td class="sm"><b>Priority Weight →</b></td>
              ${criteria.map(c => `
                <td>
                  <input type="range" min="1" max="3" value="${weights[c[0]] || 1}" data-m="w.${c[0]}" aria-label="Weight for ${c[1]}">
                  <div style="font-size:11px;text-align:center">${weights[c[0]] || 1}x</div>
                </td>
              `).join('')}
              <td style="text-align:center;font-size:11px;font-weight:700">Weighted</td>
            </tr>
          </thead>
          <tbody>
            ${validIdeas.map(idea => `
              <tr>
                <td><b>${esc(idea)}</b></td>
                ${criteria.map(c => {
                  const currentScore = ((ans.rate || {})[idea] || {})[c[0]] || 3;
                  return `
                    <td>
                      <input type="range" min="1" max="5" value="${currentScore}" data-m="r.${esc(idea)}|${c[0]}" aria-label="${esc(idea)} ${c[1]}">
                      <div style="font-size:11px;text-align:center">${currentScore}/5</div>
                    </td>
                  `;
                }).join('')}
                <td style="text-align:center">
                  <span class="tag" style="font-size:13px;font-weight:700" data-sc="${esc(idea)}">${calculateWeightedScore(ans, idea)}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Step 7: Choose
  if (step === 6) {
    const validIdeas = (ans.ideas || []).filter(i => i && i.trim());
    return `
      <p class="mut sm" style="margin-top:0">Pick your primary solution to defend and detail.</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
        ${validIdeas.map(idea => `
          <label class="card row" style="font-weight:550;cursor:pointer;padding:10px 14px">
            <input type="radio" name="pick-idea" data-a="pick" data-v="${esc(idea)}" ${ans.pick === idea ? 'checked' : ''}>
            <span style="flex:1">${esc(idea)}</span>
            <span class="tag">Score ${calculateWeightedScore(ans, idea)}</span>
          </label>
        `).join('')}
        ${!validIdeas.length ? '<p class="mut sm">No ideas entered yet. Go back to Stage 5 to brainstorm.</p>' : ''}
      </div>
      ${makeTextarea('reason', 'Why this idea over the alternatives?', 'State the primary advantages and why it fits your constraints...')}
      ${makeTextarea('risk', 'What are the main risks, dependencies, or unanswered questions?', 'Detail what could go wrong and how you might mitigate it...')}
    `;
  }

  // Step 8: Plan
  if (step === 7) {
    return `
      <p class="mut sm" style="margin-top:0">Turn your chosen idea into an actionable execution plan.</p>
      ${ans.pick ? `
        <div style="background:var(--pri2);padding:10px 14px;border-radius:10px;margin-bottom:12px" class="row sp">
          <div><b>Selected Solution:</b> ${esc(ans.pick)}</div>
          <button class="btn g sm" data-a="mkproj">Convert to Build Lab Project 🛠️</button>
        </div>
      ` : ''}
      ${makeTextarea('plan', 'Implementation steps, who does what, required tools, and timeline', '1) Day 1-2: Gather basic materials\n2) Day 3: Build first prototype\n3) Day 4: Test with 3 users\n4) Day 5: Iterate based on feedback')}
    `;
  }

  // Step 9: Test & Improve
  if (step === 8) {
    return `
      <p class="mut sm" style="margin-top:0">Plan how to validate your solution with real users in the field.</p>
      ${makeTextarea('success', 'What does measurable success look like?', 'e.g. 80% reduction in water waste; 15 students using the offline box daily')}
      ${makeTextarea('test', 'Simple test plan & feedback questions to ask users', 'What questions will you ask the first 3-5 users when testing?')}
      ${makeTextarea('obs', 'Observations, unexpected failures, and planned improvements', 'Note what happened during trial and how the next version will adapt...')}
    `;
  }

  return '';
}

// -------------------------------------------------------------
// Build Lab Views
// -------------------------------------------------------------

function createNewProject(initialData = {}) {
  const id = uid();
  store.proj[id] = Object.assign({
    id,
    name: 'Untitled Project Plan',
    sum: '',
    prob: '',
    users: '',
    sol: '',
    mat: '',
    bud: '',
    skl: '',
    steps: '',
    time: '',
    feas: '',
    imp: '',
    risk: '',
    test: '',
    fb: '',
    notes: '',
    stage: 'Prototype',
    upd: Date.now(),
    check: [
      { t: 'Define minimal testable version', d: 0 },
      { t: 'Gather required components and materials', d: 0 },
      { t: 'Conduct live test with at least 3 users', d: 0 },
      { t: 'Record user feedback and iterate', d: 0 }
    ]
  }, initialData);

  logActivity(`Created project: ${store.proj[id].name}`);
  saveStore();
  return id;
}

function viewBuildLab() {
  const projects = Object.values(store.proj).sort((a, b) => b.upd - a.upd);
  const eligibleSessions = Object.values(store.sess).filter(s => s.a && s.a.pick);

  return `
    <h1>Build Lab</h1>
    <p class="mut">Transform your verified ideas into structured, editable project plans and checklists.</p>

    <div class="row" style="margin-bottom:20px">
      <button class="btn" data-a="newp">+ New Blank Project Plan</button>
    </div>

    ${eligibleSessions.length ? `
      <h2>Create from a Completed Session Idea</h2>
      <div class="grid" style="margin-bottom:24px">
        ${eligibleSessions.map(s => `
          <button class="card k" data-a="mkp" data-v="${s.id}">
            <b>${esc(s.title)}</b>
            <div class="sm mut" style="margin-top:4px">Chosen Idea: ${esc(s.a.pick)}</div>
            <div class="sm" style="color:var(--pri-dark);margin-top:8px">Click to create project plan →</div>
          </button>
        `).join('')}
      </div>
    ` : ''}

    <h2>Your Project Plans</h2>
    ${projects.length ? `
      <div class="grid">
        ${projects.map(p => `
          <button class="card k" data-a="go" data-v="build/${p.id}">
            <b style="font-size:16px">${esc(p.name)}</b>
            <div class="sm mut" style="margin-top:6px">
              Stage: <b>${esc(p.stage)}</b> · ${p.check.filter(t => t.d).length}/${p.check.length} tasks completed
            </div>
            <div class="sm mut" style="margin-top:4px">Updated ${fmtDate(p.upd)}</div>
          </button>
        `).join('')}
      </div>
    ` : `
      <div class="card mut">
        No project plans yet. Finish Stage 7 of a problem session or click "+ New Blank Project Plan" above.
      </div>
    `}
  `;
}

function viewProjectDetail(projId) {
  const proj = store.proj[projId];
  if (!proj) {
    return `
      <div class="card">
        Project not found.
        <div style="margin-top:12px"><button class="btn g" data-a="go" data-v="build">Back to Build Lab</button></div>
      </div>
    `;
  }

  const field = (key, label, isTextarea = false) => `
    <label for="p_${key}" style="margin-top:10px;display:block">${esc(label)}</label>
    ${isTextarea ? `
      <textarea id="p_${key}" data-m="p.${key}">${esc(proj[key])}</textarea>
    ` : `
      <input type="text" id="p_${key}" data-m="p.${key}" value="${esc(proj[key])}">
    `}
  `;

  return `
    <div class="row sp np" style="margin-bottom:14px">
      <button class="chip" data-a="go" data-v="build">← Build Lab</button>
      <div class="row">
        <button class="btn g" data-a="psave">Save Project</button>
        <button class="btn g" data-a="print">🖨️ Print Summary</button>
      </div>
    </div>

    <h1 style="margin-bottom:6px">${esc(proj.name)}</h1>
    <div class="dis" style="margin-bottom:16px">Practical Action Plan & Build Specifications</div>

    <div class="card">
      ${field('name', 'Project Name')}
      ${field('sum', 'Summary Rationale', true)}
      ${field('prob', 'Problem Statement Addressed', true)}
      ${field('users', 'Target User Community', true)}
      ${field('sol', 'Core Solution Mechanism', true)}
      ${field('mat', 'Components, Tools & Materials', true)}

      <label for="p_bud" style="margin-top:10px;display:block">Estimated Budget (₹)</label>
      <input type="number" id="p_bud" min="0" data-m="p.bud" value="${esc(proj.bud)}">

      ${field('steps', 'Build Instructions & Step-by-Step Guide', true)}
      ${field('time', 'Timeline & Key Milestones', true)}
      ${field('risk', 'Risks & Mitigations', true)}
      ${field('test', 'Validation & Testing Method', true)}
      ${field('notes', 'Field Notes & Iterations', true)}

      <label for="p_stage" style="margin-top:10px;display:block">Current Stage</label>
      <select id="p_stage" data-m="p.stage">
        ${PROJECT_STAGES.map(s => `<option ${proj.stage === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>

    <h2>Action Checklist</h2>
    <div class="card">
      <div style="display:flex;flex-direction:column;gap:8px">
        ${proj.check.map((t, idx) => `
          <div class="row">
            <label class="row" style="font-weight:400;flex:1;cursor:pointer">
              <input type="checkbox" data-a="chk" data-v="${idx}" ${t.d ? 'checked' : ''}>
              <span style="${t.d ? 'text-decoration:line-through;color:var(--mut)' : ''}">${esc(t.t)}</span>
            </label>
            <button class="btn d np" data-a="rmc" data-v="${idx}" aria-label="Delete task">✕</button>
          </div>
        `).join('')}
      </div>

      <div class="row np" style="margin-top:14px">
        <input type="text" id="nt" placeholder="Add a new build task..." style="flex:1;margin:0">
        <button class="btn g" data-a="addt">+ Add Task</button>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// My Lab (Saved Work & Session Manager)
// -------------------------------------------------------------

let myLabFilter = 'All';
let myLabSearch = '';

function viewMyLab() {
  const allItems = [
    ...Object.values(store.sess).map(s => ({
      type: 'session',
      id: s.id,
      name: s.title,
      stage: s.fin ? 'Completed' : `Stage ${s.step + 1}/9`,
      updated: s.upd
    })),
    ...Object.values(store.proj).map(p => ({
      type: 'project',
      id: p.id,
      name: p.name,
      stage: p.stage,
      updated: p.upd
    }))
  ];

  const filtered = allItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(myLabSearch.toLowerCase());
    const matchesFilter = myLabFilter === 'All' || item.stage === myLabFilter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => b.updated - a.updated);

  return `
    <h1>My Lab</h1>
    <p class="mut">Your personal local workspace. All your problem analyses and project plans are safely stored here.</p>

    <input type="text" id="lq" data-m="f.lq" placeholder="Search saved sessions and project plans..." value="${esc(myLabSearch)}" style="margin-top:12px">

    <div style="margin:8px 0 16px">
      ${['All', ...PROJECT_STAGES].map(filter => `
        <button class="chip ${myLabFilter === filter ? 'on' : ''}" data-a="lf" data-v="${filter}">${filter}</button>
      `).join('')}
    </div>

    <div>
      ${filtered.length ? filtered.map(item => `
        <div class="card row sp" style="margin-bottom:10px">
          <div>
            <b>${esc(item.name)}</b>
            <div class="sm mut" style="margin-top:2px">
              ${item.type === 'session' ? 'Problem Session' : 'Project Plan'} · ${esc(item.stage)} · Updated ${fmtDate(item.updated)}
            </div>
          </div>
          <div class="row">
            <button class="btn" data-a="go" data-v="${item.type === 'session' ? 'solve' : 'build'}/${item.id}">Open</button>
            <button class="btn g" data-a="ren" data-v="${item.type[0]}${item.id}">Rename</button>
            <button class="btn g" data-a="dup" data-v="${item.type[0]}${item.id}">Duplicate</button>
            <button class="btn d" data-a="del" data-v="${item.type[0]}${item.id}">Delete</button>
          </div>
        </div>
      `).join('') : `
        <div class="card mut">
          No items found. Explore problems and begin a session to see your progress recorded here!
        </div>
      `}
    </div>
  `;
}

// -------------------------------------------------------------
// Settings & Profile View
// -------------------------------------------------------------

function viewSettings() {
  return `
    <h1>Settings & Profile</h1>
    <div class="card">
      <label for="nm">Display Name</label>
      <input type="text" id="nm" data-m="s.name" value="${esc(store.name)}">

      <label for="th">Theme Appearance</label>
      <select id="th" data-m="s.theme">
        <option value="auto" ${store.theme === 'auto' ? 'selected' : ''}>System Default</option>
        <option value="light" ${store.theme === 'light' ? 'selected' : ''}>Light Theme</option>
        <option value="dark" ${store.theme === 'dark' ? 'selected' : ''}>Dark Theme</option>
      </select>
    </div>

    <h2>About ProSolv & BLU</h2>
    <div class="card">
      <div class="row" style="gap:14px;align-items:flex-start">
        <img src="assets/logo-mark-ChcwWvj6.jpg" alt="ProSolv logo" style="height:56px;border-radius:12px">
        ${renderBluMascot('happy', 52)}
        <div style="flex:1">
          <p style="margin:0 0 8px;font-style:italic">
            "We don't want AI to think for students. We want AI to help students learn how to think."
          </p>
          <div class="sm mut">
            ProSolv guides you through a complete 9-stage engineering & design-thinking methodology to solve local and global problems.
          </div>
        </div>
      </div>
    </div>

    <h2>Local Storage & Data Reset</h2>
    <div class="card">
      <p class="sm mut" style="margin-top:0">
        All sessions, customized problems, and projects are preserved in your local browser storage.
      </p>
      <button class="btn d" data-a="reset">Clear All Local Data</button>
    </div>
  `;
}

// -------------------------------------------------------------
// Dedicated BLU Assistant View
// -------------------------------------------------------------

function viewBluAssistant() {
  return `
    <div class="hero">
      ${renderBluMascot('cheer', 80)}
      <div>
        <h1 style="margin:0 0 6px">Meet BLU — Your AI Problem-Solving Guide</h1>
        <p style="margin:0">BLU is designed to ask clarifying questions, challenge assumptions, and help you systematically navigate the 9-step analysis.</p>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <h3>How BLU Helps You:</h3>
      <ul style="line-height:1.7;padding-left:20px">
        <li><b>Root Cause Identification:</b> Distinguish surface symptoms from deep structural issues.</li>
        <li><b>Resource & Constraint Mapping:</b> Ground your ideas in practical local realities.</li>
        <li><b>Trade-off Comparison:</b> Balance feasibility, financial cost, accessibility, and long-term sustainability.</li>
        <li><b>Actionable Prototyping:</b> Convert concepts into immediate steps in the Build Lab.</li>
      </ul>
      <div style="margin-top:16px">
        <button class="btn" data-a="go" data-v="explore">Start a Problem Analysis with BLU →</button>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Router & Navigation Handler
// -------------------------------------------------------------

const NAV_TABS = [
  ['home', 'Home', '🏠'],
  ['explore', 'Explore', '🔎'],
  ['build', 'Build Lab', '🛠️'],
  ['lab', 'My Lab', '🧪'],
  ['blu', 'BLU AI', '🤖']
];

function renderNav() {
  const hash = location.hash.slice(2);
  const [route] = hash.split('/');
  const activeTab = (route === 'problem' || route === 'solve') ? 'explore' : (route || 'home');

  const navEl = $('#nav');
  if (navEl) {
    navEl.innerHTML = NAV_TABS.map(([id, label, icon]) => `
      <a href="#/${id}" class="${activeTab === id ? 'on' : ''}" ${activeTab === id ? 'aria-current="page"' : ''}>
        <span aria-hidden="true">${icon}</span> ${label}
      </a>
    `).join('');
  }

  const profileNameEl = $('#pn');
  if (profileNameEl) profileNameEl.textContent = store.name;

  document.documentElement.dataset.theme = store.theme === 'auto' ? '' : store.theme;
}

function renderApp() {
  renderNav();
  const rawHash = location.hash.replace(/^#\/?/, '');
  const [route = 'home', param = ''] = rawHash.split('/');

  const routes = {
    home: viewHome,
    explore: viewExplore,
    problem: () => viewProblemDetail(param),
    solve: () => viewSolveSession(param),
    build: () => param ? viewProjectDetail(param) : viewBuildLab(),
    lab: viewMyLab,
    settings: viewSettings,
    blu: viewBluAssistant
  };

  const appEl = $('#app');
  if (appEl) {
    appEl.innerHTML = (routes[route] || viewHome)();
    window.scrollTo(0, 0);
  }
}

window.addEventListener('hashchange', renderApp);

// -------------------------------------------------------------
// User Action Handlers (Delegated Clicks & Inputs)
// -------------------------------------------------------------

function startSessionForProblem(problemId) {
  const prob = getProblem(problemId);
  const id = uid();
  store.sess[id] = {
    id,
    pid: problemId,
    title: prob ? prob.t : 'Custom Problem',
    step: 0,
    fin: 0,
    upd: Date.now(),
    a: {
      ideas: ['', '', ''],
      causes: [],
      res: [],
      rate: {},
      w: { f: 1, c: 1, i: 1, a: 1, s: 1 }
    }
  };
  logActivity(`Started analysis: ${store.sess[id].title}`);
  saveStore();
  location.hash = `#/solve/${id}`;
}

const ACTION_MAP = {
  go: data => {
    location.hash = `#/${data.v}`;
  },

  dom: data => {
    filterState.d = data.v;
    location.hash = '#/explore';
    renderApp();
  },

  start: data => {
    startSessionForProblem(data.v);
  },

  cust: () => {
    const title = $('#ct')?.value.trim();
    const desc = $('#cd')?.value.trim();
    const domain = $('#cdm')?.value;
    const errEl = $('#ce');

    if (!title || title.length < 6) {
      if (errEl) errEl.textContent = 'Please provide a clear title (at least 6 characters).';
      return;
    }
    if (!desc || desc.length < 15) {
      if (errEl) errEl.textContent = 'Please describe the problem in a bit more detail (at least 15 characters).';
      return;
    }

    const customId = 'c' + uid();
    store.cust.push({
      id: customId,
      d: domain,
      t: title,
      s: desc,
      causes: [],
      people: '',
      ideas: [],
      df: 'Custom',
      ty: 'Custom',
      cost: 1000,
      tags: ['custom']
    });

    saveStore();
    showToast('Problem saved! Launching 9-step analysis...');
    startSessionForProblem(customId);
  },

  stage: data => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.step = Math.max(0, Math.min(8, Number(data.v)));
      session.upd = Date.now();
      saveStore();
      renderApp();
    }
  },

  hint: () => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      const key = sessionId + '-' + session.step;
      nudgeIndexMap[key] = (nudgeIndexMap[key] || 0) + 1;
      renderApp();
    }
  },

  ans: () => {
    const el = $('#blu-answer-box');
    if (el) {
      el.innerHTML = `
        <div class="bub" style="background:var(--card);border:1px solid var(--bd)">
          <b>BLU says:</b> "Answers you earn through your own reasoning stick forever! Try one more nudge, write your best hypothesis, and we will stress-test it together."
        </div>
      `;
    }
  },

  askblu: async () => {
    const input = $('#live-chat-input');
    const replyEl = $('#live-chat-reply');
    if (!input || !input.value.trim() || !replyEl) return;
    const query = input.value.trim();
    replyEl.innerHTML = `<div class="sm mut">BLU is thinking…</div>`;

    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    const problem = session ? getProblem(session.pid) : null;

    try {
      const res = await fetch('/api/blu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: problem ? {
            id: problem.id,
            title: problem.t,
            description: problem.s,
            people: problem.people,
            why: session.a?.why || '',
            challenges: problem.causes || []
          } : null,
          history: [],
          message: query
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'AI assistance unavailable.');
      replyEl.innerHTML = `
        <div class="live-msg assistant" style="margin-top:6px">
          <b>BLU:</b> ${esc(data.reply)}
        </div>
      `;
    } catch (e) {
      // Graceful intelligent fallback if server key is not set
      const stageName = session ? STAGE_NAMES[session.step] : 'Problem Solving';
      replyEl.innerHTML = `
        <div class="live-msg assistant" style="margin-top:6px">
          <b>BLU Guidance for ${stageName}:</b> Focus on what you can verify locally. Break "${esc(query)}" down into its simplest moving parts, and test each assumption with real people!
        </div>
      `;
    }
  },

  cause: data => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.a.causes = session.a.causes || [];
      const idx = session.a.causes.indexOf(data.v);
      if (idx < 0) {
        session.a.causes.push(data.v);
      } else {
        session.a.causes.splice(idx, 1);
      }
      saveStore();
      renderApp();
    }
  },

  addc: () => {
    const input = $('#nc');
    const val = input?.value.trim();
    if (!val) return;
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.a.causes = session.a.causes || [];
      if (!session.a.causes.includes(val)) {
        session.a.causes.push(val);
      }
      saveStore();
      renderApp();
    }
  },

  res: data => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.a.res = session.a.res || [];
      const idx = session.a.res.indexOf(data.v);
      if (idx < 0) {
        session.a.res.push(data.v);
      } else {
        session.a.res.splice(idx, 1);
      }
      saveStore();
      renderApp();
    }
  },

  addi: () => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.a.ideas = session.a.ideas || [];
      session.a.ideas.push('');
      saveStore();
      renderApp();
    }
  },

  rmi: data => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.a.ideas = session.a.ideas || [];
      session.a.ideas.splice(Number(data.v), 1);
      saveStore();
      renderApp();
    }
  },

  spark: () => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    const prob = session ? getProblem(session.pid) : null;
    const box = $('#sp');
    if (!box) return;
    const sampleIdeas = (prob && prob.ideas && prob.ideas.length) ? prob.ideas : [
      'Low-cost DIY approach with recycled materials',
      'Community volunteer roster or peer sharing system',
      'Lightweight digital or SMS-based notification alert'
    ];

    box.innerHTML = `
      <div class="bub sm">
        <b>Sample Directions to Inspire You (Adapt to your context):</b><br>
        ${sampleIdeas.map(i => `• ${esc(i)}`).join('<br>')}
      </div>
    `;
  },

  pick: data => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.a.pick = data.v;
      saveStore();
    }
  },

  ssave: () => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.upd = Date.now();
      saveStore();
      showToast('Session saved successfully!');
    }
  },

  sexit: () => {
    ACTION_MAP.ssave();
    location.hash = '#/lab';
  },

  finish: () => {
    const sessionId = location.hash.split('/')[2];
    const session = store.sess[sessionId];
    if (session) {
      session.fin = 1;
      session.upd = Date.now();
      logActivity(`Completed 9-step analysis: ${session.title}`);
      saveStore();
      openModal(`
        <h3 style="margin-top:0">🎉 Congratulations! Analysis Complete</h3>
        <p>You have navigated all 9 steps of problem analysis. Would you like to turn your solution into a Build Lab project plan?</p>
        <div class="row" style="margin-top:16px">
          <button class="btn" data-a="mkp" data-v="${session.id}">Open in Build Lab 🛠️</button>
          <button class="btn g" data-a="mno">View in My Lab</button>
        </div>
      `);
    }
  },

  mkproj: () => {
    const sessionId = location.hash.split('/')[2];
    ACTION_MAP.mkp({ v: sessionId });
  },

  mkp: data => {
    closeModal();
    const session = store.sess[data.v];
    const prob = session ? getProblem(session.pid) || {} : {};
    const ans = session ? session.a || {} : {};

    const projId = createNewProject({
      name: `${ans.pick || session.title} Plan`,
      sum: ans.reason || '',
      prob: session.title + (prob.s ? `: ${prob.s}` : ''),
      users: ans.people || prob.people || '',
      sol: ans.pick || '',
      bud: prob.cost || 1500,
      steps: ans.plan || '',
      risk: ans.risk || '',
      test: (ans.success || '') + (ans.test ? `\nTest Plan:\n${ans.test}` : ''),
      stage: 'Prototype',
      sid: session.id
    });

    location.hash = `#/build/${projId}`;
    showToast('Project plan created in Build Lab!');
  },

  newp: () => {
    const newId = createNewProject();
    location.hash = `#/build/${newId}`;
  },

  psave: () => {
    const projId = location.hash.split('/')[2];
    const proj = store.proj[projId];
    if (proj) {
      proj.upd = Date.now();
      saveStore();
      showToast('Project plan saved!');
    }
  },

  print: () => {
    window.print();
  },

  chk: data => {
    const projId = location.hash.split('/')[2];
    const proj = store.proj[projId];
    if (proj && proj.check[Number(data.v)]) {
      proj.check[Number(data.v)].d = proj.check[Number(data.v)].d ? 0 : 1;
      proj.upd = Date.now();
      saveStore();
      renderApp();
    }
  },

  rmc: data => {
    const projId = location.hash.split('/')[2];
    const proj = store.proj[projId];
    if (proj) {
      proj.check.splice(Number(data.v), 1);
      proj.upd = Date.now();
      saveStore();
      renderApp();
    }
  },

  addt: () => {
    const input = $('#nt');
    const val = input?.value.trim();
    if (!val) return;
    const projId = location.hash.split('/')[2];
    const proj = store.proj[projId];
    if (proj) {
      proj.check.push({ t: val, d: 0 });
      proj.upd = Date.now();
      saveStore();
      renderApp();
    }
  },

  lf: data => {
    myLabFilter = data.v;
    renderApp();
  },

  ren: data => {
    const type = data.v[0];
    const id = data.v.slice(1);
    const item = type === 's' ? store.sess[id] : store.proj[id];
    if (!item) return;
    const currentName = type === 's' ? item.title : item.name;

    promptModal('Enter new title', currentName, () => {
      const input = $('#modal-input');
      const newName = input?.value.trim();
      if (newName) {
        if (type === 's') item.title = newName;
        else item.name = newName;
        item.upd = Date.now();
        saveStore();
        renderApp();
        showToast('Renamed successfully!');
      }
    });
  },

  dup: data => {
    const type = data.v[0];
    const id = data.v.slice(1);
    const item = type === 's' ? store.sess[id] : store.proj[id];
    if (!item) return;
    const copy = JSON.parse(JSON.stringify(item));
    const newId = uid();
    copy.id = newId;
    copy.upd = Date.now();

    if (type === 's') {
      copy.title = `${copy.title} (Copy)`;
      copy.fin = 0;
      store.sess[newId] = copy;
    } else {
      copy.name = `${copy.name} (Copy)`;
      store.proj[newId] = copy;
    }
    saveStore();
    renderApp();
    showToast('Duplicated!');
  },

  del: data => {
    confirmModal('Are you sure you want to delete this item? This action cannot be undone.', () => {
      const type = data.v[0];
      const id = data.v.slice(1);
      if (type === 's') delete store.sess[id];
      else delete store.proj[id];
      saveStore();
      renderApp();
      showToast('Deleted');
    });
  },

  reset: () => {
    confirmModal('Clear ALL local data, custom problems, and sessions?', () => {
      store = JSON.parse(JSON.stringify(DEFAULT_STATE));
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      location.hash = '#/home';
      renderApp();
      showToast('All local data cleared.');
    });
  },

  mok: () => {
    const cb = activeModalCb;
    closeModal();
    if (cb) cb();
  },

  mno: () => {
    closeModal();
  }
};

// Delegated Event Listeners
document.addEventListener('click', e => {
  const target = e.target.closest('[data-a]');
  if (target && ACTION_MAP[target.dataset.a]) {
    e.preventDefault();
    ACTION_MAP[target.dataset.a](target.dataset);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// Settings button in header
document.addEventListener('click', e => {
  if (e.target.closest('#btn-settings')) {
    e.preventDefault();
    location.hash = '#/settings';
  }
});

// Live Input Mutation Handler
function handleInputMutation(target) {
  const model = target.dataset.m;
  if (!model) return;
  const val = target.type === 'checkbox' ? target.checked : target.value;
  const [scope, ...rest] = model.split('.');
  const prop = rest.join('.');
  const hashId = location.hash.split('/')[2];

  if (scope === 'f') {
    if (prop === 'lq') myLabSearch = val;
    else filterState[prop] = val;

    if (prop === 'q') {
      const container = $('#problem-list-container');
      if (container) container.innerHTML = filterProblems();
    } else if (prop === 'lq') {
      renderApp();
      const el = $('#lq');
      if (el) {
        el.focus();
        el.setSelectionRange(val.length, val.length);
      }
    } else {
      renderApp();
    }
    return;
  }

  if (scope === 's') {
    store[prop] = val;
    if (prop === 'theme' || prop === 'name') renderApp();
    saveStore();
    return;
  }

  if (scope === 'p') {
    const proj = store.proj[hashId];
    if (proj) {
      proj[prop] = val;
      proj.upd = Date.now();
      saveStore();
      if (prop === 'name') {
        const titleEl = document.querySelector('h1');
        if (titleEl) titleEl.textContent = val;
      }
    }
    return;
  }

  const session = store.sess[hashId];
  if (!session) return;
  const ans = session.a;

  if (scope === 'a') {
    ans[prop] = val;
  } else if (scope === 'i') {
    ans.ideas[Number(prop)] = val;
  } else if (scope === 'w') {
    ans.w = ans.w || {};
    ans.w[prop] = Number(val);
    updateScorePills(ans);
  } else if (scope === 'r') {
    const [idea, criterion] = prop.split('|');
    ans.rate[idea] = ans.rate[idea] || { f: 3, c: 3, i: 3, a: 3, s: 3 };
    ans.rate[idea][criterion] = Number(val);
    updateScorePills(ans);
  }

  session.upd = Date.now();
  saveStore();
}

function updateScorePills(ans) {
  document.querySelectorAll('[data-sc]').forEach(el => {
    el.textContent = calculateWeightedScore(ans, el.dataset.sc);
  });
}

document.addEventListener('input', e => {
  if (e.target.type !== 'radio') handleInputMutation(e.target);
});

document.addEventListener('change', e => {
  if (e.target.tagName === 'SELECT') handleInputMutation(e.target);
});

// App Bootstrap
if (!location.hash) location.hash = '#/home';
renderApp();
