// ─── State ────────────────────────────────────────────────────────────────────

let logsInitialised = false;

// ─── Tab Navigation ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document
      .querySelectorAll('.tab')
      .forEach((t) => t.classList.remove('active'));
    document
      .querySelectorAll('.panel')
      .forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'logs' && !logsInitialised) {
      initLogs();
    }
  });
});

// ─── DNS Lookup ───────────────────────────────────────────────────────────────

const dnsForm = document.getElementById('dnsForm');
const dnsTypeSelect = document.getElementById('dnsType');
const dnsResultSection = document.getElementById('dnsResult');
const dnsSummary = document.getElementById('dnsSummary');
const dnsAnswersBody = document.querySelector('#dnsAnswers tbody');
const dnsSubmitBtn = document.getElementById('dnsSubmit');

(async function loadDnsMeta() {
  try {
    const res = await fetch('/api/dns/meta');
    const data = await res.json();
    if (data.success && data.recordTypes) {
      data.recordTypes.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        dnsTypeSelect.appendChild(opt);
      });
    }
  } catch {
    ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      dnsTypeSelect.appendChild(opt);
    });
  }
})();

dnsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const domain = document.getElementById('dnsDomain').value.trim();
  if (!domain) {
    return;
  }

  dnsSubmitBtn.disabled = true;
  dnsSubmitBtn.innerHTML = '<span class="spinner"></span>Looking up...';
  dnsResultSection.classList.add('hidden');

  try {
    const res = await fetch('/api/dns/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        type: dnsTypeSelect.value || 'A',
        bypassCache: document.getElementById('dnsBypass').checked,
      }),
    });
    const data = await res.json();

    if (!data.success) {
      dnsSummary.innerHTML = `<strong style="color:var(--red)">Error:</strong> ${esc(data.error || data.details || 'Unknown error')}`;
      dnsAnswersBody.innerHTML = '';
      dnsResultSection.classList.remove('hidden');
      return;
    }

    dnsSummary.innerHTML = [
      `<span><strong>Domain:</strong> ${esc(data.domain)}</span>`,
      `<span><strong>Type:</strong> ${esc(data.type)}</span>`,
      `<span><strong>RCODE:</strong> ${esc(data.rcode)}</span>`,
      `<span><strong>Provider:</strong> ${esc(data.provider || 'N/A')}</span>`,
      `<span><strong>Time:</strong> ${data.responseTimeMs}ms</span>`,
      data.cached ? '<span><strong>Cached</strong></span>' : '',
    ].join('');

    const rows = [...(data.answers || []), ...(data.authority || [])];
    if (rows.length === 0) {
      dnsAnswersBody.innerHTML =
        '<tr><td colspan="4" class="empty-state">No records returned</td></tr>';
    } else {
      dnsAnswersBody.innerHTML = rows
        .map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td>${r.ttl}</td><td>${esc(formatDnsData(r.data))}</td></tr>`
        )
        .join('');
    }
    dnsResultSection.classList.remove('hidden');
  } catch (err) {
    dnsSummary.innerHTML = `<strong style="color:var(--red)">Network error:</strong> ${esc(err.message)}`;
    dnsAnswersBody.innerHTML = '';
    dnsResultSection.classList.remove('hidden');
  } finally {
    dnsSubmitBtn.disabled = false;
    dnsSubmitBtn.textContent = 'Lookup';
  }
});

function formatDnsData(data) {
  if (data === null || data === undefined) {
    return '';
  }
  if (typeof data === 'string') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(formatDnsData).join(', ');
  }
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return String(data);
}

// ─── Log Monitor ──────────────────────────────────────────────────────────────

const logLevelSelect = document.getElementById('logLevel');
const logCategorySelect = document.getElementById('logCategory');
const logSearchInput = document.getElementById('logSearch');
const logTableBody = document.querySelector('#logTable tbody');
const logPageInfo = document.getElementById('logPageInfo');
const logPrevBtn = document.getElementById('logPrev');
const logNextBtn = document.getElementById('logNext');
const logRefreshBtn = document.getElementById('logRefresh');
const logAutoCheck = document.getElementById('logAutoRefresh');
const logStatsBar = document.getElementById('logStats');

let logPage = 1;
let logTotalPages = 1;
let autoRefreshTimer = null;

async function initLogs() {
  logsInitialised = true;
  await loadLogMeta();
  await Promise.all([fetchLogs(), fetchLogStats()]);
  startAutoRefresh();
}

async function loadLogMeta() {
  try {
    const res = await fetch('/api/logs/meta');
    const data = await res.json();
    if (data.success) {
      (data.levels || []).forEach((l) => {
        const opt = document.createElement('option');
        opt.value = l;
        opt.textContent = l;
        logLevelSelect.appendChild(opt);
      });
      (data.categories || []).forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        logCategorySelect.appendChild(opt);
      });
    }
  } catch {
    /* meta load failed — filters stay empty */
  }
}

async function fetchLogs() {
  const params = new URLSearchParams();
  params.set('page', logPage);
  params.set('limit', '40');
  params.set('sortOrder', 'desc');

  const level = logLevelSelect.value;
  const category = logCategorySelect.value;
  const search = logSearchInput.value.trim();
  if (level) {
    params.set('level', level);
  }
  if (category) {
    params.set('category', category);
  }
  if (search) {
    params.set('search', search);
  }

  try {
    const res = await fetch(`/api/logs?${params}`);
    const data = await res.json();

    if (!data.success) {
      logTableBody.innerHTML = `<tr><td colspan="4" class="empty-state">Failed to load logs</td></tr>`;
      return;
    }

    const logs = data.logs || [];
    logTotalPages = data.pagination?.totalPages || 1;

    logPageInfo.textContent = `${data.pagination?.page || 1} / ${logTotalPages}`;
    logPrevBtn.disabled = logPage <= 1;
    logNextBtn.disabled = logPage >= logTotalPages;

    if (logs.length === 0) {
      logTableBody.innerHTML =
        '<tr><td colspan="4" class="empty-state">No logs found</td></tr>';
      return;
    }

    logTableBody.innerHTML = logs
      .map((log) => {
        const hasMeta =
          log.meta !== null && log.meta !== undefined && log.meta !== '';
        const metaRow = hasMeta
          ? `<tr class="meta-row hidden"><td colspan="4"><pre class="log-meta">${esc(formatMeta(log.meta))}</pre></td></tr>`
          : '';
        const mainRow = `<tr class="${hasMeta ? 'has-meta' : ''}">
            <td class="col-time">${formatTime(log.createdAt)}</td>
            <td><span class="badge ${esc(log.level)}">${esc(log.level)}</span></td>
            <td>${esc(log.category)}</td>
            <td>${esc(log.message)}${hasMeta ? ' <span class="meta-hint">meta</span>' : ''}</td>
          </tr>`;
        return mainRow + metaRow;
      })
      .join('');

    logTableBody.querySelectorAll('tr.has-meta').forEach((row) => {
      row.addEventListener('click', () => {
        const metaRow = row.nextElementSibling;
        if (metaRow) {
          metaRow.classList.toggle('hidden');
        }
      });
    });
  } catch {
    logTableBody.innerHTML =
      '<tr><td colspan="4" class="empty-state">Network error</td></tr>';
  }
}

async function fetchLogStats() {
  try {
    const res = await fetch('/api/logs/stats');
    const data = await res.json();
    if (!data.success) {
      return;
    }

    const s = data.stats;
    logStatsBar.innerHTML = [
      statCard(s.total, 'Total'),
      statCard(s.last24h, 'Last 24h'),
      statCard(s.byLevel?.ERROR || 0, 'Errors', 'var(--red)'),
      statCard(s.byLevel?.WARN || 0, 'Warnings', 'var(--orange)'),
    ].join('');
  } catch {
    /* stats failed — bar stays empty */
  }
}

function statCard(value, label, color) {
  const style = color ? ` style="color:${color}"` : '';
  return `<div class="stat-card"><div class="stat-value"${style}>${value}</div><div class="stat-label">${label}</div></div>`;
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (logAutoCheck.checked) {
    autoRefreshTimer = setInterval(() => {
      fetchLogs();
      fetchLogStats();
    }, 5000);
  }
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

logAutoCheck.addEventListener('change', () => {
  if (logAutoCheck.checked) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

logRefreshBtn.addEventListener('click', () => {
  fetchLogs();
  fetchLogStats();
});

logPrevBtn.addEventListener('click', () => {
  if (logPage > 1) {
    logPage--;
    fetchLogs();
  }
});

logNextBtn.addEventListener('click', () => {
  if (logPage < logTotalPages) {
    logPage++;
    fetchLogs();
  }
});

let searchDebounce = null;
logSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    logPage = 1;
    fetchLogs();
  }, 300);
});

logLevelSelect.addEventListener('change', () => {
  logPage = 1;
  fetchLogs();
});

logCategorySelect.addEventListener('change', () => {
  logPage = 1;
  fetchLogs();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (str === null || str === undefined) {
    return '';
  }
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function formatMeta(raw) {
  if (!raw) {
    return '';
  }
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(raw);
  }
}

function formatTime(iso) {
  if (!iso) {
    return '-';
  }
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
