# Moodle Forum Grader — Chrome Extension

A Chrome extension that automatically scrapes student posts from a Moodle discussion forum, grades them with AI, and exports results as a CSV with letter grades, scores, APA reference analysis, AI detection flags, and constructive feedback.

---

## Features

- **Scrapes all student posts and replies** from any Moodle forum discussion page while you are logged in
- **AI-powered grading** across four criteria: answer quality, APA references & figures, peer replies, writing clarity
- **APA format checking** — detects in-text citations `(Author, Year)`, reference lists, and flags missing or incorrect formatting
- **Figure & example detection** — checks for tables, charts, diagrams, and labeled figures
- **Peer reply analysis** — counts replies and distinguishes substantive engagement from generic "Great post!" responses
- **AI-generated content detection** — flags posts with telltale AI writing patterns and deducts configurable points
- **Plagiarism / copied content flag** — identifies verbatim or near-verbatim text from external sources
- **In-page dashboard overlay** — shows ranked results with score bars, badges, and expandable per-student detail
- **CSV export** — one row per student with letter grade, score, all sub-scores, APA details, feedback, and flags
- **Multi-provider AI support** — works with Google Gemini (free), Groq (free), Ollama (local/free), or Anthropic Claude (paid)

---

## Grading Rubric (default, fully adjustable)

| Criterion | Default Weight | What is evaluated |
|---|---|---|
| Answer Quality & Depth | 35 pts | Depth, accuracy, relevance, specific data or real-world examples |
| APA References & Figures | 20 pts | Proper `(Author, Year)` citations + reference list + figures/charts/tables |
| Peer Replies | 25 pts | Number of replies AND quality — substantive vs. generic |
| Writing Clarity & Structure | 20 pts | Grammar, academic tone, logical flow, paragraph organization |
| **AI Content Deduction** | −20 pts | Auto-deducted if AI-generated content is detected (configurable) |

Total: **100 points** → Letter grade: A (90–100), B (80–89), C (70–79), D (60–69), F (below 60)

---

## CSV Export Columns

| Column | Description |
|---|---|
| Student Name | Full name as shown on the forum |
| Letter Grade | A / B / C / D / F |
| Final Score (/100) | Numeric total after any AI deduction |
| Answer Quality | Sub-score out of rubric weight |
| References & Figures | Sub-score covering APA + figures |
| Peer Replies | Sub-score for peer engagement |
| Writing Clarity | Sub-score for grammar and structure |
| APA Score | `none` / `poor` / `fair` / `good` |
| APA Details | Claude's specific note on citation quality |
| Figure Details | Description of figure/table/chart usage |
| Reply Quality | `none` / `generic` / `substantive` |
| AI Detected | YES / NO |
| AI Confidence | low / medium / high |
| AI Reason | Specific pattern that triggered the flag |
| AI Deduction | Points deducted |
| Copied Content | YES / NO |
| Plagiarism Note | Quoted excerpt if suspected |
| Peer Replies Made | Count of replies to other students |
| Replied To | Names of students replied to |
| Feedback / Comment | 4–5 sentence constructive feedback |

---

## Supported AI Providers

