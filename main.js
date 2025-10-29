// ========== 主题管理 ==========
const themeToggle = document.getElementById("theme-toggle");
const currentTheme = localStorage.getItem("theme") || "light";

// 应用保存的主题
document.documentElement.setAttribute("data-theme", currentTheme);
updateThemeButton(currentTheme);

// 主题切换事件
themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "light" ? "dark" : "light";
    
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeButton(newTheme);
});

// 更新主题按钮图标
function updateThemeButton(theme) {
    themeToggle.textContent = theme === "light" ? "☾" : "☼";
    themeToggle.title = theme === "light" ? "切换到黑夜主题" : "切换到白天主题";
}

const fileInput = document.getElementById("bookmark-file");
const importBtn = document.getElementById("import-btn");
const bookmarkTree = document.getElementById("bookmarkTree");
const searchBox = document.querySelector(".search-box");
const searchIcon = document.querySelector(".search-icon");
const uploadBtn = document.getElementById("upload");
const exportBtn = document.getElementById("export-btn");
const topBar = document.querySelector(".top-bar");
const titleText = document.querySelector(".top-bar-title span");
const topBarTitle = document.querySelector(".top-bar-title");

// 新增弹窗相关元素
const importModal = document.getElementById("import-modal");
const modalBookmarkFile = document.getElementById("modal-bookmark-file");
const modalUploadBtn = document.getElementById("modal-upload-btn");
const closeBtn = document.querySelector(".close");

let rawJSON = "";
let allNodes = [];
let originalBookmarkTreeHTML = "";
let observer = null;
let bindEventsTimeout = null; // 用于防抖

// ========== chrome-extension:// 专用内容解析 ==========

function htmlEntitiesDecode(str) {
  if (!str) return str;
  return str.replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'");
}

function extractChromeExtensionContent(urlString) {
  if (!urlString || !urlString.startsWith("chrome-extension://")) return null;
  try {
    const url = new URL(urlString);
    const raw = url.searchParams.get("raw") || "";
    if (!raw) return null;

    let decoded = raw;
    for (let i = 0; i < 3; i++) {
      try {
        const tmp = decodeURIComponent(decoded);
        if (tmp === decoded) break;
        decoded = tmp;
      } catch { break; }
    }
    decoded = decoded.replace(/__NL__/g, "\n");
    decoded = htmlEntitiesDecode(decoded);

    const m = decoded.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (m) return m[1];
    return decoded;
  } catch {
    return null;
  }
}

// ========== 预处理书签数据 ==========
function flattenNodes(nodes, level) {
  const results = [];
  if (!nodes) return results;
  nodes.forEach(node => {
    results.push({
      title: node.title || "(未命名)",
      url: node.url,
      level,
      originalNode: node
    });
    if (node.children) {
      results.push(...flattenNodes(node.children, level + 1));
    }
  });
  return results;
}

// ========== 渲染书签树（只支持 chrome-extension 特殊格式） ==========

