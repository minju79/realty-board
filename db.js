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
  let html = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  html = html.replace(/```([\s\S]+?)```/g, (match, code) => {
    return `<pre class="bg-surface-gray border border-border-hairline p-md rounded-lg my-md overflow-x-auto text-body-sm font-mono"><code>${code.trim()}</code></pre>`;
  });

  let parts = html.split('`');
  for (let i = 1; i < parts.length; i += 2) {
    parts[i] = `<code class="bg-surface-gray border border-border-hairline px-xs py-[2px] rounded text-primary text-body-sm font-mono">${parts[i]}</code>`;
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