| Provider | Cost | How to get a key |
|---|---|---|
| **Google Gemini** *(recommended free)* | Free — 1,500 req/day | Sign in at [ai.google.dev](https://ai.google.dev), click **Get API key** |
| **Groq** *(fast + free)* | Free tier | Sign up at [console.groq.com](https://console.groq.com), go to **API Keys** |
| **Ollama** *(local, no key)* | 100% free | Install [ollama.com](https://ollama.com), run `ollama pull llama3.2` in Terminal |
| **Anthropic Claude** *(paid)* | Pay-per-use | [console.anthropic.com](https://console.anthropic.com) |

---

## Installation

### Step 1 — Download the extension

Clone or download this repository:

```bash
git clone https://github.com/Psn-200/mit-dq-extension.git
```

### Step 2 — Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `mit-dq-extension` folder

The **Forum Grader** extension will appear in your toolbar.

### Step 3 — Get a free API key

**Option A — Google Gemini (easiest)**
1. Go to [ai.google.dev](https://ai.google.dev)
2. Click **Get API key in Google AI Studio**
3. Click **Create API key**
4. Copy the key (starts with `AIza...`)

**Option B — Groq**
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up with Google or GitHub
3. Go to **API Keys** → **Create API Key**
4. Copy the key (starts with `gsk_...`)

**Option C — Ollama (no key needed)**
1. Download and install from [ollama.com](https://ollama.com)
2. Open Terminal and run:
   ```bash
   ollama pull llama3.2
   ollama serve
   ```
3. Select **Ollama** in the extension and type `llama3.2` as the model name

---

## Usage

1. **Log in to your Moodle** site in Chrome
2. Open the forum discussion page you want to grade
   - URL looks like: `https://yoursite.moodle/mod/forum/discuss.php?d=XXXXX`
3. Click the **Forum Grader** icon in the Chrome toolbar
4. **Select your AI provider** and paste your API key
5. Adjust the **rubric weights** if needed (must total 100)
6. Set the **AI deduction** points (default 20)
7. Click **⚡ Grade This Discussion**
8. Wait — the extension scrapes all posts and sends them to the AI for grading
9. A **dashboard overlay** appears on the page showing all results
10. Click **📥 Export CSV** to download the full graded spreadsheet

---

## Dashboard Overlay

The overlay appears in the bottom-right corner of the Moodle page after grading.

- Click any student row to **expand full detail**: APA analysis, figure feedback, reply quality, AI reason, plagiarism note
- Use the **Sort** dropdown to rank by score, name, or replies
- Switch to the **Summary** tab for class average, score distribution, and AI-flagged list
- Click **⊟** to minimize or **✕** to close

### Badges on each student row

| Badge | Meaning |
|---|---|
| 🤖 AI | Post flagged as likely AI-generated |
| ⚠ Plagiarism | Copied content suspected |
| 📚 APA ✓ | Good APA citations detected |
| 📚 APA~ | Partial / inconsistent APA |
| 📚 No APA | No citations found |
| 📊 Figures | Figures, tables, or charts present |
| 💬 N replies | Number of peer replies made |
| ⚠ No replies | Student made no peer replies |

---

## APA Reference Checking

The extension performs the following APA checks on each post:

- **In-text citations** — looks for `(Author, Year)`, `(Author & Author, Year)`, `(Author et al., Year)` patterns
- **Reference list** — checks for a "References" or "Bibliography" section at the end
- **DOI / URL** — checks if references include `doi:` or full URLs
- **Common errors flagged** — missing year, square brackets instead of parentheses, no reference list, URL without doi prefix

APA score levels:
- `good` — proper in-text citations AND a formatted reference list
- `fair` — some correct APA but inconsistent or missing reference list
- `poor` — sources mentioned but not formatted correctly
- `none` — no citations at all

---

## File Structure

```
mit-dq-extension/
├── manifest.json      Chrome extension manifest (MV3)
├── content.js         Scrapes Moodle forum + renders in-page overlay
├── background.js      AI grading logic + CSV export + LLM router
├── popup.html         Extension popup UI
├── popup.js           Popup logic (provider selection, settings, actions)
├── overlay.css        Styles for the in-page grading dashboard
└── README.md          This file
```

---

## Privacy

- Posts are sent to the AI provider you choose. If privacy is critical, use **Ollama** — all data stays on your machine and is never sent anywhere.
- Your API key is stored locally in Chrome's `storage.local` and is never sent anywhere except to the provider's API endpoint.

---

## Troubleshooting

**"Could not read forum" error**
- Make sure you are on the actual Moodle discussion page (URL contains `discuss.php`)
- Refresh the page and try again
- Check that you are logged in to Moodle

**"Grading failed" in a student's feedback**
- Your API key may be invalid or over quota
- For Ollama: make sure `ollama serve` is running in Terminal
- For Groq/Gemini: check you haven't hit the free tier daily limit

**Overlay does not appear**
- Click **📊 Show Dashboard** in the popup to re-open it
- Make sure you clicked **Grade** before trying to show the dashboard

**Scores all show 0**
- The AI returned malformed JSON — this can happen with smaller Ollama models
- Try switching to a larger model (e.g. `llama3.1:8b`) or a cloud provider

---

## License

MIT License — free to use, modify, and distribute.
