const state = {
  path: "/",
  tree: null,
  expandedFolders: new Set(["/"]),
  lastUploaded: [],
  contextFolder: null
};

const $ = (selector) => document.querySelector(selector);
const loginView = $("#loginView");
const appView = $("#appView");
const treeEl = $("#tree");
const foldersEl = $("#folders");
const imagesEl = $("#images");
const currentPathEl = $("#currentPath");
const dropZone = $("#dropZone");
const fileInput = $("#fileInput");
const folderSearchInput = $("#folderSearchInput");
const imageSearchInput = $("#imageSearchInput");
const clearImageSearchBtn = $("#clearImageSearchBtn");
const foldersSection = $("#foldersSection");
const imagesTitle = $("#imagesTitle");
const imagesSummary = $("#imagesSummary");
const uploadResult = $("#uploadResult");
const uploadResultSummary = $("#uploadResultSummary");
const uploadLinksText = $("#uploadLinksText");
const newFolderForm = $("#newFolderForm");
const newFolderPathInput = $("#newFolderPathInput");
const folderContextMenu = $("#folderContextMenu");
const deleteFolderMenuBtn = $("#deleteFolderMenuBtn");
const deleteFolderDialog = $("#deleteFolderDialog");
const deleteFolderMessage = $("#deleteFolderMessage");
const cancelDeleteFolderBtn = $("#cancelDeleteFolderBtn");
const confirmDeleteFolderBtn = $("#confirmDeleteFolderBtn");
const setupHint = $("#setupHint");
const settingsBtn = $("#settingsBtn");
const settingsDialog = $("#settingsDialog");
const baseUrlInput = $("#baseUrlInput");
const maxFileSizeInput = $("#maxFileSizeInput");
const tokenStatus = $("#tokenStatus");
const settingsError = $("#settingsError");
const cancelSettingsBtn = $("#cancelSettingsBtn");
const saveSettingsBtn = $("#saveSettingsBtn");
const toast = $("#toast");
const uploadProgressPanel = $("#uploadProgressPanel");
const uploadProgressSummary = $("#uploadProgressSummary");
const uploadProgressPercent = $("#uploadProgressPercent");
const uploadProgressBar = $("#uploadProgressBar");
const uploadFileList = $("#uploadFileList");
const loadMoreContainer = $("#loadMoreContainer");
const loadMoreBtn = $("#loadMoreBtn");
let toastTimer = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}

function showLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
}

async function loadAll() {
  state.currentPage = 1;
  await loadTree();
  await loadItems();
}

async function loadTree() {
  state.tree = await api("/api/tree");
  expandPath(state.path);
  renderTree();
}

function expandPath(folderPath) {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "/";
  state.expandedFolders.add(current);
  parts.forEach((part) => {
    current = current === "/" ? `/${part}` : `${current}/${part}`;
    state.expandedFolders.add(current);
  });
}

function renderTree() {
  treeEl.innerHTML = "";
  if (!state.tree) return;
  if (!renderTreeNode(state.tree, 0, getFolderQuery())) {
    treeEl.innerHTML = '<p class="tree-empty">没有匹配的目录</p>';
  }
}

function getFolderQuery() {
  return (folderSearchInput.value || "").trim().toLowerCase();
}

function getImageQuery() {
  return (imageSearchInput.value || "").trim();
}

