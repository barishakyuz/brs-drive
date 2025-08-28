console.log("APP v7 yüklendi");

// ==== Yardımcılar ===========================================================
const token = () => localStorage.getItem("token") || ""; // Sunucun login sonrası bunu yazıyor olmalı

async function authedFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "Authorization": "Bearer " + token(),
  };
  const res = await fetch(url, { ...options, headers });
  return res;
}

function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ==== DOM Referansları ======================================================
const fileInput  = document.getElementById("fileInput");
const uploadBtn  = document.getElementById("uploadBtn");
const fileListEl = document.getElementById("fileList");
const emptyState = document.getElementById("emptyState");
const welcomeEl  = document.getElementById("welcome");

// İsterseniz backend token payload'ından ad çekip yazdırabilirsiniz.
// Burada sadece örnek yazı koyduk:
try { welcomeEl.textContent = "Hoş geldin 👋"; } catch {}

// ==== Yükleme ===============================================================
async function uploadFile() {
  const file = fileInput.files?.[0];
  if (!file) return alert("Lütfen bir dosya seç.");

  const formData = new FormData();
  formData.append("file", file);

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Yükleniyor…";

  try {
    const res = await authedFetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      let msg = "Yükleme başarısız.";
      try {
        const data = await res.json();
        msg = data?.error || msg;
      } catch {}
      alert(msg);
      return;
    }

    alert("Dosya yüklendi!");
    fileInput.value = "";
    await loadFiles();
  } catch (e) {
    console.error(e);
    alert("Ağ hatası: Dosya yüklenemedi.");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Yükle";
  }
}

// ==== Listeleme & Kart üretimi =============================================
function renderFileCard(file) {
  // file: { id, user_id, stored_name, original_name, mime, size }
  const url = `/uploads/${file.user_id}/${file.stored_name}`;

  let previewHTML = "";
  if (file.mime?.startsWith("image/")) {
    previewHTML = `<img src="${url}" alt="${file.original_name}" />`;
  } else if (file.mime?.startsWith("video/")) {
    previewHTML = `<video controls src="${url}"></video>`;
  } else if (file.mime?.startsWith("audio/")) {
    previewHTML = `<audio controls src="${url}"></audio>`;
  } else {
    previewHTML = `
      <div style="padding:10px; text-align:center; width:100%;">
        <a href="${url}" target="_blank" style="color:#9dbafc; text-decoration:underline;">
          ${file.original_name}
        </a>
      </div>`;
  }

  const sizeInfo = file.size ? ` • ${formatBytes(file.size)}` : "";

  const div = document.createElement("div");
  div.className = "file-card";
  div.innerHTML = `
    <h3 title="${file.original_name}">${file.original_name}${sizeInfo}</h3>
    <div class="preview">${previewHTML}</div>

    <div class="file-actions">
      <a class="download" href="${url}" download>İndir</a>
      <button class="delete" data-id="${file.id}">Sil</button>
    </div>
  `;

  // Sil butonuna olay bağla
  const delBtn = div.querySelector("button.delete");
  delBtn.addEventListener("click", () => deleteFile(file.id));

  return div;
}

async function loadFiles() {
  fileListEl.innerHTML = "";
  emptyState.style.display = "none";

  try {
    const res = await authedFetch("/api/files");
    if (!res.ok) {
      let msg = "Dosyalar alınamadı.";
      try {
        const data = await res.json();
        msg = data?.error || msg;
      } catch {}
      alert(msg);
      return;
    }

    const files = await res.json(); // Array
    if (!files || files.length === 0) {
      emptyState.style.display = "block";
      return;
    }

    for (const f of files) {
      fileListEl.appendChild(renderFileCard(f));
    }
  } catch (e) {
    console.error(e);
    alert("Ağ hatası: Dosyalar yüklenemedi.");
  }
}

// ==== Silme =================================================================
async function deleteFile(id) {
  const ok = confirm("Bu dosyayı silmek istediğine emin misin?");
  if (!ok) return;

  try {
    const res = await authedFetch(`/api/files/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      let msg = "Silme başarısız.";
      try {
        const data = await res.json();
        msg = data?.error || msg;
      } catch {}
      alert(msg);
      return;
    }

    alert("Dosya silindi!");
    await loadFiles();
  } catch (e) {
    console.error(e);
    alert("Ağ hatası: Silme işlemi başarısız.");
  }
}

// ==== Olaylar & İlk yükleme =================================================
uploadBtn.addEventListener("click", uploadFile);
document.addEventListener("DOMContentLoaded", loadFiles);
