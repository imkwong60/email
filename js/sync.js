/* 資料層：增量同步、守衛、快取、下拉更新 — 以普通 <script> 載入，共用全域範圍 */
// ========== 資料層：增量同步 ==========
function guardAlive(ts) { return Date.now() - ts < GUARD_MS; }
function markDeleted(id) { recentDeleted.set(id, Date.now()); }
function unmarkDeleted(id) { recentDeleted.delete(id); }
function markDirty(id, fields) {
    const cur = localDirty.get(id);
    const base = cur && guardAlive(cur.ts) ? cur.fields : {};
    localDirty.set(id, { fields: { ...base, ...fields }, ts: Date.now() });
}
function clearDirty(id) { localDirty.delete(id); }

// 伺服器回應落地前先過守衛：本地剛刪嘅唔加返、本地剛改嘅蓋住舊值
function applyGuard(row) {
    const d = recentDeleted.get(row.id);
    if (d !== undefined) {
        if (guardAlive(d)) return null;
        recentDeleted.delete(row.id);
    }
    const m = localDirty.get(row.id);
    if (m) {
        if (guardAlive(m.ts)) return { ...row, ...m.fields };
        localDirty.delete(row.id);
    }
    return row;
}

// 按 id 合併；就地修改既有物件，令 closure 內持有嘅參考唔會過時。回傳有冇真正變動
function upsertRows(rows) {
    const idx = new Map(emails.map((e, i) => [e.id, i]));
    let changed = false;
    rows.forEach(r => {
        const g = applyGuard(r);
        if (!g) return;
        if (idx.has(g.id)) {
            const cur = emails[idx.get(g.id)];
            if (Object.keys(g).some(k => cur[k] !== g[k])) { Object.assign(cur, g); changed = true; }
        } else {
            idx.set(g.id, emails.push(g) - 1);
            changed = true;
        }
    });
    return changed;
}

function oldestReceivedAt() {
    let best = null, bestT = Infinity;
    for (const e of emails) {
        if (!e.received_at) continue;
        const t = Date.parse(e.received_at);
        if (t < bestT) { bestT = t; best = e.received_at; }
    }
    return best;
}

// 伺服器已唔存在（Gmail 刪除／自動清理）嘅信，喺本地一併移除
function pruneMissing(ids, oldest) {
    const set = new Set(ids);
    const t = Date.parse(oldest);
    emails = emails.filter(e => set.has(e.id) || !e.received_at || Date.parse(e.received_at) < t);
}

function setCounts(c) { if (c) serverCounts = { ...c }; }
function bumpCount(cat, delta) {
    if (serverCounts && cat in serverCounts) serverCounts[cat] = Math.max(0, (serverCounts[cat] || 0) + delta);
}

// localStorage 快取（debounce，唔再每次 render 都寫成個陣列）
let cacheTimer = null;
function saveCache() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
        try {
            localStorage.setItem('cachedEmails', JSON.stringify(emails));
            localStorage.setItem('cachedMeta', JSON.stringify({
                listAt: lastListAt, hasMore, counts: serverCounts, uid: session?.user?.id || null
            }));
        } catch (_) { /* quota 滿：忽略 */ }
    }, 400);
}
function loadCache() {
    try {
        const raw = localStorage.getItem('cachedEmails');
        if (!raw) return false;
        const rows = JSON.parse(raw);
        if (!Array.isArray(rows) || !rows.length) return false;
        const meta = JSON.parse(localStorage.getItem('cachedMeta') || 'null');
        const uid = session?.user?.id || null;
        if (meta && meta.uid && uid && meta.uid !== uid) return false; // 唔同帳號
        emails = rows.map(({ body, ...rest }) => rest);               // 舊快取可能帶 body，丟棄
        lastListAt = meta?.listAt || null;                            // 無 meta（舊版快取）→ 首次全量
        hasMore = !!meta?.hasMore;
        serverCounts = meta?.counts || null;
        return true;
    } catch (_) { return false; }
}

// 串行化：同一時間只跑一個 list；有新請求就排喺前一個之後（唔會食到過時嘅回應）
function loadEmails(silent = false, forceFull = false) {
    const run = () => _loadEmails(silent, forceFull);
    const p = listInFlight ? listInFlight.then(run, run) : run();
    listInFlight = p;
    p.finally(() => { if (listInFlight === p) listInFlight = null; });
    return p;
}

