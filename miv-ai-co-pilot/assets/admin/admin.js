(function () {
    const form = document.getElementById("miv-kb-upload-form");
    // If the form doesn't exist (e.g., wrong tab), exit immediately
    if (!form) return;

    const fileInput = document.getElementById("miv_kb_file");
    const btn = document.getElementById("miv-kb-upload-btn");

    // Safe getters for DOM elements that might throw null errors if accessed too early
    const getProgressWrap = () => document.getElementById("miv-progress-wrap");
    const getProgressBar = () => document.getElementById("miv-progress-bar");
    const getStatusEl = () => document.getElementById("miv-status");
    const getTableBody = () => document.getElementById("miv-kb-files-tbody");

    function setStatus(msg) {
        const el = getStatusEl();
        if (el) el.textContent = msg || "";
    }

    function resetProgress() {
        const bar = getProgressBar();
        const wrap = getProgressWrap();
        if (bar) bar.style.width = "0%";
        if (wrap) wrap.style.display = "none";
    }

    async function refreshList() {
        // Ensure table body exists before trying to populate it
        const tableBody = getTableBody();
        if (!tableBody) return;

        // Show loading state
        tableBody.innerHTML = `
            <tr>
                <td colspan="2" style="text-align: center; padding: 40px;">
                    <div class="miv-loader"></div>
                    <div style="margin-top: 16px; color: #6C757D;">Loading files...</div>
                </td>
            </tr>
        `;

        const fd = new FormData();
        fd.append("action", "miv_kb_list");
        fd.append("nonce", MIV_ADMIN.nonce);

        try {
            const res = await fetch(MIV_ADMIN.ajaxUrl, { method: "POST", body: fd });
            const data = await res.json();

            if (!data.success) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="2" style="text-align: center; padding: 40px; color: #DC3545;">
                            Unable to load files. Please try again.
                        </td>
                    </tr>
                `;
                return;
            }

            const files = data.data.files || [];

            if (files.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="2" style="text-align: center; padding: 40px; color: #6C757D;">
                            No files uploaded yet. Upload your first document above.
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = "";
            files.forEach((f) => {
                const tr = document.createElement("tr");

                const tdName = document.createElement("td");
                tdName.innerHTML = `<span class="miv-file-pill">${escapeHtml(f.filename)}</span>`;

                const tdDate = document.createElement("td");
                tdDate.textContent = f.uploaded || "";

                tr.appendChild(tdName);
                tr.appendChild(tdDate);
                tableBody.appendChild(tr);
            });
        } catch (e) {
            console.warn("Could not load file list", e);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="2" style="text-align: center; padding: 40px; color: #DC3545;">
                        Error loading files. Please check console for details.
                    </td>
                </tr>
            `;
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();

        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            setStatus("Please choose a file first.");
            return;
        }

        const progressWrap = getProgressWrap();
        const progressBar = getProgressBar();

        setStatus("Uploading…");

        // Safety check: ensure elements exist before accessing .style
        if (progressWrap) progressWrap.style.display = "block";
        if (progressBar) progressBar.style.width = "0%";

        if (btn) btn.disabled = true;

        const fd = new FormData();
        fd.append("action", "miv_kb_upload");
        fd.append("nonce", MIV_ADMIN.nonce);
        fd.append("miv_kb_file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", MIV_ADMIN.ajaxUrl, true);

        xhr.upload.addEventListener("progress", function (evt) {
            if (!evt.lengthComputable) return;
            const pct = Math.round((evt.loaded / evt.total) * 100);

            // Check again inside the event callback
            const bar = getProgressBar();
            if (bar) bar.style.width = pct + "%";

            setStatus(`Uploading… ${pct}%`);
        });

        xhr.onload = async function () {
            if (btn) btn.disabled = false;

            try {
                const data = JSON.parse(xhr.responseText || "{}");
                if (!data.success) {
                    setStatus(data.data?.message || "Upload failed.");
                    return;
                }

                setStatus("Upload complete ✅");
                const bar = getProgressBar();
                if (bar) bar.style.width = "100%";

                await refreshList();

                fileInput.value = "";
            } catch (err) {
                console.error(err);
                setStatus("Upload finished, but response could not be read.");
            }
        };

        xhr.onerror = function () {
            if (btn) btn.disabled = false;
            setStatus("Upload failed due to a network error.");
            resetProgress();
        };

        xhr.send(fd);
    });

    refreshList();
})();