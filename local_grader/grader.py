"""
local_grader.py — Heavy local grading using pre-trained models.

NO model training needed. All models download automatically from HuggingFace Hub
on first run and are cached locally for all future runs.

Usage:
    python grader.py forum-posts-2025-05-15.json

Output:
    detailed_grades_2025-05-15.csv

Requirements:
    pip install -r requirements.txt
    (Ollama optional — install from ollama.com and run: ollama pull llama3.2)
"""

import json
import sys
import re
import os
from datetime import datetime
from pathlib import Path

# ── Check dependencies ────────────────────────────────────────────────────────
MISSING = []
try:
    import torch
except ImportError:
    MISSING.append("torch")
try:
    from transformers import pipeline
except ImportError:
    MISSING.append("transformers")
try:
    from sentence_transformers import SentenceTransformer, util
except ImportError:
    MISSING.append("sentence-transformers")
try:
    import pandas as pd
except ImportError:
    MISSING.append("pandas")

if MISSING:
    print(f"❌  Missing packages: {', '.join(MISSING)}")
    print(f"    Run: pip install {' '.join(MISSING)}")
    sys.exit(1)

# Ollama is optional
OLLAMA_AVAILABLE = False
try:
    import ollama as ollama_client
    OLLAMA_AVAILABLE = True
except ImportError:
    pass


# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_MODEL       = os.environ.get("OLLAMA_MODEL", "llama3.2")
AI_DETECT_MODEL    = "openai-community/roberta-base-openai-detector"
EMBEDDING_MODEL    = "sentence-transformers/all-MiniLM-L6-v2"
PLAGIARISM_THRESH  = 0.85   # cosine similarity above this = flag
MIN_REPLIES        = int(os.environ.get("MIN_REPLIES", "2"))

# Grading weights (must total 100)
WEIGHTS = {
    "quality":  int(os.environ.get("W_QUALITY",  "35")),
    "figures":  int(os.environ.get("W_FIGURES",  "20")),
    "replies":  int(os.environ.get("W_REPLIES",  "25")),
    "writing":  int(os.environ.get("W_WRITING",  "20")),
}


# ── Letter grade ──────────────────────────────────────────────────────────────

def letter_grade(score):
    if score >= 90: return "A"
    if score >= 80: return "B"
    if score >= 70: return "C"
    if score >= 60: return "D"
    return "F"


# ── APA detection (regex, no model needed) ────────────────────────────────────

APA_PATTERN = re.compile(r'\([A-Z][a-zA-Z\-]+(?:\s+et\s+al\.)?,\s+\d{4}\)')

def check_apa(text):
    matches = APA_PATTERN.findall(text)
    has_ref_list = bool(re.search(r'\b(references|bibliography)\b', text, re.I))
    has_doi      = bool(re.search(r'doi:|https?://', text))
    count = len(matches)
    if count >= 2 and has_ref_list: score = "good"
    elif count >= 1 and has_ref_list: score = "fair"
    elif count >= 1: score = "fair"
    else: score = "none"
    return {
        "count":        count,
        "examples":     matches[:3],
        "hasRefList":   has_ref_list,
        "hasDOI":       has_doi,
        "apaScore":     score
    }


# ── Heuristic text features ───────────────────────────────────────────────────

def text_features(text):
    words      = len([w for w in text.split() if len(w) > 1])
    sentences  = len([s for s in re.split(r'[.!?]+', text) if len(s.strip()) > 5])
    paragraphs = len([p for p in text.split('\n') if len(p.strip()) > 20])
    avg_sent   = words / max(sentences, 1)
    has_figure = bool(re.search(r'\b(figure|table|chart|graph|diagram)\b', text, re.I))
    return {
        "wordCount":    words,
        "sentences":    sentences,
        "paragraphs":   paragraphs,
        "avgSentLen":   round(avg_sent, 1),
        "hasFigure":    has_figure
    }


# ── AI content detection (RoBERTa) ───────────────────────────────────────────

print("⏳  Loading AI detector (RoBERTa) — downloads ~125MB on first run…")
ai_detector = pipeline(
    "text-classification",
    model=AI_DETECT_MODEL,
    device=-1  # CPU; change to 0 for GPU
)

