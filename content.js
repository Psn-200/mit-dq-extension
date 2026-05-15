// content.js — scrapes Moodle forum posts and renders dashboard overlay

(function () {

    // ─── SCRAPE ────────────────────────────────────────────────────────────────

    function scrapeMoodleForum() {
        const posts = [];

        // Moodle forum posts — various selectors for different themes
        const postSelectors = [
            '.forumpost',
            '.post.clearfix',
            'article.forum-post-container',
            '[data-region="post"]',
            '.discussion-post'
        ];

        let postEls = [];
        for (const sel of postSelectors) {
            postEls = Array.from(document.querySelectorAll(sel));
            if (postEls.length > 0) break;
        }

        // Fallback: any element with author + content
        if (postEls.length === 0) {
            postEls = Array.from(document.querySelectorAll('[id^="p"]')).filter(el => {
                return el.querySelector('.author, .by, [data-name]');
            });
        }

        const allAuthors = [];

        postEls.forEach((el, idx) => {
            // Author
            const authorEl = el.querySelector(
                '.author a, .by a, [data-name], .username, h4 a, .poster-name, ' +
                '[data-region="author-name"], .fullname'
            );
            const author = authorEl ? authorEl.textContent.trim() : `User ${idx + 1}`;

            // Subject / title
            const subjectEl = el.querySelector(
                '.subject, .posttitle, [data-region="post-title"], h3, h4'
            );
            const subject = subjectEl ? subjectEl.textContent.trim() : '';

            // Body content
            const bodyEl = el.querySelector(
                '.posting, .post-content-container, [data-region="post-body"], ' +
                '.forumpost-body, .content .post, .message'
            );
            const body = bodyEl ? bodyEl.innerText.trim() : el.innerText.trim();

            // Post ID and parent (for reply detection)
            const postId = el.id || el.getAttribute('data-post-id') || String(idx);
            const parentId = el.getAttribute('data-parent-id') ||
                el.closest('[data-parent]')?.getAttribute('data-parent') || null;

            // Date
            const dateEl = el.querySelector('.time, .date, time, .posteddate');
            const date = dateEl ? dateEl.textContent.trim() : '';

            // Has images/figures?
            const images = el.querySelectorAll('img:not([width="1"]):not([height="1"])').length;

            if (body.length > 20) {
                posts.push({ idx, postId, parentId, author, subject, body, date, images });
                allAuthors.push(author);
            }
        });

        // Build reply graph: who replied to whom
        // First post is usually the question; subsequent ones are replies
        // Posts with parentId = first post's id are direct answers
        // Posts with parentId = other answers are peer replies

        const firstPostId = posts.length > 0 ? posts[0].postId : null;

        posts.forEach(p => {
            p.isAnswer = (p.parentId === firstPostId) || (p.idx === 0);
            p.isPeerReply = p.parentId && p.parentId !== firstPostId;

            // Count replies to this post
            p.repliesReceived = posts.filter(r => r.parentId === p.postId).length;

            // Count peer replies this person made (excluding replies to main question)
            p.peerRepliesMade = posts.filter(r =>
                r.author === p.author && r.isPeerReply
            ).length;

            // Who did they reply to?
            p.repliedTo = posts
                .filter(r => r.postId === p.parentId)
                .map(r => r.author);
        });

        return posts;
    }

    // ─── MESSAGES ──────────────────────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

        if (msg.action === 'SCRAPE_FORUM') {
            const posts = scrapeMoodleForum();
            sendResponse({ posts });
            return true;
        }

        if (msg.action === 'SHOW_OVERLAY') {
            renderOverlay(msg.grades);
            sendResponse({ ok: true });
            return true;
        }
    });

    // ─── OVERLAY ───────────────────────────────────────────────────────────────

    function renderOverlay(grades) {
        // Remove existing
        const existing = document.getElementById('mfg-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'mfg-overlay';
        overlay.innerHTML = buildOverlayHTML(grades);
        document.body.appendChild(overlay);

        // Event listeners
        document.getElementById('mfg-close').addEventListener('click', () => overlay.remove());
        document.getElementById('mfg-minimize').addEventListener('click', () => {
            const body = document.getElementById('mfg-body');
            body.style.display = body.style.display === 'none' ? 'block' : 'none';
        });

        // Tab switching
        overlay.querySelectorAll('.mfg-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                overlay.querySelectorAll('.mfg-tab').forEach(t => t.classList.remove('active'));
                overlay.querySelectorAll('.mfg-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('mfg-panel-' + tab.dataset.tab).classList.add('active');
            });
        });

        // Sort
        document.getElementById('mfg-sort').addEventListener('change', (e) => {
            renderTable(grades, e.target.value);
        });

        renderTable(grades, 'score-desc');
        renderSummary(grades);
    }

    function buildOverlayHTML(grades) {
        const avg = grades.reduce((s, g) => s + g.finalScore, 0) / grades.length;
        return `
  <div class="mfg-header">
    <div class="mfg-logo">🎓</div>
    <div class="mfg-title">
      <span>Forum Grader</span>
      <small>${grades.length} students · avg ${avg.toFixed(1)}/100</small>
    </div>
    <div class="mfg-controls">
      <button id="mfg-minimize">⊟</button>
      <button id="mfg-close">✕</button>
    </div>
  </div>
  <div id="mfg-body">
    <div class="mfg-tabs">
      <button class="mfg-tab active" data-tab="table">📋 Grades</button>
      <button class="mfg-tab" data-tab="summary">📊 Summary</button>
    </div>
    <div id="mfg-panel-table" class="mfg-panel active">
      <div class="mfg-toolbar">
        <select id="mfg-sort">
          <option value="score-desc">Sort: Score ↓</option>
          <option value="score-asc">Score ↑</option>
          <option value="name">Name A–Z</option>
          <option value="replies">Most Replies</option>
        </select>
      </div>
      <div id="mfg-table-container"></div>
    </div>
    <div id="mfg-panel-summary" class="mfg-panel">
      <div id="mfg-summary-container"></div>
    </div>
  </div>`;
    }

    function getScoreColor(score) {
        if (score >= 85) return '#4ade80';
        if (score >= 70) return '#facc15';
        if (score >= 55) return '#fb923c';
        return '#f87171';
    }

    function renderTable(grades, sortBy) {
        const sorted = [...grades].sort((a, b) => {
            if (sortBy === 'score-desc') return b.finalScore - a.finalScore;
            if (sortBy === 'score-asc') return a.finalScore - b.finalScore;
            if (sortBy === 'name') return a.author.localeCompare(b.author);
            if (sortBy === 'replies') return b.peerRepliesMade - a.peerRepliesMade;
            return 0;
        });

        const html = sorted.map((g, i) => `
    <div class="mfg-row" onclick="this.querySelector('.mfg-detail').classList.toggle('open')">
      <div class="mfg-row-main">
        <span class="mfg-rank">#${i + 1}</span>
        <span class="mfg-name">${g.author}</span>
        <div class="mfg-badges">
          ${g.aiDetected ? '<span class="mfg-badge ai">🤖 AI</span>' : ''}
          ${g.copiedContent ? '<span class="mfg-badge plagiarism">⚠ Plagiarism</span>' : ''}
          ${(() => {
            const req = g.minReplies || 2;
            const met = g.peerRepliesMet;
            const n   = g.peerRepliesMade;
            if (n === 0) return '<span class="mfg-badge warn">⚠ No replies</span>';
            if (met) return `<span class="mfg-badge reply-met">💬 ${n}/${req} replies ✓</span>`;
            return `<span class="mfg-badge reply-unmet">💬 ${n}/${req} replies ✗</span>`;
          })()}
          ${g.apaScore === 'good' ? '<span class="mfg-badge apa-good">📚 APA ✓</span>' : g.apaScore === 'fair' ? '<span class="mfg-badge apa-fair">📚 APA~</span>' : '<span class="mfg-badge apa-none">📚 No APA</span>'}
          ${g.hasFigures ? '<span class="mfg-badge fig">📊 Figures</span>' : ''}
        </div>
        <div class="mfg-score-col">
          <div class="mfg-score" style="color:${getScoreColor(g.finalScore)}">${g.finalScore}</div>
          <div class="mfg-grade-letter" style="color:${getScoreColor(g.finalScore)}">${g.grade || ''}</div>
          <div class="mfg-score-bar">
            <div class="mfg-score-fill" style="width:${g.finalScore}%;background:${getScoreColor(g.finalScore)}"></div>
          </div>
        </div>
      </div>
      <div class="mfg-detail">
        <div class="mfg-breakdown">
          <div class="mfg-bk-item"><span>Answer Quality</span><span>${g.breakdown.quality}/${g.breakdown.quality + g.breakdown.figures + g.breakdown.replies + g.breakdown.writing > 0 ? 35 : 35}</span></div>
          <div class="mfg-bk-item"><span>References &amp; Figures</span><span>${g.breakdown.figures}/20</span></div>
          <div class="mfg-bk-item"><span>Peer Replies (${g.peerRepliesMade}/${g.minReplies || 2} req.)</span><span>${g.breakdown.replies}/25</span></div>
          <div class="mfg-bk-item"><span>Writing Clarity</span><span>${g.breakdown.writing}/20</span></div>
          ${g.aiDetected ? `<div class="mfg-bk-item red"><span>AI Content Deduction</span><span>−${g.aiDeduction}</span></div>` : ''}
        </div>

        <div class="mfg-detail-blocks">

          ${g.contentComment ? `
          <div class="mfg-detail-block content">
            <span class="mfg-detail-label">📝 Content Analysis</span>
            <p>${g.contentComment}</p>
          </div>` : ''}

          ${g.apaComment || g.apaDetails ? `
          <div class="mfg-detail-block apa">
            <span class="mfg-detail-label">📚 APA References — <em>${g.apaScore || 'none'}</em></span>
            <p>${g.apaComment || g.apaDetails}</p>
          </div>` : ''}

          ${g.figureComment || g.figureDetails ? `
          <div class="mfg-detail-block fig">
            <span class="mfg-detail-label">📊 Figures &amp; Examples</span>
            <p>${g.figureComment || g.figureDetails}</p>
          </div>` : ''}

          ${(() => {
            const req = g.minReplies || 2;
            const bd  = g.peerReplyBreakdown || [];
            const replyRows = bd.map(r =>
              `<div class="mfg-reply-row">
                 <span class="mfg-reply-qual ${r.quality}">${r.quality}</span>
                 <span class="mfg-reply-who">→ ${r.repliedTo}</span>
                 <span class="mfg-reply-summary">${r.summary}</span>
               </div>`
            ).join('');
            const metLabel = g.peerRepliesMet
              ? `<span style="color:#4ade80">${g.peerRepliesMade}/${req} required ✓</span>`
              : `<span style="color:#f87171">${g.peerRepliesMade}/${req} required ✗</span>`;
            return `
          <div class="mfg-detail-block reply">
            <span class="mfg-detail-label">💬 Peer Engagement — ${metLabel}</span>
            ${replyRows}
            ${g.peerComment ? `<p style="margin-top:6px">${g.peerComment}</p>` : ''}
          </div>`;
          })()}

          ${g.copiedContent && g.plagiarismNote ? `
          <div class="mfg-detail-block plagiarism">
            <span class="mfg-detail-label">⚠ Plagiarism Flag</span>
            <p>${g.plagiarismNote}</p>
          </div>` : ''}

          ${g.aiReason ? `
          <div class="mfg-detail-block ai">
            <span class="mfg-detail-label">🤖 AI Signal (${g.aiConfidence} confidence)</span>
            <p>${g.aiReason}</p>
          </div>` : ''}

        </div>

        <div class="mfg-feedback">
          <strong>Overall Feedback:</strong>
          <p>${g.feedback}</p>
        </div>
      </div>
    </div>
  `).join('');

        document.getElementById('mfg-table-container').innerHTML = html;
    }

    function renderSummary(grades) {
        const avg = grades.reduce((s, g) => s + g.finalScore, 0) / grades.length;
        const highest = Math.max(...grades.map(g => g.finalScore));
        const lowest = Math.min(...grades.map(g => g.finalScore));
        const aiCount = grades.filter(g => g.aiDetected).length;
        const noReplies = grades.filter(g => g.peerRepliesMade === 0).length;

        const dist = [
            { label: '90–100', count: grades.filter(g => g.finalScore >= 90).length, color: '#4ade80' },
            { label: '80–89', count: grades.filter(g => g.finalScore >= 80 && g.finalScore < 90).length, color: '#86efac' },
            { label: '70–79', count: grades.filter(g => g.finalScore >= 70 && g.finalScore < 80).length, color: '#facc15' },
            { label: '60–69', count: grades.filter(g => g.finalScore >= 60 && g.finalScore < 70).length, color: '#fb923c' },
            { label: 'Below 60', count: grades.filter(g => g.finalScore < 60).length, color: '#f87171' },
        ];

        const maxCount = Math.max(...dist.map(d => d.count), 1);

        document.getElementById('mfg-summary-container').innerHTML = `
    <div class="mfg-stats">
      <div class="mfg-stat"><div class="mfg-stat-val">${avg.toFixed(1)}</div><div class="mfg-stat-lbl">Average</div></div>
      <div class="mfg-stat"><div class="mfg-stat-val" style="color:#4ade80">${highest}</div><div class="mfg-stat-lbl">Highest</div></div>
      <div class="mfg-stat"><div class="mfg-stat-val" style="color:#f87171">${lowest}</div><div class="mfg-stat-lbl">Lowest</div></div>
      <div class="mfg-stat"><div class="mfg-stat-val" style="color:#f87171">${aiCount}</div><div class="mfg-stat-lbl">AI Flagged</div></div>
      <div class="mfg-stat"><div class="mfg-stat-val" style="color:#fb923c">${noReplies}</div><div class="mfg-stat-lbl">No Replies</div></div>
    </div>
    <div class="mfg-dist-title">Score Distribution</div>
    <div class="mfg-dist">
      ${dist.map(d => `
        <div class="mfg-dist-row">
          <span class="mfg-dist-lbl">${d.label}</span>
          <div class="mfg-dist-bar-wrap">
            <div class="mfg-dist-bar" style="width:${(d.count / maxCount) * 100}%;background:${d.color}"></div>
          </div>
          <span class="mfg-dist-cnt">${d.count}</span>
        </div>
      `).join('')}
    </div>
    <div class="mfg-ai-list">
      <strong>🤖 AI-Flagged Students</strong>
      ${grades.filter(g => g.aiDetected).map(g => `<div class="mfg-ai-item">${g.author} — ${g.finalScore}/100 (−${g.aiDeduction} pts)</div>`).join('') || '<div style="color:#6b7280;font-size:11px">None detected</div>'}
    </div>
  `;
    }

})();