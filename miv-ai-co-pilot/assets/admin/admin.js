(function () {
  const form = document.getElementById("miv-kb-upload-form");
  if (!form) return;

  const fileInput = document.getElementById("miv_kb_file");
  const btn = document.getElementById("miv-kb-upload-btn");
  const progressWrap = document.getElementById("miv-progress-wrap");
  const progressBar = document.getElementById("miv-progress-bar");
  const statusEl = document.getElementById("miv-status");
  const tableBody = document.getElementById("miv-kb-files-tbody");

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  function resetProgress() {
    progressBar.style.width = "0%";
    progressWrap.style.display = "none";
  }

  async function refreshList() {
    const fd = new FormData();
    fd.append("action", "miv_kb_list");
    fd.append("nonce", MIV_ADMIN.nonce);

    const res = await fetch(MIV_ADMIN.ajaxUrl, { method: "POST", body: fd });
    const data = await res.json();

    if (!data.success) return;

    tableBody.innerHTML = "";
    (data.data.files || []).forEach((f) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.innerHTML = `<span class="miv-file-pill">${escapeHtml(f.filename)}</span>`;

      const tdDate = document.createElement("td");
      tdDate.textContent = f.uploaded || "";

      tr.appendChild(tdName);
      tr.appendChild(tdDate);
      tableBody.appendChild(tr);
    });
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

    setStatus("Uploading…");
    progressWrap.style.display = "block";
    progressBar.style.width = "0%";
    btn.disabled = true;

    const fd = new FormData();
    fd.append("action", "miv_kb_upload");
    fd.append("nonce", MIV_ADMIN.nonce);
    fd.append("miv_kb_file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", MIV_ADMIN.ajaxUrl, true);

    xhr.upload.addEventListener("progress", function (evt) {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      progressBar.style.width = pct + "%";
      setStatus(`Uploading… ${pct}%`);
    });

    xhr.onload = async function () {
      btn.disabled = false;

      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (!data.success) {
          setStatus(data.data?.message || "Upload failed.");
          return;
        }

        setStatus("Upload complete ✅");
        progressBar.style.width = "100%";
        await refreshList();

        fileInput.value = "";
      } catch (err) {
        console.error(err);
        setStatus("Upload finished, but response could not be read.");
      }
    };

    xhr.onerror = function () {
      btn.disabled = false;
      setStatus("Upload failed due to a network error.");
      resetProgress();
    };

    xhr.send(fd);
  });

  refreshList();
})();
