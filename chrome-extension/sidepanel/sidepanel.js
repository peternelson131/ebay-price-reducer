/**
 * Side Panel - Main UI for the extension
 */

// Configuration
const API_BASE = 'https://opsyncpro.io/.netlify/functions';

// Marketplace detection from Amazon URL
const MARKETPLACE_MAP = {
  'amazon.com': 'US',
  'amazon.ca': 'CA',
  'amazon.co.uk': 'UK',
  'amazon.de': 'DE',
  'amazon.fr': 'FR',
  'amazon.es': 'ES',
  'amazon.it': 'IT',
  'amazon.co.jp': 'JP',
  'amazon.com.mx': 'MX',
  'amazon.com.au': 'AU'
};

function detectMarketplace(url) {
  if (!url) return null;
  for (const [domain, code] of Object.entries(MARKETPLACE_MAP)) {
    if (url.includes(domain)) return code;
  }
  return null;
}

// State
let currentUser = null;
let tasks = [];
let currentFilter = 'pending';
let detectedMarketplace = null;

// DOM Elements
const loginView = document.getElementById('login-view');
const tasksView = document.getElementById('tasks-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');
const pendingCount = document.getElementById('pending-count');
const filterBtns = document.querySelectorAll('.filter-btn');

// Token refresh interval (refresh 5 minutes before expiry)
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes in ms
let refreshTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check for existing session
  const stored = await chrome.storage.local.get(['accessToken', 'refreshToken', 'tokenExpiresAt', 'userEmail']);
  
  if (stored.accessToken && stored.tokenExpiresAt) {
    const expiresAt = new Date(stored.tokenExpiresAt).getTime();
    const now = Date.now();
    
    // Check if token is expired
    if (expiresAt <= now) {
      // Token expired - try to refresh
      if (stored.refreshToken) {
        const refreshed = await refreshAccessToken(stored.refreshToken);
        if (refreshed) {
          currentUser = { email: stored.userEmail, token: refreshed.accessToken };
          showTasksView();
          loadTasks();
          scheduleTokenRefresh(refreshed.expiresAt);
          return;
        }
      }
      // Refresh failed - need to login again
      await chrome.storage.local.remove(['accessToken', 'refreshToken', 'tokenExpiresAt', 'userEmail']);
      showLoginView();
    } else {
      // Token still valid
      currentUser = { email: stored.userEmail, token: stored.accessToken };
      showTasksView();
      loadTasks();
      scheduleTokenRefresh(stored.tokenExpiresAt);
    }
  } else if (stored.accessToken) {
    // Legacy: token without expiration - use it but don't schedule refresh
    currentUser = { email: stored.userEmail, token: stored.accessToken };
    showTasksView();
    loadTasks();
  } else {
    showLoginView();
  }
});

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken) {
  try {
    const response = await fetch(`${API_BASE}/auth-refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      console.log('Token refresh failed:', data.error);
      return null;
    }
    
    // Calculate expiration (default to 1 hour if not provided)
    const expiresAt = data.session.expires_at 
      ? new Date(data.session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 3600000).toISOString();
    
    // Store new tokens
    await chrome.storage.local.set({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token || refreshToken,
      tokenExpiresAt: expiresAt
    });
    
    // Update current user
    currentUser.token = data.session.access_token;
    
    console.log('Token refreshed, expires at:', expiresAt);
    
    return {
      accessToken: data.session.access_token,
      expiresAt
    };
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

// Schedule token refresh before expiry
function scheduleTokenRefresh(expiresAt) {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
  
  const expiresAtMs = new Date(expiresAt).getTime();
  const refreshAt = expiresAtMs - TOKEN_REFRESH_BUFFER;
  const delay = refreshAt - Date.now();
  
  if (delay > 0) {
    console.log(`Scheduling token refresh in ${Math.round(delay / 60000)} minutes`);
    refreshTimeout = setTimeout(async () => {
      const stored = await chrome.storage.local.get(['refreshToken']);
      if (stored.refreshToken) {
        const refreshed = await refreshAccessToken(stored.refreshToken);
        if (refreshed) {
          scheduleTokenRefresh(refreshed.expiresAt);
        } else {
          // Refresh failed - logout
          showNotification('Session expired. Please login again.', 'error');
          await handleLogout();
        }
      }
    }, delay);
  }
}

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
refreshBtn.addEventListener('click', () => loadTasks());
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.status;
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks();
  });
});

// Auth Functions
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('login-btn');
  
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';
  loginError.textContent = '';
  
  try {
    // Use Supabase Auth directly
    const response = await fetch(`${API_BASE}/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Login failed');
    }
    
    // Calculate expiration (Supabase returns expires_at as unix timestamp)
    const expiresAt = data.session.expires_at 
      ? new Date(data.session.expires_at * 1000).toISOString()
      : new Date(Date.now() + 3600000).toISOString(); // Default 1 hour
    
    // Store session with expiration
    await chrome.storage.local.set({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      tokenExpiresAt: expiresAt,
      userEmail: email
    });
    
    currentUser = { email, token: data.session.access_token };
    showTasksView();
    loadTasks();
    scheduleTokenRefresh(expiresAt);
    
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
}

async function handleLogout() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userEmail']);
  currentUser = null;
  tasks = [];
  showLoginView();
}

