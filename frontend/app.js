// ============ Config & State ============
// Auto-detect API URL based on environment
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000' 
    : 'https://analysisdoc-api-production.up.railway.app';
const state = {
    documents: [],
    workspaces: [],
    selectedDocId: null,
    selectedDocs: [],
    analysisType: 'summarize',
    criteria: [],
    chartInstance: null
};

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupDragDrop();
    setupFileInput();
    setupIntentInput();
    addDefaultCriteria();
});

async function initApp() {
    await Promise.all([loadDocuments(), loadWorkspaces()]);
    loadStats();
    loadQAHistory();
}

// ============ API ============
async function api(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || 'Request failed');
    }
    return response.json();
}

// ============ Navigation ============
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`${sectionId}Section`)?.classList.add('active');
    document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');
    document.getElementById('pageTitle').textContent = {
        dashboard: 'Dashboard', workspaces: 'Workspaces', documents: 'Documents', analysis: 'Analysis',
        compare: 'Compare', matrix: 'Decision Matrix', qa: 'Q&A', charts: 'Charts'
    }[sectionId] || sectionId;
    
    if (sectionId === 'workspaces') renderWorkspaces();
    if (sectionId === 'analysis') { updateAnalysisDocList(); renderAnalysisTypes(); }
    if (sectionId === 'compare') { updateCompareDocList(); loadCompareHistory(); }
    if (sectionId === 'matrix') { updateMatrixDocList(); loadMatrixHistory(); }
    if (sectionId === 'qa') { updateQADocList(); }
    if (sectionId === 'charts') { updateChartDocList(); loadChartHistory(); }
    closeSidebar();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); }

// ============ Workspaces ============
async function loadWorkspaces() {
    try {
        state.workspaces = await api('/workspaces');
        updateWorkspaceSelects();
    } catch (e) { console.error('Failed to load workspaces:', e); }
}

function renderWorkspaces() {
    const container = document.getElementById('workspacesList');
    if (!state.workspaces.length) {
        container.innerHTML = '<p class="empty-state">No workspaces yet. Create one to organize your documents!</p>';
        return;
    }
    container.innerHTML = state.workspaces.map(w => `
        <div class="doc-card" onclick="viewWorkspace(${w.id})">
            <i class="fas fa-folder doc-icon" style="color: var(--primary)"></i>
            <div class="doc-name">${escapeHtml(w.name)}</div>
            <div class="doc-meta">${w.document_count || 0} documents</div>
            <div class="doc-meta">${escapeHtml(w.description || '')}</div>
        </div>
    `).join('');
}

function updateWorkspaceSelects() {
    const options = '<option value="">No workspace</option>' + 
        state.workspaces.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
    const select = document.getElementById('uploadWorkspaceSelect');
    if (select) select.innerHTML = options;
}

function showWorkspaceModal() {
    document.getElementById('workspaceName').value = '';
    document.getElementById('workspaceDesc').value = '';
    openModal('workspaceModal');
}

