import { useState } from "react";
import "./MIVWidget.css";
import mivButton from "../assets/miv-button.png";
import mivLogo from "../assets/miv-logo.jpg";

export default function MIVWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;
    setLoading(true);

    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: input, top_k: 3 })
    });

    const data = await res.json();
    setResponse(data.response);
    setLoading(false);
  };

  return (
    <>
      {/* Floating Button */}
      <div id="miv-button" onClick={() => setOpen(true)}>
        <img src={mivButton} alt="MIV AI Co-Pilot" />
      </div>

      {/* Overlay */}
      {open && (
        <div id="miv-overlay" onClick={(e) => e.target.id === "miv-overlay" && setOpen(false)}>
          <div id="miv-content">
            <div className="miv-header">
              <img src={mivLogo} alt="MiV Logo" />
              <h2>MIV AI Co-Pilot</h2>
            </div>

            <ul className="miv-questions">
              <li>How do I make sure my online forms are accessible?</li>
              <li>What tools can help someone with low vision?</li>
              <li>How do I make my event more accessible?</li>
              <li>Can you help me find tools for hearing impairments?</li>
            </ul>

            {response && (
              <div className="miv-response">
                <p>{response}</p>
              </div>
            )}

            <div className="miv-input">
              <input
                type="text"
                placeholder="Ask me anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button onClick={sendMessage}>
                {loading ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
