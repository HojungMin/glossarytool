// ============================================================
// 용어집 도구 - 메인 로직
// 데이터는 모두 localStorage에 저장되며, JSON 내보내기/가져오기로 백업 가능
// ============================================================

const STORAGE_KEY = 'glossary_data_v1';

// 노션 스타일 태그 색상 팔레트
// gray는 "general" 프로젝트 전용 / 나머지 색상은 자동 배정 순서대로 사용
const TAG_COLORS = ['gray', 'red', 'pink', 'purple', 'blue', 'green', 'yellow', 'orange', 'brown'];
const ASSIGNABLE_COLORS = ['red', 'pink', 'purple', 'blue', 'green', 'yellow', 'orange', 'brown'];

function isGeneralProject(name) {
  return (name || '').trim().toLowerCase() === 'general';
}

// 데이터 초기 로드
let data = loadData();
migrateProjectColors();

// 기존 프로젝트의 색상을 새 규칙(general=gray, 나머지=배정 순서)에 맞춰 재정렬
function migrateProjectColors() {
  let changed = false;
  let assignIdx = 0;
  for (const p of data.projects) {
    const target = isGeneralProject(p.name)
      ? 'gray'
      : ASSIGNABLE_COLORS[assignIdx++ % ASSIGNABLE_COLORS.length];
    if (p.color !== target) {
      p.color = target;
      changed = true;
    }
  }
  if (changed) saveData();
}

function nextColor() {
  // 사용 빈도가 가장 낮은 색상을 선택 (gray는 general 전용이므로 제외)
  const usage = Object.fromEntries(ASSIGNABLE_COLORS.map(c => [c, 0]));
  for (const p of data.projects) {
    if (usage[p.color] !== undefined) usage[p.color]++;
  }
  // 동일 사용량일 때는 ASSIGNABLE_COLORS의 정의 순서를 따름
  let minColor = ASSIGNABLE_COLORS[0];
  let minCount = usage[minColor];
  for (const c of ASSIGNABLE_COLORS) {
    if (usage[c] < minCount) { minCount = usage[c]; minColor = c; }
  }
  return minColor;
}

function cycleProjectColor(id) {
  const p = data.projects.find(x => x.id === id);
  if (!p) return;
  const idx = TAG_COLORS.indexOf(p.color);
  p.color = TAG_COLORS[(idx + 1) % TAG_COLORS.length];
  saveData();
  renderProjects();
  renderGlossary();
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error(e); }
  return {
    terms: [],
    projects: [],
    settings: { apiKey: '', model: 'claude-opus-4-7', sort: 'ko-asc' }
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  refreshStats();
}

