// shared-sync-complete.js - Complete Real-Time Sync System
console.log('🚀 Loading complete SplitEasy real-time sync system...');

// ========================================
// GLOBAL VARIABLES & CONFIGURATION
// ========================================
if (!window.splitEasySync) {
    window.splitEasySync = {
        isSyncing: false,
        syncQueue: [],
        isOffline: !navigator.onLine,
        syncTimeout: null,
        realtimeSubscription: null,
        lastSyncTime: null,
        syncRetryCount: 0,
        maxRetries: 3
    };
}

// ========================================
// ENHANCED DATABASE FUNCTIONS WITH REAL-TIME SYNC
// ========================================

// FIXED: Fetch group from database with complete structure
async function fetchGroupFromDatabase(groupId) {
    console.log('🔍 fetchGroupFromDatabase called with ID:', groupId);

    if (!groupId) {
        throw new Error('Group ID is required');
    }

    if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
    }

    try {
        console.log('🔄 Fetching group from database:', groupId);

        // Fetch group with all related data
        const { data: group, error: groupError } = await window.supabaseClient
            .from('groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (groupError) {
            console.error('❌ Group fetch error:', groupError);
            throw groupError;
        }

        if (!group) {
            console.warn('⚠️ Group not found in database:', groupId);
            return null;
        }

        console.log('📋 Group found:', group.name);

        // Fetch expenses for this group
        const { data: expenses, error: expensesError } = await window.supabaseClient
            .from('expenses')
            .select('*')
            .eq('groupid', groupId)
            .order('createdat', { ascending: false });

        if (expensesError) {
            console.warn('⚠️ Failed to fetch expenses:', expensesError);
            // Continue without expenses rather than failing
        }

        // Structure the group data properly
        const completeGroup = {
            id: group.id,
            name: group.name,
            members: group.members || group.participants || [],
            expenses: expenses || [],
            totalExpenses: expenses ? expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0) : 0,
            createdAt: group.createdat,
            createdBy: group.createdby
        };

        // Ensure expenses have proper structure
        if (completeGroup.expenses) {
            completeGroup.expenses = completeGroup.expenses.map(expense => ({
                id: expense.id,
                name: expense.description || expense.name,
                amount: parseFloat(expense.amount || 0),
                paidBy: expense.paidby,
                splitBetween: expense.splitbetween || [],
                date: expense.createdat,
                perPersonAmount: expense.perpersonamount || (parseFloat(expense.amount || 0) / (expense.splitbetween?.length || 1))
            }));
        }

        console.log('✅ Complete group data assembled:', completeGroup.name, 'with', completeGroup.expenses.length, 'expenses');
        return completeGroup;

    } catch (error) {
        console.error('❌ Failed to fetch group from database:', error);
        throw error;
    }
}

// FIXED: Join user to group with proper database operations
async function joinUserToGroup(groupId, userId) {
    console.log('👥 joinUserToGroup called:', { groupId, userId });

    if (!groupId || !userId) {
        throw new Error('Group ID and User ID are required');
    }

    if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
    }

    try {
        // First check if group exists
        const { data: group, error: groupError } = await window.supabaseClient
            .from('groups')
            .select('members, participants')
            .eq('id', groupId)
            .single();

        if (groupError || !group) {
            throw new Error('Group not found or inaccessible');
        }

        // Check if user is already a member
        const currentMembers = group.members || group.participants || [];
        if (currentMembers.includes(userId)) {
            console.log('👥 User already a member of the group');
            return true;
        }

        // Add user to members list
        const updatedMembers = [...currentMembers, userId];

        // Update the group with new member
        const { error: updateError } = await window.supabaseClient
            .from('groups')
            .update({
                members: updatedMembers,
                participants: updatedMembers,
                updatedat: new Date().toISOString()
            })
            .eq('id', groupId);

        if (updateError) {
            throw updateError;
        }

        console.log('✅ User successfully joined group');
        return true;

    } catch (error) {
        console.error('❌ Failed to join user to group:', error);
        throw error;
    }
}

