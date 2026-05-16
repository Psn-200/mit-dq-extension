// popup.js

const $ = id => document.getElementById(id);

const WEEK_SCHEDULE = [
    { week:1, dqDeadline:'2026-05-08T18:14:00Z', dqCutoff:'2026-05-11T18:14:00Z', assessDeadline:'2026-05-10T18:14:00Z', assessCutoff:'2026-05-13T18:14:00Z' },
    { week:2, dqDeadline:'2026-05-15T18:14:00Z', dqCutoff:'2026-05-18T18:14:00Z', assessDeadline:'2026-05-17T18:14:00Z', assessCutoff:'2026-05-20T18:14:00Z' },
    { week:3, dqDeadline:'2026-05-22T18:14:00Z', dqCutoff:'2026-05-25T18:14:00Z', assessDeadline:'2026-05-24T18:14:00Z', assessCutoff:'2026-05-27T18:14:00Z' },
    { week:4, dqDeadline:'2026-05-29T18:14:00Z', dqCutoff:'2026-06-01T18:14:00Z', assessDeadline:'2026-05-31T18:14:00Z', assessCutoff:'2026-06-03T18:14:00Z' },
    { week:5, dqDeadline:'2026-06-05T18:14:00Z', dqCutoff:'2026-06-08T18:14:00Z', assessDeadline:'2026-06-07T18:14:00Z', assessCutoff:'2026-06-10T18:14:00Z' },
    { week:6, dqDeadline:'2026-06-12T18:14:00Z', dqCutoff:'2026-06-15T18:14:00Z', assessDeadline:'2026-06-14T18:14:00Z', assessCutoff:'2026-06-17T18:14:00Z' },
    { week:7, dqDeadline:'2026-06-19T18:14:00Z', dqCutoff:'2026-06-22T18:14:00Z', assessDeadline:'2026-06-21T18:14:00Z', assessCutoff:'2026-06-24T18:14:00Z' },
    { week:8, dqDeadline:'2026-06-26T18:14:00Z', dqCutoff:'2026-06-29T18:14:00Z', assessDeadline:'2026-06-28T18:14:00Z', assessCutoff:'2026-07-01T18:14:00Z' },
];

function autoDetectWeek() {
    const starts = ['2026-05-04','2026-05-11','2026-05-18','2026-05-25',
                    '2026-06-01','2026-06-08','2026-06-15','2026-06-22'].map(d => new Date(d).getTime());
    const now = Date.now();
    let week = 1;
    for (let i = 0; i < starts.length; i++) { if (now >= starts[i]) week = i + 1; }
    return week;
}

function parseMoodleDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const m = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    const [, day, month, year, rawHour, min, ampm] = m;
    const monthIdx = months[month.substring(0,3).toLowerCase()];
    if (monthIdx === undefined) return null;
    let hour = parseInt(rawHour);
    if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    return new Date(Date.UTC(parseInt(year), monthIdx, parseInt(day), hour, parseInt(min)) - 345 * 60000);
}

function calcLatePenalty(dateStr, submissionType, weekNum) {
    const empty = { daysLate: 0, pct: 0, status: 'on-time', note: '' };
    if (!dateStr || !submissionType || !weekNum) return empty;
    const week = WEEK_SCHEDULE.find(w => w.week === weekNum);
    if (!week) return empty;
    const submitted = parseMoodleDate(dateStr);
    if (!submitted) return { ...empty, status: 'unknown', note: 'Could not parse submission date' };
    const deadline = new Date(submissionType === 'dq' ? week.dqDeadline : week.assessDeadline);
    const cutoff   = new Date(submissionType === 'dq' ? week.dqCutoff   : week.assessCutoff);
    if (submitted <= deadline) return empty;
    if (submitted > cutoff) return { daysLate: 4, pct: 100, status: 'past-cutoff', note: 'Submitted after 3-day grace period — not accepted' };
    const daysLate = Math.min(3, Math.ceil((submitted.getTime() - deadline.getTime()) / 86400000));
    return { daysLate, pct: daysLate * 10, status: 'late', note: `${daysLate} day${daysLate > 1 ? 's' : ''} late — ${daysLate * 10}% deduction` };
}

