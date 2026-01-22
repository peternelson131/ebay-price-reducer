/**
 * Side Panel - Main UI for the extension
 */

// Configuration
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check for existing session
  const stored = await chrome.storage.local.get(['accessToken', 'userEmail']);
  if (stored.accessToken) {
    currentUser = { email: stored.userEmail, token: stored.accessToken };
    showTasksView();
    loadTasks();
  } else {
    showLoginView();
  }
});

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
    
    // Store session
    await chrome.storage.local.set({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      userEmail: email
    });
    
    currentUser = { email, token: data.session.access_token };
    showTasksView();
    loadTasks();
    
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
    
    tasks = data.tasks || [];
    pendingCount.textContent = data.pendingCount || 0;
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
    emptyState.querySelector('p').textContent = 
      currentFilter === 'pending' 
        ? `🎉 No pending tasks${mpText}!` 
        : `No completed tasks${mpText} yet.`;
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
  taskList.querySelectorAll('.video-title-input').forEach(el => {
    el.addEventListener('click', () => {
      el.select();
      copyToClipboard(el.dataset.title, 'Title copied!');
    });
  });
}

function groupTasksByVideo(tasks) {
  const groups = {};
  const noVideoTasks = [];
  
  tasks.forEach(task => {
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
    } else {
      noVideoTasks.push(task);
    }
  });
  
  // Convert to array - video groups first, then no-video tasks
  const result = Object.values(groups);
  
  // Add no-video tasks as individual "groups"
  noVideoTasks.forEach(task => {
    result.push({
      videoId: null,
      filename: null,
      tasks: [task]
    });
  });
  
  return result;
}

function createVideoGroup(group) {
  const hasVideo = group.videoId !== null;
  const taskCount = group.tasks.length;
  const multipleAsins = taskCount > 1;
  
  return `
    <div class="video-group ${hasVideo ? '' : 'no-video-group'}">
      ${hasVideo ? `
        <div class="video-header">
          <div class="video-info">
            <span class="video-icon">📹</span>
            <span class="video-filename">${escapeHtml(group.filename)}</span>
            ${multipleAsins ? `<span class="asin-count">${taskCount} ASINs</span>` : ''}
          </div>
          <button class="btn btn-download btn-small" data-video-id="${group.videoId}" data-filename="${escapeHtml(group.filename)}" data-asins="${group.tasks.map(t => t.asin).join(',')}">
            ⬇️ Download All
          </button>
        </div>
      ` : ''}
      <div class="video-tasks ${multipleAsins ? 'multi-asin' : ''}">
        ${group.tasks.map(task => createTaskCard(task, hasVideo, multipleAsins)).join('')}
      </div>
    </div>
  `;
}

function updateMarketplaceIndicator() {
  const indicator = document.getElementById('marketplace-indicator');
  if (indicator) {
    if (detectedMarketplace) {
      indicator.textContent = `📍 ${detectedMarketplace}`;
      indicator.classList.remove('hidden');
    } else {
      indicator.textContent = '📍 All';
      indicator.classList.remove('hidden');
    }
  }
}

function createTaskCard(task, groupHasVideo = false, isMultiAsin = false) {
  const isCompleted = task.status === 'completed';
  const hasVideo = task.hasVideo || groupHasVideo;
  
  return `
    <div class="task-card ${isCompleted ? 'completed' : ''} ${isMultiAsin ? 'compact' : ''}" data-task-id="${task.id}">
      <div class="task-header">
        <span class="task-asin" title="Click to copy">${task.asin}</span>
        <span class="task-marketplace">${task.marketplace || 'US'}</span>
      </div>
      <div class="task-title">${escapeHtml(task.product_title || 'Untitled Product')}</div>
      ${task.video_title ? `
        <div class="task-video-title">
          <input type="text" class="video-title-input" value="${escapeHtml(task.video_title)}" readonly title="Click to copy" data-title="${escapeHtml(task.video_title)}" />
        </div>
      ` : `
        <div class="task-video-title no-title">
          <span class="warning">⚠️ No title - assign owner in CRM</span>
        </div>
      `}
      ${!groupHasVideo ? `
        <div class="task-video no-video">
          ⚠️ No video attached
        </div>
      ` : ''}
      ${!isCompleted ? `
        <div class="task-actions">
          <button class="btn btn-fill-title" data-task-id="${task.id}" data-video-title="${escapeHtml(task.video_title || '')}" title="${task.video_title ? escapeHtml(task.video_title) : 'No title set - set owner in CRM'}">
            📝 Title
          </button>
          <button class="btn btn-fill-asin" data-task-id="${task.id}" data-asin="${task.asin}" title="Fill ASIN in search box">
            🏷️ ASIN
          </button>
          <button class="btn btn-complete" data-task-id="${task.id}">
            ✓ Done
          </button>
        </div>
      ` : `
        <div class="task-actions">
          <span class="status-badge status-completed">Completed</span>
        </div>
      `}
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
    // Use video_title from CRM if available, otherwise show warning
    if (!videoTitle) {
      showNotification('No title set - assign an owner in CRM first', 'error');
      return;
    }
    
    const response = await sendToContentScript('fillTitle', { title: videoTitle });
    
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
  let downloadedThumbnails = 0;
  
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
    
    // 2. Download thumbnails for each ASIN (if available)
    for (const asin of asins) {
      if (!asin) continue;
      
      try {
        const thumbResponse = await fetch(`${API_BASE}/get-thumbnail?asin=${asin}`, {
          headers: {
            'Authorization': `Bearer ${currentUser.token}`
          }
        });
        
        const thumbData = await thumbResponse.json();
        
        if (thumbData.success && thumbData.downloadUrl) {
          chrome.downloads.download({
            url: thumbData.downloadUrl,
            filename: `${asin}_thumbnail.jpg`,
            saveAs: false
          }, (downloadId) => {
            if (!chrome.runtime.lastError) {
              downloadedThumbnails++;
            }
          });
        }
      } catch (thumbErr) {
        console.log(`No thumbnail for ${asin}:`, thumbErr.message);
      }
    }
    
    // Show success message
    setTimeout(() => {
      const parts = [];
      if (downloadedVideo) parts.push('video');
      if (downloadedThumbnails > 0) parts.push(`${downloadedThumbnails} thumbnail(s)`);
      
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
