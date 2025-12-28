(function () {
    const cfg = window.MIV_WIDGET_CONFIG || {};
    const backendUrl = cfg.backendUrl;
    const storageVersion = String(cfg.storageVersion || "v1");

    if (!backendUrl) {
        console.error("MIV backendUrl not provided");
        return;
    }

    /* -----------------------------
       Persistent settings
    ----------------------------- */
    let fontScale = parseFloat(localStorage.getItem('mivFontScale_' + storageVersion) || '1');

    // Theme / contrast state (From Peter's Branch)
    const THEME_KEY = 'mivTheme_' + storageVersion;
    const contrastThemes = [
        "default",   // original/base
        "high",      // existing black/white high contrast
        "blue",
        "navy",
        "sepia",
        "slate",
        "yellow"
    ];
    let currentThemeIndex = parseInt(localStorage.getItem(THEME_KEY) || '0', 10);
    if (isNaN(currentThemeIndex) || currentThemeIndex < 0 || currentThemeIndex >= contrastThemes.length) {
        currentThemeIndex = 0;
    }

    // Legacy highContrast flag kept for backward compatibility but now derived from theme
    let highContrast = false;
    let isLoading = false;

    /* -----------------------------
       Navigation state (From Peter's Branch)
    ----------------------------- */
    let intent = null;
    let currentState = { intent: null, message: null };
    let historyStack = [];
    let futureStack = [];

    /* -----------------------------
       Temp UI tracking
    ----------------------------- */
    let welcomeShown = false;

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
       Markdown parser using marked.js library (RESTORED FROM MAIN)
    ----------------------------- */
    function parseMarkdown(text) {
        if (!text) return '';

        // Check if marked library is loaded
        if (typeof marked !== 'undefined') {
            try {
                return marked.parse(text);
            } catch (e) {
                console.warn('Marked.js parsing failed, falling back to plain text', e);
                return text.replace(/\n/g, '<br>');
            }
        }

        // Fallback if marked.js not loaded
        return text.replace(/\n/g, '<br>');
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
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(history.slice(-MAX_MESSAGES))
            );
        } catch (e) {
            console.warn("MIV history save failed", e);
        }
    }

    function clearHistory() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch { }
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
        } catch { }

        const h = loadHistory();
        if (h.length === 1 && /chat cleared/i.test(h[0].text || "")) {
            clearHistory();
        }
    }

    function renderHistory() {
        const history = loadHistory();
        if (!history.length) return;

        messagesEl.innerHTML = "";
        history.forEach(m => addMessage(m.role, m.text, { skipSave: true }));

        const hasUserMessage = history.some(m => m.role === 'user');
        if (hasUserMessage) {
            quickWrap.style.display = "none";
        } else {
            quickWrap.style.display = "flex";
        }

        updateNavigationButtons();
    }

    /* -----------------------------
       Navigation helpers (From Peter's Branch)
    ----------------------------- */

    function statesEqual(a, b) {
        return (!a && !b) || (a && b && a.intent === b.intent && a.message === b.message);
    }

    function updateNavigationButtons() {
        const canGoBack = historyStack.length > 0;
        const canGoForward = futureStack.length > 0;

        if (canGoBack) {
            backBtn.hidden = false;
            backBtn.classList.remove('miv-hidden');
            backBtn.tabIndex = 0;
            backBtn.setAttribute('aria-hidden', 'false');
            backBtn.setAttribute('aria-disabled', 'false');
        } else {
            backBtn.hidden = true;
            backBtn.classList.add('miv-hidden');
            backBtn.tabIndex = -1;
            backBtn.setAttribute('aria-hidden', 'true');
            backBtn.setAttribute('aria-disabled', 'true');
        }

        if (canGoForward) {
            forwardBtn.hidden = false;
            forwardBtn.classList.remove('miv-hidden');
            forwardBtn.tabIndex = 0;
            forwardBtn.setAttribute('aria-hidden', 'false');
            forwardBtn.setAttribute('aria-disabled', 'false');
        } else {
            forwardBtn.hidden = true;
            forwardBtn.classList.add('miv-hidden');
            forwardBtn.tabIndex = -1;
            forwardBtn.setAttribute('aria-hidden', 'true');
            forwardBtn.setAttribute('aria-disabled', 'true');
        }
    }

    function navigateTo(state) {
        if (!statesEqual(currentState, state)) {
            const hasCurrent = Boolean(currentState && (currentState.intent || currentState.message));
            if (hasCurrent) {
                historyStack.push({ ...currentState });
            }
        }
        currentState = state;
        futureStack = [];
        updateNavigationButtons();
    }

    function renderState(state) {
        intent = state.intent || null;
        removeTempMessages();

        if (intent) {
            renderQuickQuestions(PROMPTS_BY_INTENT[intent] || QUICK_QUESTIONS);
            addMessage(
                "assistant",
                `Got it — ${INTENT_CATEGORIES.find(c => c.key === intent).label}. Pick a quick question or type your own.`,
                { skipSave: true, isTemp: true }
            );
            quickWrap.style.display = "flex";
        } else {
            renderIntentButtons();
            addMessage("assistant", WELCOME_MESSAGE, { skipSave: true, isTemp: true });
            quickWrap.style.display = "flex";
        }

        updateNavigationButtons();
    }

    /* -----------------------------
       Quick questions UI
    ----------------------------- */
    const quickWrap = document.createElement("div");
    quickWrap.className = "miv-quick-questions";
    chatWindow.insertBefore(quickWrap, messagesEl);

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
        temps.forEach(el => el.remove());
        welcomeShown = false;
    }

    function renderIntentButtons() {
        clearQuickArea();
        renderTitle("What can I help you with today?");

        INTENT_CATEGORIES.forEach(cat => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "miv-chip";
            btn.innerHTML = `<span class="miv-chip-text">${cat.label}</span>`;

            btn.addEventListener("click", () => {
                removeTempMessages();
                historyStack.push({ ...currentState });

                const newState = { intent: cat.key, message: null };
                currentState = newState;
                futureStack = [];

                renderState(newState);
                updateNavigationButtons();
            });

            quickWrap.appendChild(btn);
        });
    }

    function renderQuickQuestions(questions) {
        clearQuickArea();
        renderTitle("Quick questions:");

        (questions || []).slice(0, 4).forEach(q => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "miv-chip";
            btn.innerHTML = `<span class="miv-chip-text">${q}</span>`;

            btn.addEventListener("click", () => {
                removeTempMessages();
                input.value = "";

                const newState = { intent, message: q };
                navigateTo(newState);
                updateNavigationButtons();

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
    }

    function ensureFreshStartUI() {
        quickWrap.style.display = "flex";
        renderIntentButtons();
        if (!welcomeShown) {
            addMessage("assistant", WELCOME_MESSAGE, { skipSave: true, isTemp: true });
        }
        updateNavigationButtons();
    }

    /* -----------------------------
       Rendering helpers
       (MERGED: Uses Peter's temp logic + Main's marked.js parser)
    ----------------------------- */
    function addMessage(role, text, opts) {
        const options = opts || {};

        if (options.isTemp) {
            const temps = Array.from(messagesEl.querySelectorAll('[data-temp="1"]'));
            const duplicate = temps.some(el => el.textContent && el.textContent.trim() === String(text || "").trim());
            if (duplicate) return;
        }

        if (!options.skipSave) pushToHistory(role, text);

        if (role === 'user') {
            quickWrap.style.display = "none";
        }

        const wrapper = document.createElement("div");
        wrapper.className = "miv-message miv-message--" + role;
        if (options.isTemp) {
            wrapper.setAttribute("data-temp", "1");
            welcomeShown = true;
        }

        if (role === "assistant") {
            wrapper.setAttribute('role', 'alert');
            wrapper.setAttribute('aria-live', 'assertive');
        }

        /* --- MERGE POINT: Use Main Branch's Marked.js Logic --- */
        if (role === "assistant") {
            const contentDiv = document.createElement("div");
            contentDiv.className = "miv-message-parsed";
            contentDiv.innerHTML = parseMarkdown(text); // Using main's parser
            wrapper.appendChild(contentDiv);
        } else {
            // User messages - simple text
            const p = document.createElement("p");
            p.textContent = text;
            wrapper.appendChild(p);
        }

        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;
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
        chatWindow.style.setProperty('--miv-font-scale', fontScale);
        localStorage.setItem('mivFontScale_' + storageVersion, fontScale);
    }

    // Apply theme based on currentThemeIndex (From Peter's Branch)
    function applyContrast() {
        const theme = contrastThemes[currentThemeIndex];

        // Remove all theme-related classes
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
            // base colours, nothing extra to add
        } else if (theme === "high") {
            chatWindow.classList.add("miv-chat-window--high-contrast");
            highContrast = true;
        } else {
            chatWindow.classList.add(`miv-theme-${theme}`);
        }

        // aria + storage
        contrastToggle.setAttribute("aria-pressed", String(highContrast));
        localStorage.setItem('mivHighContrast_' + storageVersion, String(highContrast));
        localStorage.setItem(THEME_KEY, String(currentThemeIndex));
    }

    /* Reset Accessibility Settings */
    if (resetA11yBtn) {
        resetA11yBtn.addEventListener("click", () => {
            fontScale = 1;
            applyFontScale();

            currentThemeIndex = 0;
            applyContrast();

            a11yPanel.setAttribute("hidden", "true");
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
        ensureFreshStartUI();
    });

    /* -----------------------------
       Chat controls
    ----------------------------- */
    function isChatOpen() {
        return chatWindow.classList.contains("miv-chat-window--open");
    }

    function openChat() {
        chatWindow.classList.add("miv-chat-window--open");
        chatWindow.setAttribute("aria-hidden", "false");
        launcherBtn.style.display = "none";
        a11yPanel.setAttribute("hidden", "true");

        if (!intent && loadHistory().length === 0) {
            ensureFreshStartUI();
        }

        updateNavigationButtons();
        input.focus();
    }

    function closeChat() {
        removeTempMessages();
        chatWindow.classList.remove("miv-chat-window--open");
        chatWindow.setAttribute("aria-hidden", "true");
        a11yPanel.setAttribute("hidden", "true");
        launcherBtn.style.display = "";
    }

    // Close button
    closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeChat();
    });

    async function sendMessage(text, opts = {}) {
        if (!text || isLoading) return;
        isLoading = true;
        quickWrap.style.display = "none";
        addMessage("user", text);
        addTypingIndicator();

        if (!opts.skipNavigate) {
            navigateTo({ intent, message: text });
        }

        try {
            const res = await fetch(backendUrl + "/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: text, top_k: 3 })
            });
            const data = await res.json();
            removeTypingIndicator();
            addMessage("assistant", (data && data.response) || "I couldn’t generate a response just now.");
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

    document.addEventListener("pointerdown", (e) => {
        if (!isChatOpen() || root.contains(e.target)) return;
        closeChat();
    }, true);

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

    backBtn.addEventListener("click", () => {
        if (historyStack.length === 0) return;
        futureStack.push({ ...currentState });
        const prevState = historyStack.pop();
        currentState = prevState;
        renderState(prevState);

        if (!currentState.intent && !currentState.message) {
            quickWrap.style.display = "flex";
        }

        updateNavigationButtons();
    });

    forwardBtn.addEventListener("click", () => {
        if (futureStack.length === 0) return;
        historyStack.push({ ...currentState });
        const nextState = futureStack.pop();
        currentState = nextState;
        renderState(nextState);

        if (currentState.message) {
            quickWrap.style.display = "none";
        }

        updateNavigationButtons();
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        sendMessage(text);
    });

    /* -----------------------------
       Initial load
    ----------------------------- */
    cleanupLegacyOrBadHistory();
    renderHistory();

    updateNavigationButtons();

    if (loadHistory().length === 0) {
        ensureFreshStartUI();
    }

    applyFontScale();
    applyContrast();
})();