// ENHANCED: Delete expense from database with improved error handling
async function deleteExpenseFromDatabase(expenseId) {
    console.log('🗑️ deleteExpenseFromDatabase called with ID:', expenseId);

    if (!expenseId) {
        throw new Error('Expense ID is required for deletion');
    }

    if (window.splitEasySync.isOffline) {
        console.log('📴 Offline - queuing expense deletion for later sync');
        let deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        deleteQueue.push({ type: 'expense', id: expenseId, timestamp: Date.now() });
        localStorage.setItem('spliteasy_delete_queue', JSON.stringify(deleteQueue));
        return;
    }

    if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
    }

    try {
        console.log('🔥 Attempting to delete expense from database:', expenseId);

        const { data, error: deleteError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('id', expenseId)
            .select();

        if (deleteError) {
            console.error('❌ Supabase delete error:', deleteError);
            throw deleteError;
        }

        if (!data || data.length === 0) {
            console.warn('⚠️ No records deleted - expense might not exist in database');
            return;
        }

        console.log('✅ Expense deleted from database successfully:', data.length, 'records');
        cleanupDeleteQueue('expense', expenseId);

    } catch (error) {
        console.error('❌ Failed to delete expense from database:', error);
        throw error;
    }
}

// Delete group from database
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

        // Delete expenses first
        const { error: expenseError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('groupid', groupId);

        if (expenseError) {
            console.warn('⚠️ Failed to delete group expenses:', expenseError);
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
// SYNC FUNCTIONS
// ========================================

// Complete user sync
async function syncUserToDatabase(userData) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        console.log('📴 Skipping user sync - offline or no client');
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
        console.log('📴 Skipping group sync - offline, no client, or no user');
        return null;
    }

    try {
        console.log('👥 Syncing group to database:', group.name);

        const { data, error } = await window.supabaseClient
            .from('groups')
            .upsert({
                id: group.id,
                name: group.name,
                createdby: group.createdBy || window.currentUser.id,
                updatedby: window.currentUser.id,
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
        console.log('📴 Skipping expense sync - offline, no client, or no user');
        return null;
    }

    try {
        console.log('💰 Syncing expense to database:', expense.name);

        const completeExpenseData = {
            id: expense.id,
            groupid: groupId,
            description: expense.name,
            amount: parseFloat(expense.amount),
            paidby: expense.paidBy || 'unknown',
            splitbetween: expense.splitBetween || [],
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
// REAL-TIME SYNC SYSTEM
// ========================================

// FIXED: Start real-time sync with proper subscription handling
async function startRealtimeSync() {
    console.log('🔄 Starting real-time sync system...');

    if (!window.currentUser) {
        console.warn('⚠️ No current user - cannot start real-time sync');
        return;
    }

    if (!window.supabaseClient) {
        console.warn('⚠️ No Supabase client - cannot start real-time sync');
        return;
    }

    if (window.splitEasySync.realtimeSubscription) {
        console.log('🔄 Real-time sync already running - stopping previous subscription');
        await stopRealtimeSync();
    }

    try {
        // Subscribe to groups changes
        console.log('📡 Setting up real-time subscription for groups...');

        const subscription = window.supabaseClient
            .channel('groups-realtime')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'groups',
                    filter: `createdby=eq.${window.currentUser.id}`
                }, 
                async (payload) => {
                    console.log('🔄 Real-time group change received:', payload);
                    await handleRealtimeGroupChange(payload);
                }
            )
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'expenses'
                }, 
                async (payload) => {
                    console.log('🔄 Real-time expense change received:', payload);
                    await handleRealtimeExpenseChange(payload);
                }
            )
            .subscribe((status) => {
                console.log('📡 Real-time subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Real-time sync is now active!');
                    showNotificationSafe('Real-time sync enabled', 'success');
                } else if (status === 'CLOSED') {
                    console.log('❌ Real-time sync disconnected');
                    showNotificationSafe('Real-time sync disconnected', 'warning');
                }
            });

        window.splitEasySync.realtimeSubscription = subscription;
        console.log('✅ Real-time sync subscription set up successfully');

    } catch (error) {
        console.error('❌ Failed to start real-time sync:', error);
        showNotificationSafe('Real-time sync failed to start', 'error');
    }
}

// Stop real-time sync
async function stopRealtimeSync() {
    if (window.splitEasySync.realtimeSubscription) {
        console.log('🛑 Stopping real-time sync...');
        await window.supabaseClient.removeChannel(window.splitEasySync.realtimeSubscription);
        window.splitEasySync.realtimeSubscription = null;
        console.log('✅ Real-time sync stopped');
    }
}