function refreshStats() {
  document.getElementById('stat-terms').textContent = data.terms.length;
  document.getElementById('stat-projects').textContent = data.projects.length;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================================
// 탭 전환
// ============================================================
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ============================================================
// 용어집 (Glossary) 탭
// ============================================================
function renderGlossary() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const projectFilter = document.getElementById('project-filter').value;

  let filtered = data.terms.filter(t => {
    if (search && !t.ko.toLowerCase().includes(search) && !t.en.toLowerCase().includes(search)) return false;
    if (projectFilter && !(t.projects || []).includes(projectFilter)) return false;
    return true;
  });

  const sort = (data.settings && data.settings.sort) || 'ko-asc';
  const koCmp = (a, b) => (a.ko || '').localeCompare(b.ko || '', 'ko');
  const enCmp = (a, b) => (a.en || '').localeCompare(b.en || '', 'en', { sensitivity: 'base' });
  if (sort === 'ko-asc') {
    filtered.sort((a, b) => koCmp(a, b) || enCmp(a, b));
  } else if (sort === 'en-asc') {
    filtered.sort((a, b) => enCmp(a, b) || koCmp(a, b));
  } else if (sort === 'updated-desc') {
    filtered.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
  } else {
    // created-desc (기본 fallback)
    filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  const wrap = document.getElementById('terms-table-wrap');
  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">📭</div>
      <div>${data.terms.length === 0 ? '아직 등록된 용어가 없어요. "+ 새 용어" / "📥 일괄 가져오기" / "✨ AI 후보 추출"로 시작하세요.' : '검색 결과가 없어요.'}</div></div>`;
    return;
  }

  let html = '<table><thead><tr><th style="width:25%;">한국어</th><th style="width:25%;">영어</th><th>예문 / 프로젝트</th><th style="width:120px;">작업</th></tr></thead><tbody>';
  for (const t of filtered) {
    const projectTags = (t.projects || []).map(pid => {
      const p = data.projects.find(x => x.id === pid);
      return p ? `<span class="project-tag color-${p.color || 'gray'}">${escapeHtml(p.name)}</span>` : '';
    }).join('');
    html += `<tr>
      <td><strong>${escapeHtml(t.ko)}</strong></td>
      <td>${escapeHtml(t.en)}</td>
      <td>${projectTags}${t.context ? `<div class="context">"${escapeHtml(t.context)}"</div>` : ''}</td>
      <td>
        <button class="secondary" style="padding:4px 10px;font-size:12px;" onclick="openTermModal('${t.id}')">수정</button>
        <button class="danger" onclick="deleteTerm('${t.id}')">삭제</button>
      </td>
    </tr>`;
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById('search-input').addEventListener('input', renderGlossary);
document.getElementById('project-filter').addEventListener('change', renderGlossary);
document.getElementById('sort-select').addEventListener('change', e => {
  if (!data.settings) data.settings = {};
  data.settings.sort = e.target.value;
  saveData();
  renderGlossary();
});

// ============================================================
// 용어 추가/수정 모달
// ============================================================
function openTermModal(id) {
  const modal = document.getElementById('term-modal');
  const title = document.getElementById('term-modal-title');
  document.getElementById('term-edit-id').value = id || '';

  // 프로젝트 체크박스 렌더
  const checksDiv = document.getElementById('term-projects-checks');
  if (data.projects.length === 0) {
    checksDiv.innerHTML = '<span style="color:#a0aec0;font-size:13px;">설정 탭에서 프로젝트를 먼저 추가하세요.</span>';
  } else {
    checksDiv.innerHTML = data.projects.map(p =>
      `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:12px;margin-bottom:6px;font-size:13px;font-weight:normal;cursor:pointer;">
        <input type="checkbox" value="${p.id}" class="term-project-cb">
        <span class="project-tag color-${p.color || 'gray'}">${escapeHtml(p.name)}</span>
      </label>`).join('');
  }

  if (id) {
    const t = data.terms.find(x => x.id === id);
    if (!t) return;
    title.textContent = '용어 수정';
    document.getElementById('term-ko').value = t.ko;
    document.getElementById('term-en').value = t.en;
    document.getElementById('term-context').value = t.context || '';
    (t.projects || []).forEach(pid => {
      const cb = checksDiv.querySelector(`input[value="${pid}"]`);
      if (cb) cb.checked = true;
    });
  } else {
    title.textContent = '새 용어 추가';
    document.getElementById('term-ko').value = '';
    document.getElementById('term-en').value = '';
    document.getElementById('term-context').value = '';
  }

  modal.classList.add('active');
  document.getElementById('term-ko').focus();
}

function closeTermModal() {
  document.getElementById('term-modal').classList.remove('active');
}

function saveTerm() {
  const ko = document.getElementById('term-ko').value.trim();
  const en = document.getElementById('term-en').value.trim();
  const context = document.getElementById('term-context').value.trim();
  const id = document.getElementById('term-edit-id').value;
  const projects = Array.from(document.querySelectorAll('.term-project-cb:checked')).map(cb => cb.value);

  if (!ko || !en) { alert('한국어와 영어는 필수입니다.'); return; }

  if (id) {
    const t = data.terms.find(x => x.id === id);
    if (t) { t.ko = ko; t.en = en; t.context = context; t.projects = projects; t.updatedAt = new Date().toISOString(); }
  } else {
    data.terms.push({
      id: uid(), ko, en, context, projects,
      createdAt: new Date().toISOString()
    });
  }
  saveData();
  closeTermModal();
  renderGlossary();
}

function deleteTerm(id) {
  if (!confirm('이 용어를 삭제할까요?')) return;
  data.terms = data.terms.filter(t => t.id !== id);
  saveData();
  renderGlossary();
}

// ============================================================
// 프로젝트 관리
// ============================================================
function renderProjects() {
  const list = document.getElementById('projects-list');
  if (data.projects.length === 0) {
    list.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;">아직 프로젝트가 없어요.</p>';
  } else {
    list.innerHTML = data.projects.map(p =>
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
        <span class="color-swatch color-${p.color || 'gray'}" title="클릭해서 색 바꾸기" onclick="cycleProjectColor('${p.id}')"></span>
        <span class="project-tag color-${p.color || 'gray'}">${escapeHtml(p.name)}</span>
        <span style="flex:1;"></span>
        <button class="danger" onclick="deleteProject('${p.id}')">삭제</button>
      </div>`).join('');
  }

  // 필터 드롭다운들 업데이트
  const opts = '<option value="">전체 프로젝트</option>' +
    data.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  document.getElementById('project-filter').innerHTML = opts;

  const optsExtract = '<option value="">없음</option>' +
    data.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  document.getElementById('extract-project').innerHTML = optsExtract;
  const freeformSel = document.getElementById('extract-freeform-project');
  if (freeformSel) freeformSel.innerHTML = optsExtract;
  const bulkSel = document.getElementById('bulk-project');
  if (bulkSel) bulkSel.innerHTML = optsExtract;
}

function addProject() {
  const input = document.getElementById('new-project-name');
  const name = input.value.trim();
  if (!name) return;
  if (data.projects.some(p => p.name === name)) { alert('이미 있는 이름입니다.'); return; }
  const color = isGeneralProject(name) ? 'gray' : nextColor();
  data.projects.push({ id: uid(), name, color });
  input.value = '';
  saveData();
  renderProjects();
}

function deleteProject(id) {
  if (!confirm('이 프로젝트를 삭제할까요? (용어는 유지되지만 해당 태그만 제거됩니다)')) return;
  data.projects = data.projects.filter(p => p.id !== id);
  data.terms.forEach(t => { if (t.projects) t.projects = t.projects.filter(pid => pid !== id); });
  saveData();
  renderProjects();
  renderGlossary();
}

// ============================================================
// 설정 - API 키
// ============================================================
function loadSettingsUI() {
  document.getElementById('api-key-input').value = data.settings.apiKey || '';
  document.getElementById('model-select').value = data.settings.model || 'claude-opus-4-7';
  updateApiKeyBadge();
}

function updateApiKeyBadge() {
  const badge = document.getElementById('api-key-badge');
  if (data.settings.apiKey) {
    badge.textContent = '설정됨';
    badge.className = 'api-key-status set';
  } else {
    badge.textContent = '미설정';
    badge.className = 'api-key-status not-set';
  }
}