function parentPath(folderPath) {
  if (folderPath === "/") return "/";
  const parts = folderPath.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

function isSameOrChild(pathValue, folderPath) {
  return pathValue === folderPath || pathValue.startsWith(`${folderPath}/`);
}

function treeNodeMatches(node, query) {
  if (!query) return true;
  const selfMatches = node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
  return selfMatches || node.children.some((child) => treeNodeMatches(child, query));
}

function renderTreeNode(node, depth, query) {
  if (!treeNodeMatches(node, query)) return false;
  const hasChildren = node.children.length > 0;
  const isOpen = query || state.expandedFolders.has(node.path);
  const row = document.createElement("div");
  row.className = `tree-row${node.path === state.path ? " active" : ""}`;
  row.style.setProperty("--indent", `${depth * 18}px`);
  row.style.setProperty("--line-opacity", depth === 0 ? 0 : 1);

  const toggle = document.createElement("button");
  toggle.className = "tree-toggle";
  toggle.type = "button";
  toggle.textContent = hasChildren ? (isOpen ? "▾" : "▸") : "";
  toggle.title = hasChildren ? (isOpen ? "收起目录" : "展开目录") : "";
  toggle.disabled = !hasChildren;
  toggle.addEventListener("click", () => {
    if (state.expandedFolders.has(node.path)) {
      state.expandedFolders.delete(node.path);
    } else {
      state.expandedFolders.add(node.path);
    }
    renderTree();
  });

  const nav = document.createElement("button");
  nav.className = "tree-item";
  nav.type = "button";
  nav.title = node.path;
  nav.addEventListener("contextmenu", (event) => {
    openFolderContextMenu(event, node);
  });

  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = node.name;

  const count = document.createElement("span");
  count.className = "tree-count";
  count.textContent = node.imageCount || 0;
  count.title = "当前目录及子目录图片数量";

  nav.append(name, count);
  nav.addEventListener("click", async () => {
    state.path = node.path;
    expandPath(node.path);
    await loadAll();
  });

  row.append(toggle, nav);
  treeEl.appendChild(row);

  if (isOpen) {
    node.children.forEach((child) => renderTreeNode(child, depth + 1, query));
  }
  return true;
}

const imageSort = $("#imageSort");
imageSort.addEventListener("change", async () => {
  try {
    await loadItems();
  } catch (error) {
    showToast(error.message, "error");
  }
});

async function loadItems(append = false) {
  const sort = imageSort.value;
  const imageQuery = getImageQuery();
  if (imageQuery) {
    const data = await api(`/api/images/search?q=${encodeURIComponent(imageQuery)}&sort=${sort}`);
    foldersSection.classList.add("hidden");
    imagesTitle.textContent = "搜索结果";
    imagesSummary.textContent = `${data.images.length} 张图片`;
    renderImages(data.images, { showFolder: true });
    state.hasMore = false;
    renderLoadMore();
    return;
  }

  const page = append ? (state.currentPage || 1) + 1 : 1;
  const data = await api(`/api/items?path=${encodeURIComponent(state.path)}&page=${page}&limit=50&sort=${sort}`);
  state.currentPage = data.page;
  state.hasMore = data.hasMore;

  currentPathEl.textContent = data.path;
  foldersSection.classList.remove("hidden");
  imagesTitle.textContent = "图片";
  imagesSummary.textContent = `${data.total} 张图片`;

  if (page === 1) {
    renderFolders(data.folders);
    renderImages(data.images, { showFolder: false });
  } else {
    appendImages(data.images, { showFolder: false });
  }

  renderLoadMore();
}

function renderFolders(folders) {
  foldersEl.innerHTML = "";
  if (!folders.length) {
    foldersEl.innerHTML = '<p class="eyebrow">暂无子目录</p>';
    return;
  }
  const template = $("#folderTemplate");
  folders.forEach((folder) => {
    const node = template.content.cloneNode(true);
    const button = node.querySelector("button");
    node.querySelector(".folder-name").textContent = folder.name;
    node.querySelector(".folder-count").textContent = `${folder.imageCount || 0} 张`;
    button.title = `${folder.path}，含子目录 ${folder.imageCount || 0} 张图片`;
    button.addEventListener("contextmenu", (event) => {
      openFolderContextMenu(event, folder);
    });
    button.addEventListener("click", async () => {
      state.path = folder.path;
      expandPath(folder.path);
      await loadAll();
    });
    foldersEl.appendChild(node);
  });
}

function openFolderContextMenu(event, folder) {
  event.preventDefault();
  if (!folder || folder.path === "/") return;
  state.contextFolder = folder;
  folderContextMenu.classList.remove("hidden");
  const bounds = folderContextMenu.getBoundingClientRect();
  folderContextMenu.style.left = `${Math.max(0, Math.min(event.clientX, innerWidth - bounds.width))}px`;
  folderContextMenu.style.top = `${Math.max(0, Math.min(event.clientY, innerHeight - bounds.height))}px`;
}

function closeFolderContextMenu() {
  folderContextMenu.classList.add("hidden");
}

const editFolderDialog = $("#editFolderDialog");
const editFolderName = $("#editFolderName");
const folderDestinations = $("#folderDestinations");
const saveEditFolderBtn = $("#saveEditFolderBtn");
const editFolderError = $("#editFolderError");
let folderEdit;

function addDestination(node, depth, source) {
  if (isSameOrChild(node.path, source)) return;
  const label = document.createElement("label");
  label.style.paddingInlineStart = `${Math.min(depth, 12) * 14}px`;
  label.title = node.path;
  const choice = document.createElement("input");
  choice.type = "radio";
  choice.name = "destination";
  choice.value = node.path;
  choice.disabled = node.path === parentPath(source);
  choice.addEventListener("change", () => {
    folderEdit.parent = node.path;
    saveEditFolderBtn.disabled = false;
  });
  label.append(choice, node.path === "/" ? "根目录" : node.name);
  folderDestinations.append(label);
  node.children.forEach((child) => addDestination(child, depth + 1, source));
}

function openFolderEditor(mode) {
  const folder = state.contextFolder;
  closeFolderContextMenu();
  if (!folder) return;
  folderEdit = { mode, source: folder.path };
  const rename = mode === "rename";
  $("#editFolderTitle").textContent = rename ? "重命名目录" : `移动「${folder.name}」`;
  $("#editFolderNameField").hidden = !rename;
  $("#folderDestinationField").hidden = rename;
  editFolderName.required = rename;
  editFolderName.value = folder.name;
  editFolderError.textContent = "";
  folderDestinations.replaceChildren();
  if (!rename && state.tree) addDestination(state.tree, 0, folder.path);
  saveEditFolderBtn.disabled = !rename;
  editFolderDialog.showModal();
  if (rename) editFolderName.select();
}

$("#renameFolderMenuBtn").addEventListener("click", () => openFolderEditor("rename"));
$("#moveFolderMenuBtn").addEventListener("click", () => openFolderEditor("move"));
$("#cancelEditFolderBtn").addEventListener("click", () => editFolderDialog.close());
editFolderDialog.addEventListener("cancel", (event) => {
  if (folderEdit.busy) event.preventDefault();
});
$("#editFolderForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const { source, mode, parent, busy } = folderEdit;
  if (busy || (mode === "move" && !parent)) return;
  folderEdit.busy = saveEditFolderBtn.disabled = $("#cancelEditFolderBtn").disabled = true;
  editFolderError.textContent = "";
  try {
    const data = await api("/api/folders", {
      method: "PATCH",
      body: JSON.stringify(mode === "rename"
        ? { path: source, name: editFolderName.value.trim() }
        : { path: source, parent })
    });
    const relocate = (value) => isSameOrChild(value, source) ? data.path + value.slice(source.length) : value;
    state.path = isSameOrChild(state.path, source) ? relocate(state.path) : data.path;
    state.expandedFolders = new Set([...state.expandedFolders].map(relocate));
    folderSearchInput.value = "";
    if (data.path !== source && state.lastUploaded.some((image) => isSameOrChild(image.folder, source))) {
      state.lastUploaded = [];
      uploadResult.classList.add("hidden");
    }
    editFolderDialog.close();
    await loadAll();
    showToast(mode === "rename" ? "目录已重命名" : "目录已移动", "success");
  } catch (error) {
    if (editFolderDialog.open) editFolderError.textContent = error.message;
    else showToast(error.message, "error");
  } finally {
    folderEdit.busy = saveEditFolderBtn.disabled = $("#cancelEditFolderBtn").disabled = false;
  }
});

