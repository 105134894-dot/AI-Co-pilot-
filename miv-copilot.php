<?php

/**
 * Plugin Name: MIV AI Co-Pilot
 * Description: Adds the custom AI Accessibility Co-Pilot widget to the footer of the website.
 * Version: 1.0
 * Author: Your Team Name
 */

// Prevent direct access to this file
if (!defined('ABSPATH')) {
    exit;
}

function miv_inject_copilot_widget()
{
?>
    <style>
        /* [ACTION REQUIRED] Paste your full CSS here */
        /* Root container that pins the widget to bottom-right */
        .miv-widget-root {
            position: fixed;
            inset: auto 1.5rem 1.5rem auto;
            z-index: 9999;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
                sans-serif;
        }

        /* Launcher pill */
        .miv-launcher-btn {
            border: none;
            padding: 0;
            background: transparent;
            cursor: pointer;
        }

        .miv-launcher-img {
            display: block;
            max-width: 220px;
            height: auto;
        }

        /* Chat window */
        .miv-chat-window {
            --miv-radius: 18px;
            --miv-bg: #5ba085;
            --miv-header-text: #ffffff;
            --miv-body-bg: #fdfdfd;
            --miv-user-bubble: #ffffff;
            --miv-assistant-bubble: #fdfdfd;
            --miv-assistant-text: #0d3040;
            --miv-input-bg: #ffffff;
            --miv-border-subtle: rgba(0, 0, 0, 0.08);

            width: min(440px, 92vw);
            max-height: 80vh;
            display: none;
            /* hidden by default */
            flex-direction: column;
            border-radius: var(--miv-radius);
            background: var(--miv-bg);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
            overflow: hidden;
            color: #102329;
            font-size: calc(14px * var(--miv-font-scale, 1));
        }

        /* visible state */
        .miv-chat-window.miv-chat-window--open {
            display: flex;
        }

        /* High contrast mode */
        .miv-chat-window--high-contrast {
            --miv-bg: #050505;
            --miv-header-text: #ffffff;
            --miv-body-bg: #000000;
            --miv-user-bubble: #ffffff;
            --miv-assistant-bubble: #000000;
            --miv-assistant-text: #ffffff;
            --miv-input-bg: #111111;
            color: #ffffff;
        }

        /* Header */
        .miv-chat-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.85rem 0.9rem 0.75rem;
            color: var(--miv-header-text);
            position: relative;
        }

        .miv-header-left {
            flex-shrink: 0;
        }

        .miv-logo {
            height: 38px;
            width: auto;
            display: block;
            border-radius: 4px;
        }

        .miv-header-title {
            font-size: 1.1rem;
            font-weight: 600;
            flex: 1;
            text-align: left;
        }

        /* Close + A11y */
        .miv-close-btn,
        .miv-a11y-toggle {
            border: none;
            background: rgba(0, 0, 0, 0.18);
            color: #ffffff;
            width: 26px;
            height: 26px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            margin-left: 0.3rem;
        }

        .miv-close-btn:hover,
        .miv-a11y-toggle:hover {
            background: rgba(0, 0, 0, 0.32);
        }

        /* Accessibility panel */
        .miv-a11y-panel {
            position: absolute;
            top: 54px;
            right: 10px;
            background: var(--miv-body-bg);
            color: inherit;
            border-radius: 10px;
            padding: 0.75rem 0.9rem;
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
            width: 210px;
            font-size: 0.82rem;
            border: 1px solid var(--miv-border-subtle);
            z-index: 5;
        }

        .miv-a11y-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 600;
            margin-bottom: 0.35rem;
        }

        .miv-a11y-close {
            border: none;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-size: 1rem;
        }

        .miv-a11y-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 0.35rem;
        }

        .miv-a11y-label {
            flex: 1;
        }

        .miv-a11y-controls {
            display: flex;
            gap: 0.25rem;
        }

        .miv-a11y-btn {
            border-radius: 999px;
            border: 1px solid var(--miv-border-subtle);
            padding: 0.15rem 0.4rem;
            background: #ffffff;
            cursor: pointer;
            font-size: 0.78rem;
        }

        .miv-chat-window--high-contrast .miv-a11y-btn {
            background: #111111;
            color: #ffffff;
        }

        .miv-a11y-btn--full {
            width: 100%;
            text-align: center;
        }

        /* Quick questions */
        .miv-quick-questions {
            background: var(--miv-bg);
            padding: 0 0.9rem 0.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.35rem;
        }

        .miv-chip {
            border-radius: 999px;
            border: none;
            background: rgba(255, 255, 255, 0.92);
            padding: 0.3rem 0.75rem;
            font-size: 0.78rem;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            cursor: pointer;
            text-align: left;
            color: #0d3040;
        }

        .miv-chat-window--high-contrast .miv-chip {
            background: #ffffff;
            color: #111111;
        }

        .miv-chip-icon {
            flex-shrink: 0;
        }

        .miv-chip-text {
            line-height: 1.25;
        }

        /* Messages area */
        .miv-messages {
            background: var(--miv-body-bg);
            padding: 0.8rem 1rem;
            flex: 1;
            overflow-y: auto;
        }

        /* ChatGPT-like blocks (no strong bubbles) */
        .miv-message {
            max-width: 100%;
            margin-bottom: 0.6rem;
            font-size: 0.86rem;
            line-height: 1.5;
        }

        .miv-message--assistant {
            color: var(--miv-assistant-text);
        }

        .miv-message--user {
            font-weight: 500;
        }

        /* Typing indicator */
        .miv-message--typing {
            display: inline-flex;
            gap: 0.2rem;
        }

        .miv-dot {
            width: 4px;
            height: 4px;
            border-radius: 999px;
            background: var(--miv-assistant-text);
            animation: miv-bounce 0.9s infinite ease-in-out;
        }

        .miv-dot:nth-child(2) {
            animation-delay: 0.15s;
        }

        .miv-dot:nth-child(3) {
            animation-delay: 0.3s;
        }

        @keyframes miv-bounce {

            0%,
            80%,
            100% {
                transform: translateY(0);
                opacity: 0.5;
            }

            40% {
                transform: translateY(-3px);
                opacity: 1;
            }
        }

        /* Input row */
        .miv-input-row {
            background: var(--miv-input-bg);
            padding: 0.55rem 0.9rem 0.7rem;
            border-top: 1px solid var(--miv-border-subtle);
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }

        .miv-input {
            flex: 1;
            border-radius: 999px;
            border: 1px solid var(--miv-border-subtle);
            padding: 0.4rem 0.75rem;
            font-size: 0.82rem;
            background: inherit;
            color: inherit;
        }

        .miv-input:focus {
            outline: 2px solid #ffffff;
            outline-offset: 1px;
        }

        .miv-send-btn {
            border-radius: 999px;
            border: none;
            background: #0e5c82;
            color: #ffffff;
            padding: 0.4rem 0.8rem;
            font-size: 0.8rem;
            cursor: pointer;
        }

        .miv-send-btn:disabled {
            opacity: 0.6;
            cursor: default;
        }

        /* Screen-reader only text */
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        /* Small screens */
        @media (max-width: 600px) {
            .miv-widget-root {
                inset: auto 0.75rem 0.75rem auto;
            }

            .miv-chat-window {
                width: min(100vw - 1.5rem, 420px);
                max-height: 85vh;
            }
        }

        .miv-widget-root {
            font-family: sans-serif;
        }
    </style>

    <div class="miv-widget-root" id="miv-widget-root">
        <button class="miv-launcher-btn" id="miv-launcher-btn" aria-label="Open MIV AI Co-Pilot">
            <img src="https://via.placeholder.com/50" alt="MIV AI Co-Pilot" class="miv-launcher-img" />
        </button>

        <div class="miv-chat-window" id="miv-chat-window" role="dialog" aria-modal="true" aria-hidden="true">
            <header class="miv-chat-header">
                <div class="miv-header-title">AI Co-Pilot</div>
                <button class="miv-a11y-toggle" id="miv-a11y-toggle">♿</button>
                <button class="miv-close-btn" id="miv-close-btn">×</button>
            </header>

            <section class="miv-a11y-panel" id="miv-a11y-panel" hidden>
                <div class="miv-a11y-panel-header">
                    <span>Accessibility Settings</span>
                    <button class="miv-a11y-close" id="miv-a11y-close">×</button>
                </div>
                <div class="miv-a11y-row">
                    <span>Font size</span>
                    <div class="miv-a11y-controls">
                        <button type="button" class="miv-a11y-btn" id="miv-font-dec">A-</button>
                        <button type="button" class="miv-a11y-btn" id="miv-font-inc">A+</button>
                    </div>
                </div>
                <div class="miv-a11y-row">
                    <span>Contrast</span>
                    <button type="button" class="miv-a11y-btn" id="miv-contrast-toggle">Toggle Contrast</button>
                </div>
            </section>

            <section class="miv-messages" id="miv-messages"></section>

            <form class="miv-input-row" id="miv-form">
                <input id="miv-user-input" type="text" class="miv-input" placeholder="Ask me anything" />
                <button type="submit" class="miv-send-btn" id="miv-send-btn">Send</button>
            </form>
        </div>
    </div>

    <script>
        (function() {
            // CONFIGURATION: Point this to your Python Backend
            // Use 'http://localhost:8000' for local testing
            // Use 'https://your-app.onrender.com' for the final client zip
            window.MIV_BACKEND_URL = "http://localhost:8000";

            // [ACTION REQUIRED] Paste the rest of your miv-widget.js code below this line:

            (function() {
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
                        .map(function(block) {
                            return block.trim();
                        })
                        .filter(function(block) {
                            return block.length > 0;
                        })
                        .forEach(function(block) {
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
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                query: text,
                                top_k: 3
                            }),
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
                a11yClose.addEventListener("click", function() {
                    a11yPanel.setAttribute("hidden", "true");
                });

                fontDec.addEventListener("click", function() {
                    fontScale = Math.max(0.9, fontScale - 0.1);
                    applyFontScale();
                });
                fontInc.addEventListener("click", function() {
                    fontScale = Math.min(1.2, fontScale + 0.1);
                    applyFontScale();
                });

                contrastToggle.addEventListener("click", function() {
                    highContrast = !highContrast;
                    applyContrast();
                });

                // Quick questions
                document
                    .querySelectorAll(".miv-chip[data-question]")
                    .forEach(function(btn) {
                        btn.addEventListener("click", function() {
                            const q = btn.getAttribute("data-question");
                            if (!q) return;
                            input.value = q;
                            input.focus();
                        });
                    });

                // Form submit
                form.addEventListener("submit", function(e) {
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


        })();
    </script>
<?php
}

// Inject this into the footer of every page
add_action('wp_footer', 'miv_inject_copilot_widget');
?>