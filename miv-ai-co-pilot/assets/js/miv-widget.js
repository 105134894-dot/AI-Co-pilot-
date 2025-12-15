(function () {
  // Get backend URL from WP config, or fallback
  const backendUrl =
    (window.MIV_WIDGET_CONFIG && window.MIV_WIDGET_CONFIG.backendUrl) ||
    window.MIV_BACKEND_URL ||
    "http://localhost:8000";

  let fontScale = 1;
  let highContrast = false;
  let isOpen = false;
  let isLoading = false;

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

  if (!launcherBtn || !chatWindow || !closeBtn || !messagesEl || !form || !input) {
    console.warn("[MIV] Missing expected widget elements.");
    return;
  }

  const QUICK_QUESTIONS = [
    "How do I make sure my online forms are accessible?",
    "What tools can help someone with low vision use my digital content more easily?",
    "How do I make my event more accessible for people with different disabilities?",
    "Can you help me find tools to support people with hearing impairments?"
  ];

  // ----------------------------
  // Helpers
  // ----------------------------
  function applyFontScale() {
    chatWindow.style.setProperty("--miv-font-scale", fontScale.toString());
  }

  function applyContrast() {
    if (!contrastToggle) return;

    if (highContrast) {
      chatWindow.classList.add("miv-chat-window--high-contrast");
      contrastToggle.textContent = "Disable high contrast";
      contrastToggle.setAttribute("aria-pressed", "true");
    } else {
      chatWindow.classList.remove("miv-chat-window--high-contrast");
      contrastToggle.textContent = "Enable high contrast";
      contrastToggle.setAttribute("aria-pressed", "false");
    }
  }

  function openChat() {
    isOpen = true;
    chatWindow.classList.add("miv-chat-window--open");
    chatWindow.setAttribute("aria-hidden", "false");
    launcherBtn.style.display = "none";

    // close on click outside
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscKey);

    // focus input after paint
    setTimeout(() => input.focus(), 0);
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.remove("miv-chat-window--open");
    chatWindow.setAttribute("aria-hidden", "true");
    launcherBtn.style.display = "";

    document.removeEventListener("mousedown", handleOutsideClick);
    document.removeEventListener("keydown", handleEscKey);

    // also close a11y panel when closing chat (cleaner UX)
    if (a11yPanel) a11yPanel.setAttribute("hidden", "true");
  }

  function handleOutsideClick(e) {
    if (!isOpen) return;

    // ignore clicks inside chat window OR on launcher button
    if (chatWindow.contains(e.target) || launcherBtn.contains(e.target)) return;

    closeChat();
  }

  function handleEscKey(e) {
    if (!isOpen) return;
    if (e.key === "Escape") closeChat();
  }

  function toggleA11yPanel() {
    if (!a11yPanel) return;
    const isHidden = a11yPanel.hasAttribute("hidden");
    if (isHidden) a11yPanel.removeAttribute("hidden");
    else a11yPanel.setAttribute("hidden", "true");
  }

  function addMessage(role, text) {
    const wrapper = document.createElement("div");
    wrapper.className = "miv-message miv-message--" + role;

    (text || "")
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .forEach((block) => {
        const p = document.createElement("p");
        p.textContent = block;
        wrapper.appendChild(p);
      });

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
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  async function sendMessage(text) {
    if (!text || isLoading) return;
    isLoading = true;

    addMessage("user", text);
    addTypingIndicator();

    try {
      const res = await fetch(backendUrl + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, top_k: 3 })
      });

      if (!res.ok) throw new Error("Server error: " + res.status);

      const data = await res.json();
      const replyText = data.response || "Sorry, I couldn’t generate a response.";

      removeTypingIndicator();
      addMessage("assistant", replyText);
    } catch (err) {
      console.error(err);
      removeTypingIndicator();
      addMessage(
        "assistant",
        "I ran into a technical issue talking to the server. Please try again in a moment."
      );
    } finally {
      isLoading = false;
    }
  }

  // ----------------------------
  // Quick Questions UI (auto render)
  // ----------------------------
  function ensureQuickQuestionsUI() {
    // Only add once
    if (document.getElementById("miv-quick-questions")) return;

    const qqWrap = document.createElement("section");
    qqWrap.className = "miv-quick-questions";
    qqWrap.id = "miv-quick-questions";

    QUICK_QUESTIONS.forEach((q) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "miv-chip";
      btn.setAttribute("data-question", q);

      // simple chip text (CSS handles it)
      const span = document.createElement("span");
      span.className = "miv-chip-text";
      span.textContent = q;

      btn.appendChild(span);

      btn.addEventListener("click", function () {
        input.value = q;
        input.focus();
      });

      qqWrap.appendChild(btn);
    });

    // Insert quick questions just before messages section
    messagesEl.parentNode.insertBefore(qqWrap, messagesEl);
  }

  // ----------------------------
  // Init
  // ----------------------------
  ensureQuickQuestionsUI();

  addMessage(
    "assistant",
    "Hi, I’m the MIV AI Co-Pilot. Ask me anything about accessibility, inclusive ventures, or how to support people with disabilities."
  );

  // Events
  launcherBtn.addEventListener("click", openChat);
  closeBtn.addEventListener("click", closeChat);

  if (a11yToggle) a11yToggle.addEventListener("click", toggleA11yPanel);
  if (a11yClose) {
    a11yClose.addEventListener("click", function () {
      if (a11yPanel) a11yPanel.setAttribute("hidden", "true");
    });
  }

  if (fontDec) {
    fontDec.addEventListener("click", function () {
      fontScale = Math.max(0.9, +(fontScale - 0.1).toFixed(2));
      applyFontScale();
    });
  }

  if (fontInc) {
    fontInc.addEventListener("click", function () {
      fontScale = Math.min(1.2, +(fontScale + 0.1).toFixed(2));
      applyFontScale();
    });
  }

  if (contrastToggle) {
    contrastToggle.addEventListener("click", function () {
      highContrast = !highContrast;
      applyContrast();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(text);
  });

  // Defaults
  applyFontScale();
  applyContrast();
})();