def detect_ai(text):
    # Model max 512 tokens — chunk if needed
    chunk = text[:1800]
    result = ai_detector(chunk, truncation=True, max_length=512)[0]
    # Label 1 = AI-generated in this model
    is_ai  = result["label"] in ("LABEL_1", "AI")
    conf   = result["score"]
    return {
        "detected":   is_ai,
        "confidence": round(conf, 3),
        "level":      "high" if conf > 0.85 else "medium" if conf > 0.65 else "low"
    }


# ── Plagiarism / similarity (sentence embeddings) ────────────────────────────

print("⏳  Loading sentence embeddings (MiniLM-L6) — ~25MB…")
embedder = SentenceTransformer(EMBEDDING_MODEL)

def compute_similarity_matrix(texts):
    if len(texts) < 2:
        return []
    embeddings = embedder.encode(texts, convert_to_tensor=True, show_progress_bar=False)
    sim_matrix = util.cos_sim(embeddings, embeddings)
    return sim_matrix.tolist()

def find_plagiarism_pairs(students, threshold=PLAGIARISM_THRESH):
    texts  = [s["answer"]["text"] for s in students]
    names  = [s["name"]           for s in students]
    matrix = compute_similarity_matrix(texts)
    pairs  = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            sim = matrix[i][j]
            if sim >= threshold:
                pairs.append({
                    "student1":   names[i],
                    "student2":   names[j],
                    "similarity": round(sim, 3)
                })
    return pairs


# ── LLM grading via Ollama ────────────────────────────────────────────────────

def grade_with_ollama(student, weights, min_replies, model=OLLAMA_MODEL):
    author   = student["name"]
    answer   = student["answer"]["text"]
    replies  = student["replies"]
    apa      = student.get("_apa", {})
    features = student.get("_features", {})

    reply_lines = "\n".join([
        f"  Reply {i+1} → to {r['repliedTo']}: \"{r['text'][:300]}\""
        for i, r in enumerate(replies)
    ]) or "  None"

    prompt = f"""You are grading a student's Moodle forum post for an academic course.
Return ONLY valid JSON, no markdown, no explanation outside the JSON.

STUDENT: {author}
MIN PEER REPLIES REQUIRED: {min_replies}

ANSWER:
{answer}

PEER REPLIES ({len(replies)}):
{reply_lines}

DETECTED: wordCount={features.get('wordCount',0)}, APA citations={apa.get('count',0)}, referenceList={apa.get('hasRefList',False)}, figures={features.get('hasFigure',False)}

Return JSON:
{{"quality":0-{weights['quality']},"figures":0-{weights['figures']},"replies":0-{weights['replies']},"writing":0-{weights['writing']},"apaScore":"none|poor|fair|good","apaDetails":"2 sentences on citation quality","figureDetails":"1 sentence","peerRepliesMet":true/false,"peerReplyBreakdown":[{{"repliedTo":"","quality":"generic|substantive","summary":""}}],"peerComment":"2-3 sentences","contentComment":"3-4 sentences","feedback":"4-5 sentence constructive feedback"}}"""

    try:
        resp   = ollama_client.chat(model=model, messages=[{"role": "user", "content": prompt}])
        raw    = resp["message"]["content"].replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        return parsed, None
    except Exception as e:
        return None, str(e)


# ── Heuristic score (fallback if Ollama not available) ───────────────────────

