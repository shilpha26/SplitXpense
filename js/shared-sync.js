// sync.js - Complete Unified Sync System (FIXED VERSION)
console.log('🔄 Loading unified SplitEasy sync system...');

// ========================================
// GLOBAL VARIABLES & STATE (No conflicts)
// ========================================

// Use window namespace to avoid conflicts
if (!window.splitEasySync) {
    window.splitEasySync = {
        isSyncing: false,
        syncQueue: [],
        isOffline: !navigator.onLine,
        syncTimeout: null
    };
}

// ========================================
// CORE SYNC FUNCTIONS
// ========================================

// Complete user sync
async function syncUserToDatabase(userData) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) return null;

    try {
        console.log('👤 Syncing user to database:', userData.name);

        const { data, error } = await window.supabaseClient
            .from('users')
            .upsert({
                id: userData.id,
                name: userData.name,
                created_at: userData.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        console.log('✅ User synced successfully');
        return data;

    } catch (error) {
        console.error('❌ Failed to sync user:', error);
        return null;
    }
}

// Complete group sync
async function syncGroupToDatabase(group) {
    if (window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) return null;

    try {
        console.log('👥 Syncing group to database:', group.name);

        // In shared-sync.js, replace the problematic section:
    const { data, error } = await window.supabaseClient
    .from('groups')
    .upsert({
        id: group.id,
        name: group.name,
        created_by: window.currentUser.id,
        updated_by: window.currentUser.id,
        // FIX: Ensure arrays are properly formatted
        members: Array.isArray(group.members) ? group.members : [window.currentUser.id],
        participants: Array.isArray(group.members) ? group.members : [window.currentUser.id],
        total_expenses: group.totalExpenses || 0,
        expense_count: group.expenses?.length || 0,
        created_at: group.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
    })
    .select()
    .single();


        if (error) throw error;
        console.log('✅ Group synced successfully');
        return data;

    } catch (error) {
        console.error('❌ Failed to sync group:', error);
        return null;
    }
}

// Complete expense sync
async function syncExpenseToDatabase(expense, groupId) {
    if (window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) return null;

    try {
        console.log('💰 Syncing expense to database:', expense.name);

        // Get fresh data
        const localGroups = loadFromLocalStorage ? loadFromLocalStorage() : [];
        const group = localGroups.find(g => g.id === groupId);

        const completeExpenseData = {
            id: expense.id,
            group_id: groupId,
            description: expense.name,
            amount: parseFloat(expense.amount),
            paid_by: expense.paidBy || 'unknown',
            split_between: expense.splitBetween || group?.members || [],
            created_by: window.currentUser.id,
            created_at: expense.date || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            per_person_amount: expense.perPersonAmount || (parseFloat(expense.amount) / (expense.splitBetween?.length || 1))
        };

        const { data, error } = await window.supabaseClient
            .from('expenses')
            .upsert(completeExpenseData)
            .select()
            .single();

        if (error) throw error;
        console.log('✅ Expense synced successfully');
        return data;

    } catch (error) {
        console.error('❌ Failed to sync expense:', error);
        return null;
    }
}

// Delete from database
async function deleteGroupFromDatabase(groupId) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) return;

    try {
        console.log('🗑️ Deleting group from database:', groupId);

        // Delete expenses first (foreign key constraint)
        await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('group_id', groupId);

        // Then delete group
        await window.supabaseClient
            .from('groups')
            .delete()
            .eq('id', groupId);

        console.log('✅ Group deleted from database');

    } catch (error) {
        console.error('❌ Failed to delete group from database:', error);
    }
}

// ========================================
// BATCH SYNC FUNCTIONS
// ========================================

