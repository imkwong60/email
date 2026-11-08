/* UI 小工具 — 以普通 <script> 載入，共用全域範圍 */
// ========== UI Helpers ==========
function toggleSearch() {
    if (activeTab === 'compose') {
        showToast('寄信頁面無法搜尋郵件', 'fa-triangle-exclamation text-amber-400');
        return;
    }
    const c = document.getElementById('searchContainer');
    c.classList.toggle('hidden');
    if (!c.classList.contains('hidden')) document.getElementById('searchInput').focus();
    else clearSearch();
}
function handleSearch(v) {
    if (activeTab === 'compose') return;
    searchQuery = v.trim().toLowerCase();
    renderEmailList();
}
function clearSearch() {
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    if (activeTab !== 'compose') renderEmailList();
}
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    updateThemeIcon();
}
function updateThemeIcon() {
    document.getElementById('themeIcon').className = document.documentElement.classList.contains('dark') ? 'fa-solid fa-sun text-xs' : 'fa-solid fa-moon text-xs';
}
function showErrorBanner(title, msg) {
    document.getElementById('errorTitle').innerText = title;
    document.getElementById('errorMessage').innerText = msg;
    document.getElementById('errorBanner').classList.remove('hidden');
}
function dismissErrorBanner() { document.getElementById('errorBanner').classList.add('hidden'); }
function dismissIosBanner() {
    document.getElementById('iosInstallBanner').classList.add('hidden');
    localStorage.setItem('iosBannerDismissed', '1');
}
function setStatus(text, type='ok') {
    document.getElementById('statusLabel').innerText = text;
    const dot = document.getElementById('statusDot');
    dot.className = 'w-1.5 h-1.5 rounded-full ' + (type==='ok'?'bg-emerald-500':type==='loading'?'bg-brand-500 animate-pulse':'bg-amber-500');
}
function showToast(msg, iconCls='fa-circle-check text-emerald-400') {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    document.getElementById('toastIcon').className = 'fa-solid ' + iconCls;
    t.classList.remove('translate-y-20','opacity-0','pointer-events-none');
    setTimeout(() => t.classList.add('translate-y-20','opacity-0','pointer-events-none'), 2800);
}
function formatHKT(iso, full=false) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 86400 && !full) return d.toLocaleTimeString('zh-HK', { timeZone:'Asia/Hong_Kong', hour:'2-digit', minute:'2-digit' });
        if (diff < 172800 && !full) return '昨日';
        return d.toLocaleDateString('zh-HK', { timeZone:'Asia/Hong_Kong', month:'numeric', day:'numeric' }) + (full ? ' ' + d.toLocaleTimeString('zh-HK',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit'}) : '');
    } catch { return iso; }
}
function getAvatarColor(name) {
    const colors = ['bg-rose-500','bg-orange-500','bg-amber-500','bg-emerald-500','bg-cyan-500','bg-blue-500','bg-indigo-500','bg-purple-500','bg-pink-500'];
    let h = 0;
    for (let i=0; i<(name||'').length; i++) h = name.charCodeAt(i) + ((h<<5)-h);
    return colors[Math.abs(h)%colors.length];
}
function escapeHtml(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