function createBookmarkList(node, level) {
  const li = document.createElement("li");
  li.classList.add(`level-${level}`);

  if (node.children && node.children.length > 0) {
    li.classList.add("folder");
    const a = document.createElement("a");
    a.href = "javascript:void(0);";
    a.classList.add("menu-item");
    a.textContent = node.title || "(未命名)";
    li.appendChild(a);

    const ul = document.createElement("ul");
    ul.classList.add("accordion-submenu");
    node.children.forEach(child => {
      const childEl = createBookmarkList(child, level + 1);
      if (childEl) ul.appendChild(childEl);
    });
    li.appendChild(ul);
  } else if (node.url) {
    if (node.url.startsWith("chrome-extension://")) {
      // 📄 chrome-extension:// 类型
      const wrapper = document.createElement("div");
      wrapper.className = "chrome-extension-wrapper";

      const title = node.title || "无标题";
      const content = extractChromeExtensionContent(node.url) || "（无内容）";

      const header = document.createElement("div");
      header.className = "chrome-extension-header";
      header.innerHTML = `
        <span class="chrome-extension-title">${title}</span>
        <span class="chrome-extension-copy">📋</span>
      `;

      const contentEl = document.createElement("pre");
      contentEl.className = "chrome-extension-content";
      contentEl.textContent = content;
      contentEl.style.display = "none";

      header.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target.classList.contains("chrome-extension-copy")) {
          copyToClipboard(content, e.target);
          return;
        }
        const isOpen = wrapper.classList.contains("open");
        collapseAllExtensionExcept(wrapper);
        if (!isOpen) {
          wrapper.classList.add("open");
          contentEl.style.display = "block";
          setTimeout(() => {
            wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 0);
        } else {
          wrapper.classList.remove("open");
          contentEl.style.display = "none";
        }
      });

      wrapper.appendChild(header);
      wrapper.appendChild(contentEl);
      li.appendChild(wrapper);
    } else {
      // 🌐 普通链接
      const a = document.createElement("a");
      a.href = node.url;
      a.classList.add("bookmark-link");
      a.target = "_blank";
      a.textContent = node.title || "(无标题)";

      const icon = document.createElement("img");
      icon.src = "https://www.google.com/s2/favicons?sz=32&domain_url=" + encodeURIComponent(node.url);
      icon.classList.add("favicon-icon");
      a.prepend(icon);

      li.appendChild(a);
    }
  }
  return li;
}

function renderBookmarkTree(bookmarkTreeEl, jsonData) {
  bookmarkTreeEl.innerHTML = "";
  jsonData.forEach(child => {
    const el = createBookmarkList(child, 2);
    if (el) bookmarkTreeEl.appendChild(el);
  });
}

// ========== 折叠/复制工具函数 ==========

function collapseAllExtensionExcept(targetWrapper) {
  document.querySelectorAll(".chrome-extension-wrapper.open").forEach(wrapper => {
    if (wrapper !== targetWrapper) {
      wrapper.classList.remove("open");
      const contentEl = wrapper.querySelector(".chrome-extension-content");
      if (contentEl) contentEl.style.display = "none";
    }
  });
}

function copyToClipboard(text, copyBtn) {
  navigator.clipboard.writeText(text)
    .then(() => {
      copyBtn.textContent = "✅";
      setTimeout(() => copyBtn.textContent = "📋", 1000);
    })
    .catch(() => {
      copyBtn.textContent = "❌";
      setTimeout(() => copyBtn.textContent = "📋", 1000);
    });
}


// 📂 渲染书签树（旧版接口：renderBookmarkTree(bookmarkTree, jsonData)）
function renderBookmarkTree(bookmarkTreeEl, jsonData) {
  bookmarkTreeEl.innerHTML = "";
  jsonData.forEach(child => {
    const el = createBookmarkList(child, 2);
    if (el) bookmarkTreeEl.appendChild(el);
  });
}

// ✅ 折叠 + 滚动行为（保持原逻辑）
function setupFolderClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const li = this.parentElement;
  if (!li) return; // 增加安全检查
  const isOpen = li.classList.contains("open");
  const siblings = li.parentElement?.children || [];
  Array.from(siblings).forEach((sib) => {
    if (sib !== li) sib.classList.remove("open");
  });
  if (isOpen) {
    li.classList.remove("open");
  } else {
    li.classList.add("open");
    const liTop = li.getBoundingClientRect().top + window.scrollY;
    const desiredOffset = 0; // 将此值调整为您想要的距离（像素）
    window.scrollTo({
      top: liTop - desiredOffset, // 减去偏移量，使其在屏幕上向下一点
      behavior: "smooth"
    });
    let parent = li.parentElement;
    while (parent && parent.classList.contains("accordion-submenu")) {
      const container = parent.parentElement;
      if (container) {
        container.classList.add("open");
        const ancestorSiblings = container.parentElement?.children || [];
        Array.from(ancestorSiblings).forEach(sib => {
          if (sib !== container) sib.classList.remove("open");
        });
      }
      parent = parent.parentElement?.parentElement;
    }
  }
}

