/* ============================================================
   GALERÍA S3 — app.js
   Fixes: error handling, drag & drop, preview, modal confirm,
          loading states, toast feedback, key encoding for DELETE
   ============================================================ */

const API = 'http://localhost:3000';

const MAX_SIZE_MB  = 5;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

/* ---- DOM refs ---- */
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const filePreviewArea = document.getElementById('filePreviewArea');
const fileThumb       = document.getElementById('fileThumb');
const fileName        = document.getElementById('fileName');
const fileSize        = document.getElementById('fileSize');
const removeFileBtn   = document.getElementById('removeFileBtn');
const uploadBtn       = document.getElementById('uploadBtn');
const uploadBtnText   = document.getElementById('uploadBtnText');
const btnLoader       = document.getElementById('btnLoader');
const gallery         = document.getElementById('gallery');
const galleryLoader   = document.getElementById('galleryLoader');
const emptyState      = document.getElementById('emptyState');
const badgeNum        = document.getElementById('badgeNum');
const refreshBtn      = document.getElementById('refreshBtn');
const toastContainer  = document.getElementById('toastContainer');
const deleteModal     = document.getElementById('deleteModal');
const modalCancel     = document.getElementById('modalCancel');
const modalConfirm    = document.getElementById('modalConfirm');

let selectedFile = null;   // currently selected File object
let pendingDeleteKey = null; // key waiting for modal confirmation

/* ============================================================
   FILE SELECTION
   ============================================================ */

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setFile(file) {
  if (!file) return;

  if (!ALLOWED_MIME.includes(file.type)) {
    toast('Formato no permitido. Usa JPG, PNG o WEBP.', 'error');
    return;
  }

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    toast(`El archivo supera ${MAX_SIZE_MB} MB.`, 'error');
    return;
  }

  selectedFile = file;

  /* Thumbnail preview */
  const reader = new FileReader();
  reader.onload = e => { fileThumb.src = e.target.result; };
  reader.readAsDataURL(file);

  /* Meta text */
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);

  filePreviewArea.hidden = false;
  uploadBtn.disabled = false;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  fileThumb.src = '';
  filePreviewArea.hidden = true;
  uploadBtn.disabled = true;
}

/* Native file input */
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

/* Click on drop zone (but not on the hidden input directly — it covers the zone) */
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

/* Remove selected file */
removeFileBtn.addEventListener('click', e => {
  e.stopPropagation();
  clearFile();
});

/* ============================================================
   DRAG & DROP
   ============================================================ */

['dragenter', 'dragover'].forEach(evt => {
  dropZone.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.classList.add('is-drag-over');
  });
});

['dragleave', 'dragend', 'drop'].forEach(evt => {
  dropZone.addEventListener(evt, () => dropZone.classList.remove('is-drag-over'));
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) setFile(file);
});

/* ============================================================
   UPLOAD
   ============================================================ */

uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  setUploading(true);

  try {
    /* 1. Get pre-signed PUT URL from backend */
    const res = await fetch(`${API}/api/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename:    selectedFile.name,
        contentType: selectedFile.type,
        sizeBytes:   selectedFile.size
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error del servidor (${res.status})`);
    }

    const { uploadUrl } = await res.json();

    /* 2. Upload directly to S3 using the signed URL */
    const s3Res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': selectedFile.type },
      body: selectedFile
    });

    if (!s3Res.ok) {
      throw new Error(`Error al subir a S3 (${s3Res.status})`);
    }

    toast('¡Imagen subida correctamente!', 'success');
    clearFile();
    await loadGallery();

  } catch (err) {
    console.error('[upload]', err);
    toast(err.message || 'Error inesperado al subir la imagen.', 'error');
  } finally {
    setUploading(false);
  }
});

function setUploading(active) {
  uploadBtn.disabled   = active;
  btnLoader.hidden     = !active;
  uploadBtnText.textContent = active ? 'Subiendo…' : 'Subir imagen';

  /* icon visibility */
  const icon = uploadBtn.querySelector('.btn-icon');
  if (icon) icon.style.display = active ? 'none' : '';
}

