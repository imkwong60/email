/* 設定、全域狀態、分類資料 — 以普通 <script> 載入，共用全域範圍 */
// ========== CONFIG ==========
// 填你的 project；EDGE 若實際 slug 是 CHECK 請改路徑
const SUPABASE_URL = 'https://wanknivxcsrasdkkxmfr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbmtuaXZ4Y3NyYXNka2t4bWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMzE4NjcsImV4cCI6MjEwMjkwNzg2N30.tqsFimERtYCxoh8J-8FlqxByWtX2gNnyaGo08jditrs';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/CHECK`; // 你目前實際 slug；若改回 gmail-sync 請改呢行
const VAPID_PUBLIC_KEY = 'BNtUxRU1oQ_pfnfos06sCxB-wXRAXzd0NuNIm26mv7NQWpAbE8KwBTsBmRQowb1lE-aPVUQ6GiYzVb_F__u30Do';
// ============================

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let session = null; // { access_token, user }
let emails = [];
let activeTab = 'important';
let searchQuery = '';
let currentModalEmailId = null;
let isSyncing = false;
let pushSubscribed = localStorage.getItem('pushSubscribed') === '1';

// ---- 增量同步 / 樂觀更新守衛 狀態 ----
const GUARD_MS = 120000;          // 本地修改喺呢段時間內優先於伺服器回應
let lastListAt = null;            // 上次成功拉取嘅 server 時間（已減 5 秒重疊）
let hasMore = false;              // 伺服器仍有更舊郵件未載入
let loadingMore = false;
let listInFlight = null;
let serverCounts = null;          // { important, transaction, promotion, trash }
const recentDeleted = new Map();  // id -> ts：本地已刪，避免舊回應令信彈返出嚟
const localDirty = new Map();     // id -> { fields, ts }：本地未確認嘅修改
const bodyCache = new Map();      // id -> body（只喺開信時才向伺服器拎）

const categoryMeta = {
    important:  { label:'重要郵件', color:'bg-amber-500 text-white', pillActive:'bg-amber-500 text-white shadow-md shadow-amber-500/30', pillInactive:'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' },
    transaction:{ label:'交易通知', color:'bg-emerald-500 text-white', pillActive:'bg-emerald-500 text-white shadow-md shadow-emerald-500/30', pillInactive:'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' },
    promotion:  { label:'著數郵件', color:'bg-purple-500 text-white', pillActive:'bg-purple-500 text-white shadow-md shadow-purple-500/30', pillInactive:'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' },
    trash:      { label:'待刪除',   color:'bg-rose-500 text-white',   pillActive:'bg-rose-500 text-white shadow-md shadow-rose-500/30',   pillInactive:'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' },
    compose:    { label:'寄信',     color:'bg-brand-600 text-white',  pillActive:'bg-brand-600 text-white shadow-md shadow-brand-500/30',  pillInactive:'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' }
};