const PROVIDERS = {
    heuristics: {
        label: null,
        placeholder: '',
        defaultModel: '',
        hint: 'Instant scoring — word count, APA regex, reply count. No AI, no key. Best for a quick first pass.',
        hintClass: 'green',
        validate: () => true,
        needsKey: false,
        needsModel: false
    },
    'chrome-ai': {
        label: null,
        placeholder: '',
        defaultModel: 'Gemini Nano',
        hint: 'Uses Gemini Nano already installed in Chrome 127+. No key, no download, runs on-device.',
        hintClass: 'green',
        validate: () => true,
        needsKey: false,
        needsModel: false
    },
    gemini: {
        label: 'Google Gemini API Key',
        placeholder: 'AIza...',
        defaultModel: 'gemini-1.5-flash',
        hint: 'Free — 1,500 req/day. Get key at ai.google.dev',
        hintClass: 'green',
        validate: k => k.startsWith('AIza') && k.length > 20,
        needsKey: true,
        needsModel: true
    },
    groq: {
        label: 'Groq API Key',
        placeholder: 'gsk_...',
        defaultModel: 'llama-3.3-70b-versatile',
        hint: 'Free tier — fast Llama 3. Get key at console.groq.com',
        hintClass: 'green',
        validate: k => k.startsWith('gsk_') && k.length > 20,
        needsKey: true,
        needsModel: true
    },
    ollama: {
        label: null,
        placeholder: '',
        defaultModel: 'llama3.2',
        hint: 'No key needed. Run: ollama serve  (ollama.com)',
        hintClass: '',
        validate: () => true,
        needsKey: false,
        needsModel: true
    },
    anthropic: {
        label: 'Anthropic API Key',
        placeholder: 'sk-ant-...',
        defaultModel: 'claude-sonnet-4-6',
        hint: 'Paid. Get key at console.anthropic.com',
        hintClass: 'yellow',
        validate: k => k.startsWith('sk-ant-') && k.length > 20,
        needsKey: true,
        needsModel: true
    },
    custom: {
        label: 'API Key',
        placeholder: 'sk-...',
        defaultModel: 'gpt-4o-mini',
        hint: 'Any OpenAI-compatible API. Set base URL above.',
        hintClass: '',
        validate: k => k.length > 5,
        needsKey: true,
        needsModel: true
    }
};

const weightInputs = ['w_quality', 'w_figures', 'w_replies', 'w_writing'];

function calcTotal() {
    const total = weightInputs.reduce((s, id) => s + (parseInt($(id).value) || 0), 0);
    $('totalPts').textContent = total;
    $('totalDisplay').textContent = total + ' pts';
    $('totalDisplay').style.color = total === 100 ? '#4f8ef7' : '#f87171';
    return total;
}

weightInputs.forEach(id => $(id).addEventListener('input', calcTotal));

function applyProvider(name, keepModel) {
    const p = PROVIDERS[name] || PROVIDERS.gemini;

    $('apiKeyField').style.display   = p.needsKey   ? 'block' : 'none';
    $('modelField').style.display    = p.needsModel ? 'block' : 'none';
    $('customUrlField').style.display = name === 'custom' ? 'block' : 'none';

    if (p.needsKey) {
        $('apiKeyLabel').textContent = p.label;
        $('apiKey').placeholder      = p.placeholder;
    }
    if (p.needsModel && !keepModel) {
        $('modelName').value       = p.defaultModel;
        $('modelName').placeholder = p.defaultModel;
    }

    const hint = $('providerHint');
    hint.textContent = p.hint;
    hint.className   = 'hint' + (p.hintClass ? ' ' + p.hintClass : '');
}

$('provider').addEventListener('change', () => {
    applyProvider($('provider').value, false);
    chrome.storage.local.set({ provider: $('provider').value });
});

['modelName', 'customUrl', 'apiKey', 'submissionType', 'weekNumber'].forEach(id => {
    $(id).addEventListener('change', () => {
        chrome.storage.local.set({ [id]: $(id).value.trim() });
    });
});