async function createWorkspace() {
    const name = document.getElementById('workspaceName').value.trim();
    const description = document.getElementById('workspaceDesc').value.trim();
    if (!name) { showToast('Please enter a workspace name', 'error'); return; }
    
    showLoading('Creating workspace...');
    try {
        await api('/workspaces', { method: 'POST', body: JSON.stringify({ name, description }) });
        closeModal();
        await loadWorkspaces();
        renderWorkspaces();
        showToast('Workspace created!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

function viewWorkspace(id) {
    // Filter documents by workspace - for now just show all
    showSection('documents');
}

// ============ Documents ============
async function loadDocuments() {
    try {
        state.documents = await api('/documents');
        renderDocuments();
        renderRecentDocs();
    } catch (e) { showToast('Failed to load documents', 'error'); }
}

function renderDocuments() {
    const container = document.getElementById('documentsList');
    if (!state.documents.length) {
        container.innerHTML = '<p class="empty-state">No documents yet. Upload one to get started!</p>';
        return;
    }
    container.innerHTML = state.documents.map(d => `
        <div class="doc-card" onclick="viewDocument(${d.id})">
            ${d.suggestions ? '<span class="doc-badge">Analyzed</span>' : ''}
            <i class="fas ${getFileIcon(d.file_type)} doc-icon ${getFileClass(d.file_type)}"></i>
            <div class="doc-name">${escapeHtml(d.filename)}</div>
            <div class="doc-meta">${formatSize(d.file_size)} • ${formatDate(d.created_at)}</div>
        </div>
    `).join('');
}

function renderRecentDocs() {
    const container = document.getElementById('recentDocuments');
    const recent = state.documents.slice(0, 5);
    if (!recent.length) {
        container.innerHTML = '<p class="empty-state">No documents yet</p>';
        return;
    }
    container.innerHTML = recent.map(d => `
        <div class="doc-select-item" onclick="showSection('analysis'); selectAnalysisDoc(${d.id})">
            <i class="fas ${getFileIcon(d.file_type)} ${getFileClass(d.file_type)}"></i>
            <span style="flex:1">${escapeHtml(d.filename)}</span>
            ${d.suggestions ? '<i class="fas fa-check-circle text-green-400"></i>' : ''}
        </div>
    `).join('');
}

function viewDocument(id) {
    showSection('analysis');
    selectAnalysisDoc(id);
}

async function loadStats() {
    const analyzed = state.documents.filter(d => d.suggestions).length;
    document.getElementById('statWorkspaces').textContent = state.workspaces.length;
    document.getElementById('statDocuments').textContent = state.documents.length;
    document.getElementById('statAnalyzed').textContent = analyzed;
    try {
        const qa = await api('/qa-history?limit=100');
        document.getElementById('statQuestions').textContent = qa.length;
    } catch (e) {}
}

// ============ Upload ============
let filesToUpload = [];
function showUploadModal() {
    filesToUpload = [];
    document.getElementById('uploadFileList').innerHTML = '';
    document.getElementById('uploadBtn').disabled = true;
    updateWorkspaceSelects();
    openModal('uploadModal');
}

function setupDragDrop() {
    const zone = document.getElementById('uploadZone');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => zone?.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); }));
    zone?.addEventListener('dragenter', () => zone.classList.add('dragover'));
    zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone?.addEventListener('drop', e => { zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
}

function setupFileInput() {
    document.getElementById('fileInput')?.addEventListener('change', e => handleFiles(e.target.files));
}

function handleFiles(files) {
    filesToUpload = Array.from(files);
    document.getElementById('uploadFileList').innerHTML = filesToUpload.map((f, i) => `
        <div class="upload-file-item">
            <i class="fas ${getFileIcon(f.name.split('.').pop())}"></i>
            <span style="flex:1">${escapeHtml(f.name)}</span>
            <span class="text-sm text-gray-400">${formatSize(f.size)}</span>
        </div>
    `).join('');
    document.getElementById('uploadBtn').disabled = filesToUpload.length === 0;
}

async function doUpload() {
    if (!filesToUpload.length) return;
    const workspaceSelect = document.getElementById('uploadWorkspaceSelect');
    const workspaceId = workspaceSelect?.value ? parseInt(workspaceSelect.value) : null;
    
    console.log('Uploading with workspace_id:', workspaceId);
    showLoading('Uploading & analyzing...');
    try {
        for (const file of filesToUpload) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('auto_analyze', 'true');
            if (workspaceId) formData.append('workspace_id', workspaceId.toString());
            await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
        }
        closeModal();
        await Promise.all([loadDocuments(), loadWorkspaces()]);
        loadStats();
        showToast(`${filesToUpload.length} file(s) uploaded & analyzed!`, 'success');
        filesToUpload = [];
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

// ============ Analysis ============
const ANALYSIS_TYPES = [
    { type: 'summarize', name: 'Summary', icon: 'fa-list-ul' },
    { type: 'pros_cons', name: 'Pros/Cons', icon: 'fa-balance-scale' },
    { type: 'gaps_risks', name: 'Gaps/Risks', icon: 'fa-exclamation-triangle' },
    { type: 'upgrade', name: 'Upgrades', icon: 'fa-arrow-up' },
    { type: 'report', name: 'Report', icon: 'fa-file-alt' },
    { type: 'slides', name: 'Slides', icon: 'fa-desktop' }
];

function updateAnalysisDocList() {
    const container = document.getElementById('analysisDocList');
    container.innerHTML = state.documents.map(d => `
        <div class="doc-select-item ${state.selectedDocId === d.id ? 'selected' : ''}" onclick="selectAnalysisDoc(${d.id})">
            <i class="fas ${getFileIcon(d.file_type)} ${getFileClass(d.file_type)}"></i>
            <span style="flex:1">${escapeHtml(d.filename)}</span>
            ${d.suggestions ? '<i class="fas fa-magic text-yellow-400"></i>' : ''}
        </div>
    `).join('') || '<p class="empty-state">No documents</p>';
}

function selectAnalysisDoc(id) {
    state.selectedDocId = id;
    updateAnalysisDocList();
    document.getElementById('runAnalysisBtn').disabled = false;
    
    // Clear old results when selecting new document
    document.getElementById('analysisResults').innerHTML = '';
    document.getElementById('userIntent').value = '';
    document.getElementById('matchedAnalysis').innerHTML = '';
    
    const doc = state.documents.find(d => d.id === id);
    const panel = document.getElementById('analysisSuggestionsPanel');
    
    if (doc?.suggestions) {
        panel.style.display = 'block';
        renderDocSuggestions(doc.suggestions);
        renderIntentSuggestions(doc.suggestions);
    } else {
        panel.style.display = 'none';
        const intentContainer = document.getElementById('intentSuggestions');
        if (intentContainer) intentContainer.innerHTML = '';
    }
    
    // Load previous analysis history for this document
    loadAnalysisHistory(id);
}

async function loadAnalysisHistory(docId) {
    try {
        console.log('Loading analysis history for doc:', docId);
        const history = await api(`/analysis/${docId}`);
        console.log('Analysis history response:', history);
        
        if (history && history.length > 0) {
            // Group results by type
            const results = {};
            history.forEach(h => {
                console.log('Processing history item:', h.analysis_type, h.result_json);
                if (h.result_json) {
                    results[h.analysis_type] = h.result_json;
                }
            });
            
            console.log('Grouped results:', results);
            if (Object.keys(results).length > 0) {
                renderAllAnalysisResults(results);
                showToast('Loaded previous analysis results', 'info');
            }
        } else {
            console.log('No history found or empty array');
        }
    } catch (e) {
        console.error('Error loading analysis history:', e);
    }
}

function renderIntentSuggestions(suggestions) {
    const container = document.getElementById('intentSuggestions');
    if (!container) return;
    
    const hints = [];
    if (suggestions.document_type) hints.push(suggestions.document_type + ' analysis');
    if (suggestions.key_topics?.length) {
        suggestions.key_topics.slice(0, 3).forEach(t => hints.push(t));
    }
    if (suggestions.user_intent_keywords) {
        Object.keys(suggestions.user_intent_keywords).slice(0, 2).forEach(k => hints.push(k + ' review'));
    }
    
    container.innerHTML = hints.length ? `
        <div class="intent-hints">
            ${hints.map(h => `<span class="intent-hint" onclick="document.getElementById('userIntent').value='${escapeHtml(h)}'">${escapeHtml(h)}</span>`).join('')}
        </div>
    ` : '';
}

function renderDocSuggestions(suggestions) {
    // Summary
    document.getElementById('docSummaryBox').innerHTML = `
        <strong>${escapeHtml(suggestions.document_type || 'Document')}</strong><br>
        ${escapeHtml(suggestions.document_summary || '')}
        ${suggestions.key_topics?.length ? `<div class="mt-2">${suggestions.key_topics.map(t => `<span class="highlight-tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
    `;
    
    // Analysis suggestions
    const container = document.getElementById('analysisSuggestions');
    const items = suggestions.analysis_suggestions || [];
    items.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    
    container.innerHTML = items.slice(0, 4).map((s, i) => {
        const score = s.relevance || 0;
        return `
            <div class="suggestion-item ${i === 0 ? 'top' : ''}" onclick="selectAnalysisType('${s.type}'); runAnalysis()">
                <div class="suggestion-label">
                    <i class="fas ${ANALYSIS_TYPES.find(t => t.type === s.type)?.icon || 'fa-search'}"></i>
                    ${ANALYSIS_TYPES.find(t => t.type === s.type)?.name || s.type}
                    <span class="suggestion-score ${score >= 0.7 ? 'score-high' : 'score-med'}">${Math.round(score * 100)}%</span>
                </div>
                <div class="suggestion-reason">${escapeHtml(s.reason || '')}</div>
            </div>
        `;
    }).join('');
    
    // Update analysis types grid with recommendations
    renderAnalysisTypes(items);
}

function renderAnalysisTypes(suggestions = []) {
    // Grid removed - no longer needed since we run all types at once
    return;
}

function selectAnalysisType(type) {
    state.analysisType = type;
}

// Intent matching
function setupIntentInput() {
    const input = document.getElementById('userIntent');
    input?.addEventListener('input', debounce(matchIntent, 300));
}

function matchIntent() {
    const input = document.getElementById('userIntent').value.toLowerCase();
    if (!input || !state.selectedDocId) return;
    
    const doc = state.documents.find(d => d.id === state.selectedDocId);
    if (!doc?.suggestions?.user_intent_keywords) return;
    
    const keywords = doc.suggestions.user_intent_keywords;
    const matches = [];
    
    for (const [category, words] of Object.entries(keywords)) {
        const matchCount = words.filter(w => input.includes(w.toLowerCase())).length;
        if (matchCount > 0) matches.push({ category, matchCount });
    }
    
    const container = document.getElementById('matchedAnalysis');
    if (matches.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    matches.sort((a, b) => b.matchCount - a.matchCount);
    const typeMap = { financial: 'gaps_risks', compliance: 'gaps_risks', technical: 'report', strategic: 'summarize' };
    
    container.innerHTML = `
        <div class="suggestions-box">
            <h4>Based on your input:</h4>
            ${matches.slice(0, 2).map(m => `
                <div class="suggestion-item" onclick="selectAnalysisType('${typeMap[m.category] || 'summarize'}')">
                    <div class="suggestion-label">${m.category.charAt(0).toUpperCase() + m.category.slice(1)} Analysis</div>
                    <div class="suggestion-reason">Recommended: ${ANALYSIS_TYPES.find(t => t.type === (typeMap[m.category] || 'summarize'))?.name}</div>
                </div>
            `).join('')}
        </div>
    `;
}

async function runAnalysis() {
    if (!state.selectedDocId) return;
    
    // Clear old results first
    document.getElementById('analysisResults').innerHTML = '';
    
    showLoading('Running comprehensive analysis (all 6 types)...');
    
    const allTypes = ['summarize', 'pros_cons', 'gaps_risks', 'upgrade', 'report', 'slides'];
    const results = {};
    
    try {
        // Run all analysis types
        for (const type of allTypes) {
            showLoading(`Analyzing: ${ANALYSIS_TYPES.find(t => t.type === type)?.name || type}...`);
            try {
                const result = await api('/analyze', {
                    method: 'POST',
                    body: JSON.stringify({ document_id: state.selectedDocId, analysis_type: type })
                });
                results[type] = result.result;
            } catch (e) {
                results[type] = { error: e.message };
            }
        }
        
        renderAllAnalysisResults(results);
        showToast('Comprehensive analysis complete!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

function renderAllAnalysisResults(results) {
    const container = document.getElementById('analysisResults');
    let html = '<h2 class="text-xl font-bold mb-4 text-indigo-400">Comprehensive Analysis Results</h2>';
    
    // Summary
    if (results.summarize && !results.summarize.error) {
        html += `<div class="analysis-result-section">
            <h3 class="result-section-title"><i class="fas fa-list-ul"></i> Summary</h3>
            ${renderSummary(results.summarize)}
        </div>`;
    }
    
    // Pros/Cons
    if (results.pros_cons && !results.pros_cons.error) {
        html += `<div class="analysis-result-section">
            <h3 class="result-section-title"><i class="fas fa-balance-scale"></i> Pros & Cons</h3>
            ${renderProsCons(results.pros_cons)}
        </div>`;
    }
    
    // Gaps/Risks
    if (results.gaps_risks && !results.gaps_risks.error) {
        html += `<div class="analysis-result-section">
            <h3 class="result-section-title"><i class="fas fa-exclamation-triangle"></i> Gaps & Risks</h3>
            ${renderGapsRisks(results.gaps_risks)}
        </div>`;
    }
    
    // Upgrades
    if (results.upgrade && !results.upgrade.error) {
        html += `<div class="analysis-result-section">
            <h3 class="result-section-title"><i class="fas fa-arrow-up"></i> Upgrade Suggestions</h3>
            ${renderUpgrade(results.upgrade)}
        </div>`;
    }
    
    // Report
    if (results.report && !results.report.error) {
        html += `<div class="analysis-result-section">
            <h3 class="result-section-title"><i class="fas fa-file-alt"></i> Report</h3>
            ${renderReport(results.report)}
        </div>`;
    }
    
    // Slides
    if (results.slides && !results.slides.error) {
        html += `<div class="analysis-result-section">
            <h3 class="result-section-title"><i class="fas fa-desktop"></i> Presentation Slides</h3>
            ${renderSlides(results.slides)}
        </div>`;
    }
    
    container.innerHTML = html || '<p class="empty-state">No results</p>';
}

function renderSummary(r) {
    let html = '';
    if (r.key_highlights?.length) {
        html += `<div class="result-section"><h4><i class="fas fa-star text-yellow-400"></i> Highlights</h4>
            <div class="highlight-list">${r.key_highlights.map(h => `<span class="highlight-tag">${escapeHtml(h)}</span>`).join('')}</div></div>`;
    }
    if (r.key_points?.length) {
        html += `<div class="result-section"><h4><i class="fas fa-list"></i> Key Points</h4>
            ${r.key_points.map(kp => `<div class="key-point"><div class="key-point-label">${escapeHtml(kp.label)}</div>
                <div class="key-point-details">${escapeHtml(kp.details)}</div></div>`).join('')}</div>`;
    }
    return html;
}

function renderProsCons(r) {
    return `<div class="pros-cons-grid">
        <div class="pros-section"><h4><i class="fas fa-thumbs-up"></i> Pros</h4>
            ${(r.pros || []).map(p => `<div class="key-point"><p>${escapeHtml(p.point)}</p>
                <span class="text-xs severity-${p.importance}">${p.importance}</span></div>`).join('')}</div>
        <div class="cons-section"><h4><i class="fas fa-thumbs-down"></i> Cons</h4>
            ${(r.cons || []).map(c => `<div class="key-point"><p>${escapeHtml(c.point)}</p>
                <span class="text-xs severity-${c.importance}">${c.importance}</span></div>`).join('')}</div>
    </div>`;
}

function renderGapsRisks(r) {
    let html = '';
    if (r.completeness_score !== undefined) {
        html += `<div class="mb-4"><span>Completeness: </span><strong>${r.completeness_score}%</strong></div>`;
    }
    if (r.gaps?.length) {
        html += `<div class="result-section"><h4><i class="fas fa-search text-yellow-400"></i> Gaps</h4>
            ${r.gaps.map(g => `<div class="diff-item modified"><strong>${escapeHtml(g.description)}</strong>
                <span class="severity-${g.severity} text-xs ml-2">${g.severity}</span>
                <p class="text-sm text-gray-400 mt-1">${escapeHtml(g.recommendation || '')}</p></div>`).join('')}</div>`;
    }
    if (r.risks?.length) {
        html += `<div class="result-section"><h4><i class="fas fa-exclamation-triangle text-red-400"></i> Risks</h4>
            ${r.risks.map(risk => `<div class="diff-item removed"><strong>${escapeHtml(risk.description)}</strong>
                <span class="severity-${risk.severity} text-xs ml-2">${risk.severity}</span>
                <p class="text-sm text-gray-400 mt-1">${escapeHtml(risk.mitigation || '')}</p></div>`).join('')}</div>`;
    }
    return html;
}

function renderUpgrade(r) {
    let html = '';
    if (r.current_quality_score) {
        html += `<div class="mb-4">Current: <strong>${r.current_quality_score}</strong> → Potential: <strong class="text-green-400">${r.potential_quality_score || '?'}</strong></div>`;
    }
    if (r.suggestions?.length) {
        html += `<div class="result-section"><h4><i class="fas fa-arrow-up text-green-400"></i> Suggestions</h4>
            ${r.suggestions.map(s => `<div class="key-point"><div class="key-point-label">${escapeHtml(s.suggestion)}</div>
                <span class="severity-${s.priority} text-xs">${s.priority}</span></div>`).join('')}</div>`;
    }
    return html;
}

function renderReport(r) {
    let html = '';
    if (r.key_findings?.length) {
        html += `<div class="result-section"><h4><i class="fas fa-search"></i> Key Findings</h4>
            ${r.key_findings.map(f => `<div class="key-point"><p>${escapeHtml(f.finding)}</p></div>`).join('')}</div>`;
    }
    if (r.recommendations?.length) {
        html += `<div class="result-section"><h4><i class="fas fa-check"></i> Recommendations</h4>
            ${r.recommendations.map(rec => `<div class="key-point"><p>${escapeHtml(rec.recommendation)}</p></div>`).join('')}</div>`;
    }
    return html;
}

function renderSlides(r) {
    if (!r.slides?.length) return '<p class="empty-state">No slides</p>';
    return `<div class="result-section"><h4><i class="fas fa-desktop"></i> Slides (${r.slides.length})</h4>
        ${r.slides.map(s => `<div class="key-point"><div class="key-point-label">Slide ${s.slide_number}: ${escapeHtml(s.title)}</div>
            <ul class="text-sm text-gray-400 mt-1 list-disc list-inside">${s.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}

// ============ Compare ============
function updateCompareDocList() {
    state.selectedDocs = [];
    const container = document.getElementById('compareDocList');
    container.innerHTML = state.documents.map(d => `
        <label class="doc-checkbox-item">
            <input type="checkbox" onchange="toggleCompareDoc(${d.id}, this.checked)">
            <i class="fas ${getFileIcon(d.file_type)} ${getFileClass(d.file_type)}"></i>
            <span>${escapeHtml(d.filename)}</span>
        </label>
    `).join('') || '<p class="empty-state">No documents</p>';
    
    // Show compare suggestions
    renderCompareSuggestions();
    updateCompareBtn();
}

function toggleCompareDoc(id, checked) {
    if (checked) state.selectedDocs.push(id);
    else state.selectedDocs = state.selectedDocs.filter(d => d !== id);
    updateCompareBtn();
}

function updateCompareBtn() {
    document.getElementById('runCompareBtn').disabled = state.selectedDocs.length < 2;
}

function renderCompareSuggestions() {
    const container = document.getElementById('compareSuggestions');
    const docsWithSuggestions = state.documents.filter(d => d.suggestions?.compare_suggestions);
    
    if (docsWithSuggestions.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    const suggestions = docsWithSuggestions[0].suggestions.compare_suggestions;
    container.innerHTML = `
        <h4><i class="fas fa-lightbulb text-yellow-400"></i> Compare Suggestions</h4>
        ${suggestions.good_to_compare_with?.length ? `<p class="text-sm text-gray-400">Good to compare with: ${suggestions.good_to_compare_with.join(', ')}</p>` : ''}
        ${suggestions.comparison_criteria?.length ? `<p class="text-sm text-gray-400 mt-2">Suggested criteria: ${suggestions.comparison_criteria.join(', ')}</p>` : ''}
    `;
}

async function runComparison() {
    if (state.selectedDocs.length < 2) return;
    showLoading('Comparing documents...');
    try {
        const result = await api('/compare', {
            method: 'POST',
            body: JSON.stringify({ document_ids: state.selectedDocs })
        });
        renderCompareResults(result.result);
        loadCompareHistory();
        showToast('Comparison complete!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

function renderCompareResults(r) {
    const container = document.getElementById('compareResults');
    let html = '';
    
    // Document summaries
    if (r.document1 || r.document2) {
        html += `<div class="result-section">
            <h4><i class="fas fa-file-alt"></i> Document Summaries</h4>
            <div class="compare-summaries">
                ${r.document1 ? `<div class="compare-doc-summary">
                    <strong>${escapeHtml(r.document1.name)}</strong>
                    <p>${escapeHtml(r.document1.summary || '')}</p>
                    ${r.document1.key_points?.length ? `<ul>${r.document1.key_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
                </div>` : ''}
                ${r.document2 ? `<div class="compare-doc-summary">
                    <strong>${escapeHtml(r.document2.name)}</strong>
                    <p>${escapeHtml(r.document2.summary || '')}</p>
                    ${r.document2.key_points?.length ? `<ul>${r.document2.key_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
                </div>` : ''}
            </div>
        </div>`;
    }
    
    // Multi-document summaries
    if (r.documents?.length) {
        html += `<div class="result-section">
            <h4><i class="fas fa-file-alt"></i> Document Summaries</h4>
            ${r.documents.map(d => `<div class="compare-doc-summary">
                <strong>${escapeHtml(d.name)}</strong> ${d.quality_score ? `<span class="score-badge">${d.quality_score}%</span>` : ''}
                <p>${escapeHtml(d.summary || '')}</p>
            </div>`).join('')}
        </div>`;
    }
    
    // Comparison table
    if (r.comparison_table?.length) {
        html += `<div class="result-section">
            <h4><i class="fas fa-table"></i> Comparison Table</h4>
            <div class="table-responsive">
                <table class="compare-table">
                    <thead><tr>
                        <th>Aspect</th>
                        ${r.document1 ? '<th>Document 1</th><th>Document 2</th>' : ''}
                        ${r.comparison_table[0]?.values ? Object.keys(r.comparison_table[0].values).map(k => `<th>${escapeHtml(k)}</th>`).join('') : ''}
                        <th>Better</th>
                    </tr></thead>
                    <tbody>
                        ${r.comparison_table.map(row => `<tr>
                            <td><strong>${escapeHtml(row.aspect)}</strong></td>
                            ${row.document1_value !== undefined ? `<td>${escapeHtml(row.document1_value)}</td><td>${escapeHtml(row.document2_value)}</td>` : ''}
                            ${row.values ? Object.values(row.values).map(v => `<td>${escapeHtml(v)}</td>`).join('') : ''}
                            <td class="better-cell ${row.better}">${escapeHtml(row.better || row.best || '-')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }
    
    // Detailed differences
    if (r.detailed_differences?.length) {
        html += `<div class="result-section">
            <h4><i class="fas fa-exchange-alt"></i> Detailed Differences</h4>
            ${r.detailed_differences.map(d => `<div class="diff-item ${d.type || d.severity}">
                <div class="diff-header">
                    <span class="diff-category">${escapeHtml(d.category || '')}</span>
                    <span class="severity-${d.severity}">${d.severity}</span>
                </div>
                <p class="diff-desc">${escapeHtml(d.description)}</p>
                ${d.document1_detail ? `<div class="diff-details">
                    <div><strong>Doc 1:</strong> ${escapeHtml(d.document1_detail)}</div>
                    <div><strong>Doc 2:</strong> ${escapeHtml(d.document2_detail)}</div>
                </div>` : ''}
                ${d.by_document ? `<div class="diff-details">${Object.entries(d.by_document).map(([k,v]) => `<div><strong>${k}:</strong> ${escapeHtml(v)}</div>`).join('')}</div>` : ''}
                ${d.impact ? `<p class="diff-impact"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(d.impact)}</p>` : ''}
            </div>`).join('')}
        </div>`;
    }
    
    // Legacy differences format
    if (r.differences?.length && !r.detailed_differences) {
        html += `<div class="result-section"><h4><i class="fas fa-exchange-alt"></i> Differences</h4>
            ${r.differences.map(d => `<div class="diff-item ${d.type}">
                <strong>${escapeHtml(d.what_changed)}</strong>
                <span class="severity-${d.severity} text-xs ml-2">${d.severity}</span>
                <p class="text-sm text-gray-400 mt-1">${escapeHtml(d.impact || '')}</p>
            </div>`).join('')}</div>`;
    }
    
    // Strengths & Weaknesses
    if (r.strengths_doc1 || r.strengths_doc2 || r.strengths_by_document) {
        html += `<div class="result-section">
            <h4><i class="fas fa-balance-scale"></i> Strengths & Weaknesses</h4>
            <div class="strengths-weaknesses-grid">
                ${r.strengths_doc1 ? `<div class="sw-card strengths">
                    <h5>Document 1 Strengths</h5>
                    <ul>${r.strengths_doc1.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
                </div>` : ''}
                ${r.weaknesses_doc1 ? `<div class="sw-card weaknesses">
                    <h5>Document 1 Weaknesses</h5>
                    <ul>${r.weaknesses_doc1.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                </div>` : ''}
                ${r.strengths_doc2 ? `<div class="sw-card strengths">
                    <h5>Document 2 Strengths</h5>
                    <ul>${r.strengths_doc2.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
                </div>` : ''}
                ${r.weaknesses_doc2 ? `<div class="sw-card weaknesses">
                    <h5>Document 2 Weaknesses</h5>
                    <ul>${r.weaknesses_doc2.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                </div>` : ''}
            </div>
        </div>`;
    }
    
    // Ranking (for multi-doc)
    if (r.ranking?.length) {
        html += `<div class="result-section">
            <h4><i class="fas fa-list-ol"></i> Ranking</h4>
            <div class="ranking-list">
                ${r.ranking.map(rank => `<div class="ranking-item rank-${rank.rank}">
                    <span class="rank-number">#${rank.rank}</span>
                    <div class="rank-info">
                        <strong>${escapeHtml(rank.document)}</strong>
                        <span class="rank-score">${rank.score}%</span>
                        <p>${escapeHtml(rank.reason || '')}</p>
                    </div>
                </div>`).join('')}
            </div>
        </div>`;
    }
    
    // Similarity score
    if (r.similarity_score !== undefined) {
        html += `<div class="similarity-badge">Similarity: <strong>${r.similarity_score}%</strong></div>`;
    }
    
    // Best/Winner - at the end
    if (r.best_version || r.best_candidate) {
        const best = r.best_version || r.best_candidate?.name;
        const reason = r.best_version_reason || r.best_candidate?.reason;
        const advantages = r.best_candidate?.key_advantages || [];
        html += `<div class="winner-section">
            <h4><i class="fas fa-trophy text-yellow-400"></i> Recommendation: ${escapeHtml(best)}</h4>
            <p class="winner-reason">${escapeHtml(reason || '')}</p>
            ${advantages.length ? `<div class="winner-advantages">
                <strong>Key Advantages:</strong>
                <ul>${advantages.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
            </div>` : ''}
            ${r.recommendation ? `<p class="final-recommendation"><strong>Final Recommendation:</strong> ${escapeHtml(r.recommendation)}</p>` : ''}
        </div>`;
    }
    
    container.innerHTML = html || '<p class="empty-state">No results</p>';
}

async function loadCompareHistory() {
    try {
        const history = await api('/comparisons');
        document.getElementById('compareHistory').innerHTML = history.slice(0, 5).map(h => {
            const docCount = h.document_ids?.length || 0;
            const title = h.result_json?.best_version || h.result_json?.best_candidate?.name || `${docCount} documents`;
            return `
                <div class="history-item" onclick="renderCompareResults(${JSON.stringify(h.result_json).replace(/"/g, '&quot;')})">
                    <div class="history-item-title">${escapeHtml(title)}</div>
                    <div class="history-item-meta">${formatDate(h.created_at)}</div>
                </div>
            `;
        }).join('') || '<p class="empty-state">No history</p>';
    } catch (e) { console.error('Load compare history error:', e); }
}

// ============ Decision Matrix ============
function addDefaultCriteria() {
    state.criteria = [
        { name: 'Quality', weight: 0.3 },
        { name: 'Clarity', weight: 0.25 },
        { name: 'Relevance', weight: 0.25 },
        { name: 'Feasibility', weight: 0.2 }
    ];
    renderCriteria();
}

function renderCriteria() {
    document.getElementById('criteriaList').innerHTML = state.criteria.map((c, i) => `
        <div class="criterion-item">
            <input type="text" value="${escapeHtml(c.name)}" onchange="updateCriterion(${i}, 'name', this.value)" placeholder="Criterion name">
            <input type="number" value="${c.weight}" step="0.05" min="0" max="1" onchange="updateCriterion(${i}, 'weight', parseFloat(this.value))">
            <button class="criterion-delete" onclick="removeCriterion(${i})"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

function addCriterion() { state.criteria.push({ name: '', weight: 0.1 }); renderCriteria(); }
function updateCriterion(i, field, value) { state.criteria[i][field] = value; }
function removeCriterion(i) { state.criteria.splice(i, 1); renderCriteria(); }

function updateMatrixDocList() {
    state.selectedDocs = [];
    const container = document.getElementById('matrixDocList');
    container.innerHTML = state.documents.map(d => `
        <label class="doc-checkbox-item">
            <input type="checkbox" onchange="toggleMatrixDoc(${d.id}, this.checked)">
            <i class="fas ${getFileIcon(d.file_type)} ${getFileClass(d.file_type)}"></i>
            <span>${escapeHtml(d.filename)}</span>
        </label>
    `).join('') || '<p class="empty-state">No documents</p>';
    
    renderMatrixSuggestions();
    updateMatrixBtn();
}

function toggleMatrixDoc(id, checked) {
    if (checked) state.selectedDocs.push(id);
    else state.selectedDocs = state.selectedDocs.filter(d => d !== id);
    updateMatrixBtn();
}

function updateMatrixBtn() {
    const total = state.criteria.reduce((s, c) => s + (c.weight || 0), 0);
    document.getElementById('runMatrixBtn').disabled = state.selectedDocs.length < 2 || Math.abs(total - 1) > 0.01;
}

function renderMatrixSuggestions() {
    const container = document.getElementById('matrixCriteriaSuggestions');
    const doc = state.documents.find(d => d.suggestions?.decision_matrix_suggestions);
    
    if (!doc) { container.innerHTML = ''; return; }
    
    const suggestions = doc.suggestions.decision_matrix_suggestions;
    if (!suggestions.suitable_for_matrix) {
        container.innerHTML = '<p class="text-sm text-yellow-400">This document may not be ideal for decision matrix analysis.</p>';
        return;
    }
    
    if (suggestions.suggested_criteria?.length) {
        container.innerHTML = `
            <h4><i class="fas fa-lightbulb text-yellow-400"></i> Suggested Criteria</h4>
            ${suggestions.suggested_criteria.map(c => `
                <div class="suggestion-item" onclick="addSuggestedCriterion('${escapeHtml(c.name)}', ${c.weight})">
                    <div class="suggestion-label">${escapeHtml(c.name)} (${c.weight})</div>
                    <div class="suggestion-reason">${escapeHtml(c.description || '')}</div>
                </div>
            `).join('')}
        `;
    }
}

function addSuggestedCriterion(name, weight) {
    state.criteria.push({ name, weight });
    renderCriteria();
}

async function runDecisionMatrix() {
    const name = document.getElementById('matrixName').value || 'Decision Matrix';
    if (state.selectedDocs.length < 2) return;
    
    showLoading('Building matrix...');
    try {
        const result = await api('/decision-matrix', {
            method: 'POST',
            body: JSON.stringify({ name, document_ids: state.selectedDocs, criteria: state.criteria })
        });
        renderMatrixResults(result.result);
        loadMatrixHistory();
        showToast('Matrix complete!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

function renderMatrixResults(r) {
    const container = document.getElementById('matrixResults');
    let html = '';
    
    // Main scoring table
    if (r.options?.length && r.criteria?.length) {
        html += `<div class="result-section">
            <h4><i class="fas fa-table"></i> Decision Matrix Scores</h4>
            <div class="table-responsive">
                <table class="matrix-table">
                    <thead>
                        <tr>
                            <th>Document</th>
                            ${r.criteria.map(c => `<th>${escapeHtml(c.name)}<br><span class="weight-label">(${(c.weight * 100).toFixed(0)}%)</span></th>`).join('')}
                            <th>Total Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${r.options.map(opt => `<tr>
                            <td><strong>${escapeHtml(opt.name)}</strong></td>
                            ${opt.scores.map(s => `<td class="score-cell">
                                <span class="score-value">${s.score}/10</span>
                                ${s.reason ? `<span class="score-reason" title="${escapeHtml(s.reason)}">${escapeHtml(s.reason.substring(0, 30))}...</span>` : ''}
                            </td>`).join('')}
                            <td class="total-cell"><strong>${(opt.total_weighted_score || 0).toFixed(2)}</strong></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }
    
    // Comparison by criterion
    if (r.comparison_by_criterion?.length) {
        html += `<div class="result-section">
            <h4><i class="fas fa-chart-bar"></i> Analysis by Criterion</h4>
            ${r.comparison_by_criterion.map(c => `<div class="criterion-analysis">
                <div class="criterion-header-row">
                    <strong>${escapeHtml(c.criterion)}</strong>
                    <span class="weight-badge">${(c.weight * 100).toFixed(0)}% weight</span>
                    <span class="best-badge">Best: ${escapeHtml(c.best_performer || '-')}</span>
                </div>
                ${c.analysis ? `<p class="criterion-analysis-text">${escapeHtml(c.analysis)}</p>` : ''}
                <div class="criterion-scores">
                    ${c.scores_by_document?.map(s => `<div class="criterion-score-item">
                        <span class="doc-name">${escapeHtml(s.document)}</span>
                        <span class="doc-score">${s.score}/10</span>
                        <span class="doc-reason">${escapeHtml(s.reason || '')}</span>
                    </div>`).join('') || ''}
                </div>
            </div>`).join('')}
        </div>`;
    }
    
    // Document details (strengths/weaknesses)
    if (r.options?.some(o => o.strengths?.length || o.weaknesses?.length)) {
        html += `<div class="result-section">
            <h4><i class="fas fa-list-alt"></i> Document Analysis</h4>
            <div class="options-analysis-grid">
                ${r.options.map(opt => `<div class="option-analysis-card">
                    <h5>${escapeHtml(opt.name)}</h5>
                    ${opt.summary ? `<p class="option-summary">${escapeHtml(opt.summary)}</p>` : ''}
                    ${opt.strengths?.length ? `<div class="option-strengths">
                        <strong class="text-green-400"><i class="fas fa-plus-circle"></i> Strengths</strong>
                        <ul>${opt.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${opt.weaknesses?.length ? `<div class="option-weaknesses">
                        <strong class="text-red-400"><i class="fas fa-minus-circle"></i> Weaknesses</strong>
                        <ul>${opt.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${opt.key_findings?.length ? `<div class="option-findings">
                        <strong class="text-blue-400"><i class="fas fa-search"></i> Key Findings</strong>
                        <ul>${opt.key_findings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
                    </div>` : ''}
                </div>`).join('')}
            </div>
        </div>`;
    }
    
    // Ranking
    if (r.ranking?.length) {
        html += `<div class="result-section">
            <h4><i class="fas fa-medal"></i> Final Ranking</h4>
            <div class="ranking-list">
                ${r.ranking.map(rank => `<div class="ranking-item rank-${rank.rank}">
                    <span class="rank-number">#${rank.rank}</span>
                    <div class="rank-info">
                        <strong>${escapeHtml(rank.document)}</strong>
                        <span class="rank-score">${rank.total_score?.toFixed(2) || rank.percentage + '%'}</span>
                    </div>
                    <p class="rank-summary">${escapeHtml(rank.summary || '')}</p>
                </div>`).join('')}
            </div>
        </div>`;
    }
    
    // Winner section at the end
    if (r.winner) {
        html += `<div class="winner-section">
            <h4><i class="fas fa-trophy text-yellow-400"></i> Winner: ${escapeHtml(r.winner.name)}</h4>
            <div class="winner-score">Score: <strong>${r.winner.total_score?.toFixed(2) || r.winner.percentage + '%'}</strong></div>
            <p class="winner-reason">${escapeHtml(r.winner.reason || '')}</p>
            ${r.winner.key_advantages?.length ? `<div class="winner-advantages">
                <strong>Key Advantages:</strong>
                <ul>${r.winner.key_advantages.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
            </div>` : ''}
            ${r.winner.considerations ? `<p class="winner-considerations"><i class="fas fa-info-circle"></i> ${escapeHtml(r.winner.considerations)}</p>` : ''}
        </div>`;
    }
    
    // Final recommendation
    if (r.recommendation) {
        html += `<div class="final-recommendation">
            <strong><i class="fas fa-clipboard-check"></i> Final Recommendation</strong>
            <p>${escapeHtml(r.recommendation)}</p>
        </div>`;
    }
    
    container.innerHTML = html || '<p class="empty-state">No results</p>';
}

async function loadMatrixHistory() {
    try {
        const history = await api('/decision-matrices');
        document.getElementById('matrixHistory').innerHTML = history.slice(0, 5).map(h => `
            <div class="history-item" onclick="renderMatrixResults(${JSON.stringify(h.result_json || {}).replace(/"/g, '&quot;')})">
                <div class="history-item-title">${escapeHtml(h.name)}</div>
                <div class="history-item-meta">${formatDate(h.created_at)}</div>
            </div>
        `).join('') || '<p class="empty-state">No history</p>';
    } catch (e) {}
}

// ============ Q&A ============
function updateQADocList() {
    state.selectedDocs = [];
    const container = document.getElementById('qaDocList');
    container.innerHTML = state.documents.map(d => `
        <label class="doc-checkbox-item">
            <input type="checkbox" onchange="toggleQADoc(${d.id}, this.checked)">
            <i class="fas ${getFileIcon(d.file_type)} ${getFileClass(d.file_type)}"></i>
            <span>${escapeHtml(d.filename)}</span>
        </label>
    `).join('') || '<p class="empty-state">No documents</p>';
    
    renderQASuggestions();
}

function toggleQADoc(id, checked) {
    if (checked) state.selectedDocs.push(id);
    else state.selectedDocs = state.selectedDocs.filter(d => d !== id);
    renderQASuggestions();
}

function renderQASuggestions() {
    const container = document.getElementById('qaSuggestedQuestions');
    const selectedDoc = state.documents.find(d => state.selectedDocs.includes(d.id) && d.suggestions?.suggested_questions);
    
    if (!selectedDoc) { container.innerHTML = ''; return; }
    
    const questions = selectedDoc.suggestions.suggested_questions || [];
    container.innerHTML = questions.length ? `
        <h4><i class="fas fa-lightbulb text-yellow-400"></i> Suggested Questions</h4>
        ${questions.map(q => `
            <div class="suggestion-item" onclick="document.getElementById('questionInput').value='${escapeHtml(q)}'; askQuestion()">
                <div class="suggestion-label">${escapeHtml(q)}</div>
            </div>
        `).join('')}
    ` : '';
}

async function askQuestion() {
    const question = document.getElementById('questionInput').value.trim();
    if (!question || !state.selectedDocs.length) {
        showToast('Select documents and enter a question', 'error');
        return;
    }
    
    showLoading('Finding answer...');
    try {
        const result = await api('/qa', {
            method: 'POST',
            body: JSON.stringify({ document_ids: state.selectedDocs, question })
        });
        renderQAResult(result.result);
        document.getElementById('questionInput').value = '';
        loadQAHistory();
        showToast('Answer found!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

function renderQAResult(r) {
    document.getElementById('qaResults').innerHTML = `
        <div class="mb-3"><strong class="text-indigo-400">Q:</strong> ${escapeHtml(r.question)}</div>
        <div class="mb-3"><strong class="text-green-400">A:</strong> ${escapeHtml(r.answer)}</div>
        ${r.citations?.length ? `<div class="text-sm text-gray-400">Sources: ${r.citations.map(c => `p.${c.page}`).join(', ')}</div>` : ''}
        ${r.follow_up_questions?.length ? `
            <div class="mt-4"><strong class="text-sm">Follow-up:</strong>
            <div class="highlight-list mt-2">${r.follow_up_questions.map(q => 
                `<span class="highlight-tag cursor-pointer" onclick="document.getElementById('questionInput').value='${escapeHtml(q)}'">${escapeHtml(q)}</span>`
            ).join('')}</div></div>
        ` : ''}
    `;
}

async function loadQAHistory() {
    try {
        const history = await api('/qa-history?limit=10');
        document.getElementById('qaHistory').innerHTML = history.map(h => `
            <div class="history-item" onclick="renderQAResult(${JSON.stringify(h.answer_json).replace(/"/g, '&quot;')})">
                <div class="history-item-title">${escapeHtml(h.question?.substring(0, 50))}...</div>
                <div class="history-item-meta">${formatDate(h.created_at)}</div>
            </div>
        `).join('') || '<p class="empty-state">No history</p>';
    } catch (e) {}
}

// ============ Charts ============
function updateChartDocList() {
    state.selectedDocId = null;
    const container = document.getElementById('chartDocList');
    container.innerHTML = state.documents.map(d => `
        <div class="doc-select-item" onclick="selectChartDoc(${d.id})">
            <i class="fas ${getFileIcon(d.file_type)} ${getFileClass(d.file_type)}"></i>
            <span>${escapeHtml(d.filename)}</span>
            ${d.suggestions?.has_numeric_data ? '<i class="fas fa-chart-bar text-green-400"></i>' : ''}
        </div>
    `).join('') || '<p class="empty-state">No documents</p>';
    updateChartBtn();
}

function selectChartDoc(id) {
    state.selectedDocId = id;
    document.querySelectorAll('#chartDocList .doc-select-item').forEach((el, i) => {
        el.classList.toggle('selected', state.documents[i]?.id === id);
    });
    renderChartSuggestions();
    updateChartBtn();
}

function updateChartBtn() {
    document.getElementById('generateChartBtn').disabled = !state.selectedDocId;
}

function renderChartSuggestions() {
    const container = document.getElementById('chartSuggestions');
    const doc = state.documents.find(d => d.id === state.selectedDocId);
    
    if (!doc?.suggestions?.chart_suggestions?.length) {
        container.innerHTML = doc?.suggestions?.has_numeric_data === false ? 
            '<p class="text-sm text-yellow-400">This document may not have numeric data for charts.</p>' : '';
        return;
    }
    
    const suggestions = doc.suggestions.chart_suggestions;
    const chartIcons = { bar: 'fa-chart-bar', line: 'fa-chart-line', pie: 'fa-chart-pie', doughnut: 'fa-chart-pie', radar: 'fa-bullseye', polarArea: 'fa-circle-notch' };
    
    container.innerHTML = `
        <h4><i class="fas fa-lightbulb text-yellow-400"></i> Suggested Charts</h4>
        ${suggestions.map((s, i) => {
            const chartType = s.type?.toLowerCase() || 'bar';
            const icon = chartIcons[chartType] || 'fa-chart-bar';
            return `
                <div class="suggestion-item ${i === 0 ? 'top' : ''}" onclick="selectChartType('${chartType}')">
                    <div class="suggestion-label">
                        <i class="fas ${icon}"></i>
                        ${(s.type || 'Bar').toUpperCase()} Chart
                        <span class="suggestion-score ${(s.relevance || 0) >= 0.7 ? 'score-high' : 'score-med'}">${Math.round((s.relevance || 0) * 100)}%</span>
                    </div>
                    <div class="suggestion-reason">${escapeHtml(s.reason || '')}</div>
                </div>
            `;
        }).join('')}
    `;
}

function selectChartType(type) {
    const select = document.getElementById('chartTypeSelect');
    // Map suggestion types to valid select options
    const typeMap = { 'funnel': 'bar', 'timeline': 'line', 'map': 'bar', 'horizontal bar': 'bar' };
    const mappedType = typeMap[type.toLowerCase()] || type.toLowerCase();
    
    // Check if option exists
    const options = Array.from(select.options).map(o => o.value);
    if (options.includes(mappedType)) {
        select.value = mappedType;
    } else {
        select.value = 'bar'; // fallback
    }
    generateChart();
}

async function generateChart() {
    if (!state.selectedDocId) return;
    const chartType = document.getElementById('chartTypeSelect').value;
    
    showLoading('Generating chart...');
    try {
        const result = await api('/charts', {
            method: 'POST',
            body: JSON.stringify({ document_id: state.selectedDocId, chart_type: chartType })
        });
        renderChart(result.result);
        loadChartHistory();
        showToast('Chart generated!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { hideLoading(); }
}

function renderChart(data) {
    if (state.chartInstance) state.chartInstance.destroy();
    
    const ctx = document.getElementById('chartCanvas').getContext('2d');
    const chartData = data.data || [];
    const chartType = data.chart_type || 'bar';
    const isRadialChart = ['pie', 'doughnut', 'polarArea', 'radar'].includes(chartType);
    
    // Generate more colors for larger datasets
    const baseColors = [
        'rgba(99,102,241,0.7)', 'rgba(34,197,94,0.7)', 'rgba(245,158,11,0.7)', 
        'rgba(239,68,68,0.7)', 'rgba(168,85,247,0.7)', 'rgba(236,72,153,0.7)',
        'rgba(14,165,233,0.7)', 'rgba(20,184,166,0.7)', 'rgba(132,204,22,0.7)'
    ];
    const colors = chartData.map((_, i) => baseColors[i % baseColors.length]);
    const borderColors = colors.map(c => c.replace('0.7', '1'));
    
    state.chartInstance = new Chart(ctx, {
        type: chartType,
        data: {
            labels: chartData.map(d => d.label),
            datasets: [{
                label: data.title || 'Data',
                data: chartData.map(d => d.value),
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 2,
                fill: chartType === 'radar' ? true : false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { 
                title: { display: true, text: data.title || '', color: '#f1f5f9', font: { size: 16 } }, 
                legend: { labels: { color: '#94a3b8' } } 
            },
            scales: !isRadialChart ? {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.1)' }, beginAtZero: true }
            } : (chartType === 'radar' ? {
                r: { ticks: { color: '#94a3b8', backdropColor: 'transparent' }, grid: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#94a3b8' } }
            } : {})
        }
    });
}

async function loadChartHistory() {
    const container = document.getElementById('chartHistory');
    let allCharts = [];
    for (const doc of state.documents.slice(0, 5)) {
        try {
            const charts = await api(`/charts/${doc.id}`);
            charts.forEach(c => c.doc_name = doc.filename);
            allCharts = allCharts.concat(charts);
        } catch (e) {}
    }
    
    container.innerHTML = allCharts.slice(0, 5).map(c => `
        <div class="history-item" onclick="renderChart(${JSON.stringify(c.chart_data).replace(/"/g, '&quot;')})">
            <div class="history-item-title">${escapeHtml(c.title || 'Chart')}</div>
            <div class="history-item-meta">${escapeHtml(c.doc_name)} • ${formatDate(c.created_at)}</div>
        </div>
    `).join('') || '<p class="empty-state">No charts yet</p>';
}

// ============ Utilities ============
function openModal(id) {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById(id).classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function showLoading(text = 'Processing...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-red-400'}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

async function refreshData() {
    showLoading('Refreshing...');
    await initApp();
    hideLoading();
    showToast('Refreshed!', 'success');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getFileIcon(type) {
    return { pdf: 'fa-file-pdf', docx: 'fa-file-word', doc: 'fa-file-word', png: 'fa-file-image', jpg: 'fa-file-image', jpeg: 'fa-file-image', txt: 'fa-file-alt' }[type?.toLowerCase()] || 'fa-file';
}

function getFileClass(type) {
    return { pdf: 'pdf', docx: 'docx', doc: 'docx', png: 'image', jpg: 'image', jpeg: 'image' }[type?.toLowerCase()] || '';
}

function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
