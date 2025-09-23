// Enhanced User Authentication System
let userIdCheckTimeout = null;
let isUserIdAvailable = false;

// Initialize app with previous users check
async function initializeApp() {
    console.log('🚀 Initializing SplitEasy...');
    
    // Check for existing user
    const userData = localStorage.getItem('spliteasy_current_user');
    const previousUsers = getPreviousUsers();
    
    if (userData) {
        window.currentUser = JSON.parse(userData);
        document.getElementById('currentUserName').textContent = window.currentUser.name;
        loadGroups();
        showMainContent();
    } else if (previousUsers.length > 0) {
        showUserLoginModal(true); // Show with previous users
    } else {
        showUserLoginModal(false); // Show new user form
    }
}

// Enhanced User Login Modal
function showUserLoginModal(hasPreviousUsers = false) {
    const modal = document.getElementById('userLoginModal');
    const previousSection = document.getElementById('previousUsersSection');
    const newUserForm = document.getElementById('newUserForm');
    
    if (hasPreviousUsers) {
        loadPreviousUsers();
        previousSection.style.display = 'block';
        newUserForm.style.display = 'none';
    } else {
        previousSection.style.display = 'none';
        newUserForm.style.display = 'block';
    }
    
    modal.style.display = 'block';
    setupUserIdInput();
}

// Setup User ID input validation
function setupUserIdInput() {
    const userIdInput = document.getElementById('userIdInput');
    const checkBtn = document.querySelector('.btn-check');
    const continueBtn = document.getElementById('continueBtn');
    
    userIdInput.addEventListener('input', function() {
        const userId = this.value.trim();
        
        // Reset status
        resetUserIdStatus();
        isUserIdAvailable = false;
        continueBtn.disabled = true;
        
        if (userId.length >= 3 && isValidUserId(userId)) {
            checkBtn.disabled = false;
            
            // Clear previous timeout
            clearTimeout(userIdCheckTimeout);
            
            // Auto-check after 1 second of typing
            userIdCheckTimeout = setTimeout(() => {
                checkUserIdAvailability();
            }, 1000);
        } else {
            checkBtn.disabled = true;
            if (userId.length > 0) {
                setUserIdStatus('Invalid User ID format', 'error');
            }
        }
    });
}

// Validate User ID format
function isValidUserId(userId) {
    const regex = /^[a-zA-Z0-9]{3,20}$/;
    return regex.test(userId);
}

// Check User ID availability
async function checkUserIdAvailability() {
    const userIdInput = document.getElementById('userIdInput');
    const userId = userIdInput.value.trim();
    const checkBtn = document.querySelector('.btn-check');
    
    if (!userId || !isValidUserId(userId)) {
        setUserIdStatus('Invalid User ID format', 'error');
        return;
    }
    
    // Show checking status
    setUserIdStatus('Checking availability...', 'checking');
    checkBtn.disabled = true;
    checkBtn.textContent = '...';
    
    try {
        // Check against previous local users first
        const previousUsers = getPreviousUsers();
        const localExists = previousUsers.some(user => user.id.toLowerCase() === userId.toLowerCase());
        
        if (localExists) {
            setUserIdStatus('User ID is unavailable', 'error');
            isUserIdAvailable = false;
            document.getElementById('continueBtn').disabled = true;
            return;
        }
        
        // Check against database
        const exists = await checkUserIdExists(userId);
        
        if (exists) {
            setUserIdStatus('User ID is unavailable', 'error');
            isUserIdAvailable = false;
            document.getElementById('continueBtn').disabled = true;
        } else {
            setUserIdStatus('User ID is available', 'success');
            isUserIdAvailable = true;
            
            // Enable continue button if name is also filled
            const userName = document.getElementById('userName').value.trim();
            if (userName) {
                document.getElementById('continueBtn').disabled = false;
            }
        }
    } catch (error) {
        console.error('User ID check failed:', error);
        setUserIdStatus('Unable to verify availability (offline mode)', 'warning');
        isUserIdAvailable = true; // Allow in offline mode
        
        const userName = document.getElementById('userName').value.trim();
        if (userName) {
            document.getElementById('continueBtn').disabled = false;
        }
    } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check';
    }
}

// Set User ID status
function setUserIdStatus(message, type) {
    const statusEl = document.getElementById('userIdStatus');
    statusEl.textContent = message;
    statusEl.className = `form-help ${type}`;
}

// Reset User ID status
function resetUserIdStatus() {
    setUserIdStatus('Enter a unique User ID', '');
}

// Enhanced Generate User ID
function handleGenerateUserId() {
    const userName = document.getElementById('userName').value.trim();
    if (!userName) {
        showNotification('Please enter your name first', 'error');
        return;
    }
    
    let userId = generateUniqueUserId(userName);
    document.getElementById('userIdInput').value = userId;
    
    // Trigger availability check
    checkUserIdAvailability();
}

// Generate unique User ID
function generateUniqueUserId(name) {
    const previousUsers = getPreviousUsers();
    const baseId = generateUserIdFromName(name);
    let userId = baseId;
    let counter = 1;
    
    // Ensure uniqueness against local users
    while (previousUsers.some(user => user.id.toLowerCase() === userId.toLowerCase())) {
        userId = baseId + counter;
        counter++;
    }
    
    return userId;
}

