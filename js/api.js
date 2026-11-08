/* API（帶使用者 JWT） — 以普通 <script> 載入，共用全域範圍 */
// ========== API（帶使用者 JWT） ==========
async function apiFetch(qs, options = {}) {
    if (!session?.access_token) {
        const { data } = await supabaseClient.auth.getSession();
        session = data.session;
    }
    if (!session?.access_token) {
        showLogin();
        throw new Error('請先登入');
    }
    const url = `${EDGE_FUNCTION_URL}?${qs}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
            ...(options.headers || {})
        }
    });
    if (res.status === 401) {
        showLogin();
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '登入已過期，請重新登入');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
}
