const $ = sel => document.querySelector(sel);

const loginSection = $('#loginSection');
const registerSection = $('#registerSection');
const dashboardSection = $('#dashboardSection');
const userNameEl = $('#userName');
const logoutBtn = $('#logoutBtn');

const navLogin = $('#nav-login');
const navRegister = $('#nav-register');
const navDashboard = $('#nav-dashboard');

function show(section) {
  [loginSection, registerSection, dashboardSection].forEach(s => s.classList.add('hidden'));
  section.classList.remove('hidden');
  if (section === dashboardSection) {
    navDashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    navLogin.classList.add('hidden');
    navRegister.classList.add('hidden');
  } else {
    navDashboard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    navLogin.classList.remove('hidden');
    navRegister.classList.remove('hidden');
  }
}

navLogin.addEventListener('click', () => show(loginSection));
navRegister.addEventListener('click', () => show(registerSection));
navDashboard.addEventListener('click', () => show(dashboardSection));

$('#goRegister').addEventListener('click', (e) => { e.preventDefault(); show(registerSection); });
$('#goLogin').addEventListener('click', (e) => { e.preventDefault(); show(loginSection); });

async function api(path, opts={}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) {
    let msg = 'İstek başarısız';
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

async function checkAuth() {
  try {
    const { user } = await api('/api/me');
    userNameEl.textContent = user.name || user.email;
    show(dashboardSection);
    await loadFiles();
  } catch {
    show(loginSection);
  }
}

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    email: form.email.value.trim(),
    name: form.name.value.trim(),
    password: form.password.value
  };
  try {
    await api('/api/register', { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    await checkAuth();
  } catch (err) {
    alert(err.message);
  }
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    email: form.email.value.trim(),
    password: form.password.value
  };
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    await checkAuth();
  } catch (err) {
    alert(err.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  show(loginSection);
});

$('#uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) {
      const j = await res.json().catch(()=>({}));
      throw new Error(j.error || 'Yükleme başarısız');
    }
    fileInput.value = '';
    await loadFiles();
  } catch (err) {
    alert(err.message);
  }
});

async function loadFiles() {
  const listEl = document.getElementById('fileList');
  listEl.innerHTML = '';
  try {
    const { files } = await api('/api/files');
    if (!files.length) {
      listEl.innerHTML = '<div class="card"><p>Henüz dosya yok. Yüklemeye başla!</p></div>';
      return;
    }
    for (const f of files) {
      const card = document.createElement('div');
      card.className = 'file-card';
      const h3 = document.createElement('h3');
      h3.textContent = f.original_name;
      const preview = document.createElement('div');
      preview.className = 'preview';
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      const aDownload = document.createElement('a');
      aDownload.href = `/download/${f.id}`;
      aDownload.textContent = 'İndir';
      aDownload.setAttribute('download', f.original_name);
      const aOpen = document.createElement('a');
      aOpen.href = `/preview/${f.id}`;
      aOpen.target = '_blank';
      aOpen.textContent = 'Yeni Sekmede Aç';
      actions.appendChild(aDownload);
      actions.appendChild(aOpen);
      card.appendChild(h3);
      card.appendChild(preview);
      card.appendChild(actions);
      listEl.appendChild(card);

      renderPreview(preview, f);
    }
  } catch (err) {
    console.error(err);
    document.getElementById('fileList').innerHTML = '<div class="card"><p>Dosyalar yüklenemedi.</p></div>';
  }
}

function renderPreview(container, file) {
  const type = file.mime_type;

  if (type.startsWith('image/')) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = `/preview/${file.id}`;
    container.appendChild(img);
    return;
  }

  if (type === 'video/mp4') {
    const video = document.createElement('video');
    video.controls = true;
    video.src = `/preview/${file.id}`;
    container.appendChild(video);
    return;
  }

  if (type === 'application/pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = `/preview/${file.id}`;
    container.appendChild(iframe);
    return;
  }

  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // DOCX render
    const holder = document.createElement('div');
    holder.style.overflow = 'auto';
    container.appendChild(holder);
    fetch(`/preview/${file.id}`, { credentials: 'include' })
      .then(r => r.blob())
      .then(blob => window.docx.renderAsync(blob, holder, holder, { inWrapper: false }))
      .catch(() => { holder.innerHTML = '<p style="padding:8px">Önizleme başarısız. Yeni sekmede açmayı deneyin.</p>'; });
    return;
  }

  if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    // XLSX render
    const holder = document.createElement('div');
    holder.style.overflow = 'auto';
    holder.style.padding = '6px';
    container.appendChild(holder);
    fetch(`/preview/${file.id}`, { credentials: 'include' })
      .then(r => r.arrayBuffer())
      .then(buf => {
        const wb = XLSX.read(buf, { type: 'array' });
        const first = wb.SheetNames[0];
        const html = XLSX.utils.sheet_to_html(wb.Sheets[first], { header: '', footer: '' });
        holder.innerHTML = html;
        const table = holder.querySelector('table');
        if (table) { table.style.width = '100%'; table.style.color = 'inherit'; }
      })
      .catch(() => { holder.innerHTML = '<p style="padding:8px">Önizleme başarısız. Yeni sekmede açmayı deneyin.</p>'; });
    return;
  }

  container.innerHTML = '<p style="padding:8px">Önizleme yok. İndirebilirsiniz.</p>';
}

checkAuth();
