let _config = null;

async function loadConfig() {
  if (_config) return _config;
  let api = {}, file = {};
  try { const r = await fetch('/api/config'); if (r.ok) api = await r.json(); } catch(e) {}
  try { const r = await fetch('config/git_config.json'); if (r.ok) file = await r.json(); } catch(e) {}
  const apiTok = String(api.github_token || '').trim();
  const fileTok = String(file.github_token || '').trim();
  _config = {
    github_token: (apiTok && apiTok !== 'YOUR_GITHUB_TOKEN') ? apiTok : fileTok,
    github_owner: file.github_owner || '',
    github_repo: file.github_repo || '',
    data_file_path: file.data_file_path || 'data/posts.json',
    admin_password: api.admin_password || file.admin_password || 'admin1234'
  };
  return _config;
}

function isAdmin() {
  return sessionStorage.getItem('isAdmin') === 'true';
}

function requireAdmin() {
  if (!isAdmin()) {
    window.location.href = 'admin.html';
  }
}

function renderMarkdown(src) {
  if (!src) return '';
  
  // Sanitize dangerous HTML tags and event listeners
  let html = src
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript:/gi, "");

  html = html.replace(/```([\s\S]+?)```/g, (match, code) => {
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre class="bg-surface-gray border border-border-hairline p-md rounded-lg my-md overflow-x-auto text-body-sm font-mono"><code>${escapedCode.trim()}</code></pre>`;
  });

  let parts = html.split('`');
  for (let i = 1; i < parts.length; i += 2) {
    const escapedInline = parts[i]
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    parts[i] = `<code class="bg-surface-gray border border-border-hairline px-xs py-[2px] rounded text-primary text-body-sm font-mono">${escapedInline}</code>`;
  }
  html = parts.join('');

  html = html.replace(/^### (.*$)/gim, '<h5 class="text-title-md font-bold my-base">$1</h5>');
  html = html.replace(/^## (.*$)/gim, '<h4 class="text-headline-md font-bold my-lg">$1</h4>');
  html = html.replace(/^# (.*$)/gim, '<h3 class="text-headline-lg font-bold my-xl">$1</h3>');
  html = html.replace(/^\>(.*$)/gim, '<blockquote class="border-l-4 border-primary/40 pl-base py-sm my-base italic text-secondary">$1</blockquote>');
  html = html.replace(/^---$/gim, '<hr class="my-xl border-border-hairline" />');
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
      return `<img src="${trimmed}" alt="${alt}" class="max-w-full h-auto rounded-xl my-md shadow-sm border border-border-hairline mx-auto block" />`;
    }
    return '';
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, txt, url) => {
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:')) {
      return `<a href="${trimmed}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-bold">${txt}</a>`;
    }
    return txt;
  });

  html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-base list-disc text-body-md my-xs">$1</li>');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ml-base list-decimal text-body-md my-xs">$1</li>');

  const lines = html.split('\n');
  let result = [];
  let inList = false;
  for (let line of lines) {
    let trimmed = line.trim();
    if (trimmed.startsWith('<li')) {
      if (!inList) {
        result.push('<ul class="my-base space-y-xs">');
        inList = true;
      }
      result.push(line);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (trimmed && !trimmed.startsWith('<h') && !trimmed.startsWith('<pre') && !trimmed.startsWith('<code') && !trimmed.startsWith('<block') && !trimmed.startsWith('<hr') && !trimmed.startsWith('<ul') && !trimmed.startsWith('</ul')) {
        result.push(`<p class="text-body-md leading-relaxed my-base">${line}</p>`);
      } else {
        result.push(line);
      }
    }
  }
  if (inList) {
    result.push('</ul>');
  }

  return result.join('\n');
}