function showDeleteFolderDialog(folder) {
  if (!folder) return;
  const count = folder.imageCount || 0;
  deleteFolderMessage.textContent = `确定删除「${folder.path}」吗？该目录、所有子目录以及其中 ${count} 张图片都会被删除，图片直链也会失效。`;
  deleteFolderDialog.classList.remove("hidden");
}

function closeDeleteFolderDialog() {
  deleteFolderDialog.classList.add("hidden");
}

async function deleteFolder(folder) {
  if (!folder) return;
  await api(`/api/folders?path=${encodeURIComponent(folder.path)}`, { method: "DELETE" });
  state.expandedFolders.forEach((item) => {
    if (isSameOrChild(item, folder.path)) state.expandedFolders.delete(item);
  });
  if (isSameOrChild(state.path, folder.path)) {
    state.path = parentPath(folder.path);
  }
  closeDeleteFolderDialog();
  closeFolderContextMenu();
  await loadAll();
}

function renderImages(images, options = {}) {
  imagesEl.innerHTML = "";
  if (!images.length) {
    imagesEl.innerHTML = '<p class="eyebrow">暂无图片</p>';
    return;
  }
  const template = $("#imageTemplate");
  images.forEach((image) => {
    imagesEl.appendChild(buildImageCard(template, image, options));
  });
}