// 🔍 搜索（保持原逻辑，使用 flattenNodes）
searchIcon.addEventListener("click", () => {
  searchIcon.style.display = "none";
  searchBox.style.display = "block";
  topBar.classList.add("searching");
  searchBox.focus();

  if (window.innerWidth <= 480) {
    titleText.style.display = "none";
  }
});

searchBox.addEventListener("blur", () => {
  if (!searchBox.value) {
    searchBox.style.display = "none";
    searchIcon.style.display = "block";
    topBar.classList.remove("searching");

    if (window.innerWidth <= 480) {
      titleText.style.display = "inline";
    }
  }
});

searchBox.addEventListener("input", () => {
  const keyword = searchBox.value.trim().toLowerCase();
  const resultsContainer = document.createElement("ul");
  resultsContainer.classList.add("search-results");
  bookmarkTree.innerHTML = "";

  if (keyword) {
    const regex = new RegExp(keyword, "gi");
    const results = allNodes.filter(node =>
      node.title.toLowerCase().includes(keyword) ||
      (node.url && node.url.toLowerCase().includes(keyword))
    );

    results.forEach(result => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = result.url || result.originalNode.url;
      a.classList.add("bookmark-link");
      a.target = "_blank";

      const highlightedTitle = result.title.replace(regex, `<mark>$&</mark>`);
      a.innerHTML = highlightedTitle;

      const icon = document.createElement("img");
      icon.src = "https://www.google.com/s2/favicons?sz=32&domain_url=" + encodeURIComponent(result.url || result.originalNode.url);
      icon.classList.add("favicon-icon");
      a.prepend(icon);

      li.appendChild(a);
      resultsContainer.appendChild(li);
    });

    bookmarkTree.appendChild(resultsContainer);
  } else {
    bookmarkTree.innerHTML = originalBookmarkTreeHTML;
    bindFolderClickEvents("searchBox input");
  }
});

// ✅ 页面加载时自动尝试加载本地书签文件
const LOCAL_DATA_PATH = "data/bookmarks";   // 本地书签文件路径
const REMOTE_DATA_BASE = "https://api.mgt.xx.kg/data/"; // 远程数据基址
const DEFAULT_TOKEN = "read692";                 // 默认 token
const DEFAULT_FILE = "bookmarks";                // 默认文件名

/**
 * 根据 location.search 解析加载策略
 * - 当 URL 没有 ?data 时 -> 使用本地文件
 * - 当 ?data=xxx（且 xxx 不是 http 链接） -> 视为远程简写名
 * - 当 ?data= 完整 http 链接 -> 使用完整远程链接
 */
function resolveDataUrlFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get("data");

  if (!dataParam) {
    // 无参数：返回本地文件路径
    return {
      dataUrl: LOCAL_DATA_PATH,
      shortParam: null,
      cameFromUrlParam: false,
      isLocal: true
    };
  }

  // 有 data 参数
  if (dataParam.startsWith("http")) {
    // 完整 URL：原样使用
    return { 
      dataUrl: dataParam, 
      shortParam: null, 
      cameFromUrlParam: true,
      isLocal: false
    };
  } else if (dataParam.startsWith("data/")) {
    // data/前缀：使用Data API
    const fileName = dataParam.substring(5);
    return {
      dataUrl: `${REMOTE_DATA_BASE}${fileName}?token=${DEFAULT_TOKEN}`,
      shortParam: dataParam, // 🔥 保持 data/ 前缀
      cameFromUrlParam: true,
      isLocal: false
    };
  } else if (dataParam.startsWith("kv/")) {
    // kv/前缀：使用KV API
    const fileName = dataParam.substring(3);
    return {
      dataUrl: `https://api.mgt.xx.kg/kv/${fileName}?token=${DEFAULT_TOKEN}`,
      shortParam: dataParam, // 🔥 保持 kv/ 前缀
      cameFromUrlParam: true,
      isLocal: false
    };
  } else {
    // 默认：使用Data API（向后兼容）
    const fileName = dataParam.replace(/\$/i, "");
    return {
      dataUrl: `${REMOTE_DATA_BASE}${fileName}?token=${DEFAULT_TOKEN}`,
      shortParam: fileName,
      cameFromUrlParam: true,
      isLocal: false
    };
  }
}

