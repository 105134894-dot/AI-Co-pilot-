(function () {
  const backendUrl = window.MIV_BACKEND_URL || "http://localhost:8000";

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

  function applyFontScale() {
    chatWindow.style.setProperty("--miv-font-scale", fontScale.toString());
  }

  function applyContrast() {
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
    input.focus();
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.remove("miv-chat-window--open");
    chatWindow.setAttribute("aria-hidden", "true");
    launcherBtn.style.display = "";
  }

  function toggleA11yPanel() {
    const isHidden = a11yPanel.hasAttribute("hidden");
    if (isHidden) {
      a11yPanel.removeAttribute("hidden");
    } else {
      a11yPanel.setAttribute("hidden", "true");
    }
  }

  function addMessage(role, text) {
    const wrapper = document.createElement("div");
    wrapper.className = "miv-message miv-message--" + role;

    text
      .split(/\n{2,}/)
      .map(function (block) { return block.trim(); })
      .filter(function (block) { return block.length > 0; })
      .forEach(function (block) {
        const p = document.createElement("p");
        p.textContent = block;
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

    for (var i = 0; i < 3; i++) {
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
        body: JSON.stringify({ query: text, top_k: 3 }),
      });

      if (!res.ok) {
        throw new Error("Server error: " + res.status);
      }

      const data = await res.json();
      const replyText =
        data.response || "Sorry, I couldn’t generate a response.";
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

  // Initial assistant welcome message
  addMessage(
    "assistant",
    "Hi, I’m the MIV AI Co-Pilot. Ask me anything about accessibility, inclusive ventures, or how to support people with disabilities."
  );

  // Event listeners
  launcherBtn.addEventListener("click", openChat);
  closeBtn.addEventListener("click", closeChat);

  a11yToggle.addEventListener("click", toggleA11yPanel);
  a11yClose.addEventListener("click", function () {
    a11yPanel.setAttribute("hidden", "true");
  });

  fontDec.addEventListener("click", function () {
    fontScale = Math.max(0.9, fontScale - 0.1);
    applyFontScale();
  });
  fontInc.addEventListener("click", function () {
    fontScale = Math.min(1.2, fontScale + 0.1);
    applyFontScale();
  });

  contrastToggle.addEventListener("click", function () {
    highContrast = !highContrast;
    applyContrast();
  });

  // Quick questions
  document
    .querySelectorAll(".miv-chip[data-question]")
    .forEach(function (btn) {
      btn.addEventListener("click", function () {
        const q = btn.getAttribute("data-question");
        if (!q) return;
        input.value = q;
        input.focus();
      });
    });

  // Form submit
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(text);
  });

  // Apply defaults
  applyFontScale();
  applyContrast();
})();