function appendImages(images, options = {}) {
  const template = $("#imageTemplate");
  images.forEach((image) => {
    imagesEl.appendChild(buildImageCard(template, image, options));
  });
}

function buildImageCard(template, image, options = {}) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector(".image-card");
  const thumb = node.querySelector(".thumb");
  const title = node.querySelector("strong");
  const detail = node.querySelector("span");
  thumb.style.backgroundImage = `url("${image.thumbUrl || image.url}")`;
  thumb.title = image.url;
  thumb.addEventListener("click", () => window.open(image.url, "_blank"));
  title.textContent = image.filename;
  detail.textContent = buildImageDetail(image, options.showFolder);
  card.querySelector('[data-action="copy"]').addEventListener("click", () => copy(image.url));
  card.querySelector('[data-action="markdown"]').addEventListener("click", () => copy(`![${image.filename}](${image.url})`));
  card.querySelector('[data-action="rename"]').addEventListener("click", () => renameImage(image));
  card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteImage(image));
  return node;
}

function renderLoadMore() {
  if (state.hasMore) {
    loadMoreContainer.classList.remove("hidden");
  } else {
    loadMoreContainer.classList.add("hidden");
  }
}

function buildImageDetail(image, showFolder) {
  const parts = [formatSize(image.size)];
  if (image.width) parts.push(`${image.width}x${image.height}`);
  if (showFolder) parts.push(image.folder);
  return parts.join(" · ");
}

function showToast(message, type = "success") {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2200);
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("复制失败");
}

async function copy(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
    showToast("已复制到剪贴板");
  } catch (error) {
    try {
      fallbackCopy(text);
      showToast("已复制到剪贴板");
    } catch {
      showToast("复制失败，请手动选中文本复制", "error");
    }
  }
}

async function uploadFiles(files) {
  if (!files.length) return;
  showUploadProgress(files);
  const form = new FormData();
  form.append("path", state.path);
  Array.from(files).forEach((file) => form.append("images", file));
  try {
    const data = await uploadRequest(form, (loaded, total) => {
      updateUploadProgress((loaded / total) * 100, loaded, total);
    });
    state.lastUploaded = data.images || [];
    finishUploadProgress(state.lastUploaded);
    showUploadResult(state.lastUploaded);
    await loadAll();
  } catch (error) {
    failUploadProgress(error.message);
    throw error;
  }
}

function showUploadResult(images) {
  if (!images.length) return;
  const links = images.map((image) => image.url).join("\n");
  uploadResultSummary.textContent = `本次上传 ${images.length} 张图片`;
  uploadLinksText.value = links;
  uploadResult.classList.remove("hidden");
}

function uploadMarkdown() {
  return state.lastUploaded.map((image) => `![${image.filename}](${image.url})`).join("\n");
}

function showUploadProgress(files) {
  const fileList = Array.from(files);
  const totalSize = fileList.reduce((sum, file) => sum + file.size, 0);
  uploadProgressPanel.classList.remove("hidden");
  uploadProgressBar.style.width = "0%";
  uploadProgressPercent.textContent = "0%";
  uploadProgressSummary.textContent = `${fileList.length} 个文件，${formatSize(totalSize)}，准备上传到 ${state.path}`;
  uploadFileList.innerHTML = "";
  fileList.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "upload-file";
    item.dataset.index = String(index);
    item.innerHTML = `
      <div class="upload-file-main">
        <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
        <span>${formatSize(file.size)} · 等待上传</span>
      </div>
      <span class="upload-file-status">等待</span>
    `;
    uploadFileList.appendChild(item);
  });
}

