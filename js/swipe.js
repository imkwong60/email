/* 左滑刪除／還原 — 以普通 <script> 載入，共用全域範圍 */
function bindSwipeHandlers() {
    document.querySelectorAll('.swipe-row').forEach(row => {
        if (row.dataset.swipeBound) return;
        row.dataset.swipeBound = '1';
        const content = row.querySelector('.swipe-content');
        const act = row.querySelector('.swipe-actions');
        if (!content) return;
        const id = row.dataset.id;
        const email = () => emails.find(x => x.id === id);
        const isTrash = () => email()?.category === 'trash';
        if (act) {
            act.textContent = isTrash() ? '還原' : '刪除';
            act.className = isTrash()
                ? 'swipe-actions absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-emerald-600 text-white text-xs font-semibold z-0'
                : 'swipe-actions absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-rose-600 text-white text-xs font-semibold z-0';
        }
        let startX = 0, startY = 0, dx = 0, dragging = false, locked = null;
        let suppressClick = false, revealed = false;
        const max = -80;
        const THRESH = -56; // 超過就直接執行刪除／還原

        const onStart = (x, y) => {
            startX = x; startY = y; dx = 0; dragging = true; locked = null; suppressClick = false;
            content.style.transition = 'none';
        };
        const onMove = (x, y, e) => {
            if (!dragging) return;
            const adx = x - startX, ady = y - startY;
            if (locked === null && (Math.abs(adx) > 8 || Math.abs(ady) > 8)) {
                locked = Math.abs(adx) > Math.abs(ady) ? 'h' : 'v';
            }
            if (locked === 'v') return;
            if (locked === 'h' && e && e.cancelable) e.preventDefault();
            dx = Math.min(0, Math.max(max * 1.15, adx));
            content.style.transform = `translateX(${dx}px)`;
        };
        const doAction = () => {
            content.style.transition = 'transform 0.15s ease';
            content.style.transform = `translateX(${max}px)`;
            setTimeout(() => {
                if (isTrash()) restoreEmail(id);
                else deleteEmail(id);
            }, 120);
        };
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            content.style.transition = 'transform 0.2s ease';
            if (locked === 'h') {
                suppressClick = true;                       // 橫向拖完唔好觸發開信
                setTimeout(() => { suppressClick = false; }, 350);
            }
            if (locked === 'h' && dx <= THRESH) {
                revealed = false;
                doAction();
            } else if (locked === 'h' && dx < -40) {
                revealed = true;
                content.style.transform = `translateX(${max}px)`; // 露出按鈕等再撳
            } else {
                revealed = false;
                content.style.transform = 'translateX(0)';
                dx = 0;
            }
            locked = null;
        };

        // capture 階段攔截：拖完／已露出按鈕時，撳內容只係收返，唔開信
        content.addEventListener('click', ev => {
            if (suppressClick || revealed) {
                ev.stopImmediatePropagation();
                ev.preventDefault();
                if (revealed && !suppressClick) {
                    revealed = false;
                    content.style.transition = 'transform 0.2s ease';
                    content.style.transform = 'translateX(0)';
                }
            }
        }, true);

        content.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
        content.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
        content.addEventListener('touchend', onEnd);
        content.addEventListener('touchcancel', onEnd);

        // 桌面：滑鼠左滑（方便測試）
        content.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            onStart(e.clientX, e.clientY);
            const move = (ev) => onMove(ev.clientX, ev.clientY, ev);
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                onEnd();
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });

        if (act) {
            act.onclick = (e) => {
                e.stopPropagation();
                if (isTrash()) restoreEmail(id);
                else deleteEmail(id);
            };
        }
    });
}