/**
 * 加载并在成功后根据策略更新地址栏
 */
async function loadAndSyncAddress(dataUrl, shortParam, initiallyHadParam, isLocal) {
  await loadBookmarks(dataUrl); // 你现有的加载函数
  
  // 成功后更新地址栏逻辑
  if (shortParam) {
    // 远程简写模式：显示 ?data=shortParam
    const shortUrl = `${location.origin}${location.pathname}?data=${encodeURIComponent(shortParam)}`;
    history.replaceState(null, "", shortUrl);
  } else if (!initiallyHadParam && !isLocal) {
    // 没有传入 ?data 且不是本地加载：保持地址栏为根
    history.replaceState(null, "", `${location.origin}${location.pathname}`);
  }
  // 其他情况（本地加载或完整URL）不改地址栏
}

/* ---------------- 页面初始化：DOMContentLoaded ---------------- */
window.addEventListener("DOMContentLoaded", async () => {
  const { dataUrl, shortParam, cameFromUrlParam, isLocal } = resolveDataUrlFromLocation();

  try {
    await loadAndSyncAddress(dataUrl, shortParam, cameFromUrlParam, isLocal);

    // 绑定顶部标题点击（保持你原有逻辑）
    topBarTitle.addEventListener("click", () => {
      searchBox.value = "";
      searchBox.style.display = "none";
      searchIcon.style.display = "block";
      topBar.classList.remove("searching");
      titleText.style.display = window.innerWidth <= 480 ? "inline" : "inline";
      bookmarkTree.innerHTML = originalBookmarkTreeHTML;
      bindFolderClickEvents("topBarTitle click");
    });
  } catch (e) {
    alert(`⚠️ 无法加载书签: ${e.message}\n您可以点击"导入书签"手动上传。`);
    // 地址栏不改动（保留原样）
  }
});

/* ---------------- 加载按钮逻辑（手动加载远程文件） ---------------- */
const loadBtn = document.getElementById("load-btn");
if (loadBtn) {
  loadBtn.addEventListener("click", async () => {
    const defaultPath = DEFAULT_FILE; // "bookmarks"
    const input = prompt("请输入文件名（如 bookmarks）、data/文件名 或 kv/文件名", defaultPath);
    if (!input) return;

    try {
      let dataUrl, shortParam = null;

      if (input.startsWith("http")) {
        // 完整 URL
        dataUrl = input;
      } else if (input.startsWith("data/")) {
        // data/前缀：使用Data API
        const fileName = input.substring(5).replace(/\$/i, "");
        dataUrl = `${REMOTE_DATA_BASE}${fileName}?token=${DEFAULT_TOKEN}`;
        shortParam = input; // 🔥 保持 data/ 前缀
      } else if (input.startsWith("kv/")) {
        // kv/前缀：使用KV API
        const fileName = input.substring(3).replace(/\$/i, "");
        dataUrl = `https://api.mgt.xx.kg/kv/${fileName}?token=${DEFAULT_TOKEN}`;
        shortParam = input; // 🔥 保持 kv/ 前缀
      } else {
        // 默认：使用Data API（向后兼容）
        const fileName = input.replace(/\$/i, "");
        dataUrl = `${REMOTE_DATA_BASE}${fileName}?token=${DEFAULT_TOKEN}`;
        shortParam = fileName;
      }

      await loadBookmarks(dataUrl);

      // 更新地址栏
      if (shortParam) {
        const shortUrl = `${location.origin}${location.pathname}?data=${encodeURIComponent(shortParam)}`;
        history.replaceState(null, "", shortUrl);
      }
      // 输入完整 URL 时，不改变地址栏

    } catch (e) {
      alert(`⚠️ 远程加载失败：${e.message}`);
    } finally {
      // 20 秒后自动关闭导入弹窗（保持原逻辑）
      setTimeout(() => {
        importModal.style.display = "none";
      }, 20000);
    }
  });
}