def score_heuristics(student, weights, min_replies):
    apa      = student.get("_apa", {})
    features = student.get("_features", {})
    replies  = student["replies"]
    n_rep    = len(replies)
    rep_met  = n_rep >= min_replies

    quality  = round(weights["quality"] * min(1, features.get("wordCount", 0) / 350))
    cit      = apa.get("count", 0)
    fig      = features.get("hasFigure", False)
    fig_pct  = 1.0 if cit >= 2 and apa.get("hasRefList") else \
               0.75 if cit >= 1 and apa.get("hasRefList") else \
               0.5  if cit >= 1 else \
               0.25 if fig else 0
    if fig and cit > 0: fig_pct = min(1.0, fig_pct + 0.15)
    figures  = round(weights["figures"] * fig_pct)

    rep_pct  = 0.80 if rep_met else (n_rep / min_replies * 0.7 if n_rep > 0 else 0)
    rep_score = round(weights["replies"] * rep_pct)

    avg_len  = features.get("avgSentLen", 0)
    good_str = features.get("paragraphs", 0) >= 2 and 8 <= avg_len <= 40
    writing  = round(weights["writing"] * (0.75 if good_str else 0.45 if features.get("paragraphs", 0) >= 1 else 0.20))

    return {
        "quality":  quality,
        "figures":  figures,
        "replies":  rep_score,
        "writing":  writing,
        "apaScore":  apa.get("apaScore", "none"),
        "apaDetails": f"{cit} citation(s) found. {'Reference list present.' if apa.get('hasRefList') else 'No reference list.'}",
        "figureDetails": "Figures/tables detected." if fig else "No figures detected.",
        "peerRepliesMet": rep_met,
        "peerReplyBreakdown": [],
        "peerComment": f"{n_rep}/{min_replies} replies made. {'Requirement met.' if rep_met else 'Requirement NOT met.'}",
        "contentComment": f"{features.get('wordCount',0)} words, {features.get('paragraphs',0)} paragraphs. Heuristic estimate.",
        "feedback": f"Heuristic estimate only. {features.get('wordCount',0)} words · {cit} APA citations · {n_rep}/{min_replies} peer replies."
    }


# ── Main processing ───────────────────────────────────────────────────────────