function saveApiKey() {
  data.settings.apiKey = document.getElementById('api-key-input').value.trim();
  data.settings.model = document.getElementById('model-select').value;
  saveData();
  updateApiKeyBadge();
  alert('저장되었습니다.');
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  const btn = document.getElementById('api-key-toggle');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈 숨기기';
  } else {
    input.type = 'password';
    btn.textContent = '👁 보기';
  }
}

// ============================================================
// 파일 로딩 / 포맷 감지
// ============================================================

// 확장자 기반 포맷 분류. 'tabular'은 SheetJS로 처리, 그 외는 텍스트로 읽음.
function detectFormat(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (['xlsx', 'xls', 'xlsm', 'xlsb'].includes(ext)) return 'excel';
  if (ext === 'csv') return 'csv';
  if (ext === 'tsv') return 'tsv';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc'; // 안내용 (지원 불가)
  if (ext === 'json') return 'json';
  if (ext === 'xml' || ext === 'resx') return 'xml';
  if (['html', 'htm'].includes(ext)) return 'html';
  if (ext === 'po' || ext === 'pot') return 'po';
  if (ext === 'properties' || ext === 'strings') return 'kv';
  if (['txt', 'md', 'markdown'].includes(ext)) return 'text';
  return 'text';
}

function isTabularFormat(format) {
  return format === 'excel' || format === 'csv' || format === 'tsv';
}

function formatLabel(format) {
  return ({
    excel: '엑셀', csv: 'CSV', tsv: 'TSV',
    docx: 'Word', doc: 'Word (legacy)',
    json: 'JSON', xml: 'XML', html: 'HTML',
    po: 'PO (gettext)', kv: 'Key=Value', text: '텍스트'
  })[format] || format;
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsText(file, 'UTF-8');
  });
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try { resolve(XLSX.read(e.target.result, { type: 'array' })); }
      catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// docx는 mammoth.js로 단락 단위 텍스트 추출
