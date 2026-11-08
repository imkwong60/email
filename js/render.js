/* 列表渲染（pills / email list） — 以普通 <script> 載入，共用全域範圍 */
// ========== Render ==========
function renderApp() {
    if (activeTab === 'compose') {
        renderCompose();
        return;
    }
    document.getElementById('bulkBar').classList.remove('hidden');
    document.getElementById('markAllBtn').classList.remove('hidden');
    renderPills();
    renderEmailList();
    saveCache();
}

function renderPills() {
    // badges：優先保留 loadEmails 寫入的 server counts；否則用全量 emails 依 category 計算
    ['important','transaction','promotion','trash','compose'].forEach(key => {
        const btn = document.getElementById(`pill-${key}`);
        if (!btn) return;
        if (key === 'compose') {
            btn.className = `pill-btn flex items-center space-x-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${activeTab === 'compose' ? categoryMeta.compose.pillActive : categoryMeta.compose.pillInactive}`;
            return;
        }
        const badge = document.getElementById(`badge-${key}`);
        if (badge) badge.innerText = serverCounts ? (serverCounts[key] || 0) : emails.filter(e => e.category === key).length;
        btn.className = `pill-btn flex items-center space-x-1 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${activeTab === key ? categoryMeta[key].pillActive : categoryMeta[key].pillInactive}`;
    });
}

function renderEmailList() {
    const container = document.getElementById('emailListContainer');
    let filtered = emails.filter(e => e.category === activeTab);
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(e =>
            (e.sender||'').toLowerCase().includes(q) ||
            (e.subject||'').toLowerCase().includes(q) ||
            (e.snippet||'').toLowerCase().includes(q)
        );
    }
    document.getElementById('listStatus').innerText = (filtered.length ? `${filtered.length} 封郵件` : '無郵件') + (hasMore ? '（尚有更早郵件未載入）' : '');
    filtered.sort((a,b) => new Date(b.received_at||0) - new Date(a.received_at||0));

    if (!filtered.length) {
        container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div class="w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3 text-2xl"><i class="fa-solid fa-inbox"></i></div>
            <h3 class="font-bold text-sm text-zinc-700 dark:text-zinc-300">這裡空空如也</h3>
            <p class="text-xs text-zinc-400 mt-1">目前沒有符合條件的${categoryMeta[activeTab]?.label||''}</p>
        </div>${loadMoreHtml()}`;
        return;
    }

    container.innerHTML = filtered.map(email => {
        const unread = !email.is_read ? `<span class="px-1.5 py-0.5 rounded-md bg-brand-600 text-white text-[9px] font-bold leading-none">未讀</span>` : `<span class="text-[9px] text-zinc-400">已讀</span>`;
        const attach = email.has_attachment ? `<i class="fa-solid fa-paperclip text-zinc-400 text-[10px] ml-1"></i>` : '';
        const timeStr = formatHKT(email.received_at);
        const avatarBg = (email.avatar_bg && /^bg-[a-z]+-\d{2,3}$/.test(email.avatar_bg))
            ? email.avatar_bg
            : getAvatarColor(email.sender || '?');
        return `<div class="swipe-row relative overflow-hidden rounded-2xl" data-id="${email.id}">
            <div class="swipe-actions absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-rose-600 text-white text-xs font-semibold z-0">刪除</div>
            <div onclick="openEmail('${email.id}')" class="swipe-content relative z-10 group ${email.is_read ? 'bg-white dark:bg-zinc-800/70 border-zinc-200/60 dark:border-zinc-800' : 'bg-brand-50/70 dark:bg-brand-950/20 border-brand-300/70 dark:border-brand-800/70'} border hover:border-brand-500/40 p-3.5 rounded-2xl shadow-sm hover:shadow-md transition-transform duration-200 cursor-pointer ${email.is_read ? '' : 'border-l-4'}">
            <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center space-x-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-xl ${avatarBg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0">${(email.sender||'?').charAt(0)}</div>
                    <div class="min-w-0">
                        <h4 class="text-xs ${email.is_read ? 'font-semibold text-zinc-700 dark:text-zinc-200' : 'font-extrabold text-zinc-950 dark:text-white'} truncate flex items-center">${escapeHtml(email.sender||'未知')}${attach}</h4>
                        <span class="text-[10px] text-zinc-400 truncate block">${escapeHtml(email.sender_email||'')}</span>
                    </div>
                </div>
                <div class="flex items-center space-x-1.5 flex-shrink-0">
                    <span class="text-[10px] text-zinc-400 font-medium">${timeStr}</span>${unread}
                </div>
            </div>
            <h3 class="text-xs ${email.is_read ? 'font-medium text-zinc-700 dark:text-zinc-300' : 'font-extrabold text-zinc-950 dark:text-white'} line-clamp-1 group-hover:text-brand-600 transition">${escapeHtml(email.subject||'(無主旨)')}</h3>
            <p class="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">${escapeHtml(email.snippet||'')}</p>
            <div class="flex justify-end mt-2 pt-1.5 border-t border-zinc-100 dark:border-zinc-700/40 opacity-0 group-hover:opacity-100 transition-opacity gap-3">
                ${email.category === 'trash'
                    ? `<button onclick="event.stopPropagation(); restoreEmail('${email.id}')" class="text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1"><i class="fa-solid fa-rotate-left"></i> 還原</button>`
                    : (email.is_read ? `<button onclick="event.stopPropagation(); deleteEmail('${email.id}')" class="text-[10px] text-rose-500 hover:text-rose-600 flex items-center gap-1"><i class="fa-solid fa-trash-can"></i> 刪除 (Gmail)</button>` : '')
                }
            </div>
        </div>
        </div>`;
    }).join('') + loadMoreHtml();
    bindSwipeHandlers();   // 每次換完 innerHTML 都要重新綁定
}

function loadMoreHtml() {
    if (!hasMore) return '';
    return `<div class="flex justify-center py-4"><button onclick="loadMoreEmails()" ${loadingMore ? 'disabled' : ''} class="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-60">${loadingMore ? '載入中...' : '載入更早郵件'}</button></div>`;
}
