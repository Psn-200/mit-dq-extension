# Moodle Forum Grader — Chrome Extension

A Chrome extension that automatically scrapes student posts from a Moodle discussion forum, grades them with AI or heuristics, applies late-submission penalties, detects AI-generated content and plagiarism, and exports results as CSV and JSON.

Built specifically for **IAU Online Moodle** (Summer I 2026 schedule) but works on standard Moodle 4.x installations.

---

## Features

- **Scrapes all student posts and replies** from any Moodle discussion page while you are logged in — works on IAU Online's custom theme (extracts real author names from `aria-label` attributes)
- **Six grading modes** — Heuristics (instant, no AI), Chrome Built-in AI (Gemini Nano, no key), Google Gemini (free), Groq / Llama 3 (free), Ollama (local), or Anthropic Claude (paid)
- **AI-powered grading** across four criteria: answer quality, APA references & figures, peer replies, writing clarity
- **Heuristics grader** — instant word-count, APA regex, reply-count scoring; no API key, no cost, good for a first pass
- **APA format checking** — detects `(Author, Year)` in-text citations, reference lists, DOI links, and flags missing or malformed citations
- **Figure & example detection** — checks for tables, charts, diagrams, and figure keywords in post body
- **Peer reply analysis** — counts replies per student, identifies who each reply was directed to, and classifies replies as *substantive* (≥ 50 words or explicit engagement) vs. *generic*
- **AI-generated content detection** — 25 buzzword patterns, Firstly/Secondly structure, no first-person voice, no contractions, high lexical diversity, heavy list structure → low / medium / high confidence flag with configurable point deduction
- **Plagiarism detection** — 5-gram Jaccard similarity across all submissions; flags pairs with > 35% overlap
- **Late submission penalty** — automatic penalty based on the Summer I 2026 week schedule (11:59 PM NPT deadline); 10% per day late, score zeroed after 3-day grace period
- **In-page dashboard overlay** — ranked table with score bars, badge indicators, and expandable per-student detail; live Summary tab with class stats and distribution chart
- **CSV export** — one row per student with all scores, sub-scores, APA details, reply breakdown, AI flag, late penalty, and full feedback
- **Posts JSON export** — structured export of all scraped posts for offline / Python grading pipelines

---

## Grading Rubric (default weights, all adjustable)

| Criterion | Default | What is evaluated |
|---|---|---|
| Answer Quality & Depth | 35 pts | Depth, accuracy, relevance, real-world examples |
| APA References & Figures | 20 pts | Correct `(Author, Year)` citations + reference list + figures/charts/tables |
| Peer Replies | 25 pts | Count AND quality — substantive vs. generic; penalty if below minimum |
| Writing Clarity & Structure | 20 pts | Grammar, academic tone, logical flow, paragraph organization |
| **AI Content Deduction** | −20 pts | Deducted when AI-generated content is detected (configurable, 0–100) |
| **Late Submission** | −10/20/30% | Applied to earned score; score = 0 if past 3-day cutoff |

**Total: 100 points** → Letter grade: A (90–100), B (80–89), C (70–79), D (60–69), F (below 60)

---

## Late Submission Policy — Summer I 2026

Deadlines are stored as UTC equivalents of **11:59 PM NPT (UTC+5:45)**. Week is either auto-detected (by current date) or manually selected in the popup.

| Week | DQ Deadline (NPT) | DQ Cutoff | Assessment Deadline | Assessment Cutoff |
|---|---|---|---|---|
| 1 | Fri 8 May | Mon 11 May | Sun 10 May | Wed 13 May |
| 2 | Fri 15 May | Mon 18 May | Sun 17 May | Wed 20 May |
| 3 | Fri 22 May | Mon 25 May | Sun 24 May | Wed 27 May |
| 4 | Fri 29 May | Mon 1 Jun | Sun 31 May | Wed 3 Jun |
| 5 | Fri 5 Jun | Mon 8 Jun | Sun 7 Jun | Wed 10 Jun |
| 6 | Fri 12 Jun | Mon 15 Jun | Sun 14 Jun | Wed 17 Jun |
| 7 | Fri 19 Jun | Mon 22 Jun | Sun 21 Jun | Wed 24 Jun |
| 8 | Fri 26 Jun | Mon 29 Jun | Sun 28 Jun | Wed 1 Jul |

**Penalty schedule:**
- ≤ 1 day late → −10% of earned score
- ≤ 2 days late → −20% of earned score
- ≤ 3 days late → −30% of earned score
- > 3 days (past cutoff) → score = 0, badge: ⏰ Rejected

---

## AI Detection Signals

Each post's main answer is scanned for:

| Signal | Trigger |
|---|---|
| AI buzzwords | "in conclusion", "plays a crucial role", "delve into", "tapestry", "multifaceted", "nuanced", "underscore", "holistic", "comprehensively", "in the realm of", + 15 more |
| Firstly/Secondly structure | Both `Firstly` and `Secondly` present |
| No first-person voice | Post > 150 words and zero I/me/my/I'm |
| No contractions | Post > 150 words and zero contractions (can't, I'm, won't, etc.) |
| High lexical diversity | > 72% unique content words (AI tends to avoid word repetition) |
| Heavy list structure | 4+ numbered/bulleted items |

**Confidence levels:**
- `high` — 4+ signals OR 5+ buzzwords → deduction applied
- `medium` — 2+ signals OR 3+ buzzwords → deduction applied
- `low` — 1 signal → flagged but no deduction

---

## Plagiarism Detection

Cross-student 5-gram Jaccard similarity: every student's main answer is compared against every other student's answer. If any pair exceeds **35% overlap**, both are flagged with the similarity percentage. Manual review is always recommended before acting on the flag.

---

## Supported AI Providers

| Provider | Cost | Notes |
|---|---|---|
| **⚡ Heuristics** | Free, instant | No API key. Word count, APA regex, reply count. Best for quick first pass. |
| **🔮 Chrome Built-in AI** | Free, no key | Uses Gemini Nano in Chrome 127+. Requires AI features enabled in Chrome flags. |
| **Google Gemini** | Free — 1,500 req/day | Default model: `gemini-1.5-flash`. Get key at [ai.google.dev](https://ai.google.dev) |
| **Groq — Llama 3** | Free tier | Default model: `llama-3.3-70b-versatile`. Get key at [console.groq.com](https://console.groq.com) |
| **Ollama** | 100% free, local | Default model: `llama3.2`. Install at [ollama.com](https://ollama.com) and run `ollama serve` |
| **Anthropic Claude** | Paid | Default model: `claude-sonnet-4-6`. Key at [console.anthropic.com](https://console.anthropic.com) |
| **Custom / OpenAI-compatible** | Varies | Enter any OpenAI-compatible base URL (OpenAI, Together, LM Studio, etc.) |

---

## Installation

### Step 1 — Download the extension

```bash
git clone https://github.com/Psn-200/mit-dq-extension.git
```

Or download and unzip the repository.

### Step 2 — Load in Chrome

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `mit-dq-extension` folder

The **Forum Grader** icon appears in your toolbar.

### Step 3 — Get an API key (optional)

**Google Gemini (recommended free option)**
1. Go to [ai.google.dev](https://ai.google.dev) → **Get API key in Google AI Studio**
2. Click **Create API key**
3. Copy the key — it starts with `AIza...`

**Groq (fast + free)**
1. Go to [console.groq.com](https://console.groq.com) → sign up with Google or GitHub
2. Go to **API Keys** → **Create API Key**
3. Copy the key — starts with `gsk_...`

**Ollama (no key, fully local)**
1. Download and install from [ollama.com](https://ollama.com)
2. In Terminal:
   ```bash
   ollama pull llama3.2
   ollama serve
   ```
3. Select **Ollama** in the extension, model name: `llama3.2`

---

## Usage

1. **Log in to Moodle** in Chrome
2. Open the forum discussion page you want to grade
   - URL looks like: `https://yoursite.moodle/mod/forum/discuss.php?d=XXXXX`
3. Click the **Forum Grader** icon in the toolbar
4. **Agent Configuration** — select provider, paste API key, enter model name if needed
5. **Grading Rubric** — adjust weights if needed (must total exactly 100 pts)
6. **Evaluation Rules:**
   - *Min. peer replies required* — minimum replies each student must write (default 2)
   - *AI content deduction* — points deducted if AI writing is flagged (default 20)
   - *Submission type* — DQ (Friday deadline) or Assessment (Sunday deadline)
   - *Week* — select manually or leave on Auto to detect from current date
7. Click **⚡ Grade This Discussion**
8. Wait — the extension scrapes all posts and grades each student
9. The **dashboard overlay** appears on the Moodle page showing all results
10. Click **📥 Export CSV** or **📤 Export Posts** to download files

---

## Dashboard Overlay

The overlay appears in the bottom-right corner of the Moodle page after grading.

### Grades tab

- Each row shows: rank, student name, badges, numeric score, letter grade, and a score bar
- **Click any row** to expand full per-student detail:
  - Score breakdown (Quality / References / Replies / Writing / AI deduction / Late penalty)
  - Content analysis paragraph
  - APA citation quality with specific examples
  - Figure/table detection note
  - Per-reply breakdown — who they replied to, quality label, and one-sentence summary
  - Plagiarism flag with similarity percentage
  - AI signal description
  - Late submission detail with submission timestamp
  - Overall constructive feedback (4–5 sentences)
- Use the **Sort** dropdown to rank by: Score ↓, Score ↑, Name A–Z, Most Replies

### Summary tab

- Class statistics: Average / Highest / Lowest / AI Flagged / No Replies / Late or Rejected
- Score distribution bar chart (90–100, 80–89, 70–79, 60–69, Below 60)
- List of AI-flagged students with scores and deduction amounts
- List of late submissions with penalty notes
- **Export CSV** and **Export Posts JSON** buttons

### Badges

| Badge | Meaning |
|---|---|
| 🤖 AI | Post flagged as likely AI-generated |
| ⚠ Plagiarism | High text overlap with another submission |
| 💬 N/M replies ✓ | Made required number of peer replies |
| 💬 N/M replies ✗ | Did not meet minimum peer reply requirement |
| ⚠ No replies | Made zero peer replies |
| 📚 APA ✓ | Good APA citations with reference list |
| 📚 APA~ | Partial / inconsistent citations |
| 📚 No APA | No citations found |
| 📊 Figures | Figure, table, or chart keyword detected |
| ⏰ N days late | Late submission — penalty applied |
| ⏰ Rejected | Submitted after 3-day grace period — score = 0 |

### Controls

- **⊟** — minimize/expand the overlay body
- **✕** — close the overlay (re-open with the popup's 📊 Dashboard button)

---

## Export: CSV

**File name format:** `DQ1_grades_2026-05-16.csv` (discussion name + date)

Downloaded to your browser's default **Downloads** folder.

| Column | Description |
|---|---|
| Student Name | Full name as shown on Moodle |
| Letter Grade | A / B / C / D / F |
| Final Score (/100) | Score after AI deduction and late penalty |
| Answer Quality | Sub-score (out of rubric weight) |
| References & Figures | Sub-score covering APA + figures |
| Peer Replies | Sub-score for peer engagement |
| Writing Clarity | Sub-score for grammar and structure |
| APA Score | `none` / `poor` / `fair` / `good` |
| APA Details | Specific note on citation quality |
| Figure Details | Figure / table / chart usage |
| Min Replies Required | Minimum required by the rubric setting |
| Peer Replies Made | Number of replies student actually made |
| Replies Requirement Met | YES / NO |
| Reply Quality Breakdown | Per-reply: "Name [substantive]: summary…" |
| Peer Comment | Full peer engagement analysis |
| Content Comment | Detailed answer content analysis |
| APA Comment | Detailed APA / citation analysis |
| Figure Comment | Figure / visual content analysis |
| AI Detected | YES / NO |
| AI Confidence | low / medium / high |
| AI Reason | Specific patterns that triggered the flag |
| AI Deduction | Points deducted |
| Copied Content | YES / NO |
| Plagiarism Note | Similarity percentage and recommendation |
| Replied To | Semicolon-separated names of students replied to |
| Feedback / Comment | 4–5 sentence overall constructive feedback |
| Submission Date | Date/time extracted from the Moodle post |
| Late Status | `on-time` / `late` / `past-cutoff` / `unknown` |
| Days Late | 0–4 |
| Late Penalty Pts | Points deducted for late submission |

> The file includes a UTF-8 BOM so it opens correctly in Excel without encoding issues.

---

## Export: Posts JSON

**File name format:** `DQ1_posts_2026-05-16.json`

Structured export for use with offline or Python-based grading tools.

```json
{
  "exportedAt": "2026-05-16T10:00:00.000Z",
  "discussionUrl": "https://iauonline.net/mod/forum/discuss.php?d=38834",
  "discussionTitle": "CSE315a DQ1",
  "totalStudents": 12,
  "totalPosts": 38,
  "students": [
    {
      "name": "Jane Smith",
      "answer": {
        "text": "...",
        "wordCount": 412,
        "date": "2026-05-07T14:32:00.000Z",
        "hasImages": false,
        "apaCitationsDetected": ["(Brown, 2022)", "(Lee et al., 2021)"],
        "hasReferenceList": true
      },
      "replies": [
        {
          "text": "...",
          "repliedTo": ["Alex Johnson"],
          "date": "2026-05-08T09:15:00.000Z"
        }
      ],
      "peerRepliesCount": 2
    }
  ]
}
```

---

## APA Reference Checking

The extension performs the following checks on each main answer post:

| Check | Pattern |
|---|---|
| In-text citation | `(Author, Year)`, `(Author & Author, Year)`, `(Author et al., Year)` |
| Reference list | Presence of "References" or "Bibliography" heading |
| DOI or URL | `doi:` or `https://doi.org/` in reference entries |

**APA score levels:**
- `good` — 2+ correct in-text citations AND a formatted reference list
- `fair` — at least 1 citation (with or without reference list)
- `none` — no citations detected

Common errors the AI grader flags: missing year, square brackets instead of parentheses, no reference list, URL without DOI prefix, author name format errors.

---

## Heuristics Mode (Instant, No AI)

When **⚡ Heuristics** is selected, all grading happens locally in the browser with no API calls:

| Criterion | How it is scored |
|---|---|
| Quality | Word count scaled to 350-word target; bonus for 3+ paragraphs and 5+ sentences |
| APA & Figures | 2+ citations + reference list = full; 1 citation = 50%; figure keyword = 25% bonus |
| Peer Replies | Full score if ≥ required replies with substantive engagement; proportional partial credit otherwise |
| Writing | Paragraph count, average sentence length (8–40 words is "good") |
| AI Detection | Same 25-signal heuristic as AI mode; 20-point deduction at medium/high confidence |
| Plagiarism | 5-gram Jaccard similarity across all submissions in the batch |

Heuristics mode is best for a rapid first pass. Switch to an AI provider for qualitative feedback and more nuanced scoring.

---

## File Structure

```
mit-dq-extension/
├── manifest.json    Chrome MV3 extension manifest
├── content.js       Forum scraper + in-page overlay renderer
├── background.js    Grading logic, LLM router, CSV/JSON builder
├── popup.html       Extension popup UI
├── popup.js         Popup controller (settings, grading, exports)
├── overlay.css      Styles injected into Moodle page for the dashboard
└── README.md        This file
```

### Architecture notes (for developers)

- **Manifest V3** — uses a service worker (`background.js`) instead of a persistent background page
- **Download strategy** — downloads are triggered from the popup page or Moodle page context (not the service worker) to avoid MV3 blob URL lifetime issues; `background.js` builds and returns raw CSV/JSON data, callers create blob URLs and trigger download locally
- **Content script injection** — if the content script is not loaded in a tab (e.g. after an extension update without page reload), `popup.js` automatically injects it via `chrome.scripting.executeScript`
- **Author extraction** — IAU Online Moodle uses `aria-label="Subject by Author Name"` on `.forumpost` divs; the extension parses the substring after the last ` by ` to get the real name
- **Reply graph** — posts are connected by comparing numeric `data-post-id` values against parent IDs extracted from the `#p{id}` hash in "Permanent link to the parent" anchors; the first post's ID identifies the discussion root so replies-to-root are classified as student answers and replies-to-answers are classified as peer replies
- **Timezone** — NPT = UTC+5:45; all deadlines are stored as UTC (`18:14:00Z` = 11:59 PM NPT)

---

## Privacy

| Data | What happens to it |
|---|---|
| Forum post text | Sent to the selected AI provider only; never stored by this extension beyond the current grading session |
| API key | Stored in Chrome's `storage.local` on your device; sent only to the selected provider's API endpoint |
| Grades | Stored in Chrome's `storage.local` so the dashboard can be reopened; cleared on next grade run |
| Exports (CSV / JSON) | Saved to your local Downloads folder only; never uploaded anywhere |

For maximum privacy, use **Heuristics** mode or **Ollama** — no data leaves your machine.

---

## Troubleshooting

**"Could not read forum" error**
- Make sure you are on the Moodle discussion page (URL contains `discuss.php?d=`)
- The extension auto-injects the content script if not loaded — if it still fails, refresh the page and click Grade again
- Confirm you are logged in to Moodle

**Author names showing as "User 1", "User 2"**
- Your Moodle theme may use a non-standard HTML structure
- Open browser DevTools on the forum page, find a post element, and check whether `.forumpost` has an `aria-label` attribute or if author names appear in `a[href*="user/view.php"]` links

**Grading fails / "Grading failed" in student feedback**
- API key invalid or over quota
- For Ollama: run `ollama serve` in Terminal and confirm the model is pulled (`ollama list`)
- For Groq / Gemini: check daily free-tier limits
- Small Ollama models (< 7B) may return malformed JSON — try `llama3.1:8b` or a cloud provider

**Export buttons don't download**
- Make sure you click **Grade** before exporting CSV (grades must be stored first)
- For JSON export, you must be on the Moodle discussion page (the extension re-scrapes posts)
- If nothing downloads, check Chrome's Downloads bar at the bottom of the screen or `chrome://downloads/`

**Overlay doesn't appear after grading**
- Click **📊 Dashboard** in the popup to re-open the overlay
- If the overlay is already open but hidden, click its **⊟** button to expand it

**Scores all show 0**
- The AI returned malformed JSON — common with small Ollama models
- Switch to Gemini or Groq for more reliable structured output

**Late penalty not applying**
- Confirm the **Week** is set correctly (or use Auto)
- Confirm **Submission type** matches the assignment (DQ vs. Assessment)
- Submission date is extracted from the Moodle `<time datetime>` element — if the date is not parsed, the status shows as `unknown` and no penalty is applied

---

## License

MIT License — free to use, modify, and distribute.