// Load saved settings
chrome.storage.local.get(
    ['apiKey', 'provider', 'modelName', 'customUrl', 'weights', 'aiDeduct', 'minReplies', 'submissionType', 'weekNumber'],
    (data) => {
        if (data.provider) $('provider').value = data.provider;
        applyProvider($('provider').value, false);
        if (data.apiKey)    $('apiKey').value    = data.apiKey;
        if (data.customUrl) $('customUrl').value = data.customUrl;
        if (data.modelName) { $('modelName').value = data.modelName; }
        if (data.weights) {
            weightInputs.forEach(id => { if (data.weights[id] !== undefined) $(id).value = data.weights[id]; });
        }
        if (data.aiDeduct   !== undefined) $('aiDeduct').value   = data.aiDeduct;
        if (data.minReplies !== undefined) $('minReplies').value = data.minReplies;
        if (data.submissionType) $('submissionType').value = data.submissionType;
        if (data.weekNumber)     $('weekNumber').value     = data.weekNumber;
        calcTotal();
    }
);

function setStatus(msg, type = 'info') {
    const el = $('statusMsg');
    el.textContent = msg;
    el.className   = 'status ' + type;
}

function setProgress(pct) {
    $('progressBar').className    = 'progress-bar active';
    $('progressFill').style.width = pct + '%';
    if (pct >= 100) setTimeout(() => $('progressBar').className = 'progress-bar', 900);
}

// ── Build grading prompt (shared between LLM providers and Chrome AI) ────────
function buildGradingPrompt(author, answer, replies, weights, minReplies, apaMatches, hasFigures, hasReferences) {
    const replyLines = replies.map((r, i) =>
        `  Reply ${i + 1} → "${r.body.substring(0, 300)}"`
    ).join('\n') || '  None';

    return `Grade this student's Moodle discussion post. Return ONLY valid JSON, no markdown.

STUDENT: ${author}
MIN PEER REPLIES REQUIRED: ${minReplies}

ANSWER:
${answer.body}

PEER REPLIES (${replies.length}):
${replyLines}

DETECTED: images=${hasFigures}, APA citations=${apaMatches.length}, reference list=${hasReferences}

Return JSON:
{"quality":0-${weights.w_quality},"figures":0-${weights.w_figures},"replies":0-${weights.w_replies},"writing":0-${weights.w_writing},"aiDetected":true/false,"aiConfidence":"low|medium|high","aiReason":"","apaScore":"none|poor|fair|good","apaDetails":"","figureDetails":"","peerRepliesMet":true/false,"peerReplyBreakdown":[{"repliedTo":"","quality":"generic|substantive","summary":""}],"peerComment":"","contentComment":"","apaComment":"","figureComment":"","feedback":"","copiedContent":false,"plagiarismNote":""}`;
}