// Sync all data to database
async function syncAllDataToDatabase() {
    if (window.splitEasySync.isSyncing || window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) return;

    window.splitEasySync.isSyncing = true;
    console.log('🔄 Starting complete data sync...');

    try {
        // Sync current user first
        await syncUserToDatabase(window.currentUser);

        // Get all local data
        const localGroups = loadFromLocalStorage ? loadFromLocalStorage() : [];

        if (localGroups.length === 0) {
            console.log('📊 No groups to sync');
            return;
        }

        // Sync all groups
        for (const group of localGroups) {
            console.log(`📊 Syncing group: ${group.name}`);

            // Sync group
            await syncGroupToDatabase(group);

            // Sync all expenses in this group
            if (group.expenses && group.expenses.length > 0) {
                for (const expense of group.expenses) {
                    await syncExpenseToDatabase(expense, group.id);
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('✅ Complete data sync finished successfully!');
        if (typeof showNotification === 'function') {
            showNotification('All data synced to cloud successfully!');
        }

    } catch (error) {
        console.error('❌ Complete data sync failed:', error);
        if (typeof showNotification === 'function') {
            showNotification('Sync failed, will retry later', 'error');
        }
    } finally {
        window.splitEasySync.isSyncing = false;
    }
}

// ========================================
// SMART AUTO-SYNC SYSTEM
// ========================================

// Enhanced saveToLocalStorage with intelligent auto-sync
function saveToLocalStorage() {
    // Check if we have the required functions and data
    if (typeof isLocalStorageAvailable === 'function' && !isLocalStorageAvailable()) {
        console.warn('localStorage not available');
        return;
    }

    // Use window.groups if available, otherwise try groups variable
    const groupsToSave = window.groups || (typeof groups !== 'undefined' ? groups : []);

    if (!groupsToSave || !Array.isArray(groupsToSave)) {
        console.warn('No groups data to save');
        return;
    }

    try {
        // Calculate totals for each group
        groupsToSave.forEach(group => {
            if (group.expenses && group.expenses.length > 0) {
                group.totalExpenses = group.expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
                group.expenses.forEach(exp => {
                    if (exp.splitBetween && exp.splitBetween.length > 0) {
                        exp.perPersonAmount = parseFloat(exp.amount || 0) / exp.splitBetween.length;
                    }
                });
            } else {
                group.totalExpenses = 0;
            }
        });

        // Save to localStorage
        localStorage.setItem('spliteasy_groups', JSON.stringify(groupsToSave));
        console.log('💾 Data saved to localStorage');

        // Update window.groups to ensure consistency
        window.groups = groupsToSave;

        // Auto-sync to database if conditions are met
        if (!window.splitEasySync.isOffline && window.supabaseClient && window.currentUser && !window.splitEasySync.isSyncing) {
            // Clear any pending sync
            clearTimeout(window.splitEasySync.syncTimeout);

            // Schedule sync after 2 seconds of inactivity
            window.splitEasySync.syncTimeout = setTimeout(() => {
                console.log('🔄 Auto-sync triggered');
                syncAllDataToDatabase();
            }, 2000);
        }

    } catch (error) {
        console.error('❌ Failed to save to localStorage:', error);
    }
}

// ========================================
// DATABASE QUERY FUNCTIONS
// ========================================

// Check if user ID exists in database
async function checkUserIdExists(userId) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) return false;

    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();

        return !!data && !error;
    } catch (error) {
        console.warn('User ID check failed:', error);
        return false;
    }
}

// Create user in database
async function createUserInDatabase(userId, username) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        return { id: userId, name: username };
    }

    try {
        const userData = {
            id: userId,
            name: username,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await window.supabaseClient
            .from('users')
            .insert(userData)
            .select()
            .single();

        if (error) throw error;
        console.log('✅ User created in database:', username);
        return data;

    } catch (error) {
        console.warn('User creation failed, using local data:', error);
        return { id: userId, name: username };
    }
}

// ========================================
// SYNC MANAGEMENT & STATUS
// ========================================

// Manual sync trigger
window.forceSyncToDatabase = async function() {
    if (window.splitEasySync.isSyncing) {
        if (typeof showNotification === 'function') {
            showNotification('Sync already in progress...', 'info');
        }
        return;
    }

    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        if (typeof showNotification === 'function') {
            showNotification('Cannot sync - you are offline', 'error');
        }
        return;
    }

    if (!window.currentUser) {
        if (typeof showNotification === 'function') {
            showNotification('Please log in to sync data', 'error');
        }
        return;
    }

    if (typeof showNotification === 'function') {
        showNotification('Starting sync...', 'info');
    }
    await syncAllDataToDatabase();
};

// Sync status indicator
window.getSyncStatus = function() {
    return {
        syncing: window.splitEasySync.isSyncing,
        online: !window.splitEasySync.isOffline,
        hasSupabase: !!window.supabaseClient,
        hasUser: !!window.currentUser,
        canSync: !window.splitEasySync.isOffline && !!window.supabaseClient && !!window.currentUser && !window.splitEasySync.isSyncing,
        lastSync: localStorage.getItem('last_sync_time')
    };
};

// Add sync functions to window for backward compatibility
window.syncExpenseToDatabase = syncExpenseToDatabase;
window.syncGroupToDatabase = syncGroupToDatabase;
window.syncUserToDatabase = syncUserToDatabase;
window.deleteGroupFromDatabase = deleteGroupFromDatabase;
window.syncAllDataToDatabase = syncAllDataToDatabase;

// ========================================
// CONNECTION MANAGEMENT
// ========================================

// Monitor online/offline status
window.addEventListener('online', function() {
    window.splitEasySync.isOffline = false;
    console.log('🌐 Back online, resuming sync...');
    if (typeof showNotification === 'function') {
        showNotification('Back online - data sync resumed');
    }

    // Trigger sync after coming back online
    setTimeout(() => {
        if (window.groups && window.groups.length > 0) {
            syncAllDataToDatabase();
        }
    }, 1000);
});

