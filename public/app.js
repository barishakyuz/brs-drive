console.log('APP v3 yüklendi');

async function loadFiles() {
  const token = localStorage.getItem('token');
  if (!token) return;

  const res = await fetch('/api/files', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) return;

  const files = await res.json();
  const container = document.querySelector('#files');
  container.innerHTML = '';

  files.forEach(f => {
    const card = document.createElement('div');
    card.className = 'file-card';

    const preview = document.createElement('div');
    preview.className = 'preview';

    if (f.mimetype.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = `/uploads/${f.user_id}/${f.stored_name}`;
      preview.appendChild(img);
    } else {
      preview.textContent = f.original_name;
    }

    card.appendChild(preview);

    const actions = document.createElement('div');
    actions.className = 'actions';

    // İndir butonu
    const btnDownload = document.createElement('a');
    btnDownload.textContent = 'İndir';
    btnDownload.href = `/uploads/${f.user_id}/${f.stored_name}`;
    btnDownload.download = f.original_name;
    actions.appendChild(btnDownload);

    // Yeni Sekmede Aç butonu
    const btnOpen = document.createElement('a');
    btnOpen.textContent = 'Yeni Sekmede Aç';
    btnOpen.href = `/uploads/${f.user_id}/${f.stored_name}`;
    btnOpen.target = '_blank';
    actions.appendChild(btnOpen);

    // Sil butonu
    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Sil';
    btnDelete.className = 'danger';
    btnDelete.onclick = async () => {
      if (!confirm('Bu dosyayı silmek istiyor musun?')) return;

      const delRes = await fetch(`/api/files/${f.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });

      if (delRes.ok) {
        card.remove();
      } else {
        const data = await delRes.json().catch(() => ({}));
        alert('Silinemedi: ' + (data.error || delRes.status));
      }
    };
    actions.appendChild(btnDelete);

    card.appendChild(actions);
    container.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', loadFiles);
