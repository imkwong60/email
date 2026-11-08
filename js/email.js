/* 開信 Modal、刪除、還原、清空、全部已讀 — 以普通 <script> 載入，共用全域範圍 */
function switchTab(tab) {
    activeTab = tab;
    // 資料契約：emails 永遠是全量，切 tab 只做本地過濾/渲染
    if (tab === 'compose') {
        const sc = document.getElementById('searchContainer');
        if (sc) sc.classList.add('hidden');
        searchQuery = '';
        const si = document.getElementById('searchInput');
        if (si) si.value = '';
        renderCompose();
    } else {
        renderApp();
    }
}

function openEmail(id) {
    const email = emails.find(e => e.id === id);
    if (!email) return;
    currentModalEmailId = id;
    if (!email.is_read) {
        email.is_read = true;
        markDirty(id, { is_read: true });
        renderApp();
        const readId = id;
        apiFetch(`action=read&id=${encodeURIComponent(readId)}`, { method: 'PATCH' })
            .catch(() => {
                clearDirty(readId);
                const fresh = emails.find(x => x.id === readId);
                if (fresh) fresh.is_read = false;
                renderApp();
                showToast('標已讀失敗', 'fa-triangle-exclamation text-amber-400');
            });
    }
    const safeBg = (email.avatar_bg && /^bg-[a-z]+-\d{2,3}$/.test(email.avatar_bg))
        ? email.avatar_bg
        : getAvatarColor(email.sender);
    document.getElementById('modalAvatar').className = `w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md ${safeBg}`;
    document.getElementById('modalAvatar').innerText = (email.sender || '?').charAt(0);
    document.getElementById('modalSender').innerText = email.sender || '未知';
    document.getElementById('modalEmail').innerText = email.sender_email || '';
    document.getElementById('modalDate').innerText = formatHKT(email.received_at, true);
    document.getElementById('modalSubject').innerText = email.subject || '(無主旨)';
    const cachedBody = bodyCache.get(id) ?? email.body;
    document.getElementById('modalBodyText').innerText = cachedBody || email.snippet || '(無內容預覽)';
    if (cachedBody === undefined) fetchBody(id);
    document.getElementById('modalAttachment').classList.toggle('hidden', !email.has_attachment);

    const catTag = document.getElementById('modalCategoryTag');
    catTag.innerText = categoryMeta[email.category]?.label || email.category;
    catTag.className = `px-2 py-0.5 rounded-full font-medium text-[10px] ${categoryMeta[email.category]?.color || 'bg-zinc-500 text-white'}`;

    const actionBtn = document.getElementById('modalActionBtn');
    if (email.category === 'trash') {
        actionBtn.innerHTML = `<i class="fa-solid fa-rotate-left"></i> <span>還原</span>`;
        actionBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 transition flex items-center gap-1.5';
        actionBtn.onclick = () => { restoreEmail(id); closeModal(); };
    } else {
        actionBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i> <span>刪除 (Gmail)</span>`;
        actionBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 hover:bg-rose-200 transition flex items-center gap-1.5';
        actionBtn.onclick = () => { deleteEmail(id); closeModal(); };
    }

    document.getElementById('modalGmailLink').href = `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(id)}`;

    const modal = document.getElementById('emailModal');
    const content = document.getElementById('modalContent');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.classList.remove('pointer-events-none');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('translate-y-full');
    });
}

function closeModal() {
    const modal = document.getElementById('emailModal');
    const content = document.getElementById('modalContent');
    modal.classList.add('opacity-0');
    content.classList.add('translate-y-full');
    document.body.style.overflow = '';
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.classList.add('pointer-events-none');
        currentModalEmailId = null;
    }, 300);
}

async function deleteEmail(id) {
    const e = emails.find(x => x.id === id);
    if (!e) return;
    const snapshot = { ...e };
    // 樂觀：先從列表移除，並登記「剛刪」避免 60 秒輪詢嘅舊回應令佢彈返出嚟
    markDeleted(id);
    emails = emails.filter(x => x.id !== id);
    bumpCount(snapshot.category, -1);
    renderApp();
    try {
        await apiFetch(`action=delete&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('已移入 Gmail 垃圾桶，並從本 App 移除', 'fa-trash-can text-rose-400');
        saveCache();
    } catch (err) {
        // Gmail 失敗 → 放返列表
        unmarkDeleted(id);
        if (!emails.find(x => x.id === id)) emails.push(snapshot);
        bumpCount(snapshot.category, +1);
        renderApp();
        showErrorBanner('Gmail 刪除失敗', err.message || '郵件仍在 Gmail 收件箱');
        showToast('刪除失敗：' + err.message, 'fa-triangle-exclamation text-amber-400');
    }
}