/* ============================================================
   GALLERY
   ============================================================ */

async function loadGallery() {
  galleryLoader.hidden = false;
  emptyState.hidden    = true;
  gallery.innerHTML    = '';

  try {
    const res = await fetch(`${API}/api/images`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const items = await res.json();

    badgeNum.textContent = items.length;

    if (items.length === 0) {
      emptyState.hidden = false;
    } else {
      gallery.innerHTML = items.map((item, idx) => cardHTML(item, idx)).join('');
    }

  } catch (err) {
    console.error('[gallery]', err);
    toast('No se pudo cargar la galería. ¿Está el servidor activo?', 'error');
    badgeNum.textContent = '—';
  } finally {
    galleryLoader.hidden = true;
  }
}

function cardHTML(item, idx) {
  /* Extract a short display name from the S3 key */
  const parts = item.key.split('/');
  const rawName = parts[parts.length - 1] || item.key;
  /* Strip timestamp prefix: "<ts>-<hex>-<originalname>" */
  const displayName = rawName.replace(/^\d+-[a-f0-9]+-/, '') || rawName;

  const sizeText = item.size ? formatBytes(item.size) : '';

  /* Escape the key for safe inline use */
  const safeKey = encodeURIComponent(item.key);

  return `
    <div class="card" style="animation-delay:${idx * 40}ms">
      <div class="card-img-wrap">
        <img
          src="${escapeHTML(item.url)}"
          alt="${escapeHTML(displayName)}"
          loading="lazy"
          onerror="this.parentElement.style.background='var(--blue-100)'"
        >
        <div class="card-img-overlay"></div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span class="card-filename" title="${escapeHTML(displayName)}">${escapeHTML(displayName)}</span>
          ${sizeText ? `<span class="card-size">${sizeText}</span>` : ''}
        </div>
        <button
          class="card-del-btn"
          aria-label="Eliminar ${escapeHTML(displayName)}"
          onclick="requestDelete('${safeKey}')">
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4 4H12L11 14H5L4 4Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            <path d="M2.5 4H13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <path d="M6 4V2H10V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Refresh button */
refreshBtn.addEventListener('click', () => loadGallery());

/* ============================================================
   DELETE with MODAL CONFIRMATION
   ============================================================ */

/* Called from card's inline onclick */
function requestDelete(encodedKey) {
  pendingDeleteKey = decodeURIComponent(encodedKey);
  deleteModal.hidden = false;
  document.body.style.overflow = 'hidden';
  modalConfirm.focus();
}

function closeModal() {
  deleteModal.hidden = true;
  pendingDeleteKey = null;
  document.body.style.overflow = '';
}

modalCancel.addEventListener('click', closeModal);

/* Close on backdrop click */
deleteModal.addEventListener('click', e => {
  if (e.target === deleteModal) closeModal();
});

/* Close on Escape */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !deleteModal.hidden) closeModal();
});

modalConfirm.addEventListener('click', async () => {
  if (!pendingDeleteKey) return;

  const key = pendingDeleteKey;
  closeModal();

  try {
    /* Encode each segment so slashes inside the key don't break the URL path */
    const encodedSegments = key.split('/').map(encodeURIComponent).join('/');

    const res = await fetch(`${API}/api/images/${encodedSegments}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    toast('Imagen eliminada.', 'success');
    await loadGallery();

  } catch (err) {
    console.error('[delete]', err);
    toast('No se pudo eliminar la imagen.', 'error');
  }
});

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast-dot"></span>${escapeHTML(message)}`;
  toastContainer.appendChild(el);

  /* Auto-dismiss after 4 s */
  setTimeout(() => {
    el.classList.add('toast--fade-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 4000);
}

/* ============================================================
   INIT
   ============================================================ */
loadGallery();