/* ---------------- 处理浏览器前进/后退（可选，但建议保留） ---------------- */
window.addEventListener("popstate", async () => {
  // 当用户通过前进/后退改变 ?data 时（或回到无参数状态），重新根据地址加载
  const { dataUrl, shortParam, cameFromUrlParam } = resolveDataUrlFromLocation();
  try {
    // 不需要再更新地址栏（popstate 本身就是地址变更），直接加载
    await loadBookmarks(dataUrl);
  } catch (e) {
    alert(`⚠️ 数据加载失败：${e.message}`);
  }
});




// 修改后的 loadBookmarks（保持原接口）
async function loadBookmarks(url) {
  try {
    // 🔥 处理不同的URL类型
    let fetchUrl = url;
    if (!url.startsWith('http') && !url.startsWith('data/')) {
      fetchUrl = `data/${url}`;
    }

    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error("获取失败");

    const rawData = await res.json();
    
    // 🔥 新增：统一数据提取
    const json = extractBookmarkData(rawData);
    if (!json) throw new Error("数据格式不支持");

    rawJSON = JSON.stringify(json, null, 2);

    // 尽量兼容多个书签 JSON 结构
    const children = json?.[0]?.children?.[0]?.children || json?.[0]?.children || json?.children || json?.[0] || [];
    bookmarkTree.innerHTML = "";
    children.forEach(child => {
      const el = createBookmarkList(child, 2);
      if (el) bookmarkTree.appendChild(el);
    });

    allNodes = flattenNodes(children, 2);
    originalBookmarkTreeHTML = bookmarkTree.innerHTML;
    bindFolderClickEvents("loadBookmarks");
    observeBookmarkTree();

    // 更新 URL 参数但不刷新页面
    const newUrl = new URL(window.location);
    if (url !== "data/bookmarks") {
      newUrl.searchParams.set('data', url);
    } else {
      newUrl.searchParams.delete('data');
    }
    window.history.pushState({}, '', newUrl);
  } catch (e) {
    alert(`⚠️ 无法加载书签: ${e.message}`);
  }
}

// 🔥 新增：统一数据提取方法
function extractBookmarkData(rawData) {
  // 1. 处理Worker KV API的封装格式
  if (rawData && rawData.success !== undefined && rawData.data !== undefined) {
    console.log('检测到Worker KV封装格式');
    rawData = rawData.data;
  }
  
  // 2. 处理应用层封装格式 {version, source, data: [...]}
  if (rawData && rawData.data && Array.isArray(rawData.data)) {
    console.log('检测到应用层封装格式');
    return rawData.data;
  }
  
  // 3. 处理直接数组格式 [...]
  if (Array.isArray(rawData)) {
    console.log('检测到直接数组格式');
    return rawData;
  }
  
  // 4. 处理对象格式但包含children {children: [...]}
  if (rawData && rawData.children && Array.isArray(rawData.children)) {
    console.log('检测到对象格式，使用children');
    return [rawData]; // 包装成数组以保持格式一致
  }
  
  // 无法识别的格式
  console.warn('无法识别的数据格式:', rawData);
  return rawData;
}

// ✅ 点击 "导入" 按钮显示弹窗
importBtn?.addEventListener("click", () => {
  importModal.style.display = "block";
});