window.addEventListener('offline', function() {
    window.splitEasySync.isOffline = true;
    console.log('📴 Gone offline, sync paused');
    if (typeof showNotification === 'function') {
        showNotification('You are offline - changes will sync when reconnected', 'info');
    }
});

// Periodic sync (every 5 minutes if active)
setInterval(async () => {
    if (!window.splitEasySync.isOffline && window.supabaseClient && window.currentUser && !window.splitEasySync.isSyncing) {
        const lastSync = localStorage.getItem('last_sync_time');
        const now = Date.now();

        // Sync if last sync was more than 5 minutes ago
        if (!lastSync || (now - parseInt(lastSync)) > 300000) {
            console.log('⏰ Periodic sync triggered');
            await syncAllDataToDatabase();
            localStorage.setItem('last_sync_time', now.toString());
        }
    }
}, 300000); // 5 minutes

// ========================================
// INITIALIZATION
// ========================================

// Initialize sync system when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Initializing unified sync system...');

    // Check initial online status
    window.splitEasySync.isOffline = !navigator.onLine;

    // Set up sync status monitoring
    if (window.currentUser) {
        console.log('✅ Sync system ready for user:', window.currentUser.name);
    }

    // Clear any old sync timeouts
    if (window.splitEasySync.syncTimeout) {
        clearTimeout(window.splitEasySync.syncTimeout);
    }

    // Wait for Supabase to be ready
    const setupSync = () => {
        if (!window.supabaseClient && window.initializeSupabase) {
            window.initializeSupabase();
        }

        // Connection keeper
        setTimeout(() => {
            if (!window.supabaseClient && window.initializeSupabase) {
                window.initializeSupabase();
            }
        }, 5000);
    };

    setupSync();
});

// Debug function for development
window.debugSync = function() {
    return {
        status: window.getSyncStatus(),
        groups: window.groups?.length || 0,
        user: window.currentUser?.name || 'Not logged in',
        offline: window.splitEasySync.isOffline,
        syncing: window.splitEasySync.isSyncing,
        namespace: 'splitEasySync'
    };
};

console.log('✅ Unified SplitEasy sync system loaded successfully');

// Enhanced User ID validation functions (add to existing shared-sync.js)

// Check if user ID exists in database
async function checkUserIdExists(userId) {
    if (window.splitEasySync?.isOffline || !window.supabaseClient) {
        console.warn('Cannot check User ID - offline or no database connection');
        return false; // Assume available in offline mode
    }
    
    try {
        console.log('🔍 Checking User ID availability:', userId);
        
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('id')
            .ilike('id', userId) // Case-insensitive check
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            throw error;
        }
        
        const exists = !!data;
        console.log('User ID check result:', { userId, exists });
        return exists;
        
    } catch (error) {
        console.error('Failed to check User ID:', error);
        throw error;
    }
}

// Create user in database with validation
async function createUserInDatabase(userId, userName) {
    if (window.splitEasySync?.isOffline || !window.supabaseClient) {
        console.warn('Cannot create user in database - offline or no connection');
        return { id: userId, name: userName }; // Return local data
    }
    
    try {
        console.log('👤 Creating user in database:', { userId, userName });
        
        // Double-check availability
        const exists = await checkUserIdExists(userId);
        if (exists) {
            throw new Error('User ID is already taken');
        }
        
        const userData = {
            id: userId,
            name: userName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const { data, error } = await window.supabaseClient
            .from('users')
            .insert(userData)
            .select()
            .single();
        
        if (error) {
            throw error;
        }
        
        console.log('✅ User created in database successfully');
        return data;
        
    } catch (error) {
        console.error('❌ Failed to create user in database:', error);
        throw error;
    }
}

// Get user by ID from database
async function getUserFromDatabase(userId) {
    if (window.splitEasySync?.isOffline || !window.supabaseClient) {
        return null;
    }
    
    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        return data;
    } catch (error) {
        console.error('Failed to get user from database:', error);
        return null;
    }
}

// Delete expense from database
async function deleteExpenseFromDatabase(expenseId) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        console.log('🔄 Queuing expense deletion for later sync');
        return;
    }
    
    try {
        console.log('🗑️ Deleting expense from database:', expenseId);
        const { error } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('id', expenseId);
            
        if (error) throw error;
        console.log('✅ Expense deleted from database successfully');
    } catch (error) {
        console.error('❌ Failed to delete expense from database:', error);
        throw error;
    }
}

// Make functions available globally
window.checkUserIdExists = checkUserIdExists;
window.createUserInDatabase = createUserInDatabase;
window.getUserFromDatabase = getUserFromDatabase;
window.deleteExpenseFromDatabase = deleteExpenseFromDatabase;