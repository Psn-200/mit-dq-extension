// background.js — handles AI grading via Anthropic API and CSV export

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg.action === 'GRADE_POSTS') {
        gradePosts(msg).then(result => sendResponse(result)).catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (msg.action === 'EXPORT_CSV') {
        exportCSV(msg.grades);
        return true;
    }
});

// ─── HELPERS ────────────────────────────────────────────────────────────────

function letterGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

// ─── AI GRADING ─────────────────────────────────────────────────────────────

async function gradePosts({ posts, weights, aiDeduct, apiKey, provider, ollamaModel }) {
    const studentPosts = posts.filter(p => p.idx > 0 || posts.length === 1);

    const byAuthor = {};
    studentPosts.forEach(p => {
        if (!byAuthor[p.author]) byAuthor[p.author] = { answer: null, replies: [] };
        if (p.isAnswer) byAuthor[p.author].answer = p;
        else if (p.isPeerReply) byAuthor[p.author].replies.push(p);
        else if (!byAuthor[p.author].answer) byAuthor[p.author].answer = p;
    });

    const grades = [];
    for (const author of Object.keys(byAuthor)) {
        const data = byAuthor[author];
        if (!data.answer) continue;
        grades.push(await gradeOneStudent(author, data, weights, aiDeduct, apiKey, provider, ollamaModel));
    }

    return { grades };
}

// ─── LLM ROUTER ─────────────────────────────────────────────────────────────

async function callLLM(prompt, provider, apiKey, ollamaModel) {
    if (provider === 'gemini') {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 1000, temperature: 0.2 }
                })
            }
        );
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        return json.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    }

    if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1000,
                temperature: 0.2
            })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
        return json.choices[0].message.content.replace(/```json|```/g, '').trim();
    }

    if (provider === 'ollama') {
        const res = await fetch('http://localhost:11434/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel || 'llama3.2',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1000,
                temperature: 0.2
            })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
        return json.choices[0].message.content.replace(/```json|```/g, '').trim();
    }

    // Anthropic (default)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.content[0].text.replace(/```json|```/g, '').trim();
}

