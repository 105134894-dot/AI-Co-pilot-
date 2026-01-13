(function () {
    const cfg = window.MIV_WIDGET_CONFIG || {};
    const backendUrl = cfg.backendUrl;
    const storageVersion = String(cfg.storageVersion || "v1");
    const systemPrompt = cfg.systemPrompt || ""; // Get system prompt from config

    if (!backendUrl) {
        console.error("MIV backendUrl not provided");
        return;
    }

    // Log system prompt for debugging
    console.log("📋 System Prompt loaded:", systemPrompt.substring(0, 100) + "...");

    /* -----------------------------
       Persistent settings
    ----------------------------- */
    let fontScale = parseFloat(localStorage.getItem("mivFontScale_" + storageVersion) || "1");

    // Theme / contrast state (From Peter's Branch)
    const THEME_KEY = "mivTheme_" + storageVersion;
    const contrastThemes = ["default", "high", "blue", "navy", "sepia", "slate", "yellow"];
    let currentThemeIndex = parseInt(localStorage.getItem(THEME_KEY) || "0", 10);
    if (isNaN(currentThemeIndex) || currentThemeIndex < 0 || currentThemeIndex >= contrastThemes.length) {
        currentThemeIndex = 0;
    }

    let highContrast = false;
    let isLoading = false;

    /* -----------------------------
       Navigation state (From Peter's Branch)
    ----------------------------- */
    let intent = null;
    let currentState = { intent: null, message: null };
    let historyStack = [];
    let futureStack = [];

    // Track whether we're resizing programmatically (so we don't accidentally
    // persist bogus sizes like 0x0 on refresh/pagehide when the chat is closed).
    let isHandleResizing = false;
    let suppressSizeSave = false;

    /* -----------------------------
       Temp UI tracking
    ----------------------------- */
    let welcomeShown = false;
    let hasAskedQuestion = false; // Track if user has asked any question

    /* -----------------------------
       Constants
    ----------------------------- */
    const WELCOME_MESSAGE =
        "Ask me anything about accessibility, inclusive ventures, or supporting people with disabilities.";

    const QUICK_QUESTIONS = [
        "How do I make sure my online forms are accessible?",
        "What tools can help someone with low vision use my digital content more easily?",
        "How do I make my event more accessible for people with different disabilities?",
        "Can you help me find tools to support people with hearing impairments?"
    ];

    const INTENT_CATEGORIES = [
        { key: "digital", label: "Digital accessibility" },
        { key: "events", label: "Events & venues" },
        { key: "tools", label: "Tools & assistive tech" },
        { key: "supports", label: "Disability supports" },
        { key: "other", label: "Something else" }
    ];

    const PROMPTS_BY_INTENT = {
        digital: [
            QUICK_QUESTIONS[0],
            "How can I test my website for accessibility?",
            "What colour contrast rules should I follow?",
            "How do I write good alt text?"
        ],
        events: [
            QUICK_QUESTIONS[2],
            "What should I include on an accessible registration form?",
            "How can I support sensory needs at an event?",
            "What are low-cost accessibility improvements?"
        ],
        tools: [
            QUICK_QUESTIONS[3],
            QUICK_QUESTIONS[1],
            "What are common assistive technologies I should know about?",
            "Are there free accessibility tools available?"
        ],
        supports: [
            "How can I support someone with a disability in the workplace?",
            "What adjustments help people with ADHD or autism?",
            "How do I make my communication more accessible?",
            "What does inclusive language look like?"
        ],
        other: [
            "Help me figure out what I should focus on first.",
            "What are the most common accessibility barriers?",
            "Can you review my situation and suggest next steps?",
            "Where do I start with inclusive design?"
        ]
    };

    /* -----------------------------
       DOM elements
    ----------------------------- */
    const root = document.getElementById("miv-widget-root");
    if (!root) return;

    const launcherBtn = document.getElementById("miv-launcher-btn");
    const chatWindow = document.getElementById("miv-chat-window");
    const resizeHandle = document.getElementById("miv-resize-handle"); // optional
    const closeBtn = document.getElementById("miv-close-btn");

    const a11yToggle = document.getElementById("miv-a11y-toggle");
    const a11yPanel = document.getElementById("miv-a11y-panel");
    const a11yClose = document.getElementById("miv-a11y-close");

    const fontDec = document.getElementById("miv-font-dec");
    const fontInc = document.getElementById("miv-font-inc");
    const contrastToggle = document.getElementById("miv-contrast-toggle");
    const resetA11yBtn = document.getElementById("miv-a11y-reset");

    const messagesEl = document.getElementById("miv-messages");
    const form = document.getElementById("miv-form");
    const input = document.getElementById("miv-user-input");

    // Navigation buttons (From Peter's Branch)
    const backBtn = document.getElementById("miv-back-btn");
    const forwardBtn = document.getElementById("miv-forward-btn");
    const clearBtn = document.getElementById("miv-clear-chat-btn");

    /* -----------------------------
       Quick questions UI
    ----------------------------- */
    const quickWrap = document.createElement("div");
    quickWrap.className = "miv-quick-questions";
    chatWindow.insertBefore(quickWrap, messagesEl);

    /* -----------------------------
       NEW: Make quickWrap scroll correctly when widget is resized
    ----------------------------- */
    function adjustQuickWrapScroll() {
        if (!chatWindow || !quickWrap) return;
        if (quickWrap.style.display === "none") return;

        const headerEl = chatWindow.querySelector(".miv-chat-header");
        const inputRowEl = chatWindow.querySelector(".miv-input-row");

        const totalH = chatWindow.clientHeight || 0;
        const headerH = headerEl ? headerEl.offsetHeight : 0;
        const inputH = inputRowEl ? inputRowEl.offsetHeight : 0;

        // available vertical space between header and input row
        const available = Math.max(0, totalH - headerH - inputH);

        // leave a bit of padding; set a safe minimum so it never collapses
        const maxH = Math.max(160, available - 16);

        quickWrap.style.maxHeight = `${maxH}px`;
        quickWrap.style.overflowY = "auto";
        quickWrap.style.overscrollBehavior = "contain";
        quickWrap.style.webkitOverflowScrolling = "touch";
    }

    // Observe chatWindow resizes (works with your drag resize + native CSS resize)
    // 1) keep quickWrap sized correctly
    // 2) persist the new size so refresh restores it
    let mivSaveSizeT = null;
    if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
            adjustQuickWrapScroll();

            // Persist only when the chat is open, and avoid saving during programmatic resizes.
            if (!chatWindow.classList.contains("miv-chat-window--open")) return;
            if (suppressSizeSave || isHandleResizing) return;

            if (mivSaveSizeT) clearTimeout(mivSaveSizeT);
            mivSaveSizeT = setTimeout(() => saveSize(), 150);
        });
        if (chatWindow) ro.observe(chatWindow);
    } else {
        window.addEventListener("resize", () => {
            adjustQuickWrapScroll();
            if (chatWindow && chatWindow.classList.contains("miv-chat-window--open")) {
                saveSize();
            }
        });
    }

    /* -----------------------------
       Top-left drag-resize (kept as-is)
    ----------------------------- */
    const SIZE_KEY = "mivChatWindowSize_" + storageVersion;

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function getMaxW() {
        //  match CSS calc(100vw - 3rem) (1.5rem left + 1.5rem right)
        return Math.max(360, Math.floor(window.innerWidth - 48));
    }
    
    function getMaxH() {
        // allow it to reach near the top: calc(100vh - 3rem)
        return Math.max(360, Math.floor(window.innerHeight - 48));
    }

    function applySavedSize() {
        try {
            const raw = localStorage.getItem(SIZE_KEY);
            if (!raw) return;

            const parsed = JSON.parse(raw);
            const w = parsed && typeof parsed.w === "number" ? parsed.w : null;
            const h = parsed && typeof parsed.h === "number" ? parsed.h : null;

            suppressSizeSave = true;
            if (w != null) chatWindow.style.width = clamp(w, 360, getMaxW()) + "px";
            if (h != null) chatWindow.style.height = clamp(h, 360, getMaxH()) + "px";
            suppressSizeSave = false;
        } catch {
            // ignore
        }
    }

    function hasSavedSize() {
        try {
            const raw = localStorage.getItem(SIZE_KEY);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed.w === "number" && typeof parsed.h === "number";
        } catch {
            return false;
        }
    }
    
    function applyDefaultSizeIfNone() {
        if (!chatWindow) return;
        if (hasSavedSize()) return;
    
        //  sensible first-open size
        const defaultW = clamp(700, 360, getMaxW());
        const defaultH = clamp(500, 360, getMaxH());
    
        suppressSizeSave = true;
        chatWindow.style.width = defaultW + "px";
        chatWindow.style.height = defaultH + "px";
        suppressSizeSave = false;
    }
    

    /* -----------------------------
   Clamp chat size to viewport
----------------------------- */
    function clampChatToViewport({ persist = false } = {}) {
        if (!chatWindow) return;

        const rect = chatWindow.getBoundingClientRect();
        const currentW = parseFloat(chatWindow.style.width) || rect.width;
        const currentH = parseFloat(chatWindow.style.height) || rect.height;

        const nextW = clamp(currentW, 360, getMaxW());
        const nextH = clamp(currentH, 360, getMaxH());

        if (Math.round(nextW) !== Math.round(currentW)) {
            chatWindow.style.width = nextW + "px";
        }

        if (Math.round(nextH) !== Math.round(currentH)) {
            chatWindow.style.height = nextH + "px";
        }

        if (persist) saveSize();

        // ✅ keep quick options sized correctly after clamping
        adjustQuickWrapScroll();
    }


    function saveSize() {
        try {
            if (!chatWindow || suppressSizeSave) return;

            // Prefer explicit styles (works even if widget is temporarily hidden)
            const wStyle = parseFloat(chatWindow.style.width);
            const hStyle = parseFloat(chatWindow.style.height);

            const rect = chatWindow.getBoundingClientRect();
            const w = Number.isFinite(wStyle) && wStyle > 0 ? wStyle : rect.width;
            const h = Number.isFinite(hStyle) && hStyle > 0 ? hStyle : rect.height;

            // Guard: don't overwrite saved size with 0x0 or tiny values (happens on refresh
            // if pagehide fires while chat is closed / display:none).
            if (!(w > 100 && h > 100)) return;

            localStorage.setItem(
                SIZE_KEY,
                JSON.stringify({
                    w: Math.round(w),
                    h: Math.round(h)
                })
            );
        } catch {
            // ignore
        }
    }

    (function enableTopLeftResize() {
        if (!chatWindow || !resizeHandle) return;

        let resizing = false;
        let startX = 0;
        let startY = 0;
        let startW = 0;
        let startH = 0;

        function onDown(e) {
            if (e.button !== undefined && e.button !== 0) return;

            resizing = true;
            isHandleResizing = true;
            isHandleResizing = true;
            const pt = e.touches ? e.touches[0] : e;

            const rect = chatWindow.getBoundingClientRect();
            startX = pt.clientX;
            startY = pt.clientY;
            startW = rect.width;
            startH = rect.height;

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            document.addEventListener("touchmove", onMove, { passive: false });
            document.addEventListener("touchend", onUp);

            e.preventDefault();
            e.stopPropagation();
        }

        function onMove(e) {
            if (!resizing) return;

            const pt = e.touches ? e.touches[0] : e;

            const dx = startX - pt.clientX;
            const dy = startY - pt.clientY;

            const newW = clamp(startW + dx, 360, getMaxW());
            const newH = clamp(startH + dy, 360, getMaxH());

            chatWindow.style.width = newW + "px";
            chatWindow.style.height = newH + "px";

            // NEW: keep quick area sized correctly while resizing
            adjustQuickWrapScroll();

            if (e.cancelable) e.preventDefault();
        }

        function onUp(e) {
            if (!resizing) return;
            resizing = false;
            isHandleResizing = false;
            isHandleResizing = false;

            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.removeEventListener("touchmove", onMove);
            document.removeEventListener("touchend", onUp);

            saveSize();

            if (e && e.stopPropagation) e.stopPropagation();
        }

        resizeHandle.addEventListener("mousedown", onDown);
        resizeHandle.addEventListener("touchstart", onDown, { passive: false });
    })();

    /* -----------------------------
       Persist size when user uses native CSS resize handle (bottom-right)
       and prevent losing size on refresh.
    ----------------------------- */
    (function observeSizeChanges() {
        if (!chatWindow || typeof ResizeObserver === "undefined") return;

        let t = null;
        const ro = new ResizeObserver(() => {
            if (!isChatOpen()) return;
            if (suppressSizeSave) return;
            // During our own drag-resize, we already save on mouseup.
            if (isHandleResizing) return;

            if (t) clearTimeout(t);
            t = setTimeout(() => saveSize(), 150);
        });

        ro.observe(chatWindow);
    })();

    /* -----------------------------
       Markdown parser using marked.js library
    ----------------------------- */
    function parseMarkdown(text) {
        if (!text) return "";

        if (typeof marked !== "undefined") {
            try {
                return marked.parse(text);
            } catch (e) {
                console.warn("Marked.js parsing failed, falling back to plain text", e);
                return text.replace(/\n/g, "<br>");
            }
        }

        return text.replace(/\n/g, "<br>");
    }

    /* -----------------------------
       Chat history (localStorage)
    ----------------------------- */
    const MAX_MESSAGES = 60;
    const STORAGE_KEY = `miv_copilot_chat_history_${storageVersion}`;
    const LEGACY_KEY = "miv_copilot_chat_history_v1";

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveHistory(history) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_MESSAGES)));
        } catch (e) {
            console.warn("MIV history save failed", e);
        }
    }

    function clearHistory() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    }

    function pushToHistory(role, text) {
        const history = loadHistory();
        history.push({ role, text: String(text || ""), ts: Date.now() });
        saveHistory(history);
    }

    function cleanupLegacyOrBadHistory() {
        try {
            const legacy = localStorage.getItem(LEGACY_KEY);
            if (legacy && !localStorage.getItem(STORAGE_KEY)) {
                localStorage.removeItem(LEGACY_KEY);
            }
        } catch {
            // ignore
        }

        const h = loadHistory();
        if (h.length === 1 && /chat cleared/i.test(h[0].text || "")) {
            clearHistory();
        }
    }

    function renderHistory() {
        const history = loadHistory();
        if (!history.length) return;

        messagesEl.innerHTML = "";
        history.forEach((m) => addMessage(m.role, m.text, { skipSave: true }));

        const hasUserMessage = history.some((m) => m.role === "user");
        if (hasUserMessage) {
            hasAskedQuestion = true;
            quickWrap.style.display = "none";
        } else {
            quickWrap.style.display = "flex";
            adjustQuickWrapScroll();
        }

        updateNavigationButtons();
    }

    /* -----------------------------
       Navigation helpers  (From Peter's Branch)
    ----------------------------- */
    function statesEqual(a, b) {
        return (!a && !b) || (a && b && a.intent === b.intent && a.message === b.message);
    }

    function updateNavigationButtons() {
        const canGoBack = historyStack.length > 0;
        const canGoForward = futureStack.length > 0;

        if (canGoBack) {
            backBtn.hidden = false;
            backBtn.classList.remove("miv-hidden");
            backBtn.tabIndex = 0;
            backBtn.setAttribute("aria-hidden", "false");
            backBtn.setAttribute("aria-disabled", "false");
        } else {
            backBtn.hidden = true;
            backBtn.classList.add("miv-hidden");
            backBtn.tabIndex = -1;
            backBtn.setAttribute("aria-hidden", "true");
            backBtn.setAttribute("aria-disabled", "true");
        }

        if (canGoForward) {
            forwardBtn.hidden = false;
            forwardBtn.classList.remove("miv-hidden");
            forwardBtn.tabIndex = 0;
            forwardBtn.setAttribute("aria-hidden", "false");
            forwardBtn.setAttribute("aria-disabled", "false");
        } else {
            forwardBtn.hidden = true;
            forwardBtn.classList.add("miv-hidden");
            forwardBtn.tabIndex = -1;
            forwardBtn.setAttribute("aria-hidden", "true");
            forwardBtn.setAttribute("aria-disabled", "true");
        }
    }

    function navigateTo(state) {
        if (!statesEqual(currentState, state)) {
            const hasCurrent = Boolean(currentState && (currentState.intent || currentState.message));
            if (hasCurrent) {
                historyStack.push(captureNavEntry());
            }
        }
        currentState = state;
        futureStack = [];
        updateNavigationButtons();
    }

    function captureNavEntry() {
        return {
            state: { ...currentState },
            history: loadHistory(),
            hasAskedQuestion,
            intent
        };
    }

    function restoreNavEntry(entry) {
        if (!entry) return;
    
        const restoredHistory = Array.isArray(entry.history) ? entry.history : [];
    
        // Restore stored chat history (localStorage) and repaint messages
        saveHistory(restoredHistory);
        messagesEl.innerHTML = "";
        restoredHistory.forEach((m) => addMessage(m.role, m.text, { skipSave: true }));
        // Always scroll to top after restoring history
        messagesEl.scrollTop = 0;
        const hasUserMessage = restoredHistory.some((m) => m.role === "user");
        hasAskedQuestion = hasUserMessage;
        intent = entry.intent || null;
        currentState = entry.state || { intent: null, message: null };
    
        // KEY FIX:
        // Only render the quick UI + helper message when we are in a "pre-chat" state.
        // If the snapshot already includes a user chat, do NOT inject helper text.
        if (!hasUserMessage) {
            renderState(currentState);
        } else {
            // Ensure quick UI stays hidden and no temp helper messages linger
            removeTempMessages();
            quickWrap.style.display = "none";
        }
    
        updateNavigationButtons();
    
        // Ensure the user can scroll to the end of long responses.
        // messagesEl.scrollTop = messagesEl.scrollHeight; // Disabled to keep scroll at top after navigation
    }
    

    /* -----------------------------
       Quick questions UI helpers
    ----------------------------- */
    function clearQuickArea() {
        quickWrap.innerHTML = "";
        quickWrap.style.display = "flex";
    }

    function renderTitle(text) {
        const title = document.createElement("div");
        title.className = "miv-quick-title";
        title.textContent = text;
        quickWrap.appendChild(title);
    }

    function removeTempMessages() {
        const temps = messagesEl.querySelectorAll('[data-temp="1"]');
        temps.forEach((el) => el.remove());
        welcomeShown = false;
    }

    function renderIntentButtons() {
        clearQuickArea();
        renderTitle("What can I help you with today?");

        INTENT_CATEGORIES.forEach((cat) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "miv-chip";
            btn.innerHTML = `<span class="miv-chip-text">${cat.label}</span>`;

            btn.addEventListener("click", () => {
                removeTempMessages();
                historyStack.push(captureNavEntry());

                const newState = { intent: cat.key, message: null };
                currentState = newState;
                futureStack = [];

                renderState(newState);
                updateNavigationButtons();
            });

            quickWrap.appendChild(btn);
        });

        // NEW: ensure scroll sizing is correct right after render
        adjustQuickWrapScroll();
    }

    function renderQuickQuestions(questions) {
        clearQuickArea();
        renderTitle("Quick questions:");

        (questions || []).slice(0, 4).forEach((q) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "miv-chip";
            btn.innerHTML = `<span class="miv-chip-text">${q}</span>`;

            btn.addEventListener("click", () => {
                removeTempMessages();
                input.value = "";

                const newState = { intent, message: q };
                // Capture full chat snapshot BEFORE we change anything,
                // so Back returns the entire chat (not just the chips).
                historyStack.push(captureNavEntry());
                currentState = newState;
                futureStack = [];
                updateNavigationButtons();

                hasAskedQuestion = true;
                quickWrap.style.display = "none";
                sendMessage(q, { skipNavigate: true });
            });

            quickWrap.appendChild(btn);
        });

        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "miv-chip miv-chip--secondary";
        reset.innerHTML = `<span class="miv-chip-text">Change topic</span>`;
        reset.addEventListener("click", () => {
            const newState = { intent: null, message: null };
            navigateTo(newState);
            renderState(newState);
        });
        quickWrap.appendChild(reset);

        // NEW: ensure scroll sizing is correct right after render
        adjustQuickWrapScroll();
    }

    /* -----------------------------
       FIXED: renderState should show quick UI during navigation,
              even if hasAskedQuestion is true.
              (We still hide it when the user actually chats.)
    ----------------------------- */
    function renderState(state) {
        intent = state.intent || null;
        removeTempMessages();

        // ✅ Always show quick UI when navigating
        quickWrap.style.display = "flex";

        if (intent) {
            renderQuickQuestions(PROMPTS_BY_INTENT[intent] || QUICK_QUESTIONS);
            addMessage(
                "assistant",
                `Got it – ${INTENT_CATEGORIES.find((c) => c.key === intent).label}. Pick a quick question or type your own.`,
                { skipSave: true, isTemp: true }
            );
        } else {
            renderIntentButtons();
            addMessage("assistant", WELCOME_MESSAGE, { skipSave: true, isTemp: true });
        }

        adjustQuickWrapScroll();
        updateNavigationButtons();
    }

    function ensureFreshStartUI() {
        // On fresh start we *do* respect hasAskedQuestion for hiding/showing
        quickWrap.style.display = hasAskedQuestion ? "none" : "flex";
        renderIntentButtons();
        if (!welcomeShown) {
            addMessage("assistant", WELCOME_MESSAGE, { skipSave: true, isTemp: true });
        }
        if (!hasAskedQuestion) adjustQuickWrapScroll();
        updateNavigationButtons();
    }

    /* -----------------------------
       Rendering helpers
       (MERGED: Uses temp logic + marked.js parser)
    ----------------------------- */
    function addMessage(role, text, opts) {
        const options = opts || {};

        if (options.isTemp) {
            const temps = Array.from(messagesEl.querySelectorAll('[data-temp="1"]'));
            const duplicate = temps.some(
                (el) => el.textContent && el.textContent.trim() === String(text || "").trim()
            );
            if (duplicate) return;
        }

        if (!options.skipSave) pushToHistory(role, text);

        if (role === "user") {
            hasAskedQuestion = true;
            quickWrap.style.display = "none";
        }

        const wrapper = document.createElement("div");
        wrapper.className = "miv-message miv-message--" + role;

        if (options.isTemp) {
            wrapper.setAttribute("data-temp", "1");
            welcomeShown = true;
        }

        if (role === "assistant") {
            wrapper.setAttribute("role", "alert");
            wrapper.setAttribute("aria-live", "assertive");

            const contentDiv = document.createElement("div");
            contentDiv.className = "miv-message-parsed";
            contentDiv.innerHTML = parseMarkdown(text);

            // Ensure all links open in a new tab
            const links = contentDiv.querySelectorAll("a");
            links.forEach((link) => {
                link.setAttribute("target", "_blank");
                link.setAttribute("rel", "noopener noreferrer");
            });

            wrapper.appendChild(contentDiv);
        } else {
            const p = document.createElement("p");
            p.textContent = text;
            wrapper.appendChild(p);
        }

        messagesEl.appendChild(wrapper);

        // Scroll behaviour: keep at top for assistant responses
        if (role === "user") {
            wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
            messagesEl.scrollTop = 0;
        }
    }

    function addTypingIndicator() {
        const wrapper = document.createElement("div");
        wrapper.className = "miv-message miv-message--assistant miv-message--typing";
        wrapper.id = "miv-typing";
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement("span");
            dot.className = "miv-dot";
            wrapper.appendChild(dot);
        }
        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTypingIndicator() {
        const el = document.getElementById("miv-typing");
        if (el) el.remove();
    }

    /* -----------------------------
       Accessibility controls
    ----------------------------- */
    function applyFontScale() {
        chatWindow.style.setProperty("--miv-font-scale", fontScale);
        localStorage.setItem("mivFontScale_" + storageVersion, fontScale);
    }

    function applyContrast() {
        const theme = contrastThemes[currentThemeIndex];

        chatWindow.classList.remove(
            "miv-chat-window--high-contrast",
            "miv-theme-blue",
            "miv-theme-navy",
            "miv-theme-sepia",
            "miv-theme-slate",
            "miv-theme-yellow"
        );

        highContrast = false;

        if (theme === "default") {
            // base colours
        } else if (theme === "high") {
            chatWindow.classList.add("miv-chat-window--high-contrast");
            highContrast = true;
        } else {
            chatWindow.classList.add(`miv-theme-${theme}`);
        }

        contrastToggle.setAttribute("aria-pressed", String(highContrast));
        localStorage.setItem("mivHighContrast_" + storageVersion, String(highContrast));
        localStorage.setItem(THEME_KEY, String(currentThemeIndex));
    }

    /* Reset Accessibility Settings - FIX: Prevent closing panel */
    if (resetA11yBtn) {
        resetA11yBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            fontScale = 1;
            applyFontScale();

            currentThemeIndex = 0;
            applyContrast();
        });
    }

    clearBtn.addEventListener("click", () => {
        clearHistory();
        messagesEl.innerHTML = "";
        intent = null;
        isLoading = false;
        removeTypingIndicator();
        historyStack = [];
        futureStack = [];
        currentState = { intent: null, message: null };
        welcomeShown = false;
        hasAskedQuestion = false;
        ensureFreshStartUI();
    });

    /* -----------------------------
       Chat controls
    ----------------------------- */
    function isChatOpen() {
        return chatWindow.classList.contains("miv-chat-window--open");
    }

    function openChat() {
        // If no saved size exists (fresh install), apply a sensible default
        applyDefaultSizeIfNone();
        // Apply saved size each time the chat opens
        applySavedSize();

        // Ensure saved size never exceeds current viewport (and never collapses)
        clampChatToViewport({ persist: false });

        chatWindow.classList.add("miv-chat-window--open");
        chatWindow.setAttribute("aria-hidden", "false");
        launcherBtn.style.display = "none";
        a11yPanel.setAttribute("hidden", "true");

        if (!intent && loadHistory().length === 0) {
            ensureFreshStartUI();
        }

        updateNavigationButtons();

        // NEW: ensure quick area is sized correctly on open
        adjustQuickWrapScroll();

        input.focus();
    }

    function closeChat() {
        // Save current size on close
        saveSize();
        removeTempMessages();
        chatWindow.classList.remove("miv-chat-window--open");
        chatWindow.setAttribute("aria-hidden", "true");
        a11yPanel.setAttribute("hidden", "true");
        launcherBtn.style.display = "";
    }

    closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeChat();
    });

    async function sendMessage(text, opts = {}) {
        if (!text || isLoading) return;
        isLoading = true;
        quickWrap.style.display = "none";

        // Capture full chat snapshot BEFORE we append messages,
        // so Back returns the entire chat view.
        if (!opts.skipNavigate) {
            historyStack.push(captureNavEntry());
            currentState = { intent, message: text };
            futureStack = [];
            updateNavigationButtons();
        }

        addMessage("user", text);
        addTypingIndicator();

        try {
            const res = await fetch(backendUrl + "/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: text,
                    top_k: 3,
                    system_prompt: systemPrompt
                })
            });
            const data = await res.json();
            removeTypingIndicator();
            addMessage("assistant", (data && data.response) || "I couldn't generate a response just now.");
        } catch (err) {
            console.error(err);
            removeTypingIndicator();
            addMessage("assistant", "I ran into a technical issue talking to the server.");
        } finally {
            isLoading = false;
            updateNavigationButtons();
        }
    }

    /* -----------------------------
       Event listeners
    ----------------------------- */
    launcherBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openChat();
    });

    document.addEventListener(
        "pointerdown",
        (e) => {
            if (!isChatOpen() || root.contains(e.target)) return;
            closeChat();
        },
        true
    );

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isChatOpen()) closeChat();
    });

    a11yToggle.addEventListener("click", (e) => {
        e.preventDefault();
        a11yPanel.toggleAttribute("hidden");
    });

    a11yClose.addEventListener("click", (e) => {
        e.preventDefault();
        a11yPanel.setAttribute("hidden", "true");
    });

    document.addEventListener("pointerdown", (e) => {
        const clickedInside = a11yPanel.contains(e.target);
        const clickedToggle = e.target === a11yToggle;

        if (!a11yPanel.hidden && !clickedInside && !clickedToggle) {
            a11yPanel.setAttribute("hidden", "true");
        }
    });

    fontDec.addEventListener("click", () => {
        fontScale = Math.max(0.8, fontScale - 0.1);
        applyFontScale();
    });

    fontInc.addEventListener("click", () => {
        fontScale = Math.min(1.6, fontScale + 0.1);
        applyFontScale();
    });

    contrastToggle.addEventListener("click", () => {
        currentThemeIndex = (currentThemeIndex + 1) % contrastThemes.length;
        applyContrast();
    });

    /* -----------------------------
       FIXED: Back/Forward should always visibly render the state
    ----------------------------- */
    backBtn.addEventListener("click", () => {
        if (historyStack.length === 0) return;

        futureStack.push(captureNavEntry());
        const prev = historyStack.pop();
        restoreNavEntry(prev);
    });

    forwardBtn.addEventListener("click", () => {
        if (futureStack.length === 0) return;

        historyStack.push(captureNavEntry());
        const next = futureStack.pop();
        restoreNavEntry(next);
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        sendMessage(text);
    });

    window.addEventListener("pagehide", () => {
        // Avoid overwriting saved size with 0x0 when the chat is closed
        if (isChatOpen()) saveSize();
    });

        /* -----------------------------
    Resize chat when browser resizes
    ----------------------------- */
    let mivResizeRAF = null;

    function onViewportResize() {
        if (mivResizeRAF) cancelAnimationFrame(mivResizeRAF);
        mivResizeRAF = requestAnimationFrame(() => {
            clampChatToViewport({ persist: true });
        });
    }

    window.addEventListener("resize", onViewportResize);
    window.addEventListener("orientationchange", onViewportResize);

    /* -----------------------------
       Initial load
    ----------------------------- */
    cleanupLegacyOrBadHistory();
    renderHistory();

    updateNavigationButtons();

    if (loadHistory().length === 0) {
        ensureFreshStartUI();
    }

    // Restore saved size immediately on page load
    applySavedSize();

    // Clamp immediately on load too (prevents saved size being larger than viewport)
    clampChatToViewport({ persist: false });

    applyFontScale();
    applyContrast();

    // NEW: size quickWrap correctly on load (helps first-open sizing)
    adjustQuickWrapScroll();
})();