def process(input_file):
    with open(input_file, encoding="utf-8") as f:
        data = json.load(f)

    students = data.get("students", [])
    if not students:
        print("❌  No students found in JSON. Export the forum from the Chrome extension first.")
        sys.exit(1)

    print(f"\n📋  Processing {len(students)} students from: {data.get('discussionUrl','')}")
    print(f"    Using Ollama: {'YES — ' + OLLAMA_MODEL if OLLAMA_AVAILABLE else 'NO (heuristics only)'}")
    print(f"    Min peer replies: {MIN_REPLIES}\n")

    # Pre-compute features for each student
    for s in students:
        s["_apa"]      = check_apa(s["answer"]["text"])
        s["_features"] = text_features(s["answer"]["text"])

    # ── AI detection ─────────────────────────────────────────────────────────
    print("🤖  Running AI content detection…")
    for s in students:
        s["_ai"] = detect_ai(s["answer"]["text"])
        flag = "⚠ AI" if s["_ai"]["detected"] else "✓"
        print(f"    {s['name'][:30]:<30}  {flag}  ({s['_ai']['level']} confidence {s['_ai']['confidence']})")

    # ── Plagiarism detection ──────────────────────────────────────────────────
    print("\n🔍  Running cross-post similarity (plagiarism check)…")
    plagiarism_pairs = find_plagiarism_pairs(students)
    if plagiarism_pairs:
        print(f"    ⚠  {len(plagiarism_pairs)} suspicious pair(s) found:")
        for p in plagiarism_pairs:
            print(f"       {p['student1']} ↔ {p['student2']}  ({p['similarity']*100:.1f}% similar)")
    else:
        print("    ✓  No cross-post plagiarism above threshold.")

    # Build plagiarism map per student
    plagiarism_by_student = {}
    for pair in plagiarism_pairs:
        for name in [pair["student1"], pair["student2"]]:
            other = pair["student2"] if name == pair["student1"] else pair["student1"]
            plagiarism_by_student.setdefault(name, []).append(f"{other} ({pair['similarity']*100:.1f}%)")

    # ── Grading ───────────────────────────────────────────────────────────────
    print(f"\n📝  Grading with {'Ollama ' + OLLAMA_MODEL if OLLAMA_AVAILABLE else 'heuristics'}…")
    rows = []

    for s in students:
        name    = s["name"]
        ai_info = s["_ai"]
        apa     = s["_apa"]
        feat    = s["_features"]
        n_rep   = s["peerRepliesCount"]
        rep_met = n_rep >= MIN_REPLIES

        # Get LLM grades or fall back to heuristics
        if OLLAMA_AVAILABLE:
            parsed, err = grade_with_ollama(s, WEIGHTS, MIN_REPLIES)
            if err or not parsed:
                print(f"    ⚠  Ollama failed for {name}: {err} — falling back to heuristics")
                parsed = score_heuristics(s, WEIGHTS, MIN_REPLIES)
                grading_mode = "heuristics"
            else:
                grading_mode = f"ollama:{OLLAMA_MODEL}"
        else:
            parsed = score_heuristics(s, WEIGHTS, MIN_REPLIES)
            grading_mode = "heuristics"

        # AI deduction
        ai_deduction = 0
        if ai_info["detected"] and ai_info["level"] != "low":
            ai_deduction = 20  # configurable

        base_score = (parsed.get("quality",0) + parsed.get("figures",0) +
                      parsed.get("replies",0) + parsed.get("writing",0))
        final_score = max(0, min(100, round(base_score - ai_deduction)))

        plagiarism_flag   = name in plagiarism_by_student
        plagiarism_note   = "Similar to: " + ", ".join(plagiarism_by_student[name]) if plagiarism_flag else ""

        reply_breakdown = parsed.get("peerReplyBreakdown", [])
        reply_bd_str    = " | ".join([f"{r.get('repliedTo','')} [{r.get('quality','')}]: {r.get('summary','')}" for r in reply_breakdown])

        print(f"    {name[:30]:<30}  {final_score:>3}/100  {letter_grade(final_score)}  "
              f"{'🤖' if ai_info['detected'] else ' '}  "
              f"{'⚠ plagiarism' if plagiarism_flag else ''}")

        rows.append({
            "Student Name":          name,
            "Letter Grade":          letter_grade(final_score),
            "Final Score (/100)":    final_score,
            "Grading Mode":          grading_mode,
            "Answer Quality":        parsed.get("quality", 0),
            "References & Figures":  parsed.get("figures", 0),
            "Peer Replies Score":    parsed.get("replies", 0),
            "Writing Clarity":       parsed.get("writing", 0),
            "Word Count":            feat["wordCount"],
            "Paragraphs":            feat["paragraphs"],
            "Avg Sentence Length":   feat["avgSentLen"],
            "APA Score":             parsed.get("apaScore", "none"),
            "APA Citations Found":   apa["count"],
            "APA Examples":          "; ".join(apa["examples"]),
            "Has Reference List":    "YES" if apa["hasRefList"] else "NO",
            "Has Figures":           "YES" if feat["hasFigure"] else "NO",
            "APA Details":           parsed.get("apaDetails", ""),
            "Figure Details":        parsed.get("figureDetails", ""),
            "Min Replies Required":  MIN_REPLIES,
            "Peer Replies Made":     n_rep,
            "Replies Req Met":       "YES" if rep_met else "NO",
            "Reply Breakdown":       reply_bd_str,
            "Peer Comment":          parsed.get("peerComment", ""),
            "Content Comment":       parsed.get("contentComment", ""),
            "AI Detected":           "YES" if ai_info["detected"] else "NO",
            "AI Confidence":         ai_info["level"],
            "AI Score":              ai_info["confidence"],
            "AI Deduction":          ai_deduction,
            "Cross-Post Plagiarism": "YES" if plagiarism_flag else "NO",
            "Plagiarism Note":       plagiarism_note,
            "Feedback / Comment":    parsed.get("feedback", ""),
        })

    # ── Output CSV ────────────────────────────────────────────────────────────
    import pandas as pd
    df    = pd.DataFrame(rows)
    stamp = datetime.now().strftime("%Y-%m-%d")
    out   = Path(input_file).parent / f"detailed_grades_{stamp}.csv"
    df.to_csv(out, index=False)

    print(f"\n✅  Done! Saved → {out}")
    print(f"    Students graded: {len(rows)}")
    print(f"    Average score:   {df['Final Score (/100)'].mean():.1f}/100")
    print(f"    AI flagged:      {df['AI Detected'].eq('YES').sum()}")
    print(f"    Plagiarism pairs:{len(plagiarism_pairs)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python grader.py forum-posts-YYYY-MM-DD.json")
        print("\nExport the JSON from the Chrome extension:")
        print("  1. Open the Moodle discussion page")
        print("  2. Click the extension icon")
        print("  3. Click '📤 Export Posts'")
        sys.exit(1)

    process(sys.argv[1])