function updateUploadProgress(percent, loaded, total) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  uploadProgressBar.style.width = `${safePercent}%`;
  uploadProgressPercent.textContent = `${safePercent}%`;
  const sizeText = total ? `${formatSize(loaded)} / ${formatSize(total)}` : formatSize(loaded);
  uploadProgressSummary.textContent = `${sizeText}，正在上传到 ${state.path}`;
  uploadFileList.querySelectorAll(".upload-file").forEach((item) => {
    item.classList.add("uploading");
    item.querySelector(".upload-file-status").textContent = "上传中";
    const meta = item.querySelector(".upload-file-main span");
    meta.textContent = meta.textContent.replace("等待上传", "上传中");
  });
}

function finishUploadProgress(images) {
  uploadProgressBar.style.width = "100%";
  uploadProgressPercent.textContent = "100%";
  uploadProgressSummary.textContent = `上传完成，成功 ${images.length} 张`;
  const items = Array.from(uploadFileList.querySelectorAll(".upload-file"));
  items.forEach((item, index) => {
    item.classList.remove("uploading", "failed");
    item.classList.add("done");
    const uploaded = images[index];
    const status = item.querySelector(".upload-file-status");
    const meta = item.querySelector(".upload-file-main span");
    status.textContent = "完成";
    meta.textContent = uploaded ? `${formatSize(uploaded.size)} · ${uploaded.filename}` : meta.textContent.replace("上传中", "完成");
  });
}

function failUploadProgress(message) {
  uploadProgressBar.style.width = "100%";
  uploadProgressPercent.textContent = "失败";
  uploadProgressSummary.textContent = message;
  uploadFileList.querySelectorAll(".upload-file").forEach((item) => {
    item.classList.remove("uploading", "done");
    item.classList.add("failed");
    item.querySelector(".upload-file-status").textContent = "失败";
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function uploadRequest(form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    });
    xhr.addEventListener("load", () => {
      const data = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || "上传失败"));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("网络错误，上传失败")));
    xhr.addEventListener("abort", () => reject(new Error("上传已取消")));
    xhr.send(form);
  });
}

async function renameImage(image) {
  const filename = prompt("新的文件名", image.filename);
  if (!filename || filename === image.filename) return;
  await api(`/api/images/${image.id}`, {
    method: "PATCH",
    body: JSON.stringify({ filename })
  });
  await loadAll();
}

async function deleteImage(image) {
  if (!confirm(`确定删除 ${image.filename}？`)) return;
  await api(`/api/images/${image.id}`, { method: "DELETE" });
  await loadAll();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginError").textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: $("#passwordInput").value })
    });
    showApp();
    await loadAll();
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showLogin();
});

folderSearchInput.addEventListener("input", renderTree);
imageSearchInput.addEventListener("input", () => loadItems());
clearImageSearchBtn.addEventListener("click", async () => {
  imageSearchInput.value = "";
  await loadItems();
});

newFolderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const folderPath = newFolderPathInput.value.trim();
  if (!folderPath) return;
  await api("/api/folders", {
    method: "POST",
    body: JSON.stringify({ parent: state.path, path: folderPath })
  });
  newFolderPathInput.value = "";
  await loadAll();
});

deleteFolderMenuBtn.addEventListener("click", () => {
  closeFolderContextMenu();
  showDeleteFolderDialog(state.contextFolder);
});

cancelDeleteFolderBtn.addEventListener("click", closeDeleteFolderDialog);
confirmDeleteFolderBtn.addEventListener("click", async () => {
  try {
    await deleteFolder(state.contextFolder);
  } catch (error) {
    alert(error.message);
  }
});

loadMoreBtn.addEventListener("click", async () => {
  try {
    await loadItems(true);
  } catch (error) {
    alert(error.message);
  }
});

document.addEventListener("click", (event) => {
  if (!folderContextMenu.contains(event.target)) {
    closeFolderContextMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeFolderContextMenu();
    closeDeleteFolderDialog();
    closeSettingsDialog();
  }
});

document.addEventListener("paste", async (event) => {
  if (appView.classList.contains("hidden")) return;
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      files.push(item.getAsFile());
    }
  }
  if (files.length) {
    event.preventDefault();
    try {
      await uploadFiles(files);
    } catch (error) {
      alert(error.message);
    }
  }
});

$("#closeUploadResultBtn").addEventListener("click", () => {
  uploadResult.classList.add("hidden");
});

