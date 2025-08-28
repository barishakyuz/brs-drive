console.log("APP v5 çalışıyor");

// Dosya yükleme
async function uploadFile() {
  const file = document.getElementById("fileInput").files[0];
  if (!file) return alert("Lütfen dosya seç!");

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + localStorage.getItem("token")
    },
    body: formData
  });

  if (res.ok) {
    alert("Dosya yüklendi!");
    loadFiles();
  } else {
    const data = await res.json();
    alert("Yükleme hatası: " + data.error);
  }
}

// Dosya listeleme
async function loadFiles() {
  const res = await fetch("/api/files", {
    headers: {
      "Authorization": "Bearer " + localStorage.getItem("token")
    }
  });

  const files = await res.json();
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";

  files.forEach(file => {
    const div = document.createElement("div");
    div.className = "file-card";

    // Önizleme (resim/video/pdf vs)
    let preview = "";
    if (file.mime.startsWith("image/")) {
      preview = `<img src="/uploads/${file.user_id}/${file.stored_name}" alt="${file.original_name}" />`;
    } else if (file.mime.startsWith("video/")) {
      preview = `<video controls src="/uploads/${file.user_id}/${file.stored_name}"></video>`;
    } else if (file.mime.startsWith("audio/")) {
      preview = `<audio controls src="/uploads/${file.user_id}/${file.stored_name}"></audio>`;
    } else {
      preview = `<a href="/uploads/${file.user_id}/${file.stored_name}" target="_blank">${file.original_name}</a>`;
    }

    div.innerHTML = `
      <h3>${file.original_name}</h3>
      <div class="preview">${preview}</div>
      <div class="file-actions">
        <a href="/uploads/${file.user_id}/${file.stored_name}" download>İndir</a>
        <button class="danger" onclick="deleteFile(${file.id})">Sil</button>
      </div>
    `;
    fileList.appendChild(div);
  });
}

// Dosya silme
async function deleteFile(id) {
  if (!confirm("Bu dosyayı silmek istediğine emin misin?")) return;

  const res = await fetch(`/api/files/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": "Bearer " + localStorage.getItem("token")
    }
  });

  if (res.ok) {
    alert("Dosya silindi!");
    loadFiles();
  } else {
    const data = await res.json();
    alert("Silme hatası: " + data.error);
  }
}

// İlk yüklemede listele
loadFiles();
