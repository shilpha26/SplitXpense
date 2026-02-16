// shared-utils.js - Optimized utilities for SplitEasy
console.log('Loading SplitEasy shared utilities...');

// ========================================
// PERFORMANCE OPTIMIZATIONS
// ========================================

// Cache DOM elements to avoid repeated queries
const domCache = new Map();
const getCachedElement = (id) => {
    if (!domCache.has(id)) {
        const el = document.getElementById(id);
        if (el) domCache.set(id, el);
        return el;
    }
    return domCache.get(id);
};

// Debounce function for expensive operations
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for frequent events
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Batch localStorage operations
const localStorageQueue = [];
let localStorageTimeout = null;
function batchLocalStorageOperation(operation) {
    localStorageQueue.push(operation);
    if (localStorageTimeout) clearTimeout(localStorageTimeout);
    localStorageTimeout = setTimeout(() => {
        localStorageQueue.forEach(op => op());
        localStorageQueue.length = 0;
    }, 100);
}

// ========================================
// STORAGE UTILITIES (OPTIMIZED)
// ========================================

// Check if localStorage is available (cached)
let localStorageAvailable = null;
function isLocalStorageAvailable() {
    if (localStorageAvailable !== null) return localStorageAvailable;
    try {
        const test = 'localStorageTest';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        localStorageAvailable = true;
        return true;
    } catch (e) {
        console.warn('localStorage not available:', e);
        localStorageAvailable = false;
        return false;
    }
}

// Optimized load from localStorage with caching
let groupsCache = null;
let groupsCacheTime = 0;
const CACHE_TTL = 1000; // 1 second cache

function loadFromLocalStorage() {
    if (!isLocalStorageAvailable()) return [];
    
    const now = Date.now();
    if (groupsCache && (now - groupsCacheTime) < CACHE_TTL) {
        return groupsCache;
    }
    
    try {
        const data = localStorage.getItem('spliteasy_groups');
        const parsed = data ? JSON.parse(data) : [];
        groupsCache = parsed;
        groupsCacheTime = now;
        return parsed;
    } catch (error) {
        console.error('Error parsing groups from localStorage:', error);
        localStorage.removeItem('spliteasy_groups');
        groupsCache = [];
        groupsCacheTime = now;
        return [];
    }
}

// Invalidate cache when data changes
function invalidateGroupsCache() {
    groupsCache = null;
    groupsCacheTime = 0;
}

// ========================================
// NOTIFICATION SYSTEM (OPTIMIZED)
// ========================================

// Cache notification element
let notificationElement = null;
let notificationTimeout = null;

function showNotification(message, type = 'success') {
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Cache notification element
    if (!notificationElement) {
        notificationElement = getCachedElement('notification');
    }

    if (notificationElement) {
        // Clear previous timeout
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
        }

        notificationElement.textContent = message;
        notificationElement.className = `notification ${type}`;
        notificationElement.style.display = 'block';

        // Auto-hide after 3 seconds
        notificationTimeout = setTimeout(() => {
            if (notificationElement) {
                notificationElement.style.display = 'none';
            }
        }, 3000);
    } else {
        // Fallback to console
        if (type === 'error') {
            console.error('❌', message);
        } else {
            console.log('✅', message);
        }
    }
}

// ========================================
// DATE & CURRENCY FORMATTING (OPTIMIZED)
// ========================================

// Cache formatters for better performance
const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
});

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return dateFormatter.format(date);
    } catch (e) {
        return dateString;
    }
}

// Format currency for display
function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    // Keep space between ₹ and amount (e.g., "₹ 70.00")
    return currencyFormatter.format(num);
}

// Format relative time (optimized)
function formatRelativeTime(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return formatDate(dateString);
    } catch (e) {
        return dateString;
    }
}

// ========================================
// HTML ESCAPING (OPTIMIZED)
// ========================================

// Cache div element for HTML escaping
let escapeDiv = null;
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    if (!escapeDiv) {
        escapeDiv = document.createElement('div');
    }
    escapeDiv.textContent = text;
    return escapeDiv.innerHTML;
}

// ========================================
// ID GENERATION
// ========================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Generate unique user ID
function generateUserId(username) {
    const clean = username.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 8);
    const timestamp = Date.now().toString().slice(-4);
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return (clean || 'user') + timestamp + random;
}

// ========================================
// VALIDATION UTILITIES
// ========================================

// Validate user ID format (optimized regex)
const userIdRegex = /^[a-zA-Z0-9]{3,20}$/;
function isValidUserId(userId) {
    return userIdRegex.test(userId);
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
    return emailRegex.test(email);
}

// ========================================
// DOM UTILITIES (OPTIMIZED)
// ========================================

// Safe element selector with caching
function safeGetElement(id) {
    return getCachedElement(id);
}

// Safe event listener addition
function safeAddEventListener(elementId, event, handler) {
    const element = safeGetElement(elementId);
    if (element && typeof handler === 'function') {
        element.addEventListener(event, handler);
        return true;
    }
    return false;
}

// Safe update element text
function safeUpdateElement(id, content) {
    const element = safeGetElement(id);
    if (element) {
        element.textContent = content;
        return true;
    }
    return false;
}

// ========================================
// EXPORT TO WINDOW (GLOBAL ACCESS)
// ========================================

// Make all utility functions globally available
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatRelativeTime = formatRelativeTime;
window.escapeHtml = escapeHtml;
window.generateId = generateId;
window.generateUserId = generateUserId;
window.isValidUserId = isValidUserId;
window.isValidEmail = isValidEmail;
window.showNotification = showNotification;
window.loadFromLocalStorage = loadFromLocalStorage;
window.invalidateGroupsCache = invalidateGroupsCache;
window.safeGetElement = safeGetElement;
window.safeUpdateElement = safeUpdateElement;
window.debounce = debounce;
window.throttle = throttle;
window.batchLocalStorageOperation = batchLocalStorageOperation;

// ========================================
// DEBUGGING UTILITIES
// ========================================

window.debugApp = function() {
    return {
        user: window.currentUser?.name || 'Not logged in',
        groups: window.groups?.length || 0,
        localStorage: isLocalStorageAvailable(),
        supabase: !!window.supabaseClient,
        online: navigator.onLine,
        cacheSize: domCache.size,
        groupsCache: groupsCache ? groupsCache.length : 0
    };
};

console.log('SplitEasy shared utilities loaded successfully');