// ✅ 弹窗选择文件导入
modalBookmarkFile?.addEventListener("change", () => {
  const file = modalBookmarkFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const json = e.target.result;
    rawJSON = json;
    try {
      const data = JSON.parse(json);
      const children = data?.[0]?.children?.[0]?.children || data?.[0]?.children || data?.children || data?.[0] || [];
      bookmarkTree.innerHTML = "";
      children.forEach(child => {
        const el = createBookmarkList(child, 2);
        if (el) bookmarkTree.appendChild(el);
      });

      allNodes = flattenNodes(children, 2);
      originalBookmarkTreeHTML = bookmarkTree.innerHTML;
      bindFolderClickEvents("modalBookmarkFile change");

      // 延迟（不自动关闭，保留用户操作空间）
      // setTimeout(() => { importModal.style.display = "none"; }, 2000);
    } catch (err) {
      alert("无效 JSON");
    }
  };
  reader.readAsText(file);
});

// ✅ 上传到 GitHub（保留原逻辑）
modalUploadBtn?.addEventListener("click", async () => {
  const token = prompt("请输入 GitHub Token：");
  if (!token) return alert("❌ 未提供 Token，上传已取消");

  const repo = "fjvi/data";
  const path = "backup";
  const branch = "main";
  const getURL = `https://api.github.com/repos/${repo}/contents/${path}`;
  let sha = null;

  try {
    const res = await fetch(getURL, {
      headers: { Authorization: "token " + token }
    });
    if (res.ok) {
      const json = await res.json();
      sha = json.sha;
    }
  } catch (e) {}

  const content = btoa(unescape(encodeURIComponent(rawJSON)));
  const payload = {
    message: "更新书签 JSON",
    content,
    branch,
    ...(sha && { sha })
  };

  const res = await fetch(getURL, {
    method: "PUT",
    headers: {
      Authorization: "token " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert("✅ 上传成功！");
    importModal.style.display = "none"; // 关闭弹窗
  } else {
    alert("❌ 上传失败");
  }
});

// 点击弹窗外部，关闭弹窗
window.addEventListener("click", (event) => {
  if (event.target == importModal) {
    importModal.style.display = "none";
  }
});

// 💾 导出为 JSON 文件（保留原逻辑）
exportBtn?.addEventListener("click", async () => {
  const password = prompt("请输入导出密码：");

  if (password === null) {
    alert("导出已取消。");
    return;
  }

  try {
    const response = await fetch("https://api.mgt.xx.kg/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: password })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      if (!rawJSON) return alert("请先导入书签");

      const blob = new Blob([rawJSON], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bookmarks";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert("密码错误，导出已取消。");
    }
  } catch (error) {
    console.error("密码验证失败", error);
    alert("网络错误，请稍后再试！");
  }
});

// 绑定文件夹点击事件（保持原逻辑）
function bindFolderClickEvents(calledFrom) {
  console.log(`bindFolderClickEvents called from: ${calledFrom}`);

  // 防抖处理
  if (bindEventsTimeout) {
    clearTimeout(bindEventsTimeout);
  }
  bindEventsTimeout = setTimeout(() => {
    const folderLinks = document.querySelectorAll(".menu-item");
    console.log(`  folderLinks.length: ${folderLinks.length}`);

    folderLinks.forEach(a => {
      if (!a.parentElement) return; // 增加安全检查

      a.removeEventListener("click", setupFolderClick);
      a.addEventListener("click", setupFolderClick);

      console.log(`  Event listener added to: ${a.textContent}`);
    });
    console.log(`bindFolderClickEvents finished`);
  }, 100); // 100ms 防抖
}

// 创建并配置 MutationObserver（保持原逻辑）
function observeBookmarkTree() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver(function(mutations) {
    let shouldBindEvents = false;
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        shouldBindEvents = true;
      }
    });
    if (shouldBindEvents) {
      bindFolderClickEvents("MutationObserver");
    }
  });

  observer.observe(bookmarkTree, {
    childList: true,
    subtree: true
  });
}