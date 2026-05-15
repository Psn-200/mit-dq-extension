// popup.js

const $ = id => document.getElementById(id);

const PROVIDERS = {
    gemini: {
        label: 'Google Gemini API Key',
        placeholder: 'AIza...',
        defaultModel: 'gemini-1.5-flash',
        hint: 'Free — 1,500 req/day. Get key at ai.google.dev',
        hintClass: 'green',
        validate: k => k.startsWith('AIza') && k.length > 20,
        needsKey: true
    },
    groq: {
        label: 'Groq API Key',
        placeholder: 'gsk_...',
        defaultModel: 'llama-3.3-70b-versatile',
        hint: 'Free tier — fast Llama 3. Get key at console.groq.com',
        hintClass: 'green',
        validate: k => k.startsWith('gsk_') && k.length > 20,
        needsKey: true
    },
    ollama: {
        label: null,
        placeholder: '',
        defaultModel: 'llama3.2',
        hint: 'No key needed. Run: ollama serve  (ollama.com)',
        hintClass: '',
        validate: () => true,
        needsKey: false
    },
    anthropic: {
        label: 'Anthropic API Key',
        placeholder: 'sk-ant-...',
        defaultModel: 'claude-sonnet-4-6',
        hint: 'Paid. Get key at console.anthropic.com',
        hintClass: 'yellow',
        validate: k => k.startsWith('sk-ant-') && k.length > 20,
        needsKey: true
    },
    custom: {
        label: 'API Key',
        placeholder: 'sk-...',
        defaultModel: 'gpt-4o-mini',
        hint: 'Any OpenAI-compatible API. Set base URL above.',
        hintClass: '',
        validate: k => k.length > 5,
        needsKey: true
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

function applyProvider(name, keepModelValue) {
    const p = PROVIDERS[name];

    // API key field
    $('apiKeyField').style.display = p.needsKey ? 'block' : 'none';
    if (p.needsKey) {
        $('apiKeyLabel').textContent = p.label;
        $('apiKey').placeholder = p.placeholder;
    }

    // Custom URL field
    $('customUrlField').style.display = name === 'custom' ? 'block' : 'none';

    // Model name field — always shown
    if (!keepModelValue) {
        $('modelName').value = p.defaultModel;
        $('modelName').placeholder = p.defaultModel;
    }

    // Hint
    const hint = $('providerHint');
    hint.textContent = p.hint;
    hint.className = 'hint' + (p.hintClass ? ' ' + p.hintClass : '');
}

$('provider').addEventListener('change', () => {
    const name = $('provider').value;
    applyProvider(name, false);
    chrome.storage.local.set({ provider: name });
});

// Persist model name on change
$('modelName').addEventListener('change', () => {
    chrome.storage.local.set({ modelName: $('modelName').value.trim() });
});
$('customUrl').addEventListener('change', () => {
    chrome.storage.local.set({ customUrl: $('customUrl').value.trim() });
});
$('apiKey').addEventListener('change', () => {
    chrome.storage.local.set({ apiKey: $('apiKey').value.trim() });
});

// Load saved settings
chrome.storage.local.get(
    ['apiKey', 'provider', 'modelName', 'customUrl', 'weights', 'aiDeduct', 'minReplies'],
    (data) => {
        if (data.provider) $('provider').value = data.provider;
        applyProvider($('provider').value, false);

        if (data.apiKey) $('apiKey').value = data.apiKey;
        if (data.customUrl) $('customUrl').value = data.customUrl;
        if (data.modelName) {
            $('modelName').value = data.modelName;
        }
        if (data.weights) {
            weightInputs.forEach(id => { if (data.weights[id] !== undefined) $(id).value = data.weights[id]; });
        }
        if (data.aiDeduct !== undefined) $('aiDeduct').value = data.aiDeduct;
        if (data.minReplies !== undefined) $('minReplies').value = data.minReplies;
        calcTotal();
    }
);

function setStatus(msg, type = 'info') {
    const el = $('statusMsg');
    el.textContent = msg;
    el.className = 'status ' + type;
}

function setProgress(pct) {
    $('progressBar').className = 'progress-bar active';
    $('progressFill').style.width = pct + '%';
    if (pct >= 100) setTimeout(() => $('progressBar').className = 'progress-bar', 900);
}

// ── Grade button ────────────────────────────────────────────────────────────

$('gradeBtn').addEventListener('click', async () => {
    const provider  = $('provider').value;
    const apiKey    = $('apiKey').value.trim();
    const modelName = $('modelName').value.trim() || PROVIDERS[provider].defaultModel;
    const customUrl = $('customUrl').value.trim();

    const p = PROVIDERS[provider];

    if (p.needsKey) {
        if (!apiKey) {
            setStatus('Enter an API key for ' + provider, 'error');
            return;
        }
        if (!p.validate(apiKey)) {
            setStatus('API key format looks wrong — double-check it.', 'error');
            return;
        }
    }

    if (provider === 'custom' && !customUrl) {
        setStatus('Enter the API base URL for your custom provider.', 'error');
        return;
    }

    const total = calcTotal();
    if (total !== 100) {
        setStatus('Rubric weights must total exactly 100 pts', 'error');
        return;
    }

    const weights    = {};
    weightInputs.forEach(id => weights[id] = parseInt($(id).value));
    const aiDeduct   = parseInt($('aiDeduct').value) || 20;
    const minReplies = parseInt($('minReplies').value) || 2;

    chrome.storage.local.set({ apiKey, provider, modelName, customUrl, weights, aiDeduct, minReplies });

    $('gradeBtn').disabled = true;
    setStatus('Scraping forum posts…', 'info');
    setProgress(10);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_FORUM' }, async (response) => {
        if (chrome.runtime.lastError || !response) {
            setStatus('Could not read forum. Open a Moodle discussion page first.', 'error');
            $('gradeBtn').disabled = false;
            return;
        }

        if (!response.posts || response.posts.length === 0) {
            setStatus('No posts found on this page.', 'error');
            $('gradeBtn').disabled = false;
            return;
        }

        const posts = response.posts;
        setStatus(`Found ${posts.length} posts — grading with ${modelName}…`, 'info');
        setProgress(30);

        chrome.runtime.sendMessage(
            { action: 'GRADE_POSTS', posts, weights, aiDeduct, minReplies, apiKey, provider, modelName, customUrl },
            (result) => {
                if (result && result.error) {
                    setStatus(result.error, 'error');
                    $('gradeBtn').disabled = false;
                    return;
                }

                setProgress(100);
                setStatus(`Graded ${result.grades.length} students with ${modelName}`, 'success');
                $('gradeBtn').disabled = false;

                chrome.storage.local.set({ grades: result.grades, posts }, () => {
                    chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY', grades: result.grades });
                });
            }
        );
    });
});

$('showOverlay').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.storage.local.get(['grades'], (data) => {
        if (!data.grades) { setStatus('Grade first, then open the dashboard.', 'error'); return; }
        chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY', grades: data.grades });
        window.close();
    });
});

$('exportCSV').addEventListener('click', () => {
    chrome.storage.local.get(['grades'], (data) => {
        if (!data.grades) { setStatus('Grade first, then export.', 'error'); return; }
        chrome.runtime.sendMessage({ action: 'EXPORT_CSV', grades: data.grades });
        window.close();
    });
});