async function _loadEmails(silent, forceFull) {
    if (!silent && activeTab !== 'compose') setStatus('載入中...', 'loading');
    try {
        const oldest = oldestReceivedAt();
        const incremental = !forceFull && !!lastListAt && emails.length > 0;
        let qs = 'action=list&category=all';
        if (incremental) {
            qs += `&since=${encodeURIComponent(lastListAt)}`;
            if (oldest) qs += `&oldest=${encodeURIComponent(oldest)}`;
        }
        const data = await apiFetch(qs);
        if (incremental && data.truncated) {          // 變動太多 → 退回全量
            lastListAt = null;
            return _loadEmails(silent, true);
        }
        const rows = data.emails || [];
        let changed = !incremental;
        if (incremental) {
            if (upsertRows(rows)) changed = true;
            if (Array.isArray(data.ids) && oldest) {
                const before = emails.length;
                pruneMissing(data.ids, oldest);
                if (emails.length !== before) changed = true;
            }
        } else {
            emails = [];
            upsertRows(rows);
            hasMore = !!data.has_more;
        }
        const t = Date.parse(data.server_time);
        lastListAt = new Date((isNaN(t) ? Date.now() : t) - 5000).toISOString();
        const prevCounts = JSON.stringify(serverCounts);
        setCounts(data.counts);
        if (JSON.stringify(serverCounts) !== prevCounts) changed = true;
        if (changed || !silent) renderApp();
        else saveCache();                              // 冇變動：只更新 lastListAt
        setStatus('已同步', 'ok');
        dismissErrorBanner();
    } catch (err) {
        console.error(err);
        if (!emails.length && loadCache()) renderApp();
        setStatus(emails.length ? '離線快取' : '連線失敗', 'warn');
        showErrorBanner('連線失敗', err.message || '無法取得郵件');
    }
}

// 載入更早嘅郵件（突破首次 400 封上限）
async function loadMoreEmails() {
    if (loadingMore || !hasMore) return;
    const oldest = oldestReceivedAt();
    if (!oldest) return;
    loadingMore = true;
    renderEmailList();
    try {
        const data = await apiFetch(`action=list&category=all&limit=200&before=${encodeURIComponent(oldest)}`);
        upsertRows(data.emails || []);
        hasMore = !!data.has_more;
        setCounts(data.counts);
    } catch (err) {
        showToast('載入失敗：' + err.message, 'fa-triangle-exclamation text-amber-400');
    } finally {
        loadingMore = false;
        renderApp();
    }
}

// 開信時先拎 body（列表唔再帶 body）
async function fetchBody(id) {
    try {
        const r = await apiFetch(`action=get&id=${encodeURIComponent(id)}`);
        if (typeof r.body !== 'string') return;
        bodyCache.set(id, r.body);
        if (bodyCache.size > 50) bodyCache.delete(bodyCache.keys().next().value);
        if (currentModalEmailId === id && r.body) document.getElementById('modalBodyText').innerText = r.body;
    } catch (_) { /* 失敗就保持顯示 snippet */ }
}

let pullStartY = 0;
let pullTracking = false;
let pullTriggered = false;
function initPullToRefresh() {
    const container = document.getElementById('emailListContainer');
    if (!container || container.dataset.pullBound) return;
    container.dataset.pullBound = '1';
    container.addEventListener('touchstart', (e) => {
        if (activeTab === 'compose' || container.scrollTop > 0 || isSyncing) return;
        pullStartY = e.touches[0].clientY;
        pullTracking = true;
        pullTriggered = false;
    }, {passive:true});
    container.addEventListener('touchmove', (e) => {
        if (!pullTracking || isSyncing) return;
        const dy = e.touches[0].clientY - pullStartY;
        if (dy <= 0) return;
        if (dy > 10 && e.cancelable) e.preventDefault();
        if (dy > 70 && !pullTriggered) {
            pullTriggered = true;
            triggerSync(true);
        }
    }, {passive:false});
    container.addEventListener('touchend', () => { pullTracking = false; pullTriggered = false; }, {passive:true});
    container.addEventListener('touchcancel', () => { pullTracking = false; pullTriggered = false; }, {passive:true});
}

async function triggerSync(fromPull = false) {
    if (isSyncing) return;
    isSyncing = true;
    document.getElementById('syncIcon').classList.add('fa-spin');
    setStatus('同步中...', 'loading');
    try {
        const result = await apiFetch('action=sync', { method: 'POST' });
        showToast(result.message || `同步完成，新增 ${result.added || 0} 封`, 'fa-check text-emerald-400');
        await loadEmails(true);
    } catch (err) {
        showErrorBanner('同步失敗', err.message);
        showToast('同步失敗', 'fa-triangle-exclamation text-amber-400');
    } finally {
        isSyncing = false;
        document.getElementById('syncIcon').classList.remove('fa-spin');
    }
}