// ── Chrome AI grading (runs in popup context, not background) ────────────────
async function gradeWithChromeAI(posts, weights, aiDeduct, minReplies) {
    if (!window.ai?.languageModel) {
        throw new Error('Chrome AI not available. Requires Chrome 127+ with AI features enabled.');
    }

    const caps = await window.ai.languageModel.capabilities();
    if (caps.available === 'no') {
        throw new Error('Gemini Nano not available on this device. Try a different provider.');
    }

    const session = await window.ai.languageModel.create({
        systemPrompt: 'You are an academic instructor grading forum discussion posts. Always respond with valid JSON only.',
        temperature: 0.2
    });

    const studentPosts = posts.filter(p => p.idx > 0 || posts.length === 1);
    const byAuthor = {};
    studentPosts.forEach(p => {
        if (!byAuthor[p.author]) byAuthor[p.author] = { answer: null, replies: [] };
        if (p.isAnswer)                       byAuthor[p.author].answer = p;
        else if (p.isPeerReply)               byAuthor[p.author].replies.push(p);
        else if (!byAuthor[p.author].answer)  byAuthor[p.author].answer = p;
    });

    const grades = [];
    for (const [author, data] of Object.entries(byAuthor)) {
        if (!data.answer) continue;

        const text      = data.answer.body;
        const apaMatches  = text.match(/\([A-Z][a-zA-Z\-]+(?:\s+et\s+al\.)?,\s+\d{4}\)/g) || [];
        const hasFigures  = (data.answer.images || 0) > 0 || /\b(figure|table|chart|graph|diagram)\b/i.test(text);
        const hasRefs     = apaMatches.length > 0 || /\b(references|bibliography)\b/i.test(text);

        try {
            const prompt = buildGradingPrompt(author, data.answer, data.replies, weights, minReplies, apaMatches, hasFigures, hasRefs);
            const raw    = await session.prompt(prompt);
            const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

            const base  = (parsed.quality||0)+(parsed.figures||0)+(parsed.replies||0)+(parsed.writing||0);
            const ded   = (parsed.aiDetected && parsed.aiConfidence !== 'low') ? aiDeduct : 0;
            const score = Math.max(0, Math.min(100, Math.round(base - ded)));

            grades.push({
                author, finalScore: score,
                submissionDate: data.answer.date || '',
                grade: letterGrade(score),
                gradingMode: 'chrome-ai',
                breakdown: { quality: parsed.quality||0, figures: parsed.figures||0, replies: parsed.replies||0, writing: parsed.writing||0 },
                aiDetected: parsed.aiDetected && parsed.aiConfidence !== 'low',
                aiConfidence: parsed.aiConfidence||'low', aiReason: parsed.aiReason||'', aiDeduction: ded,
                apaScore: parsed.apaScore||'none', apaDetails: parsed.apaDetails||'', figureDetails: parsed.figureDetails||'',
                peerRepliesMet: parsed.peerRepliesMet||false, peerReplyBreakdown: parsed.peerReplyBreakdown||[],
                peerComment: parsed.peerComment||'', contentComment: parsed.contentComment||'',
                apaComment: parsed.apaComment||'', figureComment: parsed.figureComment||'',
                feedback: parsed.feedback||'', copiedContent: parsed.copiedContent||false, plagiarismNote: parsed.plagiarismNote||'',
                hasFigures, hasReferences: hasRefs, referenceCount: apaMatches.length,
                peerRepliesMade: data.replies.length,
                repliedToList: data.replies.map(r => r.repliedTo).flat().filter(Boolean),
                minReplies
            });
        } catch (e) {
            grades.push({ author, finalScore: 0, grade: 'F', gradingMode: 'chrome-ai',
                submissionDate: data.answer.date || '',
                breakdown: {quality:0,figures:0,replies:0,writing:0},
                feedback: 'Chrome AI parse error: ' + e.message,
                aiDetected:false, aiDeduction:0, peerRepliesMade: data.replies.length,
                peerRepliesMet:false, peerReplyBreakdown:[], minReplies,
                apaScore:'none', apaDetails:'', figureDetails:'',
                peerComment:'', contentComment:'', apaComment:'', figureComment:'',
                copiedContent:false, plagiarismNote:'',
                hasFigures:false, hasReferences:false, referenceCount:0, repliedToList:[]
            });
        }
    }

    session.destroy();
    return { grades };
}

function letterGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

// ── Grade button ──────────────────────────────────────────────────────────────
$('gradeBtn').addEventListener('click', async () => {
    const provider   = $('provider').value;
    const apiKey     = $('apiKey').value.trim();
    const modelName  = $('modelName').value.trim() || (PROVIDERS[provider]?.defaultModel || '');
    const customUrl  = $('customUrl').value.trim();
    const p          = PROVIDERS[provider] || PROVIDERS.gemini;

    if (p.needsKey) {
        if (!apiKey) { setStatus('Enter an API key for ' + provider, 'error'); return; }
        if (!p.validate(apiKey)) { setStatus('API key format looks wrong — double-check it.', 'error'); return; }
    }
    if (provider === 'custom' && !customUrl) {
        setStatus('Enter the API base URL for your custom provider.', 'error'); return;
    }

    const total = calcTotal();
    if (total !== 100) { setStatus('Rubric weights must total exactly 100 pts', 'error'); return; }

    const weights    = {};
    weightInputs.forEach(id => weights[id] = parseInt($(id).value));
    const aiDeduct   = parseInt($('aiDeduct').value)   || 20;
    const minReplies = parseInt($('minReplies').value)  || 2;

    chrome.storage.local.set({ apiKey, provider, modelName, customUrl, weights, aiDeduct, minReplies });

    $('gradeBtn').disabled = true;
    setStatus('Scraping forum posts…', 'info');
    setProgress(10);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject content script + CSS if not yet loaded in this tab (e.g. after extension update)
    async function ensureContentScript(tabId) {
        return new Promise(resolve => {
            chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_FORUM' }, r => {
                if (!chrome.runtime.lastError && r) { resolve(r); return; }
                // Not loaded — inject programmatically then retry once
                chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
                    chrome.scripting.insertCSS({ target: { tabId }, files: ['overlay.css'] }, () => {});
                    if (chrome.runtime.lastError) { resolve(null); return; }
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, { action: 'SCRAPE_FORUM' }, r2 => {
                            resolve(chrome.runtime.lastError ? null : r2);
                        });
                    }, 300);
                });
            });
        });
    }

    const response = await ensureContentScript(tab.id);
    if (!response) {
            setStatus('Could not read forum. Open the Moodle discussion page and try again.', 'error');
            $('gradeBtn').disabled = false; return;
        }
        if (!response.posts || response.posts.length === 0) {
            setStatus('No posts found on this page.', 'error');
            $('gradeBtn').disabled = false; return;
        }

        const posts = response.posts;
        const label = provider === 'heuristics' ? 'heuristics engine'
                    : provider === 'chrome-ai'  ? 'Chrome Gemini Nano'
                    : modelName;

        setStatus(`Found ${posts.length} posts — grading with ${label}…`, 'info');
        setProgress(30);

        // ── Heuristics: background handles it ─────────────────────────────
        if (provider === 'heuristics') {
            chrome.runtime.sendMessage(
                { action: 'GRADE_HEURISTICS', posts, weights, minReplies },
                (result) => finish(result, tab)
            );
            return;
        }

        // ── Chrome AI: handled in popup context (has window.ai) ───────────
        if (provider === 'chrome-ai') {
            try {
                const result = await gradeWithChromeAI(posts, weights, aiDeduct, minReplies);
                finish(result, tab);
            } catch (e) {
                setStatus(e.message, 'error');
                $('gradeBtn').disabled = false;
            }
            return;
        }

        // ── All other providers: background.js handles it ─────────────────
        chrome.runtime.sendMessage(
            { action: 'GRADE_POSTS', posts, weights, aiDeduct, minReplies, apiKey, provider, modelName, customUrl },
            (result) => finish(result, tab)
        );
});

