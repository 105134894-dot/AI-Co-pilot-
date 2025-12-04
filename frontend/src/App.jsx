// src/App.jsx
import { useState } from "react";
import "./App.css";

import mivLogo from "./assets/miv-logo.jpg";
import mivButton from "./assets/miv-button.png";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

const QUICK_QUESTIONS = [
  "How do I make sure my online forms are accessible?",
  "What tools can help someone with low vision use my digital content more easily?",
  "How do I make my event more accessible for people with different disabilities?",
  "Can you help me find tools to support people with hearing impairments?"
];

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      text: "Hi, I’m the MIV AI Co-Pilot. Ask me anything about accessibility, inclusive ventures, or how to support people with disabilities."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [showA11yPanel, setShowA11yPanel] = useState(false);
  const [fontScale, setFontScale] = useState(1); // 0.9–1.2 range
  const [highContrast, setHighContrast] = useState(false);

  const handleToggleOpen = () => setIsOpen((prev) => !prev);

  const handleQuickQuestion = (question) => {
    setInput(question);
    // Optionally auto-send; for now just fill the box
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      text: trimmed
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, top_k: 3 })
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();
      const replyText = data.response || "Sorry, I couldn’t generate a response.";

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: replyText
        }
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          role: "assistant",
          text:
            "I ran into a technical issue talking to the server. Please try again in a moment."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const decreaseFont = () => setFontScale((v) => Math.max(0.9, v - 0.1));
  const increaseFont = () => setFontScale((v) => Math.min(1.2, v + 0.1));

  return (
    <div className="miv-widget-root">
      {/* Floating launcher button */}
      {!isOpen && (
        <button
          className="miv-launcher-btn"
          onClick={handleToggleOpen}
          aria-label="Open MIV AI Co-Pilot"
        >
          <img
            src={mivButton}
            alt="MIV AI Co-Pilot"
            className="miv-launcher-img"
          />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div
          className={`miv-chat-window ${
            highContrast ? "miv-chat-window--high-contrast" : ""
          }`}
          style={{ "--miv-font-scale": fontScale }}
          role="dialog"
          aria-modal="true"
          aria-label="MIV AI Co-Pilot chat"
        >
          {/* Header */}
          <header className="miv-chat-header">
            <div className="miv-header-left">
              <img
                src={mivLogo}
                alt="Mekong Inclusive Ventures"
                className="miv-logo"
              />
            </div>
            <div className="miv-header-title">AI Co-Pilot</div>

            <button
              className="miv-a11y-toggle"
              onClick={() => setShowA11yPanel((v) => !v)}
              aria-label="Accessibility settings"
            >
              <span aria-hidden="true">♿</span>
            </button>

            <button
              className="miv-close-btn"
              onClick={handleToggleOpen}
              aria-label="Close MIV AI Co-Pilot"
            >
              ×
            </button>
          </header>

          {/* Accessibility panel */}
          {showA11yPanel && (
            <section
              className="miv-a11y-panel"
              aria-label="Accessibility settings"
            >
              <div className="miv-a11y-panel-header">
                <span>Accessibility Settings</span>
                <button
                  className="miv-a11y-close"
                  onClick={() => setShowA11yPanel(false)}
                  aria-label="Close accessibility settings"
                >
                  ×
                </button>
              </div>

              <div className="miv-a11y-row">
                <span className="miv-a11y-label">Font size</span>
                <div className="miv-a11y-controls">
                  <button
                    type="button"
                    onClick={decreaseFont}
                    className="miv-a11y-btn"
                    aria-label="Decrease font size"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={increaseFont}
                    className="miv-a11y-btn"
                    aria-label="Increase font size"
                  >
                    A+
                  </button>
                </div>
              </div>

              <div className="miv-a11y-row">
                <span className="miv-a11y-label">Contrast</span>
                <button
                  type="button"
                  onClick={() => setHighContrast((v) => !v)}
                  className="miv-a11y-btn miv-a11y-btn--full"
                  aria-pressed={highContrast}
                >
                  {highContrast ? "Disable high contrast" : "Enable high contrast"}
                </button>
              </div>
            </section>
          )}

          {/* Quick questions */}
          <section className="miv-quick-questions" aria-label="Suggested questions">
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                className="miv-chip"
                type="button"
                onClick={() => handleQuickQuestion(q)}
              >
                <span className="miv-chip-icon" aria-hidden="true">
                  ❇
                </span>
                <span className="miv-chip-text">{q}</span>
              </button>
            ))}
          </section>

          {/* Messages */}
          <section className="miv-messages" aria-live="polite">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`miv-message miv-message--${msg.role}`}
              >
                <p>{msg.text}</p>
              </div>
            ))}
            {isLoading && (
              <div className="miv-message miv-message--assistant miv-message--typing">
                <span className="miv-dot" />
                <span className="miv-dot" />
                <span className="miv-dot" />
              </div>
            )}
          </section>

          {/* Input area */}
          <form className="miv-input-row" onSubmit={handleSend}>
            <label className="sr-only" htmlFor="miv-user-input">
              Ask the MIV AI Co-Pilot a question
            </label>
            <input
              id="miv-user-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything"
              className="miv-input"
            />
            <button
              type="submit"
              className="miv-send-btn"
              disabled={isLoading || !input.trim()}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