// Handle real-time group changes
async function handleRealtimeGroupChange(payload) {
    console.log('👥 Processing real-time group change:', payload.eventType);

    try {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            // Update local storage with new/updated group
            const groups = loadFromLocalStorageSafe();
            const existingIndex = groups.findIndex(g => g.id === newRecord.id);

            // Fetch complete group data
            const completeGroup = await fetchGroupFromDatabase(newRecord.id);

            if (completeGroup) {
                if (existingIndex !== -1) {
                    groups[existingIndex] = completeGroup;
                    console.log('🔄 Updated group in local storage:', completeGroup.name);
                } else {
                    groups.push(completeGroup);
                    console.log('📥 Added new group to local storage:', completeGroup.name);
                }

                saveGroupsToLocalStorageSafe(groups);

                // Refresh UI if on relevant page
                if (typeof displayGroups === 'function') {
                    window.groups = groups;
                    displayGroups();
                }

                if (window.currentGroup && window.currentGroup.id === completeGroup.id) {
                    window.currentGroup = completeGroup;
                    if (typeof updateGroupDisplay === 'function') {
                        updateGroupDisplay();
                    }
                }
            }

        } else if (eventType === 'DELETE') {
            // Remove deleted group from local storage
            const groups = loadFromLocalStorageSafe().filter(g => g.id !== oldRecord.id);
            saveGroupsToLocalStorageSafe(groups);

            console.log('🗑️ Removed deleted group from local storage');

            // Refresh UI
            if (typeof displayGroups === 'function') {
                window.groups = groups;
                displayGroups();
            }
        }

        showNotificationSafe('Data synced from server', 'success');

    } catch (error) {
        console.error('❌ Failed to handle real-time group change:', error);
    }
}

