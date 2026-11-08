/* 寄信頁面 — 以普通 <script> 載入，共用全域範圍 */
// ========== Compose Page ==========
function renderCompose() {
    document.getElementById('bulkBar').classList.add('hidden');
    document.getElementById('markAllBtn').classList.add('hidden');
    renderPills();
    document.getElementById('emailListContainer').innerHTML = `
        <div class="space-y-4 p-1">
            <div class="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800/40 rounded-2xl p-3.5 flex items-start gap-3">
                <div class="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center text-white flex-shrink-0"><i class="fa-solid fa-paper-plane text-sm"></i></div>
                <div><p class="text-xs font-bold text-brand-800 dark:text-brand-200">直接從電郵本本寄出 Gmail</p><p class="text-[11px] text-brand-700/80 dark:text-brand-300/70 mt-0.5">可附相片或一般檔案；單一附件最多 20 MB，總附件最多 22 MB。</p></div>
            </div>
            <div><label class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">收件人</label><input id="composeTo" type="email" placeholder="example@gmail.com" class="w-full px-3.5 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-500 rounded-xl text-sm focus:outline-none transition"></div>
            <div><label class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">主旨</label><input id="composeSubject" type="text" placeholder="郵件主旨" class="w-full px-3.5 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-500 rounded-xl text-sm focus:outline-none transition"></div>
            <div><label class="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">內容</label><textarea id="composeBody" rows="8" placeholder="在此輸入郵件內容..." class="w-full px-3.5 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-brand-500 rounded-xl text-sm focus:outline-none transition resize-none"></textarea></div>
            <div class="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/60 p-3">
                <div class="flex items-center justify-between gap-2 mb-2"><span class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"><i class="fa-solid fa-paperclip mr-1"></i>附件</span><span id="attachmentSize" class="text-[10px] text-zinc-400">未選擇</span></div>
                <input id="composeAttachments" type="file" multiple class="hidden" onchange="renderAttachmentList()" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv,.7z,.rar">
                <button type="button" onclick="document.getElementById('composeAttachments').click()" class="w-full py-2.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:border-brand-500 hover:text-brand-600 transition"><i class="fa-solid fa-plus mr-1"></i>加入相片 / 檔案</button>
                <div id="attachmentList" class="mt-2 space-y-1"></div>
            </div>
            <button onclick="sendMail()" id="sendBtn" class="w-full py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-brand-500/25"><i class="fa-solid fa-paper-plane"></i> 立即寄出</button>
        </div>`;
}

function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderAttachmentList() {
    const input = document.getElementById('composeAttachments');
    const list = document.getElementById('attachmentList');
    const sizeEl = document.getElementById('attachmentSize');
    if (!input || !list || !sizeEl) return;
    const files = Array.from(input.files || []);
    const total = files.reduce((n, f) => n + f.size, 0);
    sizeEl.textContent = files.length ? `${files.length} 個 · ${formatBytes(total)}` : '未選擇';
    list.innerHTML = files.map((f, i) => `<div class="flex items-center gap-2 rounded-xl bg-white dark:bg-zinc-800 px-2.5 py-2 border border-zinc-100 dark:border-zinc-700"><i class="fa-solid ${f.type.startsWith('image/') ? 'fa-image' : 'fa-file'} text-brand-500 text-xs"></i><span class="text-[10px] text-zinc-700 dark:text-zinc-200 truncate flex-1">${escapeHtml(f.name)}</span><span class="text-[9px] text-zinc-400">${formatBytes(f.size)}</span></div>`).join('');
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error || new Error('讀取附件失敗'));
        reader.readAsDataURL(file);
    });
}

async function sendMail() {
    const to = document.getElementById('composeTo').value.trim();
    const subject = document.getElementById('composeSubject').value.trim();
    const text = document.getElementById('composeBody').value;
    const input = document.getElementById('composeAttachments');
    const files = Array.from(input?.files || []);
    const totalBytes = files.reduce((n, f) => n + f.size, 0);
    if (!to || !subject) { showToast('請填寫收件人與主旨', 'fa-triangle-exclamation text-amber-400'); return; }
    if (files.length > 10) { showToast('附件最多 10 個', 'fa-triangle-exclamation text-amber-400'); return; }
    if (files.some(f => f.size > 20 * 1024 * 1024) || totalBytes > 22 * 1024 * 1024) { showToast('附件太大：單一最多 20 MB、總共最多 22 MB', 'fa-triangle-exclamation text-amber-400'); return; }
    const btn = document.getElementById('sendBtn'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 準備附件...';
    try {
        const attachments = [];
        for (const file of files) attachments.push({ filename: file.name, mimeType: file.type || 'application/octet-stream', data: await fileToBase64(file) });
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 寄送中...';
        await apiFetch('action=sendFromApp', { method: 'POST', body: JSON.stringify({ to, subject, text, attachments }) });
        showToast('郵件已成功寄出！', 'fa-check text-emerald-400');
        document.getElementById('composeTo').value = ''; document.getElementById('composeSubject').value = ''; document.getElementById('composeBody').value = '';
        if (input) input.value = ''; renderAttachmentList();
    } catch (err) {
        showToast('寄送失敗：' + err.message, 'fa-triangle-exclamation text-amber-400');
        showErrorBanner('寄信失敗', err.message + '（請確認 OAuth 有 gmail.send 權限）');
    } finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 立即寄出'; }
}