// View Functions
function showLoginView() {
  loginView.classList.remove('hidden');
  tasksView.classList.add('hidden');
}

function showTasksView() {
  loginView.classList.add('hidden');
  tasksView.classList.remove('hidden');
  userEmail.textContent = currentUser?.email || '';
}

// Task Functions
async function loadTasks() {
  taskList.innerHTML = '<div class="loading">Loading tasks...</div>';
  emptyState.classList.add('hidden');
  
  // Detect marketplace from active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    detectedMarketplace = detectMarketplace(tab?.url);
    updateMarketplaceIndicator();
  } catch (e) {
    console.log('Could not detect marketplace:', e);
  }
  
  try {
    const response = await fetch(`${API_BASE}/influencer-tasks`, {
      headers: {
        'Authorization': `Bearer ${currentUser.token}`
      }
    });
    
    if (response.status === 401) {
      // Token expired
      showNotification('Session expired. Please login again.', 'error');
      await handleLogout();
      return;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to load tasks');
    }
    
    // Filter out tasks without videos - only show actionable tasks
    tasks = (data.tasks || []).filter(task => task.video && task.video.id);
    
    // Update pending count (only tasks with videos are shown)
    const actionablePending = tasks.filter(t => t.status === 'pending').length;
    pendingCount.textContent = actionablePending;
    renderTasks();
    
  } catch (error) {
    taskList.innerHTML = `<div class="error-text">Error: ${error.message}</div>`;
  }
}

function renderTasks() {
  // Filter by status AND marketplace (if detected)
  let filtered = tasks.filter(t => t.status === currentFilter);
  
  if (detectedMarketplace) {
    filtered = filtered.filter(t => t.marketplace === detectedMarketplace);
  }
  
  if (filtered.length === 0) {
    taskList.innerHTML = '';
    emptyState.classList.remove('hidden');
    const mpText = detectedMarketplace ? ` for ${detectedMarketplace}` : '';
    emptyState.innerHTML = `
      <svg class="icon-lg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p>${currentFilter === 'pending' ? `No pending tasks${mpText}!` : `No completed tasks${mpText} yet.`}</p>
    `;
    return;
  }
  
  emptyState.classList.add('hidden');
  
  // Group tasks by video ID
  const videoGroups = groupTasksByVideo(filtered);
  
  // Render grouped tasks
  taskList.innerHTML = videoGroups.map(group => createVideoGroup(group)).join('');
  
  // Attach event listeners
  taskList.querySelectorAll('.btn-fill-title').forEach(btn => {
    btn.addEventListener('click', () => handleFillTitle(btn.dataset.videoTitle));
  });
  taskList.querySelectorAll('.btn-fill-asin').forEach(btn => {
    btn.addEventListener('click', () => handleFillAsin(btn.dataset.asin));
  });
  taskList.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', () => handleComplete(btn.dataset.taskId));
  });
  taskList.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', () => handleDownloadAll(btn.dataset.videoId, btn.dataset.filename, btn.dataset.asins));
  });
  taskList.querySelectorAll('.task-asin').forEach(el => {
    el.addEventListener('click', () => copyToClipboard(el.textContent, 'ASIN copied!'));
  });
}