async function readDocx(file) {
  if (typeof mammoth === 'undefined') {
    throw new Error('Word 파서(mammoth.js)를 로드하지 못했어요. 인터넷 연결을 확인하거나 페이지를 새로고침해 주세요.');
  }
  const arrayBuffer = await readAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

// 파일을 포맷에 맞춰 로드한 통합 핸들러
async function loadFile(file) {
  const format = detectFormat(file.name);
  if (format === 'doc') {
    throw new Error('구버전 .doc은 지원하지 않습니다. Word에서 .docx로 다시 저장해 주세요.');
  }
  if (isTabularFormat(format)) {
    const workbook = await readExcel(file);
    return { format, isTabular: true, workbook, filename: file.name };
  }
  if (format === 'docx') {
    const text = await readDocx(file);
    return { format, isTabular: false, text, filename: file.name };
  }
  const text = await readAsText(file);
  return { format, isTabular: false, text, filename: file.name };
}

function sheetToRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

function getColumnLetters(rows) {
  let maxCols = 0;
  for (const r of rows) maxCols = Math.max(maxCols, r.length);
  const letters = [];
  for (let i = 0; i < maxCols; i++) {
    letters.push({ index: i, label: XLSX.utils.encode_col(i) });
  }
  return letters;
}

// ============================================================
// 비-tabular 포맷에서 문자열 추출 (하이라이트용)
// ============================================================

function extractStringsFromText(loaded) {
  switch (loaded.format) {
    case 'json': {
      let parsed;
      try { parsed = JSON.parse(loaded.text); }
      catch (e) { throw new Error('JSON 파싱 실패: ' + e.message); }
      const strings = [];
      const walk = v => {
        if (typeof v === 'string') strings.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(parsed);
      return strings.map(s => s.trim()).filter(Boolean);
    }
    case 'xml': {
      const doc = new DOMParser().parseFromString(loaded.text, 'text/xml');
      const err = doc.querySelector('parsererror');
      if (err) throw new Error('XML 파싱 실패');
      const strings = [];
      const walk = node => {
        for (const child of node.childNodes || []) {
          if (child.nodeType === 3) {
            const t = (child.textContent || '').trim();
            if (t) strings.push(t);
          } else if (child.nodeType === 1) {
            walk(child);
          }
        }
      };
      walk(doc);
      return strings;
    }
    case 'html': {
      const div = document.createElement('div');
      div.innerHTML = loaded.text;
      div.querySelectorAll('script, style').forEach(el => el.remove());
      const strings = [];
      const walk = node => {
        for (const child of node.childNodes || []) {
          if (child.nodeType === 3) {
            const t = (child.textContent || '').trim();
            if (t) strings.push(t);
          } else if (child.nodeType === 1) {
            walk(child);
          }
        }
      };
      walk(div);
      return strings;
    }
    case 'po': {
      // msgstr(번역문)을 우선 추출, 없으면 msgid(원문) 추출
      const strings = [];
      const blocks = loaded.text.split(/\n\s*\n/);
      for (const block of blocks) {
        let msgid = '', msgstr = '', mode = null;
        for (const line of block.split('\n')) {
          if (line.startsWith('msgid ')) { mode = 'id'; msgid = unquotePo(line.slice(6)); }
          else if (line.startsWith('msgstr ')) { mode = 'str'; msgstr = unquotePo(line.slice(7)); }
          else if (line.startsWith('"') && mode === 'id') msgid += unquotePo(line);
          else if (line.startsWith('"') && mode === 'str') msgstr += unquotePo(line);
        }
        const picked = (msgstr.trim() ? msgstr : msgid).trim();
        if (picked) strings.push(picked);
      }
      return strings;
    }
    case 'kv': {
      // key=value 또는 "key" = "value"; 형식 (.properties / .strings)
      const strings = [];
      for (const line of loaded.text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#') || t.startsWith('//') || t.startsWith('!')) continue;
        // .strings 형식: "key" = "value";
        let m = t.match(/^"[^"]*"\s*=\s*"([^"]*)"\s*;?\s*$/);
        if (m) { if (m[1].trim()) strings.push(m[1]); continue; }
        // .properties: key=value
        m = t.match(/^[^=:]+[=:]\s*(.*)$/);
        if (m && m[1].trim()) strings.push(m[1].trim());
      }
      return strings;
    }
    case 'text':
    default:
      return loaded.text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
}

function unquotePo(s) {
  s = s.trim();
  if (s.startsWith('"')) s = s.slice(1);
  if (s.endsWith('"')) s = s.slice(0, -1);
  return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// ============================================================
// 하이라이트 탭
// ============================================================
let highlightLoaded = null;

document.getElementById('highlight-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const picker = document.getElementById('highlight-sheet-picker');
  const summary = document.getElementById('highlight-summary');
  picker.style.display = 'none';
  summary.innerHTML = '';
  document.getElementById('highlight-result').innerHTML = '';

  try {
    highlightLoaded = await loadFile(file);

    if (highlightLoaded.isTabular) {
      // 표 형식: 시트/컬럼 선택
      const sheetSel = document.getElementById('highlight-sheet');
      sheetSel.innerHTML = highlightLoaded.workbook.SheetNames
        .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
      picker.style.display = 'block';
      summary.innerHTML = `<div class="status-msg info">📊 ${formatLabel(highlightLoaded.format)} 파일 — 시트와 한국어 컬럼을 선택하세요.</div>`;
      updateHighlightColumns();
    } else {
      // 비-tabular: 즉시 추출
      const strings = extractStringsFromText(highlightLoaded);
      highlightLoaded.strings = strings;
      summary.innerHTML = `<div class="status-msg info">📄 ${formatLabel(highlightLoaded.format)} 파일 감지 — ${strings.length}개 문자열 추출됨.</div>
        <button class="primary" onclick="runHighlightForStrings()">하이라이트 보기</button>`;
    }
  } catch (err) {
    summary.innerHTML = `<div class="status-msg error">파일을 처리하지 못했어요: ${escapeHtml(err.message)}</div>`;
  }
});

document.getElementById('highlight-sheet').addEventListener('change', updateHighlightColumns);

function clearHighlight() {
  document.getElementById('highlight-file').value = '';
  document.getElementById('highlight-summary').innerHTML = '';
  document.getElementById('highlight-sheet-picker').style.display = 'none';
  document.getElementById('highlight-result').innerHTML = '';
  highlightLoaded = null;
}

function updateHighlightColumns() {
  if (!highlightLoaded || !highlightLoaded.isTabular) return;
  const sheetName = document.getElementById('highlight-sheet').value;
  const ws = highlightLoaded.workbook.Sheets[sheetName];
  const rows = sheetToRows(ws);
  const cols = getColumnLetters(rows);
  const firstRow = rows[0] || [];
  const colSel = document.getElementById('highlight-column');
  colSel.innerHTML = cols.map(c => {
    const sample = String(firstRow[c.index] || '').slice(0, 20);
    return `<option value="${c.index}">${c.label}열 ${sample ? `(${escapeHtml(sample)})` : ''}</option>`;
  }).join('');
}

function runHighlight() {
  if (!highlightLoaded || !highlightLoaded.isTabular) return;
  const sheetName = document.getElementById('highlight-sheet').value;
  const colIdx = parseInt(document.getElementById('highlight-column').value);
  const ws = highlightLoaded.workbook.Sheets[sheetName];
  const rows = sheetToRows(ws);
  const strings = rows.map(r => String(r[colIdx] || '').trim()).filter(Boolean);
  renderHighlightStrings(strings);
}

function runHighlightForStrings() {
  if (!highlightLoaded || !highlightLoaded.strings) return;
  renderHighlightStrings(highlightLoaded.strings);
}

function renderHighlightStrings(strings) {
  // 등록된 용어를 길이 내림차순으로 정렬 (긴 용어 먼저 매칭)
  const terms = [...data.terms].sort((a, b) => b.ko.length - a.ko.length);

  if (terms.length === 0) {
    document.getElementById('highlight-result').innerHTML =
      '<div class="status-msg error">먼저 용어집에 용어를 등록하세요.</div>';
    return;
  }

  let html = '';
  const foundTerms = new Map();

  strings.forEach((text, i) => {
    const { highlighted, hits } = highlightText(text, terms);
    for (const h of hits) {
      if (!foundTerms.has(h.ko)) foundTerms.set(h.ko, { en: h.en, count: 0 });
      foundTerms.get(h.ko).count++;
    }
    html += `<div class="highlight-row">
      <div class="row-num">${i + 1}</div>
      <div class="row-text">${highlighted}</div>
    </div>`;
  });

  let foundHtml = '';
  if (foundTerms.size > 0) {
    foundHtml = `<div class="terms-found"><h3>이 파일에서 발견된 용어 (${foundTerms.size}개)</h3>`;
    for (const [ko, info] of foundTerms) {
      foundHtml += `<span class="term-chip"><strong>${escapeHtml(ko)}</strong> → ${escapeHtml(info.en)} <span style="color:var(--text-tertiary);">×${info.count}</span></span>`;
    }
    foundHtml += '</div>';
  } else {
    foundHtml = '<div class="status-msg info">이 파일에서 등록된 용어가 발견되지 않았어요.</div>';
  }

  document.getElementById('highlight-result').innerHTML = foundHtml + html;
}

function highlightText(text, terms) {
  // 간단한 멀티 패턴 매칭: 각 용어를 순서대로 찾아 마킹
  // 정확한 매칭을 위해 위치 기반으로 처리
  const matches = [];
  for (const t of terms) {
    if (!t.ko) continue;
    let idx = 0;
    while ((idx = text.indexOf(t.ko, idx)) !== -1) {
      matches.push({ start: idx, end: idx + t.ko.length, ko: t.ko, en: t.en });
      idx += t.ko.length;
    }
  }
  // 겹치는 매치 제거 (먼저 등록된/긴 용어 우선)
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const final = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) { final.push(m); lastEnd = m.end; }
  }

  let result = '';
  let cursor = 0;
  const hits = [];
  for (const m of final) {
    result += escapeHtml(text.slice(cursor, m.start));
    result += `<mark class="term-hl" title="${escapeHtml(m.en)}">${escapeHtml(text.slice(m.start, m.end))}<sub style="font-size:10px;color:#9a3412;margin-left:2px;">${escapeHtml(m.en)}</sub></mark>`;
    cursor = m.end;
    hits.push({ ko: m.ko, en: m.en });
  }
  result += escapeHtml(text.slice(cursor));
  return { highlighted: result, hits };
}

// ============================================================
// 일괄 가져오기 탭 (엑셀/CSV/TSV → 용어집에 직접 등록)
// 한국어가 일치하는 기존 용어는 영어/예문을 덮어쓰고, 프로젝트 태그는 병합
// ============================================================
let bulkLoaded = null;

document.getElementById('bulk-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const picker = document.getElementById('bulk-picker');
  const summary = document.getElementById('bulk-summary');
  picker.style.display = 'none';
  summary.innerHTML = '';
  document.getElementById('bulk-result').innerHTML = '';

  try {
    bulkLoaded = await loadFile(file);
    if (!bulkLoaded.isTabular) {
      summary.innerHTML = `<div class="status-msg error">일괄 가져오기는 엑셀/CSV/TSV만 지원합니다. 다른 형식이라면 "AI 후보 추출"을 이용하세요.</div>`;
      return;
    }
    const sheetSel = document.getElementById('bulk-sheet');
    sheetSel.innerHTML = bulkLoaded.workbook.SheetNames
      .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    picker.style.display = 'block';
    summary.innerHTML = `<div class="status-msg info">📊 ${formatLabel(bulkLoaded.format)} 파일 — 한국어/영어 컬럼을 선택한 뒤 "가져오기"를 누르세요.</div>`;
    updateBulkColumns();
  } catch (err) {
    summary.innerHTML = `<div class="status-msg error">파일을 처리하지 못했어요: ${escapeHtml(err.message)}</div>`;
  }
});

document.getElementById('bulk-sheet').addEventListener('change', updateBulkColumns);

function clearBulk() {
  document.getElementById('bulk-file').value = '';
  document.getElementById('bulk-summary').innerHTML = '';
  document.getElementById('bulk-picker').style.display = 'none';
  document.getElementById('bulk-result').innerHTML = '';
  bulkLoaded = null;
}

function updateBulkColumns() {
  if (!bulkLoaded || !bulkLoaded.isTabular) return;
  const sheetName = document.getElementById('bulk-sheet').value;
  const ws = bulkLoaded.workbook.Sheets[sheetName];
  const rows = sheetToRows(ws);
  const cols = getColumnLetters(rows);
  const firstRow = rows[0] || [];
  const options = cols.map(c => {
    const sample = String(firstRow[c.index] || '').slice(0, 20);
    return `<option value="${c.index}">${c.label}열 ${sample ? `(${escapeHtml(sample)})` : ''}</option>`;
  }).join('');
  document.getElementById('bulk-ko-col').innerHTML = options;
  document.getElementById('bulk-en-col').innerHTML = options;
  document.getElementById('bulk-context-col').innerHTML = '<option value="">없음</option>' + options;
  if (cols.length > 1) document.getElementById('bulk-en-col').value = '1';
}

function runBulkImport() {
  if (!bulkLoaded || !bulkLoaded.isTabular) return;
  const sheetName = document.getElementById('bulk-sheet').value;
  const koIdx = parseInt(document.getElementById('bulk-ko-col').value);
  const enIdx = parseInt(document.getElementById('bulk-en-col').value);
  const ctxRaw = document.getElementById('bulk-context-col').value;
  const ctxIdx = ctxRaw === '' ? -1 : parseInt(ctxRaw);
  const projectId = document.getElementById('bulk-project').value;
  const skipHeader = document.getElementById('bulk-skip-header').checked;

  if (koIdx === enIdx) {
    document.getElementById('bulk-result').innerHTML =
      '<div class="status-msg error">한국어와 영어 컬럼이 같습니다. 다른 컬럼을 선택해 주세요.</div>';
    return;
  }

  const ws = bulkLoaded.workbook.Sheets[sheetName];
  const rows = sheetToRows(ws);
  const startIdx = skipHeader ? 1 : 0;

  // 한국어 기준 인덱스 (덮어쓰기 매칭용)
  const koToTerm = new Map();
  for (const t of data.terms) koToTerm.set(t.ko, t);

  let added = 0, overwritten = 0, skipped = 0;
  const now = new Date().toISOString();

  for (let i = startIdx; i < rows.length; i++) {
    const ko = String(rows[i][koIdx] || '').trim();
    const en = String(rows[i][enIdx] || '').trim();
    if (!ko || !en) { skipped++; continue; }
    const context = ctxIdx >= 0 ? String(rows[i][ctxIdx] || '').trim() : '';

    const existing = koToTerm.get(ko);
    if (existing) {
      existing.en = en;
      if (context) existing.context = context;
      if (projectId && !(existing.projects || []).includes(projectId)) {
        existing.projects = [...(existing.projects || []), projectId];
      }
      existing.updatedAt = now;
      overwritten++;
    } else {
      const newTerm = {
        id: uid(), ko, en, context,
        projects: projectId ? [projectId] : [],
        createdAt: now
      };
      data.terms.push(newTerm);
      koToTerm.set(ko, newTerm);
      added++;
    }
  }

  saveData();
  renderGlossary();

  const resultDiv = document.getElementById('bulk-result');
  resultDiv.innerHTML = `<div class="status-msg success">
    ✓ 가져오기 완료!<br>
    • 새로 추가: <strong>${added}개</strong><br>
    • 덮어쓰기: <strong>${overwritten}개</strong>${skipped ? `<br>• 빈 행 건너뜀: ${skipped}개` : ''}
  </div>`;
}

// ============================================================
// AI 후보 추출 탭 (표 형식 + freeform 모드)
// ============================================================
let extractLoaded = null;

document.getElementById('extract-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const tabularPicker = document.getElementById('extract-sheet-picker');
  const freeformPicker = document.getElementById('extract-freeform-picker');
  const summary = document.getElementById('extract-summary');
  tabularPicker.style.display = 'none';
  freeformPicker.style.display = 'none';
  summary.innerHTML = '';
  document.getElementById('extract-result').innerHTML = '';

  try {
    extractLoaded = await loadFile(file);

    if (extractLoaded.isTabular) {
      // 표 형식: 컬럼 선택 UI
      const sheetSel = document.getElementById('extract-sheet');
      sheetSel.innerHTML = extractLoaded.workbook.SheetNames
        .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
      tabularPicker.style.display = 'block';
      summary.innerHTML = `<div class="status-msg info">📊 ${formatLabel(extractLoaded.format)} 파일 — 한국어 / 영어 컬럼을 직접 지정하세요.</div>`;
      updateExtractColumns();
    } else {
      // 비-tabular: freeform 모드 (Claude가 한/영 쌍 자동 식별)
      const charCount = extractLoaded.text.length;
      freeformPicker.style.display = 'block';
      summary.innerHTML = `<div class="status-msg info">📄 ${formatLabel(extractLoaded.format)} 파일 감지 (${charCount.toLocaleString()}자) — AI가 한/영 쌍을 자동으로 찾아 분석합니다.</div>`;
    }
  } catch (err) {
    summary.innerHTML = `<div class="status-msg error">파일을 처리하지 못했어요: ${escapeHtml(err.message)}</div>`;
  }
});

