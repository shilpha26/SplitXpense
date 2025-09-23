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

// Add these functions to shared-sync.js

// Fetch group from database by ID
async function fetchGroupFromDatabase(groupId) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        console.log('Cannot fetch group - offline or no database connection');
        return null;
    }
    
    try {
        console.log('🔍 Fetching group from database:', groupId);
        
        // Get group data
        const { data: groupData, error: groupError } = await window.supabaseClient
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();
            
        if (groupError) {
            console.error('Group not found in database:', groupError);
            return null;
        }
        
        // Get group expenses
        const { data: expensesData, error: expensesError } = await window.supabaseClient
            .from('expenses')
            .select('*')
            .eq('group_id', groupId);
            
        if (expensesError) {
            console.warn('Failed to fetch expenses:', expensesError);
        }
        
        // Combine group with expenses
        const completeGroup = {
            id: groupData.id,
            name: groupData.name,
            members: groupData.members || [],
            createdBy: groupData.created_by,
            createdAt: groupData.created_at,
            totalExpenses: groupData.total_expenses || 0,
            expenses: (expensesData || []).map(expense => ({
                id: expense.id,
                name: expense.description,
                amount: expense.amount,
                paidBy: expense.paid_by,
                splitBetween: expense.split_between || [],
                date: expense.created_at,
                perPersonAmount: expense.per_person_amount || 0
            }))
        };
        
        console.log('✅ Group fetched successfully:', completeGroup.name);
        return completeGroup;
        
    } catch (error) {
        console.error('❌ Failed to fetch group from database:', error);
        return null;
    }
}

// Join user to existing group
async function joinUserToGroup(groupId, userId) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        console.log('Cannot join group - offline or no database connection');
        return false;
    }
    
    try {
        console.log('👤 Adding user to group:', userId, '→', groupId);
        
        // Get current group data
        const { data: groupData, error: fetchError } = await window.supabaseClient
            .from('groups')
            .select('members')
            .eq('id', groupId)
            .single();
            
        if (fetchError) throw fetchError;
        
        const currentMembers = groupData.members || [];
        
        // Check if user is already a member
        if (currentMembers.includes(userId)) {
            console.log('User already a member of this group');
            return true;
        }
        
        // Add user to members array
        const updatedMembers = [...currentMembers, userId];
        
        // Update group in database
        const { error: updateError } = await window.supabaseClient
            .from('groups')
            .update({ 
                members: updatedMembers,
                updated_at: new Date().toISOString()
            })
            .eq('id', groupId);
            
        if (updateError) throw updateError;
        
        console.log('✅ User successfully joined group');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to join user to group:', error);
        return false;
    }
}

// ========================================
// REAL-TIME SYNC SYSTEM
// ========================================

// Real-time subscriptions storage
if (!window.splitEasyRealtime) {
    window.splitEasyRealtime = {
        subscriptions: [],
        isSubscribed: false,
        currentUserId: null,
        currentGroupIds: []
    };
}

// Initialize real-time subscriptions
async function initializeRealTimeSync() {
    if (!window.supabaseClient || !window.currentUser) {
        console.log('Cannot initialize real-time - missing client or user');
        return;
    }
    
    console.log('🔄 Initializing real-time sync...');
    
    // Clean up existing subscriptions
    cleanupRealtimeSubscriptions();
    
    // Subscribe to user's groups changes
    await subscribeToUserGroups();
    
    // Subscribe to expenses changes
    await subscribeToExpensesChanges();
    
    // Subscribe to user changes
    await subscribeToUserChanges();
    
    window.splitEasyRealtime.isSubscribed = true;
    window.splitEasyRealtime.currentUserId = window.currentUser.id;
    
    console.log('✅ Real-time sync initialized successfully');
    showNotification('Real-time sync enabled - you\'ll see live updates!', 'success');
}

// Subscribe to groups table changes
async function subscribeToUserGroups() {
    try {
        const subscription = window.supabaseClient
            .channel('user-groups')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'groups',
                filter: `members.cs.{${window.currentUser.id}}`
            }, handleGroupChange)
            .subscribe();
            
        window.splitEasyRealtime.subscriptions.push(subscription);
        console.log('📊 Subscribed to groups changes');
    } catch (error) {
        console.error('Failed to subscribe to groups:', error);
    }
}