function markdownToText(src) {
  if (!src) return '';
  return src
    .replace(/---[\s\S]+?---/g, '')
    .replace(/```[\s\S]+?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}

const LOCAL_STORAGE_KEY = 'realty_posts';

async function fetchFromGithub(config) {
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  const url = `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/contents/${config.data_file_path}`;
  if (!token || !config.github_owner || !config.github_repo) {
    throw new Error('GitHub configuration or token missing');
  }
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (res.status === 404) {
    return { content: [], sha: null };
  }
  if (!res.ok) {
    throw new Error(`GitHub fetch failed: ${res.statusText}`);
  }
  const data = await res.json();
  const content = JSON.parse(decodeURIComponent(atob(data.content).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join('')));
  return { content, sha: data.sha };
}

async function saveToGithub(config, posts, sha) {
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  const url = `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/contents/${config.data_file_path}`;
  const body = {
    message: 'Update posts.json data via admin interface',
    content: btoa(encodeURIComponent(JSON.stringify(posts, null, 2)).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    })),
    sha: sha
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errorDetails = await res.text();
    throw new Error(`GitHub save failed: ${res.status} ${res.statusText} - ${errorDetails}`);
  }
  const data = await res.json();
  return data.content.sha;
}

async function getPosts() {
  try {
    const config = await loadConfig();
    const token = String(config.github_token || '').trim().replace(/\s+/g, '');
    if (!token || !config.github_owner || !config.github_repo) {
      return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    }
    const { content } = await fetchFromGithub(config);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(content));
    return content;
  } catch (e) {
    return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }
}

async function savePost(post) {
  const config = await loadConfig();
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  let posts = [];
  let sha = null;
  let useGithub = false;
  if (token && config.github_owner && config.github_repo) {
    useGithub = true;
    try {
      const res = await fetchFromGithub(config);
      posts = res.content;
      sha = res.sha;
    } catch (e) {
      useGithub = false;
    }
  }
  if (!useGithub) {
    posts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }
  const idx = posts.findIndex(p => p.id === post.id);
  if (idx > -1) {
    posts[idx] = { ...posts[idx], ...post };
  } else {
    posts.unshift(post);
  }
  if (useGithub) {
    await saveToGithub(config, posts, sha);
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(posts));
}

async function deletePost(id) {
  const config = await loadConfig();
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  let posts = [];
  let sha = null;
  let useGithub = false;
  if (token && config.github_owner && config.github_repo) {
    useGithub = true;
    try {
      const res = await fetchFromGithub(config);
      posts = res.content;
      sha = res.sha;
    } catch (e) {
      useGithub = false;
    }
  }
  if (!useGithub) {
    posts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  }
  posts = posts.filter(p => p.id !== id);
  if (useGithub) {
    await saveToGithub(config, posts, sha);
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(posts));
}

const LOCAL_MENUS_KEY = 'realty_menus';

async function fetchMenusFromGithub(config) {
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  const url = `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/contents/data/menus.json`;
  if (!token || !config.github_owner || !config.github_repo) {
    throw new Error('GitHub configuration or token missing');
  }
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (res.status === 404) {
    return { content: [], sha: null };
  }
  if (!res.ok) {
    throw new Error(`GitHub fetch failed: ${res.statusText}`);
  }
  const data = await res.json();
  const content = JSON.parse(decodeURIComponent(atob(data.content).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join('')));
  return { content, sha: data.sha };
}

async function saveMenusToGithub(config, menus, sha) {
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  const url = `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/contents/data/menus.json`;
  const body = {
    message: 'Update menus.json via admin interface',
    content: btoa(encodeURIComponent(JSON.stringify(menus, null, 2)).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    })),
    sha: sha
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`GitHub save failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.content.sha;
}

async function getMenus() {
  try {
    const config = await loadConfig();
    const token = String(config.github_token || '').trim().replace(/\s+/g, '');
    if (!token || !config.github_owner || !config.github_repo) {
      const local = localStorage.getItem(LOCAL_MENUS_KEY);
      if (local) return JSON.parse(local);
      const r = await fetch('data/menus.json');
      const d = await r.json();
      localStorage.setItem(LOCAL_MENUS_KEY, JSON.stringify(d));
      return d;
    }
    const { content } = await fetchMenusFromGithub(config);
    localStorage.setItem(LOCAL_MENUS_KEY, JSON.stringify(content));
    return content;
  } catch (e) {
    const local = localStorage.getItem(LOCAL_MENUS_KEY);
    if (local) return JSON.parse(local);
    try {
      const r = await fetch('data/menus.json');
      const d = await r.json();
      localStorage.setItem(LOCAL_MENUS_KEY, JSON.stringify(d));
      return d;
    } catch(err) {
      return [];
    }
  }
}

async function saveMenu(menu) {
  const config = await loadConfig();
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  let menus = [];
  let sha = null;
  let useGithub = false;
  if (token && config.github_owner && config.github_repo) {
    useGithub = true;
    try {
      const res = await fetchMenusFromGithub(config);
      menus = res.content;
      sha = res.sha;
    } catch (e) {
      useGithub = false;
    }
  }
  if (!useGithub) {
    menus = JSON.parse(localStorage.getItem(LOCAL_MENUS_KEY) || '[]');
  }
  const idx = menus.findIndex(m => m.id === menu.id);
  if (idx > -1) {
    menus[idx] = { ...menus[idx], ...menu };
  } else {
    menus.push(menu);
  }
  if (useGithub) {
    await saveMenusToGithub(config, menus, sha);
  }
  localStorage.setItem(LOCAL_MENUS_KEY, JSON.stringify(menus));
}

async function deleteMenu(id) {
  const config = await loadConfig();
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  let menus = [];
  let sha = null;
  let useGithub = false;
  if (token && config.github_owner && config.github_repo) {
    useGithub = true;
    try {
      const res = await fetchMenusFromGithub(config);
      menus = res.content;
      sha = res.sha;
    } catch (e) {
      useGithub = false;
    }
  }
  if (!useGithub) {
    menus = JSON.parse(localStorage.getItem(LOCAL_MENUS_KEY) || '[]');
  }
  menus = menus.filter(m => m.id !== id);
  if (useGithub) {
    await saveMenusToGithub(config, menus, sha);
  }
  localStorage.setItem(LOCAL_MENUS_KEY, JSON.stringify(menus));
}

async function renderNavMenus() {
  const navContainer = document.getElementById('desktop-nav');
  if (!navContainer) return;
  try {
    const menus = await getMenus();
    navContainer.innerHTML = '';
    const currentPath = window.location.pathname;
    
    menus.forEach(menu => {
      const a = document.createElement('a');
      a.className = "font-headline-md text-headline-md transition-colors ";
      
      const isHome = (currentPath === '/' || currentPath.endsWith('index.html') || currentPath.endsWith('/')) && (menu.url === '/' || menu.url === '' || menu.url === '#');
      const isCurrent = currentPath.includes(menu.url) && menu.url !== '/' && menu.url !== '#' && menu.url !== '';
      
      if (isHome || isCurrent) {
        a.className += "text-primary font-bold border-b-2 border-primary pb-1";
      } else {
        a.className += "text-secondary dark:text-secondary-fixed-dim hover:text-primary";
      }
      
      a.href = menu.url;
      a.textContent = menu.title;
      navContainer.appendChild(a);
    });
  } catch (err) {
    console.error('Failed to render navigation menus:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderNavMenus);
} else {
  renderNavMenus();
}

const LOCAL_AGENTS_KEY = 'realty_agents';

async function fetchAgentsFromGithub(config) {
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  const url = `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/contents/data/agents.json`;
  if (!token || !config.github_owner || !config.github_repo) {
    throw new Error('GitHub configuration or token missing');
  }
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (res.status === 404) {
    return { content: [], sha: null };
  }
  if (!res.ok) {
    throw new Error(`GitHub fetch failed: ${res.statusText}`);
  }
  const data = await res.json();
  const content = JSON.parse(decodeURIComponent(atob(data.content).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join('')));
  return { content, sha: data.sha };
}

async function saveAgentsToGithub(config, agents, sha) {
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  const url = `https://api.github.com/repos/${config.github_owner}/${config.github_repo}/contents/data/agents.json`;
  const body = {
    message: 'Update agents.json via admin interface',
    content: btoa(encodeURIComponent(JSON.stringify(agents, null, 2)).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    })),
    sha: sha
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`GitHub save failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.content.sha;
}

async function getAgents() {
  let agents = [];
  try {
    const config = await loadConfig();
    const token = String(config.github_token || '').trim().replace(/\s+/g, '');
    if (token && config.github_owner && config.github_repo) {
      const res = await fetchAgentsFromGithub(config);
      agents = res.content;
      localStorage.setItem(LOCAL_AGENTS_KEY, JSON.stringify(agents));
      return agents;
    }
  } catch (err) {
    console.warn('GitHub getAgents failed, trying local storage', err);
  }
  
  const local = localStorage.getItem(LOCAL_AGENTS_KEY);
  if (local) {
    return JSON.parse(local);
  }
  
  try {
    const res = await fetch('data/agents.json');
    if (res.ok) {
      agents = await res.json();
      localStorage.setItem(LOCAL_AGENTS_KEY, JSON.stringify(agents));
      return agents;
    }
  } catch (e) {
    console.error('Failed to load default agents', e);
  }
  return [];
}

async function saveAgent(agent) {
  const config = await loadConfig();
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  let agents = [];
  let sha = null;
  let useGithub = false;
  if (token && config.github_owner && config.github_repo) {
    useGithub = true;
    try {
      const res = await fetchAgentsFromGithub(config);
      agents = res.content;
      sha = res.sha;
    } catch (e) {
      useGithub = false;
    }
  }
  if (!useGithub) {
    agents = JSON.parse(localStorage.getItem(LOCAL_AGENTS_KEY) || '[]');
  }
  
  const existingIndex = agents.findIndex(a => a.id === agent.id);
  if (existingIndex > -1) {
    agents[existingIndex] = agent;
  } else {
    agents.push(agent);
  }
  
  if (useGithub) {
    await saveAgentsToGithub(config, agents, sha);
  }
  localStorage.setItem(LOCAL_AGENTS_KEY, JSON.stringify(agents));
}

async function deleteAgent(id) {
  const config = await loadConfig();
  const token = String(config.github_token || '').trim().replace(/\s+/g, '');
  let agents = [];
  let sha = null;
  let useGithub = false;
  if (token && config.github_owner && config.github_repo) {
    useGithub = true;
    try {
      const res = await fetchAgentsFromGithub(config);
      agents = res.content;
      sha = res.sha;
    } catch (e) {
      useGithub = false;
    }
  }
  if (!useGithub) {
    agents = JSON.parse(localStorage.getItem(LOCAL_AGENTS_KEY) || '[]');
  }
  agents = agents.filter(a => a.id !== id);
  if (useGithub) {
    await saveAgentsToGithub(config, agents, sha);
  }
  localStorage.setItem(LOCAL_AGENTS_KEY, JSON.stringify(agents));
}