function finish(result, tab) {
    if (result && result.error) {
        setStatus(result.error, 'error');
        $('gradeBtn').disabled = false;
        return;
    }
    // Apply late submission penalties
    const subType  = $('submissionType').value;
    const rawWeek  = $('weekNumber').value;
    const weekNum  = rawWeek === 'auto' ? autoDetectWeek() : parseInt(rawWeek);
    result.grades.forEach(g => {
        const late = calcLatePenalty(g.submissionDate || '', subType, weekNum);
        g.lateSubmission = late;
        if (late.status === 'past-cutoff') {
            g.latePenaltyPts = g.finalScore;
            g.finalScore = 0;
            g.grade = letterGrade(0);
        } else if (late.status === 'late') {
            g.latePenaltyPts = Math.round(g.finalScore * late.pct / 100);
            g.finalScore = Math.max(0, g.finalScore - g.latePenaltyPts);
            g.grade = letterGrade(g.finalScore);
        } else {
            g.latePenaltyPts = 0;
        }
    });
    setProgress(100);
    setStatus(`Graded ${result.grades.length} students successfully!`, 'success');
    $('gradeBtn').disabled = false;
    chrome.storage.local.set({ grades: result.grades }, () => {
        chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY', grades: result.grades });
    });
}

// ── Dashboard ────────────────────────────────────────────────────────────────
$('showOverlay').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.storage.local.get(['grades'], (data) => {
        if (!data.grades) { setStatus('Grade first, then open the dashboard.', 'error'); return; }
        chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY', grades: data.grades });
        window.close();
    });
});

// ── Export CSV ───────────────────────────────────────────────────────────────
$('exportCSV').addEventListener('click', () => {
    chrome.storage.local.get(['grades'], (data) => {
        if (!data.grades) { setStatus('Grade first, then export.', 'error'); return; }
        chrome.runtime.sendMessage({ action: 'EXPORT_CSV', grades: data.grades });
        window.close();
    });
});

// ── Export Posts JSON (for local Python grader) ───────────────────────────────
$('exportPosts').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_FORUM' }, (response) => {
        if (chrome.runtime.lastError || !response?.posts?.length) {
            setStatus('Open a Moodle discussion page first, then export.', 'error'); return;
        }
        const metadata = { url: tab.url, title: tab.title };
        chrome.runtime.sendMessage({ action: 'EXPORT_POSTS', posts: response.posts, metadata });
        setStatus(`Exported ${response.posts.length} posts as JSON.`, 'success');
    });
});