// Enhanced Create User
async function createUser() {
    const userName = document.getElementById('userName').value.trim();
    const userId = document.getElementById('userIdInput').value.trim();
    
    if (!userName) {
        showNotification('Please enter your name', 'error');
        return;
    }
    
    if (!userId || !isValidUserId(userId)) {
        showNotification('Please enter a valid User ID', 'error');
        return;
    }
    
    if (!isUserIdAvailable) {
        showNotification('Please check User ID availability', 'error');
        return;
    }
    
    // Create user data
    const userData = {
        id: userId,
        name: userName,
        createdAt: new Date().toISOString()
    };
    
    try {
        // Try to create user in database
        if (window.supabaseClient) {
            await createUserInDatabase(userId, userName);
        }
        
        // Store user data
        localStorage.setItem('spliteasy_current_user', JSON.stringify(userData));
        storePreviousUser(userData);
        
        window.currentUser = userData;
        document.getElementById('currentUserName').textContent = userName;
        
        showMainContent();
        loadGroups();
        showNotification(`Welcome, ${userName}!`);
        
    } catch (error) {
        console.error('User creation failed:', error);
        showNotification('Failed to create user. Please try again.', 'error');
    }
}

// Previous Users Management
function getPreviousUsers() {
    try {
        const data = localStorage.getItem('spliteasy_previous_users');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading previous users:', error);
        return [];
    }
}

function storePreviousUser(userData) {
    try {
        let previousUsers = getPreviousUsers();
        
        // Remove if already exists (to avoid duplicates)
        previousUsers = previousUsers.filter(user => user.id !== userData.id);
        
        // Add to beginning of array
        previousUsers.unshift({
            id: userData.id,
            name: userData.name,
            lastUsed: new Date().toISOString()
        });
        
        // Keep only last 10 users
        previousUsers = previousUsers.slice(0, 10);
        
        localStorage.setItem('spliteasy_previous_users', JSON.stringify(previousUsers));
    } catch (error) {
        console.error('Error storing previous user:', error);
    }
}

function loadPreviousUsers() {
    const previousUsers = getPreviousUsers();
    const container = document.getElementById('previousUsersList');
    
    if (previousUsers.length === 0) {
        container.innerHTML = '<p class="no-users">No previous users found</p>';
        return;
    }
    
    container.innerHTML = previousUsers.map(user => `
        <div class="previous-user-item" onclick="switchToUser('${user.id}')">
            <div class="user-info">
                <div class="user-name">${escapeHtml(user.name)}</div>
                <div class="user-id">ID: ${escapeHtml(user.id)}</div>
                <div class="last-used">Last used: ${formatRelativeTime(user.lastUsed)}</div>
            </div>
            <button class="btn-remove" onclick="removePreviousUser('${user.id}', event)" title="Remove">×</button>
        </div>
    `).join('');
}

// Switch to previous user
async function switchToUser(userId) {
    const previousUsers = getPreviousUsers();
    const userData = previousUsers.find(user => user.id === userId);
    
    if (!userData) {
        showNotification('User not found', 'error');
        return;
    }
    
    // Create full user data
    const fullUserData = {
        id: userData.id,
        name: userData.name,
        createdAt: userData.createdAt || new Date().toISOString()
    };
    
    // Store as current user
    localStorage.setItem('spliteasy_current_user', JSON.stringify(fullUserData));
    storePreviousUser(fullUserData); // Update last used time
    
    window.currentUser = fullUserData;
    document.getElementById('currentUserName').textContent = userData.name;
    
    showMainContent();
    loadGroups();
    showNotification(`Switched to ${userData.name}`);
}

// Remove previous user
function removePreviousUser(userId, event) {
    event.stopPropagation(); // Prevent switching to user
    
    if (confirm('Remove this user from the list?')) {
        let previousUsers = getPreviousUsers();
        previousUsers = previousUsers.filter(user => user.id !== userId);
        localStorage.setItem('spliteasy_previous_users', JSON.stringify(previousUsers));
        
        loadPreviousUsers();
        showNotification('User removed from list');
    }
}

// Show new user form
function showNewUserForm() {
    document.getElementById('previousUsersSection').style.display = 'none';
    document.getElementById('newUserForm').style.display = 'block';
    
    // Clear form
    document.getElementById('userName').value = '';
    document.getElementById('userIdInput').value = '';
    resetUserIdStatus();
    document.getElementById('continueBtn').disabled = true;
    
    setupUserIdInput();
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatRelativeTime(dateString) {
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
    return date.toLocaleDateString();
}

// Enhanced Change User function
function showUserLoginModal() {
    const previousUsers = getPreviousUsers();
    showUserLoginModal(previousUsers.length > 0);
}

// Also enable/disable continue button when name changes
document.addEventListener('DOMContentLoaded', function() {
    // Name input validation
    const userNameInput = document.getElementById('userName');
    if (userNameInput) {
        userNameInput.addEventListener('input', function() {
            const continueBtn = document.getElementById('continueBtn');
            const userName = this.value.trim();
            const userId = document.getElementById('userIdInput').value.trim();
            
            if (userName && userId && isUserIdAvailable) {
                continueBtn.disabled = false;
            } else {
                continueBtn.disabled = true;
            }
        });
    }
});
