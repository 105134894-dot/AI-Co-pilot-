(function () {
    // ========================================
    // KNOWLEDGE BASE TAB
    // ========================================
    const kbForm = document.getElementById("miv-kb-upload-form");

    if (kbForm) {
        const kbFileInput = document.getElementById("miv_kb_file");
        const kbBtn = document.getElementById("miv-kb-upload-btn");

        const getKbProgressWrap = () => document.getElementById("miv-progress-wrap");
        const getKbProgressBar = () => document.getElementById("miv-progress-bar");
        const getKbStatusEl = () => document.getElementById("miv-status");
        const getKbTableBody = () => document.getElementById("miv-kb-files-tbody");

        function setKbStatus(msg) {
            const el = getKbStatusEl();
            if (el) el.innerHTML = msg || "";
        }

        async function refreshKbList() {
            const tableBody = getKbTableBody();
            if (!tableBody) return;

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
                console.warn("Could not load KB file list", e);
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="2" style="text-align: center; padding: 40px; color: #DC3545;">
                            Error loading files. Please check console for details.
                        </td>
                    </tr>
                `;
            }
        }

        kbForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const file = kbFileInput.files && kbFileInput.files[0];
            if (!file) {
                setKbStatus("Please choose a file first.");
                return;
            }

            const progressWrap = getKbProgressWrap();
            const progressBar = getKbProgressBar();

            if (progressWrap) progressWrap.style.display = "block";
            if (progressBar) progressBar.style.width = "0%";
            setKbStatus("Uploading & Processing... (This may take a minute)");

            if (kbBtn) kbBtn.disabled = true;

            let currentProgress = 0;
            const maxFakeProgress = 95;
            const duration = 80000;
            const intervalTime = 500;
            const increment = maxFakeProgress / (duration / intervalTime);

            const progressInterval = setInterval(() => {
                currentProgress += increment;
                if (currentProgress >= maxFakeProgress) {
                    currentProgress = maxFakeProgress;
                }
                if (progressBar) {
                    progressBar.style.width = Math.round(currentProgress) + "%";
                }
            }, intervalTime);

            const fd = new FormData();
            fd.append("action", "miv_kb_upload");
            fd.append("nonce", MIV_ADMIN.nonce);
            fd.append("miv_kb_file", file);

            try {
                const res = await fetch(MIV_ADMIN.ajaxUrl, {
                    method: "POST",
                    body: fd
                });

                const data = await res.json();
                clearInterval(progressInterval);

                if (data.success) {
                    if (progressBar) progressBar.style.width = "100%";
                    setKbStatus('<span style="color:green;">Upload complete ✅</span>');
                    kbFileInput.value = "";
                    await refreshKbList();
                } else {
                    setKbStatus('<span style="color:red;">' + (data.data?.message || "Upload failed.") + '</span>');
                    if (progressBar) progressBar.style.width = "0%";
                }

            } catch (err) {
                clearInterval(progressInterval);
                console.error(err);
                setKbStatus('<span style="color:red;">Upload failed due to a network error.</span>');
                if (progressBar) progressBar.style.width = "0%";
            } finally {
                if (kbBtn) kbBtn.disabled = false;
            }
        });

        refreshKbList();
    }

    // ========================================
    // KNOWLEDGE MAP TAB
    // ========================================
    const kmForm = document.getElementById("miv-km-upload-form");

    if (kmForm) {
        const kmFileInput = document.getElementById("miv_km_file");
        const kmBtn = document.getElementById("miv-km-upload-btn");

        const getKmProgressWrap = () => document.getElementById("miv-km-progress-wrap");
        const getKmProgressBar = () => document.getElementById("miv-km-progress-bar");
        const getKmStatusEl = () => document.getElementById("miv-km-status");
        const getKmTableBody = () => document.getElementById("miv-km-files-tbody");

        function setKmStatus(msg) {
            const el = getKmStatusEl();
            if (el) el.innerHTML = msg || "";
        }

        async function refreshKmList() {
            const tableBody = getKmTableBody();
            if (!tableBody) return;

            tableBody.innerHTML = `
                <tr>
                    <td colspan="2" style="text-align: center; padding: 40px;">
                        <div class="miv-loader"></div>
                        <div style="margin-top: 16px; color: #6C757D;">Loading files...</div>
                    </td>
                </tr>
            `;

            const fd = new FormData();
            fd.append("action", "miv_km_list");
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
                                No files uploaded yet. Upload your first knowledge map above.
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
                console.warn("Could not load KM file list", e);
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="2" style="text-align: center; padding: 40px; color: #DC3545;">
                            Error loading files. Please check console for details.
                        </td>
                    </tr>
                `;
            }
        }

        kmForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const file = kmFileInput.files && kmFileInput.files[0];
            if (!file) {
                setKmStatus("Please choose a file first.");
                return;
            }

            const progressWrap = getKmProgressWrap();
            const progressBar = getKmProgressBar();

            if (progressWrap) progressWrap.style.display = "block";
            if (progressBar) progressBar.style.width = "0%";
            setKmStatus("Uploading & Processing... (This may take a minute)");

            if (kmBtn) kmBtn.disabled = true;

            let currentProgress = 0;
            const maxFakeProgress = 95;
            const duration = 80000;
            const intervalTime = 500;
            const increment = maxFakeProgress / (duration / intervalTime);

            const progressInterval = setInterval(() => {
                currentProgress += increment;
                if (currentProgress >= maxFakeProgress) {
                    currentProgress = maxFakeProgress;
                }
                if (progressBar) {
                    progressBar.style.width = Math.round(currentProgress) + "%";
                }
            }, intervalTime);

            const fd = new FormData();
            fd.append("action", "miv_km_upload");
            fd.append("nonce", MIV_ADMIN.nonce);
            fd.append("miv_km_file", file);

            try {
                const res = await fetch(MIV_ADMIN.ajaxUrl, {
                    method: "POST",
                    body: fd
                });

                const data = await res.json();
                clearInterval(progressInterval);

                if (data.success) {
                    if (progressBar) progressBar.style.width = "100%";
                    setKmStatus('<span style="color:green;">Upload complete ✅</span>');
                    kmFileInput.value = "";
                    await refreshKmList();
                } else {
                    setKmStatus('<span style="color:red;">' + (data.data?.message || "Upload failed.") + '</span>');
                    if (progressBar) progressBar.style.width = "0%";
                }

            } catch (err) {
                clearInterval(progressInterval);
                console.error(err);
                setKmStatus('<span style="color:red;">Upload failed due to a network error.</span>');
                if (progressBar) progressBar.style.width = "0%";
            } finally {
                if (kmBtn) kmBtn.disabled = false;
            }
        });

        refreshKmList();
    }

    // ========================================
    // SHARED UTILITY
    // ========================================
    function escapeHtml(str) {
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
})();