// Subscribe to expenses table changes  
async function subscribeToExpensesChanges() {
    try {
        // Get current user's group IDs
        const localGroups = loadFromLocalStorage();
        const groupIds = localGroups.map(g => g.id);
        
        if (groupIds.length === 0) return;
        
        const subscription = window.supabaseClient
            .channel('user-expenses')
            .on('postgres_changes', {
                event: '*',
                schema: 'public', 
                table: 'expenses'
            }, handleExpenseChange)
            .subscribe();
            
        window.splitEasyRealtime.subscriptions.push(subscription);
        console.log('💰 Subscribed to expenses changes');
    } catch (error) {
        console.error('Failed to subscribe to expenses:', error);
    }
}

// Subscribe to users table changes
async function subscribeToUserChanges() {
    try {
        const subscription = window.supabaseClient
            .channel('users-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'users'
            }, handleUserChange)
            .subscribe();
            
        window.splitEasyRealtime.subscriptions.push(subscription);
        console.log('👤 Subscribed to user changes');
    } catch (error) {
        console.error('Failed to subscribe to users:', error);
    }
}

// Handle real-time group changes
async function handleGroupChange(payload) {
    console.log('🔄 Real-time group change:', payload);
    
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    try {
        // Don't process changes made by current user
        if (newRecord?.updated_by === window.currentUser?.id) {
            return;
        }
        
        let localGroups = loadFromLocalStorage();
        let updated = false;
        
        switch (eventType) {
            case 'INSERT':
                // New group where user is a member
                if (newRecord && newRecord.members?.includes(window.currentUser.id)) {
                    const existingIndex = localGroups.findIndex(g => g.id === newRecord.id);
                    if (existingIndex === -1) {
                        const newGroup = transformDbGroupToLocal(newRecord);
                        localGroups.push(newGroup);
                        updated = true;
                        showNotification(`Added to new group: ${newRecord.name}`, 'info');
                    }
                }
                break;
                
            case 'UPDATE':
                // Group updated
                const groupIndex = localGroups.findIndex(g => g.id === newRecord.id);
                if (groupIndex !== -1) {
                    localGroups[groupIndex] = transformDbGroupToLocal(newRecord);
                    updated = true;
                    showNotification(`Group "${newRecord.name}" updated`, 'info');
                }
                break;
                
            case 'DELETE':
                // Group deleted
                if (oldRecord) {
                    const deleteIndex = localGroups.findIndex(g => g.id === oldRecord.id);
                    if (deleteIndex !== -1) {
                        localGroups.splice(deleteIndex, 1);
                        updated = true;
                        showNotification(`Group "${oldRecord.name}" was deleted`, 'warning');
                    }
                }
                break;
        }
        
        if (updated) {
            // Update localStorage
            localStorage.setItem('spliteasy_groups', JSON.stringify(localGroups));
            window.groups = localGroups;
            
            // Refresh UI if on main page
            if (typeof displayGroups === 'function') {
                displayGroups();
            }
        }
        
    } catch (error) {
        console.error('Error handling group change:', error);
    }
}