$("#copyUploadLinksBtn").addEventListener("click", () => copy(uploadLinksText.value));
$("#copyUploadMarkdownBtn").addEventListener("click", () => copy(uploadMarkdown()));

fileInput.addEventListener("change", async () => {
  try {
    await uploadFiles(fileInput.files);
  } catch (error) {
    alert(error.message);
  } finally {
    fileInput.value = "";
  }
});

["dragenter", "dragover"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", async (event) => {
  try {
    await uploadFiles(event.dataTransfer.files);
  } catch (error) {
    alert(error.message);
  }
});

function closeSettingsDialog() {
  if (backupBusy) return;
  settingsDialog.classList.add("hidden");
  settingsError.textContent = "";
}

async function openSettingsDialog() {
  settingsError.textContent = "";
  try {
    const data = await api("/api/settings");
    $("#rollbackDownload").hidden = !data.rollbackAvailable;
    baseUrlInput.value = data.baseUrl || "";
    maxFileSizeInput.value = data.maxFileSizeMb || 10;
    const readState = data.tokens.read ? "已配置" : "未配置";
    const writeState = data.tokens.write ? "已配置" : "未配置";
    const envNote = data.sources.baseUrl === "env" ? "（当前由环境变量控制，此处修改不生效）" : "";
    tokenStatus.textContent = `只读 Token：${readState}　读写 Token：${writeState}${envNote}`;
    settingsDialog.classList.remove("hidden");
  } catch (error) {
    showToast(error.message, "error");
  }
}

settingsBtn.addEventListener("click", openSettingsDialog);
cancelSettingsBtn.addEventListener("click", closeSettingsDialog);

saveSettingsBtn.addEventListener("click", async () => {
  settingsError.textContent = "";
  try {
    const data = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        baseUrl: baseUrlInput.value.trim(),
        maxFileSizeMb: Number(maxFileSizeInput.value)
      })
    });
    closeSettingsDialog();
    if (data.restartRequired) {
      showToast("已保存；最大上传大小需重启容器后生效", "success");
    } else {
      showToast("设置已保存", "success");
    }
  } catch (error) {
    settingsError.textContent = error.message;
  }
});

(async function boot() {
  const me = await api("/api/me");
  if (me.authed) {
    showApp();
    await loadAll();
  } else {
    showLogin();
    if (me.passwordConfigured === false) {
      setupHint.textContent =
        "尚未设置访问密码，请在服务器上执行：docker exec -it qingfeng-image-host node cli.js password";
      setupHint.classList.remove("hidden");
    } else {
      setupHint.classList.add("hidden");
    }
  }
})();
const resizeHandle = $("#sidebarResize");
const sidebarPreference = "qingfeng-sidebar-width";
let preferredWidth = Number(localStorage.getItem(sidebarPreference)) || 320;
let resizePointer = null;

function resizeSidebar(width, commit = false) {
  const min = 230;
  const max = Math.max(min, Math.min(560, appView.clientWidth - 420));
  const size = Math.round(Math.min(max, Math.max(min, width)));
  appView.style.setProperty("--sidebar-width", `${size}px`);
  resizeHandle.setAttribute("aria-valuemin", min);
  resizeHandle.setAttribute("aria-valuemax", max);
  resizeHandle.setAttribute("aria-valuenow", size);
  if (commit) {
    preferredWidth = size;
    localStorage.setItem(sidebarPreference, size);
  }
}

new ResizeObserver(() => {
  if (appView.clientWidth && resizePointer === null) resizeSidebar(preferredWidth);
}).observe(appView);
resizeHandle.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  resizePointer = event.pointerId;
  resizeHandle.setPointerCapture(event.pointerId);
  appView.classList.add("resizing");
});
resizeHandle.addEventListener("pointermove", (event) => {
  if (resizePointer === event.pointerId) resizeSidebar(event.clientX - appView.getBoundingClientRect().left);
});
resizeHandle.addEventListener("lostpointercapture", () => {
  resizePointer = null;
  appView.classList.remove("resizing");
  resizeSidebar(Number(resizeHandle.getAttribute("aria-valuenow")), true);
});
resizeHandle.addEventListener("keydown", (event) => {
  const width = Number(resizeHandle.getAttribute("aria-valuenow"));
  const steps = { ArrowLeft: width - 16, ArrowRight: width + 16, Home: 230, End: 560 };
  if (!Object.hasOwn(steps, event.key)) return;
  event.preventDefault();
  resizeSidebar(steps[event.key], true);
});

