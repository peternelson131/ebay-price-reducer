/**
 * Side Panel - Main UI for the extension
 */

// Configuration
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// State
let currentUser = null;
let tasks = [];
let currentFilter = 'pending';

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
  const filtered = tasks.filter(t => t.status === currentFilter);
  
  if (filtered.length === 0) {
    taskList.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = 
      currentFilter === 'pending' ? '🎉 No pending tasks!' : 'No completed tasks yet.';
    return;
  }
  
  emptyState.classList.add('hidden');
  taskList.innerHTML = filtered.map(task => createTaskCard(task)).join('');
  
  // Attach event listeners
  taskList.querySelectorAll('.btn-autofill').forEach(btn => {
    btn.addEventListener('click', () => handleAutofill(btn.dataset.taskId));
  });
  taskList.querySelectorAll('.btn-complete').forEach(btn => {
    btn.addEventListener('click', () => handleComplete(btn.dataset.taskId));
  });
  taskList.querySelectorAll('.task-asin').forEach(el => {
    el.addEventListener('click', () => copyToClipboard(el.textContent, 'ASIN copied!'));
  });
}

function createTaskCard(task) {
  const isCompleted = task.status === 'completed';
  const hasVideo = task.hasVideo && task.video?.upload_status === 'completed';
  
  return `
    <div class="task-card ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
      <div class="task-header">
        <span class="task-asin" title="Click to copy">${task.asin}</span>
        <span class="task-marketplace">${task.marketplace || 'US'}</span>
      </div>
      <div class="task-title">${escapeHtml(task.product_title || 'Untitled Product')}</div>
      <div class="task-video ${hasVideo ? '' : 'no-video'}">
        ${hasVideo 
          ? `📹 ${task.video.filename}` 
          : '⚠️ No video attached'}
      </div>
      ${!isCompleted ? `
        <div class="task-actions">
          <button class="btn btn-autofill" data-task-id="${task.id}" ${!hasVideo ? 'disabled' : ''}>
            ✨ Autofill
          </button>
          <button class="btn btn-complete" data-task-id="${task.id}">
            ✓ Complete
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
async function handleAutofill(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  // Send message to content script
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.url?.includes('amazon')) {
      showNotification('Please navigate to Amazon Influencer upload page first.', 'error');
      return;
    }
    
    // Inject content script if not already
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/amazon-autofill.js']
    });
    
    // Send autofill command
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'autofill',
      data: {
        title: 'Product Review', // Blanket title for MVP
        asin: task.asin,
        productTitle: task.product_title
      }
    });
    
    if (response?.success) {
      showNotification('Form autofilled! ASIN copied to clipboard.', 'success');
      await copyToClipboard(task.asin);
    } else {
      showNotification(response?.error || 'Could not find form fields.', 'error');
    }
    
  } catch (error) {
    console.error('Autofill error:', error);
    showNotification('Failed to autofill. Make sure you\'re on the upload page.', 'error');
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