// Handle real-time expense changes
async function handleExpenseChange(payload) {
    console.log('💰 Real-time expense change:', payload);
    
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    try {
        // Don't process changes made by current user
        if (newRecord?.created_by === window.currentUser?.id) {
            return;
        }
        
        let localGroups = loadFromLocalStorage();
        let updated = false;
        
        const targetGroupId = newRecord?.group_id || oldRecord?.group_id;
        const groupIndex = localGroups.findIndex(g => g.id === targetGroupId);
        
        if (groupIndex === -1) return; // Not user's group
        
        switch (eventType) {
            case 'INSERT':
                // New expense added
                if (newRecord) {
                    const newExpense = transformDbExpenseToLocal(newRecord);
                    localGroups[groupIndex].expenses.push(newExpense);
                    updated = true;
                    showNotification(`New expense: ${newRecord.description}`, 'info');
                }
                break;
                
            case 'UPDATE':
                // Expense updated
                const expenseIndex = localGroups[groupIndex].expenses.findIndex(e => e.id === newRecord.id);
                if (expenseIndex !== -1) {
                    localGroups[groupIndex].expenses[expenseIndex] = transformDbExpenseToLocal(newRecord);
                    updated = true;
                    showNotification(`Expense "${newRecord.description}" updated`, 'info');
                }
                break;
                
            case 'DELETE':
                // Expense deleted
                if (oldRecord) {
                    const deleteIndex = localGroups[groupIndex].expenses.findIndex(e => e.id === oldRecord.id);
                    if (deleteIndex !== -1) {
                        localGroups[groupIndex].expenses.splice(deleteIndex, 1);
                        updated = true;
                        showNotification(`Expense "${oldRecord.description}" deleted`, 'info');
                    }
                }
                break;
        }
        
        if (updated) {
            // Recalculate group totals
            localGroups[groupIndex].totalExpenses = localGroups[groupIndex].expenses
                .reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
            
            // Update localStorage
            localStorage.setItem('spliteasy_groups', JSON.stringify(localGroups));
            window.groups = localGroups;
            
            // Refresh UI if on group detail page
            if (window.currentGroup && window.currentGroup.id === targetGroupId) {
                window.currentGroup = localGroups[groupIndex];
                if (typeof displayExpenses === 'function') {
                    displayExpenses();
                    calculateBalances();
                    updateGroupDisplay();
                }
            }
            
            // Refresh UI if on main page
            if (typeof displayGroups === 'function') {
                displayGroups();
            }
        }
        
    } catch (error) {
        console.error('Error handling expense change:', error);
    }
}

// Handle real-time user changes
async function handleUserChange(payload) {
    console.log('👤 Real-time user change:', payload);
    
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Handle user deletion
    if (eventType === 'DELETE' && oldRecord?.id === window.currentUser?.id) {
        showNotification('Your account was deleted from another device', 'error');
        setTimeout(() => {
            localStorage.clear();
            window.location.reload();
        }, 3000);
    }
}

// Transform database records to local format
function transformDbGroupToLocal(dbGroup) {
    return {
        id: dbGroup.id,
        name: dbGroup.name,
        members: dbGroup.members || [],
        createdBy: dbGroup.created_by,
        createdAt: dbGroup.created_at,
        totalExpenses: dbGroup.total_expenses || 0,
        expenses: [] // Will be loaded separately
    };
}

function transformDbExpenseToLocal(dbExpense) {
    return {
        id: dbExpense.id,
        name: dbExpense.description,
        amount: dbExpense.amount,
        paidBy: dbExpense.paid_by,
        splitBetween: dbExpense.split_between || [],
        date: dbExpense.created_at,
        perPersonAmount: dbExpense.per_person_amount || 0
    };
}

// Cleanup subscriptions
function cleanupRealtimeSubscriptions() {
    if (window.splitEasyRealtime.subscriptions.length > 0) {
        console.log('🧹 Cleaning up existing subscriptions');
        window.splitEasyRealtime.subscriptions.forEach(subscription => {
            window.supabaseClient.removeChannel(subscription);
        });
        window.splitEasyRealtime.subscriptions = [];
    }
}

// Initialize real-time when user logs in
function startRealtimeSync() {
    if (window.currentUser && window.supabaseClient) {
        initializeRealTimeSync();
    }
}

// Stop real-time when user logs out
function stopRealtimeSync() {
    cleanupRealtimeSubscriptions();
    window.splitEasyRealtime.isSubscribed = false;
    console.log('🛑 Real-time sync stopped');
}

// Make functions globally available
window.initializeRealTimeSync = initializeRealTimeSync;
window.startRealtimeSync = startRealtimeSync;
window.stopRealtimeSync = stopRealtimeSync;


// Make functions globally available
window.fetchGroupFromDatabase = fetchGroupFromDatabase;
window.joinUserToGroup = joinUserToGroup;
window.checkUserIdExists = checkUserIdExists;
window.createUserInDatabase = createUserInDatabase;
window.getUserFromDatabase = getUserFromDatabase;
window.deleteExpenseFromDatabase = deleteExpenseFromDatabase;