async function gradeOneStudent(author, data, weights, aiDeduct, apiKey, provider, ollamaModel) {
    const { answer, replies } = data;

    const peerRepliesMade = replies.length;
    const repliedToList = replies.map(r => r.repliedTo).flat().filter(Boolean);

    // Figure detection
    const hasFigures = (answer.images || 0) > 0 ||
        /\b(figure|table|chart|graph|diagram|exhibit|appendix)\b/i.test(answer.body);

    // APA in-text citation detection: (Author, Year) or (Author et al., Year)
    const apaInTextPattern = /\([A-Z][a-zA-Zé\-]+(?:\s+et\s+al\.)?(?:\s*&\s*[A-Z][a-zA-Z]+)?,\s+\d{4}[a-z]?\)/g;
    const apaMatches = answer.body.match(apaInTextPattern) || [];
    const referenceCount = apaMatches.length;
    const hasReferences = referenceCount > 0 ||
        /\b(references|bibliography|works cited)\b/i.test(answer.body) ||
        /doi:|et\s+al\./i.test(answer.body);

    const prompt = `You are grading a student's Moodle forum discussion post for an academic course. Analyze carefully and return ONLY valid JSON with no markdown.

STUDENT: ${author}

MAIN ANSWER:
"""
${answer.body}
"""

PEER REPLIES MADE (${peerRepliesMade}):
${replies.map((r, i) => `Reply ${i + 1}: "${r.body.substring(0, 400)}"`).join('\n') || 'None'}

AUTO-DETECTED IN POST:
- Embedded images/figures: ${hasFigures}
- APA-style in-text citations found: ${referenceCount} (examples: ${apaMatches.slice(0, 3).join(', ') || 'none detected'})
- Has reference list / bibliography section: ${hasReferences}

Grade on these criteria and return ONLY a JSON object:
{
  "quality": <0-${weights.w_quality}, score for: answer depth, accuracy, relevance to question, use of specific real-world examples or data>,
  "figures": <0-${weights.w_figures}, score for BOTH: (a) APA citations — proper in-text (Author, Year) and a reference list? (b) figures, tables, charts, or concrete visual/data examples. Full score needs both; partial for only one>,
  "replies": <0-${weights.w_replies}, score for peer replies count AND quality — substantive engagement vs. "Great post!" generic praise. Zero if no replies>,
  "writing": <0-${weights.w_writing}, score for: clarity, logical structure, grammar, academic tone, paragraph organization>,
  "aiDetected": <true/false>,
  "aiConfidence": <"low"|"medium"|"high">,
  "aiReason": <1 sentence: specific phrases or structural patterns that suggest AI, else "">,
  "apaScore": <"none"|"poor"|"fair"|"good" — "none"=no citations, "poor"=sources mentioned without format, "fair"=some correct APA but missing reference list or inconsistent, "good"=proper in-text (Author, Year) AND formatted reference list>,
  "apaDetails": <1-2 sentences: what APA elements are present or missing, cite specific examples from the post. Mention if DOI or URL is missing from references>,
  "figureDetails": <1 sentence: are figures/tables present? labeled? referenced in text? or completely absent?>,
  "replyQuality": <"none"|"generic"|"substantive" — "none"=no replies, "generic"=short praise only, "substantive"=adds ideas, asks questions, challenges or builds on peer's point>,
  "feedback": <4-5 sentences covering: (1) content quality, (2) APA reference quality with specific advice, (3) figure/example usage, (4) peer reply engagement, (5) one concrete improvement suggestion>,
  "copiedContent": <true/false — verbatim or near-verbatim text from external sources without citation>,
  "plagiarismNote": <1 sentence with a quoted excerpt if copied content suspected, else "">
}

APA rules to check:
- In-text: (Author, Year) or (Author & Author, Year) or (Author et al., Year)
- Reference list: Author, A. A. (Year). Title. Journal, volume(issue), pages. https://doi.org/xxxxx
- Common errors: missing year, square brackets instead of parentheses, no reference list, URL without doi prefix

AI signals: perfect bullet structure, phrases like "In conclusion" / "It is important to note" / "In today's world" / "Firstly... Secondly...", no personal voice, zero grammar variation, missing any personal perspective or specific experience.`;

    try {
        const text = await callLLM(prompt, provider, apiKey, ollamaModel);
        const parsed = JSON.parse(text);

        const baseScore = (parsed.quality || 0) + (parsed.figures || 0) +
            (parsed.replies || 0) + (parsed.writing || 0);
        const aiDeduction = (parsed.aiDetected && parsed.aiConfidence !== 'low') ? aiDeduct : 0;
        const finalScore = Math.max(0, Math.min(100, Math.round(baseScore - aiDeduction)));

        return {
            author,
            finalScore,
            grade: letterGrade(finalScore),
            breakdown: {
                quality: parsed.quality || 0,
                figures: parsed.figures || 0,
                replies: parsed.replies || 0,
                writing: parsed.writing || 0
            },
            aiDetected: parsed.aiDetected && parsed.aiConfidence !== 'low',
            aiConfidence: parsed.aiConfidence || 'low',
            aiReason: parsed.aiReason || '',
            aiDeduction,
            apaScore: parsed.apaScore || 'none',
            apaDetails: parsed.apaDetails || '',
            figureDetails: parsed.figureDetails || '',
            replyQuality: parsed.replyQuality || 'none',
            feedback: parsed.feedback || '',
            copiedContent: parsed.copiedContent || false,
            plagiarismNote: parsed.plagiarismNote || '',
            hasFigures,
            hasReferences,
            referenceCount,
            peerRepliesMade,
            repliedToList
        };

    } catch (err) {
        return {
            author,
            finalScore: 0,
            grade: 'F',
            breakdown: { quality: 0, figures: 0, replies: 0, writing: 0 },
            aiDetected: false,
            aiConfidence: 'low',
            aiReason: '',
            aiDeduction: 0,
            apaScore: 'none',
            apaDetails: '',
            figureDetails: '',
            replyQuality: 'none',
            feedback: 'Grading failed: ' + err.message,
            copiedContent: false,
            plagiarismNote: '',
            hasFigures,
            hasReferences,
            referenceCount,
            peerRepliesMade,
            repliedToList
        };
    }
}

// ─── CSV EXPORT ─────────────────────────────────────────────────────────────

function exportCSV(grades) {
    const header = [
        'Student Name',
        'Letter Grade',
        'Final Score (/100)',
        'Answer Quality',
        'References & Figures',
        'Peer Replies',
        'Writing Clarity',
        'APA Score',
        'APA Details',
        'Figure Details',
        'Reply Quality',
        'AI Detected',
        'AI Confidence',
        'AI Reason',
        'AI Deduction',
        'Copied Content',
        'Plagiarism Note',
        'Peer Replies Made',
        'Replied To',
        'Feedback / Comment'
    ].join(',');

    const rows = grades.map(g => [
        csvEsc(g.author),
        g.grade || 'N/A',
        g.finalScore,
        g.breakdown.quality,
        g.breakdown.figures,
        g.breakdown.replies,
        g.breakdown.writing,
        g.apaScore || 'none',
        csvEsc(g.apaDetails || ''),
        csvEsc(g.figureDetails || ''),
        g.replyQuality || 'none',
        g.aiDetected ? 'YES' : 'NO',
        g.aiConfidence || 'N/A',
        csvEsc(g.aiReason || ''),
        g.aiDeduction || 0,
        g.copiedContent ? 'YES' : 'NO',
        csvEsc(g.plagiarismNote || ''),
        g.peerRepliesMade,
        csvEsc((g.repliedToList || []).join('; ')),
        csvEsc(g.feedback)
    ].join(','));

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const stamp = now.toISOString().slice(0, 10);

    chrome.downloads.download({
        url,
        filename: `forum-grades-${stamp}.csv`,
        saveAs: true
    });
}

function csvEsc(val) {
    const str = String(val || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}