function groupTasksByVideo(tasks) {
  const groups = {};
  
  tasks.forEach(task => {
    // All tasks should have videos at this point due to filtering in loadTasks()
    if (task.video?.id) {
      if (!groups[task.video.id]) {
        groups[task.video.id] = {
          videoId: task.video.id,
          filename: task.video.filename,
          onedrivePath: task.video.onedrive_path,
          tasks: []
        };
      }
      groups[task.video.id].tasks.push(task);
    }
  });
  
  // Convert to array of video groups
  return Object.values(groups);
}

function createVideoGroup(group) {
  // All groups have videos now (filtered in loadTasks)
  const taskCount = group.tasks.length;
  const multipleAsins = taskCount > 1;
  
  // Extract parent ASIN from video filename (e.g., "B0FQFB8FMG.mov" -> "B0FQFB8FMG")
  const parentAsin = group.filename ? group.filename.replace(/\.[^/.]+$/, '') : null;
  
  // Get first task's title as the product title (they all share the same video/product)
  const productTitle = group.tasks[0]?.title || group.tasks[0]?.video_title || 'Untitled Product';
  
  return `
    <div class="video-group">
      <div class="video-header parent-header">
        <div class="parent-info">
          <div class="parent-asin-row">
            <span class="parent-asin">${escapeHtml(parentAsin || 'Unknown')}</span>
            <span class="parent-label">Parent ASIN</span>
          </div>
          <div class="parent-title">${escapeHtml(productTitle)}</div>
          <div class="parent-video">
            <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span class="video-filename">${escapeHtml(group.filename)}</span>
            <span class="child-count">${taskCount} upload${taskCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button class="btn btn-download" data-video-id="${group.videoId}" data-filename="${escapeHtml(group.filename)}" data-asins="${group.tasks.map(t => t.asin).join(',')}">
          <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>
      <div class="children-container">
        <div class="children-header">
          <span class="children-label">Upload Tasks</span>
        </div>
        <div class="video-tasks children-list">
          ${group.tasks.map((task, idx) => createTaskCard(task, true, multipleAsins, idx === group.tasks.length - 1)).join('')}
        </div>
      </div>
    </div>
  `;
}

function updateMarketplaceIndicator() {
  const indicator = document.getElementById('marketplace-indicator');
  if (indicator) {
    const text = detectedMarketplace || 'All';
    indicator.innerHTML = `
      <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>${text}</span>
    `;
    indicator.classList.remove('hidden');
  }
}

function createTaskCard(task, groupHasVideo = false, isMultiAsin = false, isLast = false) {
  const isCompleted = task.status === 'completed';
  const connector = isLast ? '└─' : '├─';
  
  return `
    <div class="task-card child-task ${isCompleted ? 'completed' : ''} ${isMultiAsin ? 'compact' : ''}" data-task-id="${task.id}">
      ${groupHasVideo ? `<span class="tree-connector">${connector}</span>` : ''}
      <div class="task-content">
        <div class="task-header">
          <span class="task-asin" title="Click to copy">${task.asin}</span>
          <span class="task-marketplace">${task.marketplace || 'US'}</span>
        </div>
        <div class="task-title">${escapeHtml(task.product_title || 'Untitled Product')}</div>
        ${!isCompleted ? `
          <div class="task-actions">
            <button class="btn btn-fill-title" data-task-id="${task.id}" data-video-title="${escapeHtml(task.video_title || '')}" title="${task.video_title ? escapeHtml(task.video_title) : 'No title set - set owner in CRM'}">
              <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Title
            </button>
            <button class="btn btn-fill-asin" data-task-id="${task.id}" data-asin="${task.asin}" title="Fill ASIN in search box">
              <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              ASIN
            </button>
            <button class="btn btn-complete" data-task-id="${task.id}">
              <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Done
            </button>
          </div>
        ` : `
          <div class="task-actions">
            <span class="status-badge status-completed">Completed</span>
          </div>
        `}
      </div>
    </div>
  `;
}

// Action Handlers

// Helper to inject content script and send message
async function sendToContentScript(action, data) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.url?.includes('amazon')) {
    throw new Error('Please navigate to Amazon Influencer upload page first.');
  }
  
  // Inject content script if not already
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/amazon-autofill.js']
  });
  
  // Send command
  return await chrome.tabs.sendMessage(tab.id, { action, ...data });
}

