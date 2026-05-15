// popup.js

const $ = id => document.getElementById(id);

const PROVIDERS = {
    gemini: {
        label: 'Google Gemini API Key',
        placeholder: 'AIza...',
        hint: 'Free tier: 1,500 requests/day. Get key → <a href="#" onclick="return false">ai.google.dev</a>',
        validate: k => k.startsWith('AIza') && k.length > 20
    },
    groq: {
        label: 'Groq API Key',
        placeholder: 'gsk_...',
        hint: 'Free tier — very fast Llama 3. Get key → console.groq.com',
        validate: k => k.startsWith('gsk_') && k.length > 20
    },
    ollama: {
        label: null,
        placeholder: '',
        hint: 'No key needed. Ollama must be running on your machine (ollama.com).',
        validate: () => true
    },
    anthropic: {
        label: 'Anthropic API Key',
        placeholder: 'sk-ant-...',
        hint: 'Paid. Get key → console.anthropic.com',
        validate: k => k.startsWith('sk-ant-') && k.length > 20
    }
};

// Weight inputs
const weightInputs = ['w_quality', 'w_figures', 'w_replies', 'w_writing'];

function calcTotal() {
    const total = weightInputs.reduce((s, id) => s + (parseInt($(id).value) || 0), 0);
    $('totalPts').textContent = total;
    $('totalDisplay').textContent = total + ' pts';
    $('totalDisplay').style.color = total === 100 ? '#4f8ef7' : '#f87171';
    return total;
}

weightInputs.forEach(id => $(id).addEventListener('input', calcTotal));

function applyProvider(name) {
    const p = PROVIDERS[name];
    const isOllama = name === 'ollama';

    $('apiKeySection').style.display = isOllama ? 'none' : 'block';
    $('ollamaSection').style.display = isOllama ? 'block' : 'none';

    if (!isOllama) {
        $('apiKeyLabel').textContent = p.label;
        $('apiKey').placeholder = p.placeholder;
    }
    $('providerHint').innerHTML = p.hint;
}

$('provider').addEventListener('change', () => {
    applyProvider($('provider').value);
    chrome.storage.local.set({ provider: $('provider').value });
});

// Load saved settings
chrome.storage.local.get(['apiKey', 'provider', 'ollamaModel', 'weights', 'aiDeduct'], (data) => {
    if (data.provider) $('provider').value = data.provider;
    if (data.apiKey) $('apiKey').value = data.apiKey;
    if (data.ollamaModel) $('ollamaModel').value = data.ollamaModel;
    if (data.weights) {
        weightInputs.forEach(id => { if (data.weights[id]) $(id).value = data.weights[id]; });
    }
    if (data.aiDeduct !== undefined) $('aiDeduct').value = data.aiDeduct;
    applyProvider($('provider').value);
    calcTotal();
});

$('apiKey').addEventListener('change', () => {
    chrome.storage.local.set({ apiKey: $('apiKey').value.trim() });
});

$('ollamaModel').addEventListener('change', () => {
    chrome.storage.local.set({ ollamaModel: $('ollamaModel').value.trim() });
});

function setStatus(msg, type = 'info') {
    const el = $('statusMsg');
    el.textContent = msg;
    el.className = 'status ' + type;
}

function setProgress(pct) {
    const bar = $('progressBar');
    bar.className = 'progress-bar active';
    $('progressFill').style.width = pct + '%';
    if (pct >= 100) setTimeout(() => bar.className = 'progress-bar', 800);
}

// Grade button
$('gradeBtn').addEventListener('click', async () => {
    const provider = $('provider').value;
    const apiKey = $('apiKey').value.trim();
    const ollamaModel = $('ollamaModel').value.trim() || 'llama3.2';

    if (provider !== 'ollama') {
        if (!apiKey) {
            setStatus('Please enter an API key for ' + PROVIDERS[provider].label, 'error');
            return;
        }
        if (!PROVIDERS[provider].validate(apiKey)) {
            setStatus('API key format looks wrong for ' + provider + '. Check it and try again.', 'error');
            return;
        }
    }

    const total = calcTotal();
    if (total !== 100) {
        setStatus('Rubric weights must total exactly 100 pts', 'error');
        return;
    }

    const weights = {};
    weightInputs.forEach(id => weights[id] = parseInt($(id).value));
    const aiDeduct = parseInt($('aiDeduct').value) || 20;

    chrome.storage.local.set({ apiKey, provider, ollamaModel, weights, aiDeduct });

    $('gradeBtn').disabled = true;
    setStatus('Scraping forum posts...', 'info');
    setProgress(10);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_FORUM' }, async (response) => {
        if (chrome.runtime.lastError || !response) {
            setStatus('Could not read forum. Make sure you are on a Moodle discussion page.', 'error');
            $('gradeBtn').disabled = false;
            return;
        }

        if (!response.posts || response.posts.length === 0) {
            setStatus('No posts found. Open a Moodle forum discussion first.', 'error');
            $('gradeBtn').disabled = false;
            return;
        }

        const posts = response.posts;
        setStatus(`Found ${posts.length} posts. Grading with AI...`, 'info');
        setProgress(25);

        chrome.runtime.sendMessage({
            action: 'GRADE_POSTS',
            posts, weights, aiDeduct, apiKey, provider, ollamaModel
        }, (result) => {
            if (result && result.error) {
                setStatus(result.error, 'error');
                $('gradeBtn').disabled = false;
                return;
            }

            setProgress(100);
            setStatus(`Graded ${result.grades.length} students successfully!`, 'success');
            $('gradeBtn').disabled = false;

            chrome.storage.local.set({ grades: result.grades, posts }, () => {
                chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY', grades: result.grades });
            });
        });
    });
});

$('showOverlay').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.storage.local.get(['grades'], (data) => {
        if (!data.grades) { setStatus('No grades yet. Click Grade first.', 'error'); return; }
        chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY', grades: data.grades });
        window.close();
    });
});

$('exportCSV').addEventListener('click', () => {
    chrome.storage.local.get(['grades'], (data) => {
        if (!data.grades) { setStatus('No grades yet. Click Grade first.', 'error'); return; }
        chrome.runtime.sendMessage({ action: 'EXPORT_CSV', grades: data.grades });
        window.close();
    });
});