async function restoreEmail(id) {
    const e = emails.find(x => x.id === id);
    if (!e) return;
    const fromCat = e.category;
    const target = e.prev_category || 'important';
    const wasTrashed = e.is_trashed;
    e.category = target;
    e.is_trashed = false;
    markDirty(id, { category: target, is_trashed: false });
    bumpCount(fromCat, -1); bumpCount(target, +1);
    renderApp();
    const revert = () => {
        clearDirty(id);
        const cur = emails.find(x => x.id === id);
        if (cur) { cur.category = fromCat; cur.is_trashed = wasTrashed; }
        bumpCount(target, -1); bumpCount(fromCat, +1);
        renderApp();
    };
    try {
        const res = await apiFetch(`action=restore&id=${encodeURIComponent(id)}`, { method: 'PATCH' });
        // Gmail 已永久刪除：後端回 success:false + purged
        if (res && res.purged) {
            clearDirty(id);
            markDeleted(id);
            emails = emails.filter(x => x.id !== id);
            bumpCount(target, -1);
            renderApp();
            showToast(res.error || 'Gmail 已無此信，已從本機移除', 'fa-triangle-exclamation text-amber-400');
            return;
        }
        if (res && res.success === false) {
            revert();
            showToast(res.error || '還原失敗', 'fa-triangle-exclamation text-amber-400');
            return;
        }
        if (res && res.category && res.category !== target) {
            const cur = emails.find(x => x.id === id);
            if (cur) cur.category = res.category;
            markDirty(id, { category: res.category, is_trashed: false });
            bumpCount(target, -1); bumpCount(res.category, +1);
        }
        renderApp();
        if (res && res.gmail_untrashed === false) {
            showToast('本機已還原，但 Gmail 同步失敗', 'fa-triangle-exclamation text-amber-400');
        } else {
            showToast('已還原', 'fa-rotate-left text-emerald-400');
        }
    } catch (err) {
        revert();
        showToast('還原失敗：' + err.message, 'fa-triangle-exclamation text-amber-400');
    }
}

function confirmClearCategory() {
    const m = document.getElementById('confirmModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    m.classList.remove('pointer-events-none');
    requestAnimationFrame(() => {
        m.classList.remove('opacity-0');
        document.querySelector('#confirmModal > div').classList.remove('scale-95');
    });
}
function closeConfirmModal() {
    const m = document.getElementById('confirmModal');
    m.classList.add('opacity-0');
    document.querySelector('#confirmModal > div').classList.add('scale-95');
    setTimeout(() => {
        m.classList.add('hidden');
        m.classList.remove('flex');
        m.classList.add('pointer-events-none');
    }, 200);
}
async function clearCategory() {
    closeConfirmModal();
    if (activeTab === 'compose' || activeTab === 'trash') {
        showToast('此分頁不支援清空', 'fa-triangle-exclamation text-amber-400');
        return;
    }
    const cat = activeTab;
    const removed = emails.filter(e => e.category === cat).map(e => ({ ...e }));
    const prevCount = serverCounts ? serverCounts[cat] : undefined;
    removed.forEach(e => markDeleted(e.id));
    emails = emails.filter(e => e.category !== cat);
    if (serverCounts) serverCounts[cat] = 0;
    renderApp();
    try {
        const r = await apiFetch(`action=clear&category=${encodeURIComponent(cat)}`, { method: 'DELETE' });
        removed.forEach(e => unmarkDeleted(e.id));
        // 以伺服器實際成功的為準全量重載，避免樂觀更新與 Gmail 落差
        await loadEmails(true, true);
        const msg = r.note || `已清空並刪除 ${r.count || 0} 封`;
        showToast(msg, r.skipped > 0 ? 'fa-triangle-exclamation text-amber-400' : 'fa-check text-emerald-400');
    } catch (err) {
        removed.forEach(e => unmarkDeleted(e.id));
        removed.forEach(e => { if (!emails.find(x => x.id === e.id)) emails.push(e); });
        if (serverCounts && prevCount !== undefined) serverCounts[cat] = prevCount;
        renderApp();
        showToast('清空失敗：' + err.message, 'fa-triangle-exclamation text-amber-400');
    }
}

async function markAllAsRead() {
    const targets = emails.filter(e => e.category === activeTab && !e.is_read);
    const ids = targets.map(e => e.id);
    targets.forEach(e => { e.is_read = true; markDirty(e.id, { is_read: true }); });
    renderApp();
    try {
        const result = await apiFetch(`action=readAll&category=${encodeURIComponent(activeTab)}`, { method: 'PATCH' });
        ids.forEach(clearDirty);
        // 伺服器一次只處理一批：仲有剩 → 全量重載，確保顯示同伺服器一致
        await loadEmails(true, !!result.remaining);
        showToast(result.remaining ? `已處理，仍有 ${result.remaining} 封未讀` : '已全部標為已讀', 'fa-envelope-open text-brand-400');
    } catch (err) {
        ids.forEach(id => {
            clearDirty(id);
            const e = emails.find(x => x.id === id);
            if (e) e.is_read = false;
        });
        renderApp();
        showToast('操作失敗', 'fa-triangle-exclamation text-amber-400');
    }
}
