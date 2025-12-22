(function () {
  const cfg = window.MIV_WIDGET_CONFIG || {};
  const backendUrl = cfg.backendUrl;

  // ✅ changes every plugin upload (we’ll set it in PHP)
  const storageVersion = String(cfg.storageVersion || "v1");

  if (!backendUrl) {
    console.error("MIV backendUrl not provided");
    return;
  }

  // Load saved settings with version key — persistence across updates
  let fontScale = parseFloat(localStorage.getItem('mivFontScale_' + storageVersion) || '1');
  let highContrast = localStorage.getItem('mivHighContrast_' + storageVersion) === 'true';
  let isLoading = false;

  // Intent state
  let intent = null;

  const WELCOME_MESSAGE =
    "Ask me anything about accessibility, inclusive ventures, or supporting people with disabilities.";

  // Keep your original 4 quick questions
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

  const messagesEl = document.getElementById("miv-messages");
  const form = document.getElementById("miv-form");
  const input = document.getElementById("miv-user-input");

  /* -----------------------------
     Chat history (localStorage)
  ----------------------------- */
  const MAX_MESSAGES = 60;
  const STORAGE_KEY = `miv_copilot_chat_history_${storageVersion}`;
  const LEGACY_KEY = "miv_copilot_chat_history_v1"; // old key you used earlier

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
    } catch {}
  }

  function pushToHistory(role, text) {
    const history = loadHistory();
    history.push({
      role,
      text: String(text || ""),
      ts: Date.now()
    });
    saveHistory(history);
  }

  // Prevent old “Chat cleared…” leftovers from older builds
  function cleanupLegacyOrBadHistory() {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch {}

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
  }

  /* -----------------------------
     Quick Questions UI (dynamic)
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

  // ✅ remove temp “system” messages from UI
  function removeTempMessages() {
    const temps = messagesEl.querySelectorAll('[data-temp="1"]');
    temps.forEach(el => el.remove());
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

        intent = cat.key;

        addMessage(
          "assistant",
          `Got it — ${cat.label}. Pick a quick question below, or type your own.`,
          { skipSave: true, isTemp: true }
        );

        renderQuickQuestions(PROMPTS_BY_INTENT[intent] || QUICK_QUESTIONS);
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
        sendMessage(q);
      });

      quickWrap.appendChild(btn);
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "miv-chip miv-chip--secondary";
    reset.innerHTML = `<span class="miv-chip-text">Change topic</span>`;
    reset.addEventListener("click", () => {
      intent = null;
      removeTempMessages();
      renderIntentButtons();
      addMessage("assistant", WELCOME_MESSAGE, { skipSave: true, isTemp: true });
    });
    quickWrap.appendChild(reset);
  }

  function ensureFreshStartUI() {
    quickWrap.style.display = "flex";
    renderIntentButtons();

    addMessage("assistant", WELCOME_MESSAGE, { skipSave: true, isTemp: true });
  }

  /* -----------------------------
     Rendering helpers
  ----------------------------- */
  function addMessage(role, text, opts) {
    const options = opts || {};
    if (!options.skipSave) pushToHistory(role, text);

    const wrapper = document.createElement("div");
    wrapper.className = "miv-message miv-message--" + role;

    if (options.isTemp) wrapper.setAttribute("data-temp", "1");

    // ARIA for assistant messages — screen readers announce new responses
    if (role === "assistant") {
      wrapper.setAttribute('role', 'alert');
      wrapper.setAttribute('aria-live', 'assertive');
    }

    const lines = (text || "")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    let listEl = null;

    lines.forEach(line => {
      if (line.startsWith("## ")) {
        const h = document.createElement("h4");
        h.textContent = line.replace(/^##\s*/, "");
        wrapper.appendChild(h);
        listEl = null;
        return;
      }

      if (line.startsWith("### ")) {
        const h = document.createElement("h5");
        h.textContent = line.replace(/^###\s*/, "");
        wrapper.appendChild(h);
        listEl = null;
        return;
      }

      if (line.startsWith("- ") || line.startsWith("• ")) {
        if (!listEl || listEl.tagName !== "UL") {
          listEl = document.createElement("ul");
          wrapper.appendChild(listEl);
        }
        const li = document.createElement("li");
        li.textContent = line.replace(/^[-•]\s*/, "");
        listEl.appendChild(li);
        return;
      }

      if (/^\d+\.\s+/.test(line)) {
        if (!listEl || listEl.tagName !== "OL") {
          listEl = document.createElement("ol");
          wrapper.appendChild(listEl);
        }
        const li = document.createElement("li");
        li.textContent = line.replace(/^\d+\.\s+/, "");
        listEl.appendChild(li);
        return;
      }

      listEl = null;
      const p = document.createElement("p");
      p.textContent = line;
      wrapper.appendChild(p);
    });

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addTypingIndicator() {
    const wrapper = document.createElement("div");
    wrapper.className =
      "miv-message miv-message--assistant miv-message--typing";
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
     Accessibility controls — FIXED font resize
  ----------------------------- */
  function applyFontScale() {
    chatWindow.style.setProperty('--miv-font-scale', fontScale);
    localStorage.setItem('mivFontScale_' + storageVersion, fontScale);
  }

  function applyContrast() {
    chatWindow.classList.toggle("miv-chat-window--high-contrast", highContrast);
    contrastToggle.setAttribute("aria-pressed", highContrast);
    localStorage.setItem('mivHighContrast_' + storageVersion, highContrast);
  }

  // ✅ Clear chat: resets to fresh start WITHOUT saving any “cleared” message
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "miv-a11y-btn miv-a11y-btn--full";
  clearBtn.textContent = "Clear chat history";
  clearBtn.addEventListener("click", () => {
    clearHistory();
    messagesEl.innerHTML = "";
    intent = null;
    isLoading = false;
    removeTypingIndicator();

    ensureFreshStartUI();
  });
  a11yPanel.appendChild(clearBtn);

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

    if (loadHistory().length === 0 && messagesEl.children.length === 0) {
      ensureFreshStartUI();
    }

    input.focus();
  }

  function closeChat() {
    chatWindow.classList.remove("miv-chat-window--open");
    chatWindow.setAttribute("aria-hidden", "true");
    a11yPanel.setAttribute("hidden", "true");
    launcherBtn.style.display = "";
  }

  async function sendMessage(text) {
    if (!text || isLoading) return;
    isLoading = true;

    quickWrap.style.display = "none";

    addMessage("user", text);
    addTypingIndicator();

    try {
      const res = await fetch(backendUrl + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, top_k: 3 })
      });

      const data = await res.json();
      removeTypingIndicator();
      addMessage(
        "assistant",
        (data && data.response) || "I couldn’t generate a response just now."
      );
    } catch (err) {
      console.error(err);
      removeTypingIndicator();
      addMessage("assistant", "I ran into a technical issue talking to the server.");
    } finally {
      isLoading = false;
    }
  }

  /* -----------------------------
     Event listeners
  ----------------------------- */
  launcherBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openChat();
  });

  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    closeChat();
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!isChatOpen()) return;
      if (root.contains(e.target)) return;
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

  // Font resize buttons — NOW WORKING with persistence
  fontDec.addEventListener("click", () => {
    fontScale = Math.max(0.8, fontScale - 0.1);
    applyFontScale();
  });

  fontInc.addEventListener("click", () => {
    fontScale = Math.min(1.6, fontScale + 0.1);
    applyFontScale();
  });

  contrastToggle.addEventListener("click", () => {
    highContrast = !highContrast;
    applyContrast();
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

  if (loadHistory().length === 0) {
    ensureFreshStartUI();
  }

  applyFontScale();
  applyContrast();
})();