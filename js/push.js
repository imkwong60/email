/* Web Push — 以普通 <script> 載入，共用全域範圍 */
// ========== Push ==========
function updatePushUI() {
    const icon = document.getElementById('pushIcon');
    const dot = document.getElementById('pushDot');
    if (pushSubscribed) {
        icon.className = 'fa-solid fa-bell text-xs text-brand-600';
        dot.classList.add('hidden');
    } else {
        icon.className = 'fa-solid fa-bell-slash text-xs';
        dot.classList.remove('hidden');
    }
}

async function checkPushStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        pushSubscribed = false;
        localStorage.removeItem('pushSubscribed');
        updatePushUI();
        return;
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        pushSubscribed = !!sub && Notification.permission === 'granted';
        if (pushSubscribed) localStorage.setItem('pushSubscribed', '1');
        else localStorage.removeItem('pushSubscribed');
        updatePushUI();
    } catch (e) {
        console.warn('checkPushStatus', e);
    }
}

async function togglePush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        showToast('此裝置不支援推送通知', 'fa-triangle-exclamation text-amber-400');
        return;
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();

        // 只以瀏覽器實際 subscription 判斷是否已訂閱；不可使用舊 localStorage 決定取消/訂閱。
        if (existing) {
            const endpoint = existing.endpoint;
            try { await existing.unsubscribe(); } catch (e) { console.warn(e); }
            try {
                await apiFetch('action=unsubscribe', {
                    method: 'POST',
                    body: JSON.stringify({ endpoint })
                });
            } catch (e) { console.warn('backend unsubscribe', e); }
            pushSubscribed = false;
            localStorage.removeItem('pushSubscribed');
            updatePushUI();
            showToast('已關閉推送通知', 'fa-bell-slash text-zinc-400');
            return;
        }

        if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith('YOUR_')) {
            showToast('尚未設定 VAPID_PUBLIC_KEY，無法完成訂閱', 'fa-triangle-exclamation text-amber-400');
            return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            showToast('請允許通知權限', 'fa-triangle-exclamation text-amber-400');
            return;
        }
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        const result = await apiFetch('action=subscribe', {
            method: 'POST',
            body: JSON.stringify(sub.toJSON())
        });
        if (!result || result.success !== true) throw new Error(result?.error || '伺服器未確認訂閱');
        pushSubscribed = true;
        localStorage.setItem('pushSubscribed', '1');
        updatePushUI();
        showToast('推送通知已開啟！', 'fa-bell text-emerald-400');
    } catch (err) {
        console.error(err);
        showToast('推送操作失敗：' + (err.message || err), 'fa-triangle-exclamation text-amber-400');
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
