/* 初始化（最後載入） — 以普通 <script> 載入，共用全域範圍 */
// ========== Init ==========
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('emailModal');
        if (modal && !modal.classList.contains('hidden')) closeModal();
        const confirm = document.getElementById('confirmModal');
        if (confirm && !confirm.classList.contains('hidden')) closeConfirmModal();
    }
});

window.onload = async function () {
    if (localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
    updateThemeIcon();
    updatePushUI();

    if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('./sw.js'); await checkPushStatus(); } catch (e) { console.warn(e); }
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isIos && !isStandalone && !localStorage.getItem('iosBannerDismissed')) {
        setTimeout(() => document.getElementById('iosInstallBanner').classList.remove('hidden'), 1800);
    }

    supabaseClient.auth.onAuthStateChange((_event, s) => {
        session = s;
        if (!s) showLogin();
    });

    const ok = await ensureSession();
    if (ok) {
        const hadCache = loadCache();
        if (hadCache) renderApp();
        await loadEmails(hadCache);
        initPullToRefresh();
        setInterval(() => {
            if (!document.hidden && activeTab !== 'compose' && session) loadEmails(true);
            if (!document.hidden && session) checkPushStatus();
        }, 60000);
    }
};