document.getElementById('extract-sheet').addEventListener('change', updateExtractColumns);

function clearExtract() {
  document.getElementById('extract-file').value = '';
  document.getElementById('extract-summary').innerHTML = '';
  document.getElementById('extract-sheet-picker').style.display = 'none';
  document.getElementById('extract-freeform-picker').style.display = 'none';
  document.getElementById('extract-result').innerHTML = '';
  extractLoaded = null;
}

function updateExtractColumns() {
  if (!extractLoaded || !extractLoaded.isTabular) return;
  const sheetName = document.getElementById('extract-sheet').value;
  const ws = extractLoaded.workbook.Sheets[sheetName];
  const rows = sheetToRows(ws);
  const cols = getColumnLetters(rows);
  const firstRow = rows[0] || [];
  const options = cols.map(c => {
    const sample = String(firstRow[c.index] || '').slice(0, 20);
    return `<option value="${c.index}">${c.label}열 ${sample ? `(${escapeHtml(sample)})` : ''}</option>`;
  }).join('');
  document.getElementById('extract-ko-col').innerHTML = options;
  document.getElementById('extract-en-col').innerHTML = options;
  // 영어 컬럼 기본값: 두 번째 컬럼
  if (cols.length > 1) document.getElementById('extract-en-col').value = '1';
}