const backupFile = $("#backupFile");
const backupMode = $("#backupMode");
const previewBackupBtn = $("#previewBackupBtn");
const restoreBackupBtn = $("#restoreBackupBtn");
const backupStatus = $("#backupStatus");
const backupProgress = $("#backupProgress");
const backupSkipped = $("#backupSkipped");
let backupPreview = null;
let backupBusy = false;

function resetBackupPreview() {
  backupPreview = null;
  backupStatus.textContent = "";
  backupSkipped.hidden = true;
  previewBackupBtn.disabled = !backupFile.files.length;
  restoreBackupBtn.disabled = true;
}

function submitBackup(file, mode, preview) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.set("mode", mode);
    form.set("preview", String(preview));
    form.set("backup", file);
    request.open("POST", "/api/backup/restore");
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) backupProgress.value = event.loaded / event.total * 100;
    };
    request.upload.onload = () => {
      backupProgress.removeAttribute("value");
      backupStatus.textContent = preview ? "正在校验备份…" : "正在校验并恢复备份…";
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(request.response);
      else reject(new Error(request.response?.error || "备份请求失败"));
    };
    request.onerror = () => reject(new Error("网络连接中断，请检查当前数据后重试"));
    request.send(form);
  });
}

async function runRestore(preview) {
  const file = backupFile.files[0];
  const mode = backupMode.value;
  if (!file || backupBusy || (!preview && !backupPreview)) return;
  if (!preview && mode === "replace" &&
      !confirm("整站替换会覆盖当前图片、目录和可迁移设置。系统会先保存一份替换前备份。确定继续？")) return;

  backupBusy = true;
  backupFile.disabled = backupMode.disabled = previewBackupBtn.disabled = restoreBackupBtn.disabled = true;
  saveSettingsBtn.disabled = cancelSettingsBtn.disabled = true;
  backupSkipped.hidden = true;
  backupProgress.hidden = false;
  backupProgress.value = 0;
  backupStatus.textContent = "正在上传备份…";
  try {
    const data = await submitBackup(file, mode, preview);
    if (preview) {
      backupPreview = data;
      backupStatus.textContent = mode === "merge"
        ? `已校验 ${data.images} 张图片、${data.folders} 个目录。合并时将跳过 ${data.conflicts} 项。`
        : `已校验 ${data.images} 张图片、${data.folders} 个目录。当前的 ${data.currentImages} 张图片将被替换。`;
      return;
    }
    backupPreview = null;
    if (data.rollback) $("#rollbackDownload").hidden = false;
    const skipped = [
      ...(data.skippedFolders || []).map((name) => `目录  ${name}`),
      ...(data.skippedImages || []).map((name) => `图片  ${name}`)
    ];
    backupSkipped.textContent = skipped.join("\n");
    backupSkipped.hidden = !skipped.length;
    backupStatus.textContent = data.rollback
      ? `已替换，恢复 ${data.restored} 张图片。上传大小设置在重启后生效。`
      : `已恢复 ${data.restored} 张图片，跳过 ${skipped.length} 项。`;
    if (mode === "replace") {
      state.path = "/";
      state.lastUploaded = [];
      uploadResult.classList.add("hidden");
      state.expandedFolders = new Set(["/"]);
      await openSettingsDialog();
    }
    await loadAll();
  } catch (error) {
    backupStatus.textContent = error.message;
  } finally {
    backupBusy = false;
    backupProgress.hidden = true;
    backupFile.disabled = backupMode.disabled = saveSettingsBtn.disabled = cancelSettingsBtn.disabled = false;
    previewBackupBtn.disabled = !backupFile.files.length;
    restoreBackupBtn.disabled = !backupPreview;
  }
}

backupFile.addEventListener("change", resetBackupPreview);
backupMode.addEventListener("change", resetBackupPreview);
previewBackupBtn.addEventListener("click", () => runRestore(true));
restoreBackupBtn.addEventListener("click", () => runRestore(false));
