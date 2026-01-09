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
        if (el) el.innerHTML = msg || ""; // Changed to innerHTML to allow styling (colors)
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

    // --- NEW UPLOAD LOGIC ---
    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            setStatus("Please choose a file first.");
            return;
        }

        const progressWrap = getProgressWrap();
        const progressBar = getProgressBar();

        // 1. Reset UI & Start "Fake" Loading Message
        if (progressWrap) progressWrap.style.display = "block";
        if (progressBar) progressBar.style.width = "0%";
        setStatus("Uploading & Processing... (This may take a minute)");

        if (btn) btn.disabled = true;

        // 2. Start the Fake Progress Timer
        // We want to reach approx 95% in 80 seconds (80000ms)
        let currentProgress = 0;
        const maxFakeProgress = 95; // Don't hit 100% until it's actually done
        const duration = 80000;
        const intervalTime = 500; // Update every half second
        const increment = maxFakeProgress / (duration / intervalTime);

        const progressInterval = setInterval(() => {
            currentProgress += increment;

            // Cap it at 95%
            if (currentProgress >= maxFakeProgress) {
                currentProgress = maxFakeProgress;
            }

            if (progressBar) {
                progressBar.style.width = Math.round(currentProgress) + "%";
            }
        }, intervalTime);

        // 3. Prepare the Real Request
        const fd = new FormData();
        fd.append("action", "miv_kb_upload");
        fd.append("nonce", MIV_ADMIN.nonce);
        fd.append("miv_kb_file", file);

        try {
            // 4. Send Request (we ignore real network progress now)
            const res = await fetch(MIV_ADMIN.ajaxUrl, {
                method: "POST",
                body: fd
            });

            // Parse response
            // (Note: WordPress AJAX success usually returns HTTP 200 even on logical errors, so we check data.success)
            const data = await res.json();

            // STOP the fake timer immediately
            clearInterval(progressInterval);

            if (data.success) {
                // 5. Success! Snap to 100%
                if (progressBar) progressBar.style.width = "100%";
                setStatus('<span style="color:green;">Upload complete ✅</span>');

                // Clear the input
                fileInput.value = "";

                // Refresh the file list
                await refreshList();
            } else {
                // Backend logical error
                setStatus('<span style="color:red;">' + (data.data?.message || "Upload failed.") + '</span>');
                if (progressBar) progressBar.style.width = "0%";
            }

        } catch (err) {
            // Network or Parsing error
            clearInterval(progressInterval);
            console.error(err);
            setStatus('<span style="color:red;">Upload failed due to a network error.</span>');
            if (progressBar) progressBar.style.width = "0%";
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // Initial Load
    refreshList();
})();