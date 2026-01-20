/**
 * Arşiv yönetimi (indir/yükle)
 *
 * Not: Arşiv yükleme işlemi mevcut verilerin üzerine yazacağı için
 * kullanıcıya açık uyarılar ve durum mesajları verilir.
 */

function setupArchiveListeners() {
  const downloadBtn = qs("archive_download");
  const uploadBtn = qs("archive_upload");
  const fileInput = qs("archive_file");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      setButtonLoading(downloadBtn, true);
      try {
        // Blob download için özel fetch kullan (apiGet blob döndürmez)
        const response = await fetchWithRetry("/api/archive/download", { method: "GET" });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          showToast(errorData.error || "Arşiv indirilemedi", "error");
          return;
        }

        const blob = await response.blob();
        const filename = getArchiveFilename(response) || "memskor-archive.zip";
        triggerDownload(blob, filename);
        showToast("Arşiv indiriliyor", "success");
      } catch (error) {
        showToast("Arşiv indirilemedi", "error");
      } finally {
        setButtonLoading(downloadBtn, false);
      }
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      const file = fileInput?.files?.[0];
      if (!file) {
        showToast("Lütfen bir arşiv dosyası seçin", "warning");
        return;
      }

      setButtonLoading(uploadBtn, true);
      try {
        const formData = new FormData();
        formData.append("archive", file);

        // FormData için özel fetch kullan (apiPost JSON bekler)
        const response = await fetchWithRetry("/api/archive/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          showToast(payload.error || "Arşiv yüklenemedi", "error");
          return;
        }
        
        const payload = await response.json();

        updateArchiveStatus(payload);
        showToast("Arşiv yüklendi. Sayfayı yenileyin.", "success");
      } catch (error) {
        showToast("Arşiv yüklenemedi", "error");
      } finally {
        setButtonLoading(uploadBtn, false);
      }
    });
  }
}

function getArchiveFilename(response) {
  const header = response.headers.get("Content-Disposition") || "";
  const match = header.match(/filename="([^"]+)"/);
  return match ? match[1] : "";
}

function triggerDownload(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function updateArchiveStatus(payload) {
  const status = qs("archive_status");
  if (!status) return;

  const backups = payload.backups || [];
  const backupText = backups.length
    ? `Otomatik yedekler: ${backups.join(", ")}`
    : "Otomatik yedek bulunmuyor.";

  status.innerHTML = `
    <strong>Durum:</strong> ${escapeHtml(payload.message || "Arşiv yüklendi.")}
    <br />
    <small style="color: #666;">${escapeHtml(backupText)}</small>
  `;
}