// Handle real-time expense changes
async function handleRealtimeExpenseChange(payload) {
    console.log('💰 Processing real-time expense change:', payload.eventType);

    try {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        const affectedGroupId = newRecord?.groupid || oldRecord?.groupid;

        if (!affectedGroupId) return;

        // Find and update the affected group
        const groups = loadFromLocalStorageSafe();
        const groupIndex = groups.findIndex(g => g.id === affectedGroupId);

        if (groupIndex !== -1) {
            // Refresh group data from database
            const updatedGroup = await fetchGroupFromDatabase(affectedGroupId);
            if (updatedGroup) {
                groups[groupIndex] = updatedGroup;
                saveGroupsToLocalStorageSafe(groups);

                console.log('🔄 Updated group expenses from real-time sync');

                // Update current group if it's the affected one
                if (window.currentGroup && window.currentGroup.id === affectedGroupId) {
                    window.currentGroup = updatedGroup;
                    if (typeof updateGroupDisplay === 'function') {
                        updateGroupDisplay();
                    }
                }

                // Update groups list if on index page
                if (typeof displayGroups === 'function') {
                    window.groups = groups;
                    displayGroups();
                }
            }
        }

    } catch (error) {
        console.error('❌ Failed to handle real-time expense change:', error);
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Safe localStorage functions
function loadFromLocalStorageSafe() {
    try {
        const data = localStorage.getItem('spliteasy_groups');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('❌ Error loading from localStorage:', error);
        return [];
    }
}

function saveGroupsToLocalStorageSafe(groups) {
    try {
        groups.forEach(group => {
            if (!group.expenses) group.expenses = [];
            if (group.expenses.length > 0) {
                group.totalExpenses = group.expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
            } else {
                group.totalExpenses = 0;
            }
        });

        localStorage.setItem('spliteasy_groups', JSON.stringify(groups));
        console.log('💾 Groups saved to localStorage:', groups.length, 'groups');
    } catch (error) {
        console.error('❌ Failed to save to localStorage:', error);
    }
}

function showNotificationSafe(message, type = 'success') {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        console.log(`📢 Notification: ${message} (${type})`);
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

// Process queued deletions
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

        localStorage.removeItem('spliteasy_delete_queue');
        console.log('🧹 Delete queue cleared');

    } catch (error) {
        console.error('Failed to process delete queue:', error);
    }
}

// Sync all data to database
async function syncAllDataToDatabase() {
    if (window.splitEasySync.isSyncing || window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) {
        console.log('⚠️ Cannot sync - already syncing, offline, no client, or no user');
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
        const localGroups = loadFromLocalStorageSafe();

        if (localGroups.length === 0) {
            console.log('📭 No groups to sync');
            return;
        }

        // Sync all groups
        for (const group of localGroups) {
            console.log('🔄 Syncing group:', group.name);

            await syncGroupToDatabase(group);

            if (group.expenses && group.expenses.length > 0) {
                for (const expense of group.expenses) {
                    await syncExpenseToDatabase(expense, group.id);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        window.splitEasySync.lastSyncTime = new Date().toISOString();
        localStorage.setItem('lastsynctime', window.splitEasySync.lastSyncTime);

        console.log('✅ Complete data sync finished successfully!');
        showNotificationSafe('All data synced to cloud successfully!');
    } catch (error) {
        console.error('❌ Complete data sync failed:', error);
        showNotificationSafe('Sync failed, will retry later', 'error');
    } finally {
        window.splitEasySync.isSyncing = false;
    }
}

// ========================================
// CONNECTION MANAGEMENT
// ========================================

// Monitor online/offline status
window.addEventListener('online', function() {
    window.splitEasySync.isOffline = false;
    console.log('🌐 Back online, resuming sync...');

    showNotificationSafe('Back online - data sync resumed');

    setTimeout(() => {
        if (window.currentUser && (window.groups?.length > 0 || loadFromLocalStorageSafe().length > 0)) {
            syncAllDataToDatabase();
        }

        // Restart real-time sync
        if (window.currentUser) {
            startRealtimeSync();
        }
    }, 1000);
});

window.addEventListener('offline', function() {
    window.splitEasySync.isOffline = true;
    console.log('📴 Gone offline, sync paused');

    showNotificationSafe('You are offline - changes will sync when reconnected', 'info');

    // Stop real-time sync
    stopRealtimeSync();
});

// ========================================
// GLOBAL FUNCTION EXPORTS
// ========================================

// Make all functions globally available
window.fetchGroupFromDatabase = fetchGroupFromDatabase;
window.joinUserToGroup = joinUserToGroup;
window.deleteExpenseFromDatabase = deleteExpenseFromDatabase;
window.deleteGroupFromDatabase = deleteGroupFromDatabase;
window.syncExpenseToDatabase = syncExpenseToDatabase;
window.syncGroupToDatabase = syncGroupToDatabase;
window.syncUserToDatabase = syncUserToDatabase;
window.syncAllDataToDatabase = syncAllDataToDatabase;
window.startRealtimeSync = startRealtimeSync;
window.stopRealtimeSync = stopRealtimeSync;
window.processDeleteQueue = processDeleteQueue;

// Enhanced sync management functions
window.forceSyncToDatabase = async function() {
    if (window.splitEasySync.isSyncing) {
        showNotificationSafe('Sync already in progress...', 'info');
        return;
    }

    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        showNotificationSafe('Cannot sync - you are offline', 'error');
        return;
    }

    if (!window.currentUser) {
        showNotificationSafe('Please log in to sync data', 'error');
        return;
    }

    showNotificationSafe('Starting sync...', 'info');
    await syncAllDataToDatabase();
};

window.getSyncStatus = function() {
    return {
        syncing: window.splitEasySync.isSyncing,
        online: !window.splitEasySync.isOffline,
        hasSupabase: !!window.supabaseClient,
        hasUser: !!window.currentUser,
        hasRealtimeSync: !!window.splitEasySync.realtimeSubscription,
        canSync: !window.splitEasySync.isOffline && !!window.supabaseClient && !!window.currentUser && !window.splitEasySync.isSyncing,
        lastSync: window.splitEasySync.lastSyncTime || localStorage.getItem('lastsynctime')
    };
};

// ========================================
// INITIALIZATION
// ========================================

// Initialize sync system when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 Initializing complete sync system with real-time capabilities...');

    // Check initial online status
    window.splitEasySync.isOffline = !navigator.onLine;

    // Wait for user and Supabase to be ready
    const initializeSync = () => {
        if (window.currentUser && window.supabaseClient) {
            console.log('👤 Complete sync system ready for user:', window.currentUser.name);

            // Start real-time sync after a brief delay
            setTimeout(() => {
                startRealtimeSync();
            }, 2000);

            // Initial sync
            setTimeout(() => {
                if (!window.splitEasySync.isSyncing) {
                    syncAllDataToDatabase();
                }
            }, 5000);
        } else {
            // Retry initialization
            setTimeout(initializeSync, 1000);
        }
    };

    // Start initialization
    initializeSync();
});

// Debug function for development
window.debugSync = function() {
    return {
        status: window.getSyncStatus(),
        groups: window.groups?.length || 0,
        user: window.currentUser?.name || 'Not logged in',
        offline: window.splitEasySync.isOffline,
        syncing: window.splitEasySync.isSyncing,
        realtimeActive: !!window.splitEasySync.realtimeSubscription,
        lastSync: window.splitEasySync.lastSyncTime,
        supabaseClient: !!window.supabaseClient,
        namespace: 'splitEasySync'
    };
};

console.log('✅ Complete SplitEasy sync system with real-time capabilities loaded successfully');