// 표 형식 분석
async function runExtraction() {
  if (!data.settings.apiKey) {
    alert('먼저 설정 탭에서 Claude API 키를 등록하세요.');
    return;
  }

  const sheetName = document.getElementById('extract-sheet').value;
  const koIdx = parseInt(document.getElementById('extract-ko-col').value);
  const enIdx = parseInt(document.getElementById('extract-en-col').value);
  const projectId = document.getElementById('extract-project').value;
  const maxRows = parseInt(document.getElementById('extract-max-rows').value) || 100;

  const ws = extractLoaded.workbook.Sheets[sheetName];
  const rows = sheetToRows(ws);

  const pairs = [];
  for (let i = 0; i < rows.length && pairs.length < maxRows; i++) {
    const ko = String(rows[i][koIdx] || '').trim();
    const en = String(rows[i][enIdx] || '').trim();
    if (ko && en && ko !== en) pairs.push({ ko, en, row: i + 1 });
  }

  if (pairs.length === 0) {
    document.getElementById('extract-result').innerHTML =
      '<div class="status-msg error">분석할 한/영 쌍을 찾지 못했어요. 컬럼 선택을 확인하세요.</div>';
    return;
  }

  const resultDiv = document.getElementById('extract-result');
  resultDiv.innerHTML = `<div class="status-msg loading">⏳ ${pairs.length}개 행을 분석 중... (수십 초 걸릴 수 있어요)</div>`;

  try {
    const existingTerms = data.terms.map(t => `${t.ko} = ${t.en}`).join('\n');
    const candidates = await callClaudeForPairs(pairs, existingTerms);
    finishExtraction(candidates, projectId);
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = `<div class="status-msg error">오류: ${escapeHtml(err.message)}</div>`;
  }
}

