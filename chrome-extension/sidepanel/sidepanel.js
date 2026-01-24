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
            <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span class="video-filename">${escapeHtml(group.filename)}</span>
            ${multipleAsins ? `<span class="asin-count">${taskCount} ASINs</span>` : ''}
          </div>
          <button class="btn btn-download btn-small" data-video-id="${group.videoId}" data-filename="${escapeHtml(group.filename)}" data-asins="${group.tasks.map(t => t.asin).join(',')}">
            <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download All
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
      ${!groupHasVideo ? `
        <div class="task-video no-video">
          <svg class="icon-sm" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          No video attached
        </div>
      ` : ''}
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
