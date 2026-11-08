/* 登入／登出／Session — 以普通 <script> 載入，共用全域範圍 */
// ========== Auth ==========
function showLogin() {
    const el = document.getElementById('loginOverlay');
    el.classList.remove('hidden');
    el.classList.add('flex');
    el.style.pointerEvents = 'auto';
}
function hideLogin() {
    const el = document.getElementById('loginOverlay');
    el.classList.add('hidden');
    el.classList.remove('flex');
    el.style.pointerEvents = 'none';
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = '登入中...';
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        session = data.session;
        hideLogin();
        showToast('登入成功', 'fa-check text-emerald-400');
        await loadEmails();
    } catch (err) {
        errEl.textContent = err.message || '登入失敗';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = '登入';
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    session = null;
    emails = [];
    lastListAt = null; hasMore = false; serverCounts = null;
    recentDeleted.clear(); localDirty.clear(); bodyCache.clear();
    try { localStorage.removeItem('cachedEmails'); localStorage.removeItem('cachedMeta'); } catch (_) {}
    showLogin();
    showToast('已登出', 'fa-right-from-bracket text-zinc-400');
}

async function ensureSession() {
    const { data } = await supabaseClient.auth.getSession();
    session = data.session;
    if (!session) {
        showLogin();
        return false;
    }
    hideLogin();
    return true;
}
