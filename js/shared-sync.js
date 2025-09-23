// shared-sync.js - Complete Unified Sync System ENHANCED VERSION
console.log('🚀 Loading enhanced SplitEasy sync system...');

// ========================================
// GLOBAL VARIABLES & STATE
// ========================================
// No conflicts - Use window namespace to avoid conflicts
if (!window.splitEasySync) {
    window.splitEasySync = {
        isSyncing: false,
        syncQueue: [],
        isOffline: !navigator.onLine,
        syncTimeout: null
    };
}

// ========================================
// ENHANCED DATABASE FUNCTIONS
// ========================================

// FIXED: Enhanced delete expense from database with better error handling
async function deleteExpenseFromDatabase(expenseId) {
    console.log('🗑️ deleteExpenseFromDatabase called with ID:', expenseId);

    if (!expenseId) {
        const error = new Error('Expense ID is required for deletion');
        console.error('❌ Delete expense failed:', error.message);
        throw error;
    }

    if (window.splitEasySync.isOffline) {
        console.log('📴 Offline - queuing expense deletion for later sync');
        // Store for later deletion when online
        let deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        deleteQueue.push({ type: 'expense', id: expenseId, timestamp: Date.now() });
        localStorage.setItem('spliteasy_delete_queue', JSON.stringify(deleteQueue));
        return; // Return successfully for offline mode
    }

    if (!window.supabaseClient) {
        const error = new Error('Supabase client not available');
        console.error('❌ Delete expense failed:', error.message);
        throw error;
    }

    try {
        console.log('🔥 Attempting to delete expense from database:', expenseId);

        // Method 1: Try direct deletion
        const { data, error: deleteError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('id', expenseId)
            .select(); // Get deleted records

        if (deleteError) {
            console.error('❌ Supabase delete error:', deleteError);
            throw deleteError;
        }

        // Check if any records were actually deleted
        if (!data || data.length === 0) {
            console.warn('⚠️ No records deleted - expense might not exist in database');
            // This is not necessarily an error - expense might have already been deleted
            console.log('✅ Expense deletion completed (no records found)');
            return;
        }

        console.log('✅ Expense deleted from database successfully:', data);
        console.log('🔢 Number of records deleted:', data.length);

        // Clean up delete queue if this was a queued deletion
        cleanupDeleteQueue('expense', expenseId);

    } catch (error) {
        console.error('❌ Failed to delete expense from database:', error);
        console.error('🔍 Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });

        // If we're online but deletion failed, this is a real error
        if (!window.splitEasySync.isOffline) {
            throw new Error(`Database deletion failed: ${error.message}`);
        }
    }
}

// Clean up delete queue
function cleanupDeleteQueue(type, id) {
    try {
        let deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        deleteQueue = deleteQueue.filter(item => !(item.type === type && item.id === id));
        localStorage.setItem('spliteasy_delete_queue', JSON.stringify(deleteQueue));
        console.log('🧹 Cleaned up delete queue for', type, id);
    } catch (error) {
        console.warn('Failed to clean up delete queue:', error);
    }
}

// Process queued deletions when coming back online
async function processDeleteQueue() {
    try {
        const deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        if (deleteQueue.length === 0) return;

        console.log('🔄 Processing', deleteQueue.length, 'queued deletions...');

        for (const item of deleteQueue) {
            try {
                if (item.type === 'expense') {
                    await deleteExpenseFromDatabase(item.id);
                } else if (item.type === 'group') {
                    await deleteGroupFromDatabase(item.id);
                }
                console.log('✅ Processed queued deletion:', item.type, item.id);
            } catch (error) {
                console.warn('⚠️ Failed to process queued deletion:', item, error.message);
            }
        }

        // Clear the queue
        localStorage.removeItem('spliteasy_delete_queue');
        console.log('🧹 Delete queue cleared');

    } catch (error) {
        console.error('Failed to process delete queue:', error);
    }
}

// ENHANCED: Delete group from database
async function deleteGroupFromDatabase(groupId) {
    console.log('🗑️ deleteGroupFromDatabase called with ID:', groupId);

    if (!groupId) {
        throw new Error('Group ID is required for deletion');
    }

    if (window.splitEasySync.isOffline) {
        console.log('📴 Offline - queuing group deletion for later sync');
        let deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        deleteQueue.push({ type: 'group', id: groupId, timestamp: Date.now() });
        localStorage.setItem('spliteasy_delete_queue', JSON.stringify(deleteQueue));
        return;
    }

    if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
    }

    try {
        console.log('🔥 Deleting group from database:', groupId);

        // Delete expenses first (foreign key constraint)
        const { error: expenseError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('groupid', groupId);

        if (expenseError) {
            console.warn('⚠️ Failed to delete group expenses:', expenseError);
            // Continue with group deletion anyway
        } else {
            console.log('✅ Group expenses deleted');
        }

        // Then delete group
        const { data, error: groupError } = await window.supabaseClient
            .from('groups')
            .delete()
            .eq('id', groupId)
            .select();

        if (groupError) {
            throw groupError;
        }

        console.log('✅ Group deleted from database successfully');
        cleanupDeleteQueue('group', groupId);

    } catch (error) {
        console.error('❌ Failed to delete group from database:', error);
        throw error;
    }
}

// ========================================
// EXISTING SYNC FUNCTIONS (ENHANCED)
// ========================================

// Complete user sync
async function syncUserToDatabase(userData) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        return null;
    }

    try {
        console.log('👤 Syncing user to database:', userData.name);
        const { data, error } = await window.supabaseClient
            .from('users')
            .upsert({
                id: userData.id,
                name: userData.name,
                createdat: userData.createdAt || new Date().toISOString(),
                updatedat: new Date().toISOString()
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
    if (window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) {
        return null;
    }

    try {
        console.log('👥 Syncing group to database:', group.name);

        const { data, error } = await window.supabaseClient
            .from('groups')
            .upsert({
                id: group.id,
                name: group.name,
                createdby: window.currentUser.id,
                updatedby: window.currentUser.id,
                // FIX: Ensure arrays are properly formatted
                members: Array.isArray(group.members) ? group.members : [window.currentUser.id],
                participants: Array.isArray(group.members) ? group.members : [window.currentUser.id],
                totalexpenses: group.totalExpenses || 0,
                expensecount: group.expenses?.length || 0,
                createdat: group.createdAt || new Date().toISOString(),
                updatedat: new Date().toISOString()
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
    if (window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) {
        return null;
    }

    try {
        console.log('💰 Syncing expense to database:', expense.name);

        // Get fresh data
        const localGroups = (typeof loadFromLocalStorage === 'function') ? loadFromLocalStorage() : [];
        const group = localGroups.find(g => g.id === groupId);

        const completeExpenseData = {
            id: expense.id,
            groupid: groupId,
            description: expense.name,
            amount: parseFloat(expense.amount),
            paidby: expense.paidBy || 'unknown',
            splitbetween: expense.splitBetween || group?.members || [],
            createdby: window.currentUser.id,
            createdat: expense.date || new Date().toISOString(),
            updatedat: new Date().toISOString(),
            perpersonamount: expense.perPersonAmount || (parseFloat(expense.amount) / (expense.splitBetween?.length || 1))
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

// ========================================
// BATCH SYNC FUNCTIONS
// ========================================

// Sync all data to database
async function syncAllDataToDatabase() {
    if (window.splitEasySync.isSyncing || window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) {
        return;
    }

    window.splitEasySync.isSyncing = true;
    console.log('🔄 Starting complete data sync...');

    try {
        // Process any queued deletions first
        await processDeleteQueue();

        // Sync current user first
        await syncUserToDatabase(window.currentUser);

        // Get all local data
        const localGroups = (typeof loadFromLocalStorage === 'function') ? loadFromLocalStorage() : [];

        if (localGroups.length === 0) {
            console.log('📭 No groups to sync');
            return;
        }

        // Sync all groups
        for (const group of localGroups) {
            console.log('🔄 Syncing group:', group.name);

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
// ENHANCED AUTO-SYNC SYSTEM
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

// ========================================
// GLOBAL FUNCTION EXPORTS
// ========================================

// Make functions globally available
window.deleteExpenseFromDatabase = deleteExpenseFromDatabase;
window.deleteGroupFromDatabase = deleteGroupFromDatabase;
window.syncExpenseToDatabase = syncExpenseToDatabase;
window.syncGroupToDatabase = syncGroupToDatabase;
window.syncUserToDatabase = syncUserToDatabase;
window.syncAllDataToDatabase = syncAllDataToDatabase;
window.saveToLocalStorage = saveToLocalStorage;
window.processDeleteQueue = processDeleteQueue;

// Sync management functions
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
        lastSync: localStorage.getItem('lastsynctime')
    };
};

// ========================================
// INITIALIZATION
// ========================================

// Initialize sync system when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 Initializing enhanced sync system...');

    // Check initial online status
    window.splitEasySync.isOffline = !navigator.onLine;

    // Set up sync status monitoring
    if (window.currentUser) {
        console.log('👤 Sync system ready for user:', window.currentUser.name);
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
    };

    // Connection keeper
    setTimeout(() => {
        if (!window.supabaseClient && window.initializeSupabase) {
            window.initializeSupabase();
        }
    }, 5000);

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

console.log('✅ Enhanced SplitEasy sync system loaded successfully');