async function handleFillTitle(videoTitle) {
  try {
    // Use video_title from CRM if available, otherwise warn but allow product title fallback
    const titleToUse = videoTitle || null;
    
    if (!titleToUse) {
      showNotification('No title set - assign owner in CRM to auto-generate', 'error');
      return;
    }
    
    const response = await sendToContentScript('fillTitle', { title: titleToUse });
    
    if (response?.success) {
      showNotification('Title filled!', 'success');
    } else {
      showNotification(response?.error || 'Could not find title field.', 'error');
    }
  } catch (error) {
    console.error('Fill title error:', error);
    showNotification(error.message || 'Failed to fill title.', 'error');
  }
}

async function handleFillAsin(asin) {
  try {
    const response = await sendToContentScript('fillAsin', { asin });
    
    if (response?.success) {
      showNotification('ASIN filled in search!', 'success');
    } else {
      showNotification(response?.error || 'Could not find search field.', 'error');
    }
  } catch (error) {
    console.error('Fill ASIN error:', error);
    showNotification(error.message || 'Failed to fill ASIN.', 'error');
  }
}

async function handleComplete(taskId) {
  try {
    const response = await fetch(`${API_BASE}/influencer-tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentUser.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ taskId, action: 'complete' })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to complete task');
    }
    
    showNotification('Task marked as completed!', 'success');
    await loadTasks(); // Refresh list
    
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function handleDownloadAll(videoId, filename, asinsStr) {
  showNotification('Preparing downloads...', 'info');
  
  const asins = asinsStr ? asinsStr.split(',') : [];
  let downloadedVideo = false;
  let downloadedThumbnail = false;
  
  try {
    // 1. Download the video
    const videoResponse = await fetch(`${API_BASE}/video-download?videoId=${videoId}`, {
      headers: {
        'Authorization': `Bearer ${currentUser.token}`
      }
    });
    
    const videoData = await videoResponse.json();
    
    if (videoData.success && videoData.downloadUrl) {
      chrome.downloads.download({
        url: videoData.downloadUrl,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (!chrome.runtime.lastError) {
          downloadedVideo = true;
        }
      });
    }
    
    // 2. Download ONE thumbnail for this video group (Bug 4: only 1 per parent)
    // Use the first ASIN - thumbnail is the same across marketplace variants
    const firstAsin = asins[0];
    let downloadedThumbnail = false;
    
    if (firstAsin) {
      try {
        const thumbResponse = await fetch(`${API_BASE}/get-thumbnail?asin=${firstAsin}`, {
          headers: {
            'Authorization': `Bearer ${currentUser.token}`
          }
        });
        
        const thumbData = await thumbResponse.json();
        
        if (thumbData.success && thumbData.downloadUrl) {
          // Use video filename base for thumbnail (more intuitive)
          const thumbFilename = filename 
            ? filename.replace(/\.[^/.]+$/, '_thumbnail.jpg')
            : `${firstAsin}_thumbnail.jpg`;
          
          chrome.downloads.download({
            url: thumbData.downloadUrl,
            filename: thumbFilename,
            saveAs: false
          }, (downloadId) => {
            if (!chrome.runtime.lastError) {
              downloadedThumbnail = true;
            }
          });
        }
      } catch (thumbErr) {
        console.log(`No thumbnail available:`, thumbErr.message);
      }
    }
    
    // Show success message
    setTimeout(() => {
      const parts = [];
      if (downloadedVideo) parts.push('video');
      if (downloadedThumbnail) parts.push('thumbnail');
      
      if (parts.length > 0) {
        showNotification(`Downloading ${parts.join(' + ')}...`, 'success');
      } else {
        showNotification('Download started...', 'info');
      }
    }, 500);
    
  } catch (error) {
    console.error('Download error:', error);
    showNotification(error.message || 'Download failed', 'error');
  }
}

// Utility Functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function copyToClipboard(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    if (message) showNotification(message, 'success');
  } catch (error) {
    console.error('Copy failed:', error);
  }
}

function showNotification(message, type = 'success') {
  // Remove existing notifications
  document.querySelectorAll('.notification').forEach(n => n.remove());
  
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}
