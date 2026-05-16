// background.js — AI grading, LLM router, CSV export

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'GRADE_POSTS') {
        gradePosts(msg).then(r => sendResponse(r)).catch(e => sendResponse({ error: e.message }));
        return true;
    }
    if (msg.action === 'GRADE_HEURISTICS') {
        try { sendResponse(gradeHeuristics(msg)); }
        catch (e) { sendResponse({ error: e.message }); }
        return true;
    }
    if (msg.action === 'EXPORT_CSV') {
        sendResponse(buildCSVExport(msg.grades, msg.pageTitle, msg.pageUrl));
        return true;
    }
    if (msg.action === 'EXPORT_POSTS') {
        sendResponse(buildPostsExport(msg.posts, msg.metadata));
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

function detectAISignals(text) {
    const signals = [];
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(w => w.length > 1).length;

    const buzzwords = [
        'in conclusion', 'it is important to note', 'it is worth noting',
        'plays a crucial role', 'plays a vital role',
        "in today's rapidly", "in today's world",
        'delve into', 'embark on', 'tapestry', 'multifaceted',
        'nuanced', 'underscore', 'paramount', 'pivotal role', 'synergy',
        'holistic', 'comprehensively', 'notwithstanding',
        'in the realm of', 'in the context of',
        'it goes without saying', 'needless to say',
        'this post will', 'this response will', 'this essay will',
        'as an ai', "i don't have personal"
    ];
    let buzzCount = 0;
    const foundBuzz = [];
    for (const phrase of buzzwords) {
        if (lower.includes(phrase)) { buzzCount++; foundBuzz.push(`"${phrase}"`); }
    }
    if (buzzCount >= 2) signals.push(`AI phrases detected: ${foundBuzz.slice(0, 2).join(', ')}`);

    if (/\bfirstly\b/i.test(text) && /\bsecondly\b/i.test(text)) {
        signals.push('Firstly/Secondly enumeration structure');
    }

    if (words > 150 && (text.match(/\b(I|me|my|I'm|I've|I'd|I'll|myself)\b/g) || []).length === 0) {
        signals.push('no first-person voice');
    }

    if (words > 150 && (text.match(/\b\w+n't\b|\bI'm\b|\bI've\b|\bI'd\b|\bI'll\b|\bwon't\b|\bcan't\b|\bdon't\b/gi) || []).length === 0) {
        signals.push('no contractions');
    }

    if (words > 150) {
        const wl = lower.split(/\s+/).filter(w => /^[a-z]+$/.test(w) && w.length > 2);
        const ratio = new Set(wl).size / Math.max(wl.length, 1);
        if (ratio > 0.72) signals.push(`high lexical diversity (${Math.round(ratio * 100)}%)`);
    }

    const enumCount = (text.match(/^\s*\d+\.|^\s*[-•*]\s+\w/gm) || []).length;
    if (enumCount >= 4) signals.push(`heavy list structure (${enumCount} items)`);

    const confidence = (signals.length >= 4 || buzzCount >= 5) ? 'high'
                     : (signals.length >= 2 || buzzCount >= 3) ? 'medium' : 'low';

    return {
        detected: confidence !== 'low',
        confidence,
        signals,
        reason: signals.length > 0 ? signals.slice(0, 3).join('; ') : ''
    };
}

function calcSimilarity(text1, text2) {
    function ngrams(t, n) {
        const words = t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
        const grams = new Set();
        for (let i = 0; i <= words.length - n; i++) grams.add(words.slice(i, i + n).join(' '));
        return grams;
    }
    const g1 = ngrams(text1, 5), g2 = ngrams(text2, 5);
    if (g1.size < 3 || g2.size < 3) return 0;
    let shared = 0;
    for (const g of g1) if (g2.has(g)) shared++;
    return shared / Math.min(g1.size, g2.size);
}

// ─── LLM ROUTER ─────────────────────────────────────────────────────────────

async function callLLM(prompt, provider, apiKey, modelName, customUrl) {

    if (provider === 'gemini') {
        const model = modelName || 'gemini-1.5-flash';
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 1200, temperature: 0.2 }
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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: modelName || 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1200,
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
                model: modelName || 'llama3.2',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1200,
                temperature: 0.2
            })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
        return json.choices[0].message.content.replace(/```json|```/g, '').trim();
    }

    if (provider === 'custom') {
        const base = (customUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
        const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: modelName || 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1200,
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
            model: modelName || 'claude-sonnet-4-6',
            max_tokens: 1200,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.content[0].text.replace(/```json|```/g, '').trim();
}

// ─── GRADING ORCHESTRATOR ────────────────────────────────────────────────────

async function gradePosts({ posts, weights, aiDeduct, minReplies, apiKey, provider, modelName, customUrl }) {
    const studentPosts = posts.filter(p => p.idx > 0 || posts.length === 1);

    const byAuthor = {};
    studentPosts.forEach(p => {
        if (!byAuthor[p.author]) byAuthor[p.author] = { answer: null, replies: [] };
        if (p.isAnswer)                        byAuthor[p.author].answer = p;
        else if (p.isPeerReply)                byAuthor[p.author].replies.push(p);
        else if (!byAuthor[p.author].answer)   byAuthor[p.author].answer = p;
    });

    const grades = [];
    for (const author of Object.keys(byAuthor)) {
        const data = byAuthor[author];
        if (!data.answer) continue;
        grades.push(await gradeOneStudent(
            author, data, weights, aiDeduct, minReplies || 2,
            apiKey, provider, modelName, customUrl
        ));
    }

    return { grades };
}

// ─── SINGLE STUDENT GRADER ───────────────────────────────────────────────────

async function gradeOneStudent(author, data, weights, aiDeduct, minReplies, apiKey, provider, modelName, customUrl) {
    const { answer, replies } = data;

    const peerRepliesMade = replies.length;
    const repliedToList   = replies.map(r => r.repliedTo).flat().filter(Boolean);

    // Figure detection
    const hasFigures = (answer.images || 0) > 0 ||
        /\b(figure|table|chart|graph|diagram|exhibit|appendix)\b/i.test(answer.body);

    // APA in-text citation detection: (Author, Year) or (Author et al., Year)
    const apaPattern   = /\([A-Z][a-zA-Zé\-]+(?:\s+et\s+al\.)?(?:\s*&\s*[A-Z][a-zA-Z]+)?,\s+\d{4}[a-z]?\)/g;
    const apaMatches   = answer.body.match(apaPattern) || [];
    const referenceCount = apaMatches.length;
    const hasReferences  = referenceCount > 0 ||
        /\b(references|bibliography|works cited)\b/i.test(answer.body) ||
        /doi:|et\s+al\./i.test(answer.body);

    // Format peer replies for the prompt
    const replyLines = replies.map((r, i) =>
        `  Reply ${i + 1} → to "${r.repliedTo?.[0] || 'unknown'}": "${r.body.substring(0, 350)}"`
    ).join('\n') || '  None';

    const prompt = `You are an academic instructor grading a Moodle forum discussion post. Analyze carefully and return ONLY valid JSON — no markdown, no explanation outside the JSON.

STUDENT: ${author}
MINIMUM PEER REPLIES REQUIRED BY COURSE: ${minReplies}

━━ MAIN ANSWER ━━
${answer.body}

━━ PEER REPLIES MADE (${peerRepliesMade} total) ━━
${replyLines}

━━ AUTO-DETECTED ━━
- Images/figures embedded: ${hasFigures}
- APA in-text citations found: ${referenceCount} (${apaMatches.slice(0, 3).join(', ') || 'none'})
- Reference list / bibliography present: ${hasReferences}

━━ GRADING TASK ━━
Return ONLY this JSON object:
{
  "quality":  <0–${weights.w_quality}, depth + accuracy + relevance + real examples>,
  "figures":  <0–${weights.w_figures}, (a) APA citations quality AND (b) figures/tables/charts — full score needs both, partial for one>,
  "replies":  <0–${weights.w_replies}, peer reply score: 0 if none, partial if below ${minReplies} required, partial if all generic, full if ${minReplies}+ substantive replies>,
  "writing":  <0–${weights.w_writing}, clarity + structure + grammar + academic tone>,

  "aiDetected":   <true/false>,
  "aiConfidence": <"low"|"medium"|"high">,
  "aiReason":     <1 sentence: specific phrases/patterns that signal AI writing, or "">,

  "apaScore":   <"none"|"poor"|"fair"|"good">,
  "apaDetails": <2 sentences: what citations are present, what is wrong or missing, quote a specific example>,

  "figureDetails": <1–2 sentences: figures present? labeled? relevant? referenced in text? or absent?>,

  "peerRepliesMet":      <true if student made >= ${minReplies} replies, else false>,
  "peerReplyBreakdown":  [
    { "repliedTo": "<name>", "quality": "<generic|substantive>", "summary": "<1 sentence summary of what they said>" }
  ],
  "peerComment": <2–3 sentences: did they meet the ${minReplies}-reply requirement? quality of each reply — were they substantive or generic? specific quotes welcome>,

  "contentComment": <3–4 sentences: detailed analysis of answer — what was strong, what was shallow, missing concepts, quality of examples used>,
  "apaComment":     <2–3 sentences: detailed APA analysis — correct format? missing reference list? specific errors found?>,
  "figureComment":  <1–2 sentences: figure/table usage — present and relevant or missing?>,

  "feedback":       <4–5 sentence overall constructive feedback covering all criteria with one specific actionable improvement>,

  "copiedContent":  <true/false>,
  "plagiarismNote": <1 sentence with quoted excerpt if plagiarism suspected, else "">
}

APA rules: in-text = (Author, Year) or (Author et al., Year). Reference list = Author, A. (Year). Title. Journal, vol(iss), pp. https://doi.org/xxx. Flag: wrong brackets, missing year, no reference list, URLs without DOI prefix.
AI signals: "In conclusion" / "It is important to note" / "Firstly… Secondly… Finally" / perfect bullet structure / no personal voice / zero grammar variation / no specific personal experience.`;

    try {
        const rawText = await callLLM(prompt, provider, apiKey, modelName, customUrl);
        const parsed  = JSON.parse(rawText);

        const baseScore   = (parsed.quality || 0) + (parsed.figures || 0) + (parsed.replies || 0) + (parsed.writing || 0);
        const aiDeduction = (parsed.aiDetected && parsed.aiConfidence !== 'low') ? aiDeduct : 0;
        const finalScore  = Math.max(0, Math.min(100, Math.round(baseScore - aiDeduction)));

        return {
            author,
            submissionDate: answer.date || '',
            finalScore,
            grade: letterGrade(finalScore),
            breakdown: {
                quality: parsed.quality || 0,
                figures: parsed.figures || 0,
                replies: parsed.replies || 0,
                writing: parsed.writing || 0
            },
            aiDetected:   parsed.aiDetected && parsed.aiConfidence !== 'low',
            aiConfidence: parsed.aiConfidence || 'low',
            aiReason:     parsed.aiReason || '',
            aiDeduction,
            apaScore:      parsed.apaScore || 'none',
            apaDetails:    parsed.apaDetails || '',
            figureDetails: parsed.figureDetails || '',
            peerRepliesMet:     parsed.peerRepliesMet || false,
            peerReplyBreakdown: parsed.peerReplyBreakdown || [],
            peerComment:    parsed.peerComment || '',
            contentComment: parsed.contentComment || '',
            apaComment:     parsed.apaComment || '',
            figureComment:  parsed.figureComment || '',
            feedback:       parsed.feedback || '',
            copiedContent:  parsed.copiedContent || false,
            plagiarismNote: parsed.plagiarismNote || '',
            hasFigures,
            hasReferences,
            referenceCount,
            peerRepliesMade,
            repliedToList,
            minReplies
        };

    } catch (err) {
        return {
            author,
            submissionDate: answer.date || '',
            finalScore: 0,
            grade: 'F',
            breakdown: { quality: 0, figures: 0, replies: 0, writing: 0 },
            aiDetected: false, aiConfidence: 'low', aiReason: '',
            aiDeduction: 0,
            apaScore: 'none', apaDetails: '', figureDetails: '',
            peerRepliesMet: false, peerReplyBreakdown: [],
            peerComment: '', contentComment: '', apaComment: '', figureComment: '',
            feedback: 'Grading failed: ' + err.message,
            copiedContent: false, plagiarismNote: '',
            hasFigures, hasReferences, referenceCount,
            peerRepliesMade, repliedToList, minReplies
        };
    }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function extractDiscussionName(str) {
    if (!str) return 'forum';
    // Match "DQ1", "DQ 1", "DQ-1", "Assessment 1", "Assignment 1" anywhere in string
    const m = str.match(/\bDQ\s*[-_]?\s*\d+|\bAssessment\s*\d+|\bAssignment\s*\d+/i);
    if (m) return m[0].replace(/[\s\-_]+/g, '').toUpperCase(); // → "DQ1", "ASSESSMENT1"
    if (/\bDQ\b/i.test(str)) return 'DQ';
    return 'forum';
}

// ─── CSV EXPORT ─────────────────────────────────────────────────────────────

function buildCSVExport(grades, pageTitle, pageUrl) {
    const header = [
        'Student Name', 'Letter Grade', 'Final Score (/100)',
        'Answer Quality', 'References & Figures', 'Peer Replies', 'Writing Clarity',
        'APA Score', 'APA Details', 'Figure Details',
        'Min Replies Required', 'Peer Replies Made', 'Replies Requirement Met',
        'Reply Quality Breakdown', 'Peer Comment',
        'Content Comment', 'APA Comment', 'Figure Comment',
        'AI Detected', 'AI Confidence', 'AI Reason', 'AI Deduction',
        'Copied Content', 'Plagiarism Note',
        'Replied To', 'Feedback / Comment',
        'Submission Date', 'Late Status', 'Days Late', 'Late Penalty Pts'
    ].join(',');

    const rows = grades.map(g => {
        const replyBreakdown = (g.peerReplyBreakdown || [])
            .map(r => `${r.repliedTo} [${r.quality}]: ${r.summary}`)
            .join(' | ');

        return [
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
            g.minReplies || 2,
            g.peerRepliesMade,
            g.peerRepliesMet ? 'YES' : 'NO',
            csvEsc(replyBreakdown),
            csvEsc(g.peerComment || ''),
            csvEsc(g.contentComment || ''),
            csvEsc(g.apaComment || ''),
            csvEsc(g.figureComment || ''),
            g.aiDetected ? 'YES' : 'NO',
            g.aiConfidence || 'N/A',
            csvEsc(g.aiReason || ''),
            g.aiDeduction || 0,
            g.copiedContent ? 'YES' : 'NO',
            csvEsc(g.plagiarismNote || ''),
            csvEsc((g.repliedToList || []).join('; ')),
            csvEsc(g.feedback),
            csvEsc(g.submissionDate || ''),
            (g.lateSubmission?.status || 'on-time'),
            (g.lateSubmission?.daysLate || 0),
            (g.latePenaltyPts || 0)
        ].join(',');
    });

    const csv    = [header, ...rows].join('\n');
    const stamp  = new Date().toISOString().slice(0, 10);
    const dqName = extractDiscussionName(pageTitle || pageUrl || '');
    const filename = `${dqName}_grades_${stamp}.csv`;
    // Return data to caller — download is triggered in popup/content context (MV3 SW can't hold blob URLs)
    return { csv: '﻿' + csv, filename };
}

function csvEsc(val) {
    const str = String(val || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// ─── HEURISTICS GRADER (instant, no AI) ─────────────────────────────────────

function gradeHeuristics({ posts, weights, minReplies }) {
    const req = minReplies || 2;
    const studentPosts = posts.filter(p => p.idx > 0 || posts.length === 1);

    const byAuthor = {};
    studentPosts.forEach(p => {
        if (!byAuthor[p.author]) byAuthor[p.author] = { answer: null, replies: [] };
        if (p.isAnswer)                       byAuthor[p.author].answer = p;
        else if (p.isPeerReply)               byAuthor[p.author].replies.push(p);
        else if (!byAuthor[p.author].answer)  byAuthor[p.author].answer = p;
    });

    const allTexts = Object.values(byAuthor).filter(d => d.answer).map(d => d.answer.body);

    const grades = [];
    for (const author of Object.keys(byAuthor)) {
        if (!byAuthor[author].answer) continue;
        grades.push(scoreHeuristics(author, byAuthor[author], weights, req, allTexts));
    }
    return { grades };
}

function scoreHeuristics(author, data, weights, minReplies, allTexts) {
    const { answer, replies } = data;
    const text = answer.body;

    const words      = text.split(/\s+/).filter(w => w.length > 1).length;
    const sentences  = text.split(/[.!?]+/).filter(s => s.trim().length > 5).length;
    const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 20).length;

    // APA detection
    const apaMatches   = text.match(/\([A-Z][a-zA-Z\-]+(?:\s+et\s+al\.)?,\s+\d{4}\)/g) || [];
    const citCount     = apaMatches.length;
    const hasRefList   = /\b(references|bibliography)\b/i.test(text);
    const hasFigures   = (answer.images || 0) > 0 ||
                         /\b(figure|table|chart|graph|diagram)\b/i.test(text);
    const peerRepliesMade = replies.length;
    const peerRepliesMet  = peerRepliesMade >= minReplies;

    // AI signal detection
    const aiResult = detectAISignals(text);

    // Plagiarism: 5-gram similarity vs other submissions
    let copiedContent = false, plagiarismNote = '';
    const otherTexts = (allTexts || []).filter(t => t !== text);
    let maxSim = 0;
    for (const other of otherTexts) {
        const sim = calcSimilarity(text, other);
        if (sim > maxSim) maxSim = sim;
    }
    if (maxSim > 0.35) {
        copiedContent = true;
        plagiarismNote = `High text overlap with another submission (${Math.round(maxSim * 100)}% 5-gram similarity). Manual review recommended.`;
    }

    // Peer reply breakdown from scraped reply data
    const peerReplyBreakdown = replies.map(r => {
        const rWords = r.body.split(/\s+/).filter(w => w.length > 1).length;
        const hasAck = /\b(you mentioned|you said|your point|I agree|great point|building on|you noted|in response to|as you pointed)\b/i.test(r.body);
        const quality = (rWords >= 50 || hasAck) ? 'substantive' : 'generic';
        return {
            repliedTo: r.repliedTo?.[0] || 'classmate',
            quality,
            summary: r.body.substring(0, 120).trim() + (r.body.length > 120 ? '…' : '')
        };
    });

    // Quality score: word count + structure
    let qualPct = Math.min(1, words / 350);
    if (paragraphs >= 3) qualPct = Math.min(1, qualPct + 0.05);
    if (sentences >= 5 && sentences / Math.max(paragraphs, 1) >= 3) qualPct = Math.min(1, qualPct + 0.05);
    const quality = Math.round(weights.w_quality * qualPct);

    // APA + Figures
    let figPct = 0;
    if (citCount >= 2 && hasRefList)      figPct = 1.0;
    else if (citCount >= 1 && hasRefList) figPct = 0.75;
    else if (citCount >= 1)               figPct = 0.5;
    else if (hasFigures)                  figPct = 0.25;
    if (hasFigures && citCount > 0)       figPct = Math.min(1, figPct + 0.15);
    const figures = Math.round(weights.w_figures * figPct);

    // Peer replies
    const substantiveReplies = peerReplyBreakdown.filter(r => r.quality === 'substantive').length;
    let repPct = 0;
    if (peerRepliesMet) {
        repPct = substantiveReplies >= minReplies ? 1.0 : 0.80;
    } else if (peerRepliesMade > 0) {
        repPct = (peerRepliesMade / minReplies) * 0.7;
    }
    const repliesScore = Math.round(weights.w_replies * repPct);

    // Writing quality
    const avgLen = words / Math.max(sentences, 1);
    const goodStructure = paragraphs >= 2 && avgLen >= 8 && avgLen <= 40;
    const writing = Math.round(weights.w_writing * (goodStructure ? 0.75 : paragraphs >= 1 ? 0.45 : 0.20));

    const rawScore  = Math.min(100, quality + figures + repliesScore + writing);
    const aiDeduction = (aiResult.detected && aiResult.confidence !== 'low') ? 20 : 0;
    const finalScore  = Math.max(0, rawScore - aiDeduction);

    const apaLabel = citCount >= 2 && hasRefList ? 'good' : citCount >= 1 ? 'fair' : 'none';

    return {
        author,
        submissionDate: answer.date || '',
        finalScore,
        grade: letterGrade(finalScore),
        gradingMode: 'heuristics',
        breakdown: { quality, figures, replies: repliesScore, writing },
        aiDetected: aiResult.detected && aiResult.confidence !== 'low',
        aiConfidence: aiResult.confidence,
        aiReason: aiResult.reason,
        aiDeduction,
        apaScore: apaLabel,
        apaDetails: citCount > 0
            ? `${citCount} APA citation(s) found (${apaMatches.slice(0, 2).join(', ')})${hasRefList ? ' + reference list present.' : ' — no reference list detected.'}`
            : 'No APA citations detected.',
        figureDetails: hasFigures ? 'Figure, table or chart keyword detected in post.' : 'No figures or tables found.',
        peerRepliesMet,
        peerReplyBreakdown,
        peerComment: `${peerRepliesMade}/${minReplies} required replies made. ${peerRepliesMet ? 'Requirement met.' : 'Requirement NOT met.'} ${substantiveReplies > 0 ? `${substantiveReplies} substantive reply/replies detected (≥50 words or explicit engagement).` : 'Replies appear brief/generic.'} (Use AI grading for deeper quality analysis.)`,
        contentComment: `${words} words across ~${paragraphs} paragraph(s), ${sentences} sentences (avg ${Math.round(avgLen)} words/sentence). ${words >= 350 ? 'Meets recommended length.' : 'Below recommended 350-word threshold.'} ${citCount > 0 ? `${citCount} APA citation(s) detected.` : 'No citations found.'} Heuristic estimate only.`,
        apaComment: citCount > 0 ? `${citCount} in-text citation(s) detected. ${hasRefList ? 'Reference list section found.' : 'No reference list section found.'}` : 'No APA citations found in post.',
        figureComment: hasFigures ? 'Visual content or figure references detected.' : 'No visual content detected.',
        feedback: `⚡ Heuristic estimate (no AI used). ${words} words · ${citCount} APA citation(s) · ${peerRepliesMade}/${minReplies} peer replies · ${aiResult.detected ? `AI signal (${aiResult.confidence} confidence): ${aiResult.reason}` : 'no strong AI signal'}. For qualitative feedback, use an AI provider.`,
        copiedContent,
        plagiarismNote,
        hasFigures,
        hasReferences: hasRefList || citCount > 0,
        referenceCount: citCount,
        peerRepliesMade,
        repliedToList: replies.map(r => r.repliedTo).flat().filter(Boolean),
        minReplies
    };
}

// ─── EXPORT POSTS JSON (for local Python grader) ─────────────────────────────

function buildPostsExport(posts, metadata) {
    const studentPosts = posts.filter(p => p.idx > 0 || posts.length === 1);

    const byAuthor = {};
    studentPosts.forEach(p => {
        if (!byAuthor[p.author]) byAuthor[p.author] = { answer: null, replies: [] };
        if (p.isAnswer)                       byAuthor[p.author].answer = p;
        else if (p.isPeerReply)               byAuthor[p.author].replies.push(p);
        else if (!byAuthor[p.author].answer)  byAuthor[p.author].answer = p;
    });

    const exportData = {
        exportedAt:       new Date().toISOString(),
        discussionUrl:    metadata?.url   || '',
        discussionTitle:  metadata?.title || '',
        totalStudents:    Object.keys(byAuthor).length,
        totalPosts:       posts.length,
        students: []
    };

    for (const [author, data] of Object.entries(byAuthor)) {
        if (!data.answer) continue;
        const text = data.answer.body;
        const words = text.split(/\s+/).filter(w => w.length > 1).length;
        const apaMatches = text.match(/\([A-Z][a-zA-Z\-]+(?:\s+et\s+al\.)?,\s+\d{4}\)/g) || [];

        exportData.students.push({
            name:  author,
            answer: {
                text,
                wordCount:      words,
                date:           data.answer.date    || '',
                hasImages:      (data.answer.images || 0) > 0,
                apaCitationsDetected: apaMatches,
                hasReferenceList: /\b(references|bibliography)\b/i.test(text)
            },
            replies: data.replies.map(r => ({
                text:      r.body,
                repliedTo: r.repliedTo || [],
                date:      r.date || ''
            })),
            peerRepliesCount: data.replies.length
        });
    }

    const jsonStr = JSON.stringify(exportData, null, 2);
    const stamp   = new Date().toISOString().slice(0, 10);
    const dqName  = extractDiscussionName(metadata?.title || metadata?.url || '');
    const filename = `${dqName}_posts_${stamp}.json`;
    return { json: jsonStr, filename };
}
