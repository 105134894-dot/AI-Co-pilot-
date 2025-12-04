// src/App.jsx
import { useState } from "react";
import "./App.css";
import mivLogo from "./assets/miv-logo.jpg";
import mivButton from "./assets/miv-button.png";

function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi, I’m the MIV AI Co-Pilot. I can help you understand MIV’s work, impact frameworks, and how to complete the venture form.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fontScale, setFontScale] = useState(1); // accessibility: font size

  const toggleWidget = () => {
    setIsOpen((open) => !open);
  };

  const handleFontSmaller = () => {
    setFontScale((s) => Math.max(0.9, s - 0.1));
  };

  const handleFontLarger = () => {
    setFontScale((s) => Math.min(1.3, s + 0.1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, top_k: 3 }),
      });

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status}`);
      }

      const data = await res.json();
      const assistantMessage = {
        role: "assistant",
        content: data.response ?? "I’m here, but I couldn’t read that response.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I couldn’t reach the Co-Pilot service just now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="miv-widget-root">
      {/* Floating launcher button */}
      {!isOpen && (
        <button
          className="miv-launcher"
          onClick={toggleWidget}
          aria-label="Open MIV AI Co-Pilot"
        >
          <img
            src={mivButton}
            alt="MIV AI Co-Pilot"
            className="miv-launcher-image"
          />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <section
          className="miv-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="miv-chat-title"
        >
          {/* Header */}
          <header className="miv-chat-header">
            <div className="miv-header-left">
              <img
                src={mivLogo}
                alt="Mekong Inclusive Ventures logo"
                className="miv-logo"
              />
              <div className="miv-title-block">
                <h2 id="miv-chat-title">AI Co-Pilot</h2>
                <p className="miv-subtitle">Guidance for ventures & impact</p>
              </div>
            </div>

            <div className="miv-header-actions">
              <div className="miv-font-controls" aria-label="Font size controls">
                <button
                  type="button"
                  onClick={handleFontSmaller}
                  className="miv-icon-button"
                  aria-label="Decrease font size"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={handleFontLarger}
                  className="miv-icon-button"
                  aria-label="Increase font size"
                >
                  A+
                </button>
              </div>

              <button
                type="button"
                className="miv-close-button"
                onClick={toggleWidget}
                aria-label="Close MIV AI Co-Pilot"
              >
                ×
              </button>
            </div>
          </header>

          {/* Body */}
          <div
            className="miv-chat-body"
            style={{ fontSize: `${fontScale}rem` }}
          >
            <ul className="miv-message-list">
              {messages.map((msg, idx) => (
                <li
                  key={idx}
                  className={`miv-message miv-message-${msg.role}`}
                >
                  <p>{msg.content}</p>
                </li>
              ))}
              {isLoading && (
                <li className="miv-message miv-message-assistant miv-message-typing">
                  <p>MIV Co-Pilot is thinking…</p>
                </li>
              )}
            </ul>
          </div>

          {/* Input */}
          <form className="miv-chat-input-row" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="miv-user-input">
              Ask the MIV AI Co-Pilot a question
            </label>
            <input
              id="miv-user-input"
              className="miv-chat-input"
              type="text"
              placeholder="Ask me anything about MIV’s venture form, SDGs, or impact…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="miv-send-button"
              disabled={isLoading || !input.trim()}
            >
              Send
            </button>
          </form>

          {/* Footer helper text */}
          <div className="miv-footer-hint">
            <p>
              Tip: Try asking “How do I map my venture to SDG targets?” or “What
              does the GDEC Climate Outcomes area mean?”
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