// freeform 모드: 임의 형식 파일 전체를 Claude에 보내 한/영 쌍을 자동 식별 + 용어 추출
async function runExtractionFreeform() {
  if (!data.settings.apiKey) {
    alert('먼저 설정 탭에서 Claude API 키를 등록하세요.');
    return;
  }

  const projectId = document.getElementById('extract-freeform-project').value;
  const maxChars = parseInt(document.getElementById('extract-freeform-max').value) || 30000;
  let content = extractLoaded.text;
  const truncated = content.length > maxChars;
  if (truncated) content = content.slice(0, maxChars);

  const resultDiv = document.getElementById('extract-result');
  resultDiv.innerHTML = `<div class="status-msg loading">⏳ ${content.length.toLocaleString()}자 분석 중... ${truncated ? '(파일이 커서 앞부분만 분석)' : ''}</div>`;

  try {
    const existingTerms = data.terms.map(t => `${t.ko} = ${t.en}`).join('\n');
    const candidates = await callClaudeForFreeform(content, extractLoaded.format, existingTerms);
    finishExtraction(candidates, projectId);
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = `<div class="status-msg error">오류: ${escapeHtml(err.message)}</div>`;
  }
}

function finishExtraction(candidates, projectId) {
  const resultDiv = document.getElementById('extract-result');
  if (!candidates || candidates.length === 0) {
    resultDiv.innerHTML = '<div class="status-msg info">새로운 용어 후보를 찾지 못했어요.</div>';
    return;
  }
  renderCandidates(candidates, projectId);
}

// 공통 시스템 프롬프트 (캐싱 대상)
const EXTRACTION_RULES = `당신은 한국어-영어 게임 번역 용어집 정리 전문가입니다.

추출 기준:
1. 게임 고유명사 (캐릭터명, 아이템명, 스킬명, 지역명 등)
2. 게임 시스템 용어 (길드, 던전, 퀘스트 등 일관성이 중요한 용어)
3. 사내/프로젝트 고유 용어
4. 두 번 이상 등장하거나, 향후 다시 등장할 가능성이 있는 용어
5. 이미 용어집에 있는 용어는 제외

추출하지 말 것:
- 일반 명사/동사 (예: "사람", "가다")
- 한 번만 등장하는 일반적인 문구
- 이미 등록된 용어와 중복

응답은 반드시 JSON 배열로만 출력하세요. 다른 설명은 일절 금지.
형식: [{"ko": "한국어용어", "en": "English term", "reason": "추출 이유 (한 문장)", "context": "원본 문장 발췌"}]
최대 30개까지 추출. 후보가 없으면 빈 배열 [] 반환.`;

async function callClaudeForPairs(pairs, existingTerms) {
  const pairsText = pairs.map(p => `${p.row}행: KO: ${p.ko} | EN: ${p.en}`).join('\n');
  const userPrompt = `[이미 등록된 용어]
${existingTerms || '(없음)'}

[분석할 한영 쌍]
${pairsText}

위에서 용어집 후보를 JSON 배열로만 출력하세요.`;
  return callClaude(userPrompt);
}

async function callClaudeForFreeform(content, format, existingTerms) {
  const userPrompt = `[이미 등록된 용어]
${existingTerms || '(없음)'}

[분석할 파일 (${formatLabel(format)} 형식)]
아래 파일은 한국어 원문과 영어 번역이 함께 들어있는 ${formatLabel(format)} 형식 파일입니다.
파일 구조를 분석해 한/영 쌍을 식별한 다음, 용어집 후보를 JSON 배열로만 출력하세요.

\`\`\`
${content}
\`\`\``;
  return callClaude(userPrompt);
}

async function callClaude(userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': data.settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: data.settings.model || 'claude-opus-4-7',
      max_tokens: 4096,
      system: [{
        type: 'text',
        text: EXTRACTION_RULES,
        cache_control: { type: 'ephemeral' }
      }],
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 호출 실패 (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const textBlock = result.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('응답에 텍스트가 없습니다.');

  let jsonText = textBlock.text.trim();
  const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
  if (jsonMatch) jsonText = jsonMatch[0];

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error('JSON 파싱 실패. 원본:', textBlock.text);
    throw new Error('AI 응답을 JSON으로 파싱할 수 없습니다. 다시 시도해보세요.');
  }
}

function renderCandidates(candidates, projectId) {
  const resultDiv = document.getElementById('extract-result');
  // 이미 등록된 용어 자동 필터링
  const existing = new Set(data.terms.map(t => t.ko.toLowerCase()));
  const newOnes = candidates.filter(c => c.ko && !existing.has(c.ko.toLowerCase()));

  if (newOnes.length === 0) {
    resultDiv.innerHTML = '<div class="status-msg info">AI가 추출한 모든 후보가 이미 용어집에 있어요.</div>';
    return;
  }

  let html = `<div class="status-msg success">✓ ${newOnes.length}개 후보를 추출했어요. 추가할 항목을 선택하세요.</div>`;
  html += `<div class="toolbar"><button class="secondary" onclick="toggleAllCandidates(true)">전체 선택</button>
    <button class="secondary" onclick="toggleAllCandidates(false)">전체 해제</button>
    <button class="primary" onclick="addSelectedCandidates('${projectId}')">선택 항목 용어집에 추가</button></div>`;
  html += '<div class="candidate-list">';
  html += '<div class="candidate-item" style="background:#edf2f7;font-weight:600;font-size:13px;"><div>선택</div><div>한국어</div><div>영어</div><div>추출 이유 / 예문</div></div>';
  newOnes.forEach((c, i) => {
    html += `<div class="candidate-item">
      <input type="checkbox" class="candidate-cb" data-idx="${i}" checked>
      <div class="ko-en"><input type="text" value="${escapeHtml(c.ko || '')}" data-field="ko" data-idx="${i}"></div>
      <div class="ko-en"><input type="text" value="${escapeHtml(c.en || '')}" data-field="en" data-idx="${i}"></div>
      <div class="reason">
        ${escapeHtml(c.reason || '')}
        ${c.context ? `<div style="margin-top:4px;font-style:italic;color:#a0aec0;">"${escapeHtml(c.context)}"</div>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';
  resultDiv.innerHTML = html;
  // 데이터를 전역에 저장 (선택 시 사용)
  window._candidates = newOnes;
}

function toggleAllCandidates(checked) {
  document.querySelectorAll('.candidate-cb').forEach(cb => cb.checked = checked);
}

function addSelectedCandidates(projectId) {
  const checked = document.querySelectorAll('.candidate-cb:checked');
  let added = 0;
  checked.forEach(cb => {
    const idx = cb.dataset.idx;
    const ko = document.querySelector(`.candidate-item input[data-field="ko"][data-idx="${idx}"]`).value.trim();
    const en = document.querySelector(`.candidate-item input[data-field="en"][data-idx="${idx}"]`).value.trim();
    if (!ko || !en) return;
    const cand = window._candidates[idx];
    data.terms.push({
      id: uid(), ko, en,
      context: cand.context || '',
      projects: projectId ? [projectId] : [],
      createdAt: new Date().toISOString()
    });
    added++;
  });
  saveData();
  renderGlossary();
  document.getElementById('extract-result').innerHTML =
    `<div class="status-msg success">✓ ${added}개 용어를 용어집에 추가했어요!</div>`;
}

// ============================================================
// 데이터 내보내기 / 가져오기
// ============================================================
function exportData() {
  const exportObj = {
    version: 1,
    exportedAt: new Date().toISOString(),
    terms: data.terms,
    projects: data.projects
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glossary-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!imported.terms || !Array.isArray(imported.terms)) throw new Error('형식이 올바르지 않아요');
      const mode = confirm(
        `가져올 데이터:\n- 용어 ${imported.terms.length}개\n- 프로젝트 ${(imported.projects || []).length}개\n\n` +
        '확인 = 현재 데이터에 병합 추가\n취소 = 가져오기 취소'
      );
      if (!mode) return;
      // 중복 방지: ko+en 조합이 같으면 스킵
      const existing = new Set(data.terms.map(t => t.ko + '|' + t.en));
      let addedTerms = 0;
      for (const t of imported.terms) {
        if (!existing.has(t.ko + '|' + t.en)) {
          data.terms.push({ ...t, id: t.id || uid() });
          addedTerms++;
        }
      }
      const existingProjects = new Set(data.projects.map(p => p.name));
      let addedProjects = 0;
      for (const p of (imported.projects || [])) {
        if (!existingProjects.has(p.name)) {
          const proj = { ...p, id: p.id || uid() };
          if (!proj.color || !TAG_COLORS.includes(proj.color)) proj.color = nextColor();
          data.projects.push(proj);
          addedProjects++;
        }
      }
      saveData();
      renderGlossary();
      renderProjects();
      alert(`완료! 용어 ${addedTerms}개, 프로젝트 ${addedProjects}개 추가됨.`);
    } catch (err) {
      alert('가져오기 실패: ' + err.message);
    }
    e.target.value = ''; // 같은 파일 재선택 가능하도록
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (!confirm('모든 용어와 프로젝트가 삭제됩니다. 진행할까요?')) return;
  if (!confirm('정말요? 되돌릴 수 없습니다.')) return;
  data = { terms: [], projects: [], settings: data.settings };
  saveData();
  renderGlossary();
  renderProjects();
}

// ============================================================
// 초기화
// ============================================================
function init() {
  loadSettingsUI();
  const sortSel = document.getElementById('sort-select');
  if (sortSel) sortSel.value = (data.settings && data.settings.sort) || 'ko-asc';
  renderProjects();
  renderGlossary();
  refreshStats();
}

init();
