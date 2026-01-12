// shared-sync-database-fixed.js - Schema-Aware Sync System
console.log('Loading database schema-aware SplitEasy sync system...');

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
        maxRetries: 3,
        schemaChecked: false
    };
}

// ========================================
// DATABASE SCHEMA DETECTION & MAPPING
// ========================================

// FIXED: Detect and map column names based on actual database schema
let SCHEMA_MAPPING = {
    users: {
        id: 'id',
        name: 'name',
        createdAt: 'created_at',    // Try created_at first
        updatedAt: 'updated_at'     // Try updated_at first
    },
    groups: {
        id: 'id',  // UUID type in database
        name: 'name',
        createdBy: 'created_by',
        updatedBy: 'updated_by',
        members: 'members',  // JSONB array
        createdAt: 'created_at',
        updatedAt: 'updated_at'
        // NO: total_expenses, participants (computed from expenses)
    },
    expenses: {
        id: 'id',  // UUID type in database
        groupId: 'group_id',
        description: 'description',
        amount: 'amount',
        paidBy: 'paid_by',
        splitBetween: 'split_between',  // JSONB array
        createdBy: 'created_by',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        perPersonAmount: 'per_person_amount'
    }
};

// Optimized schema detection with caching
let schemaDetectionPromise = null;
async function detectDatabaseSchema() {
    // Return cached promise if already detecting
    if (schemaDetectionPromise) {
        return schemaDetectionPromise;
    }

    if (window.splitEasySync.schemaChecked || !window.supabaseClient) {
        return Promise.resolve();
    }

    console.log('Detecting database schema...');

    schemaDetectionPromise = (async () => {
        try {
            // Try different column name variations for users table
            const testQueries = [
                // Test createdat vs created_at
                { table: 'users', column: 'createdat', mapping: 'createdAt' },
                { table: 'users', column: 'created_at', mapping: 'createdAt' },
                { table: 'users', column: 'updatedat', mapping: 'updatedAt' },
                { table: 'users', column: 'updated_at', mapping: 'updatedAt' },

                // Test groups table
                { table: 'groups', column: 'createdby', mapping: 'createdBy' },
                { table: 'groups', column: 'created_by', mapping: 'createdBy' },
                { table: 'groups', column: 'createdat', mapping: 'createdAt' },
                { table: 'groups', column: 'created_at', mapping: 'createdAt' },
                { table: 'groups', column: 'members', mapping: 'members' },
                { table: 'groups', column: 'updated_by', mapping: 'updatedBy' },
                { table: 'groups', column: 'updated_at', mapping: 'updatedAt' },

                // Test expenses table  
                { table: 'expenses', column: 'groupid', mapping: 'groupId' },
                { table: 'expenses', column: 'group_id', mapping: 'groupId' },
                { table: 'expenses', column: 'paidby', mapping: 'paidBy' },
                { table: 'expenses', column: 'paid_by', mapping: 'paidBy' }
            ];

            // Run queries in parallel for better performance
            const queryPromises = testQueries.map(async (test) => {
                try {
                    const { error } = await window.supabaseClient
                        .from(test.table)
                        .select(test.column)
                        .limit(1);

                    if (!error) {
                        SCHEMA_MAPPING[test.table][test.mapping] = test.column;
                        console.log(`Schema detected: ${test.table}.${test.mapping} = ${test.column}`);
                    }
                } catch (e) {
                    // Column doesn't exist, try next variation
                }
            });

            await Promise.all(queryPromises);

            window.splitEasySync.schemaChecked = true;
            console.log('Database schema detection complete');
            console.log('Final schema mapping:', SCHEMA_MAPPING);

        } catch (error) {
            console.warn('Schema detection failed:', error);
        } finally {
            schemaDetectionPromise = null;
        }
    })();

    return schemaDetectionPromise;
}

// ========================================
// ENHANCED DATABASE FUNCTIONS WITH SCHEMA HANDLING
// ========================================

// FIXED: Schema-aware user sync
async function syncUserToDatabase(userData) {
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        console.log('Skipping user sync - offline or no client');
        return null;
    }

    // Ensure schema is detected
    await detectDatabaseSchema();

    try {
        console.log('Syncing user to database:', userData.name);

        const userSchema = SCHEMA_MAPPING.users;
        const userRecord = {
            [userSchema.id]: userData.id,
            [userSchema.name]: userData.name,
            [userSchema.createdAt]: userData.createdAt || new Date().toISOString(),
            [userSchema.updatedAt]: new Date().toISOString()
        };

        console.log('User record structure:', userRecord);

        const { data, error } = await window.supabaseClient
            .from('users')
            .upsert(userRecord)
            .select()
            .single();

        if (error) {
            console.error('User sync error details:', error);
            throw error;
        }

        console.log('User synced successfully:', data);
        return data;
    } catch (error) {
        console.error('Failed to sync user:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        return null;
    }
}

// FIXED: Schema-aware group sync
async function syncGroupToDatabase(group) {
    console.log('🔄 syncGroupToDatabase called with group:', group);
    console.log('🔄 isOffline:', window.splitEasySync?.isOffline);
    console.log('🔄 supabaseClient:', !!window.supabaseClient);
    console.log('🔄 currentUser:', window.currentUser);
    
    if (window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) {
        const reason = !window.supabaseClient ? 'no Supabase client' : 
                       !window.currentUser ? 'no current user' : 'offline';
        console.error('❌ Skipping group sync -', reason);
        throw new Error(`Cannot sync group: ${reason}`);
    }

    // Ensure schema is detected
    console.log('🔍 Detecting database schema...');
    await detectDatabaseSchema();
    console.log('✅ Schema detection complete');

    try {
        console.log('Syncing group to database:', group.name);

        const groupSchema = SCHEMA_MAPPING.groups;
        
        // Generate UUID for Supabase (database expects UUID, not string ID)
        // Store mapping: group.supabaseId = UUID, group.id = local string ID
        function generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        
        // Determine the Supabase ID for this group
        // Priority: 1) group.supabaseId, 2) group.id (if it's a UUID), 3) generate new UUID
        let supabaseId = group.supabaseId;
        
        // If no supabaseId, check if group.id is already a UUID (from Supabase)
        if (!supabaseId && group.id) {
            // Check if group.id is a UUID format (8-4-4-4-12 hex characters)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(group.id)) {
                // group.id is already a UUID from Supabase, use it
                supabaseId = group.id;
                console.log('Using existing UUID from group.id:', supabaseId);
            } else {
                // group.id is a local string ID, generate new UUID
                supabaseId = generateUUID();
                console.log('Generated new UUID for group:', supabaseId);
            }
        } else if (!supabaseId) {
            // No ID at all, generate new UUID
            supabaseId = generateUUID();
            console.log('Generated new UUID for group (no existing ID):', supabaseId);
        }
        
        // Store supabaseId for future syncs
        if (!group.supabaseId) {
            group.supabaseId = supabaseId;
        }
        
        console.log('Syncing group with supabaseId:', supabaseId, 'group.id:', group.id);
        
        // Build group record with all available columns
        const groupRecord = {
            [groupSchema.id]: supabaseId, // Use UUID for Supabase
            [groupSchema.name]: group.name,
            [groupSchema.createdBy]: group.createdBy || window.currentUser.id,
            [groupSchema.updatedBy]: window.currentUser.id,
            [groupSchema.members]: Array.isArray(group.members) ? group.members : [],
            [groupSchema.createdAt]: group.createdAt || new Date().toISOString(),
            [groupSchema.updatedAt]: new Date().toISOString()
        };
        
        // Note: total_expenses, participants are computed from expenses

        console.log('📤 Group record structure:', JSON.stringify(groupRecord, null, 2));
        console.log('📤 Using schema mapping:', groupSchema);

        // Use upsert - Supabase will handle conflicts based on primary key
        console.log('📤 Attempting to upsert group to Supabase...');
        const { data, error } = await window.supabaseClient
            .from('groups')
            .upsert(groupRecord, {
                onConflict: 'id'  // Use 'id' as the conflict column
            })
            .select()
            .single();
        
        console.log('📥 Supabase response - data:', data);
        console.log('📥 Supabase response - error:', error);

        if (error) {
            console.error('❌ Group sync error details:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error details:', error.details);
            console.error('Error hint:', error.hint);
            console.error('Group record that failed:', groupRecord);
            throw error;
        }

        if (!data) {
            throw new Error('Group sync returned no data');
        }

        console.log('✅ Group synced successfully:', data);
        return data;
    } catch (error) {
        console.error('❌ Failed to sync group:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        // Re-throw the error so calling code knows it failed
        throw error;
    }
}

// FIXED: Schema-aware expense sync
async function syncExpenseToDatabase(expense, groupId) {
    if (window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) {
        console.log('Skipping expense sync - offline, no client, or no user');
        return null;
    }

    // Ensure schema is detected
    await detectDatabaseSchema();

    try {
        console.log('Syncing expense to database:', expense.name || expense.description);

        const expenseSchema = SCHEMA_MAPPING.expenses;
        
        // Generate UUID for expense if needed (database expects UUID)
        function generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        
        const supabaseExpenseId = expense.supabaseId || generateUUID();
        if (!expense.supabaseId) {
            expense.supabaseId = supabaseExpenseId;
        }
        
        // Get group's Supabase ID (UUID) if available
        let supabaseGroupId = groupId;
        if (window.groups && Array.isArray(window.groups)) {
            const group = window.groups.find(g => g.id === groupId || g.supabaseId === groupId);
            if (group && group.supabaseId) {
                supabaseGroupId = group.supabaseId;
            }
        }
        
        // Build expense record with all available columns
        const expenseRecord = {
            [expenseSchema.id]: supabaseExpenseId,
            [expenseSchema.groupId]: supabaseGroupId,
            [expenseSchema.description]: expense.name || expense.description,
            [expenseSchema.amount]: parseFloat(expense.amount),
            [expenseSchema.paidBy]: expense.paidBy || 'unknown',
            [expenseSchema.splitBetween]: Array.isArray(expense.splitBetween) ? expense.splitBetween : [],
            [expenseSchema.createdBy]: window.currentUser.id,
            [expenseSchema.createdAt]: expense.date || new Date().toISOString(),
            [expenseSchema.updatedAt]: new Date().toISOString(),
            [expenseSchema.perPersonAmount]: expense.perPersonAmount || (parseFloat(expense.amount) / (expense.splitBetween?.length || 1))
        };

        console.log('Expense record structure:', expenseRecord);

        const { data, error } = await window.supabaseClient
            .from('expenses')
            .upsert(expenseRecord)
            .select()
            .single();

        if (error) {
            console.error('Expense sync error details:', error);
            throw error;
        }

        console.log('Expense synced successfully:', data);
        return data;
    } catch (error) {
        console.error('Failed to sync expense:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        return null;
    }
}

// Fetch all groups for the current user from database
async function fetchAllGroupsFromDatabase() {
    console.log('fetchAllGroupsFromDatabase called');

    if (!window.supabaseClient || !window.currentUser) {
        console.warn('Cannot fetch groups - no Supabase client or user');
        return [];
    }

    // Ensure schema is detected
    await detectDatabaseSchema();

    try {
        console.log('Fetching all groups from database for user:', window.currentUser.id);

        const groupSchema = SCHEMA_MAPPING.groups;

        // Fetch groups where user is a member
        // Try different approaches: check members array or use group_members table
        const { data: groups, error: groupsError } = await window.supabaseClient
            .from('groups')
            .select('*')
            .order(groupSchema.createdAt || 'created_at', { ascending: false });

        if (groupsError) {
            console.error('Groups fetch error:', groupsError);
            throw groupsError;
        }

        if (!groups || groups.length === 0) {
            console.log('No groups found in database');
            return [];
        }

        console.log('Found', groups.length, 'groups in database');

        // Filter groups where user is the creator
        // Since participants/members column doesn't exist, filter by created_by
        // In the future, we can also check expenses to see if user is involved
        const userGroups = groups.filter(group => {
            const createdBy = group[groupSchema.createdBy] || group.created_by;
            return createdBy === window.currentUser.id;
        });

        console.log('User is a member of', userGroups.length, 'groups (filtered by created_by)');

        // Fetch expenses for each group
        const expenseSchema = SCHEMA_MAPPING.expenses;
        const completeGroups = await Promise.all(userGroups.map(async (group) => {
            try {
                const { data: expenses, error: expensesError } = await window.supabaseClient
                    .from('expenses')
                    .select('*')
                    .eq(expenseSchema.groupId, group[groupSchema.id] || group.id)
                    .order(expenseSchema.createdAt || 'created_at', { ascending: false });

                if (expensesError) {
                    console.warn('Failed to fetch expenses for group', group[groupSchema.id], ':', expensesError);
                }

                // Structure the group data properly
                // Derive members from stored members OR from expenses (fallback)
                let members = [];
                
                // Try to get members from database (handle JSONB)
                if (groupSchema.members && group[groupSchema.members] !== undefined && group[groupSchema.members] !== null) {
                    members = group[groupSchema.members];
                } else if (group.members !== undefined && group.members !== null) {
                    members = group.members;
                }
                
                // Handle JSONB/JSON string format
                if (typeof members === 'string') {
                    try {
                        members = JSON.parse(members);
                    } catch (e) {
                        console.warn('Failed to parse members JSON:', e);
                        members = [];
                    }
                }
                
                // Ensure it's an array
                if (!Array.isArray(members)) {
                    members = [];
                }
                
                // Fallback: derive members from expenses if still empty
                if (members.length === 0 && expenses && expenses.length > 0) {
                    console.log('Members not found in group, deriving from expenses...');
                    const memberSet = new Set();
                    expenses.forEach(expense => {
                        if (expense[expenseSchema.paidBy] || expense.paid_by) {
                            memberSet.add(expense[expenseSchema.paidBy] || expense.paid_by);
                        }
                        const splitBetween = expense[expenseSchema.splitBetween] || expense.split_between || [];
                        if (Array.isArray(splitBetween)) {
                            splitBetween.forEach(m => memberSet.add(m));
                        }
                    });
                    members = Array.from(memberSet);
                    console.log('Derived members from expenses:', members);
                }
                
                console.log('Final members for group:', group[groupSchema.name] || group.name, ':', members);
                
                // Store the Supabase ID for future updates
                const supabaseId = group[groupSchema.id] || group.id;
                
                const completeGroup = {
                    id: supabaseId, // Use Supabase UUID as the ID
                    supabaseId: supabaseId, // Also store as supabaseId for sync
                    name: group[groupSchema.name] || group.name,
                    members: members,
                    expenses: expenses ? expenses.map(expense => ({
                        id: expense[expenseSchema.id] || expense.id,
                        name: expense[expenseSchema.description] || expense.description || expense.name,
                        amount: parseFloat(expense[expenseSchema.amount] || expense.amount || 0),
                        paidBy: expense[expenseSchema.paidBy] || expense.paid_by || expense.paidby,
                        splitBetween: expense[expenseSchema.splitBetween] || expense.split_between || expense.splitbetween || [],
                        date: expense[expenseSchema.createdAt] || expense.created_at || expense.createdat,
                        perPersonAmount: expense[expenseSchema.perPersonAmount] || expense.per_person_amount || expense.perpersonamount || 0
                    })) : [],
                    totalExpenses: 0,
                    createdAt: group[groupSchema.createdAt] || group.created_at || group.createdat,
                    createdBy: group[groupSchema.createdBy] || group.created_by || group.createdby
                };

                // Calculate total expenses
                if (completeGroup.expenses) {
                    completeGroup.totalExpenses = completeGroup.expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
                }

                return completeGroup;
            } catch (error) {
                console.error('Error processing group', group[groupSchema.id], ':', error);
                return null;
            }
        }));

        // Filter out null results
        const validGroups = completeGroups.filter(g => g !== null);
        console.log('Successfully loaded', validGroups.length, 'complete groups from database');
        return validGroups;

    } catch (error) {
        console.error('Failed to fetch all groups from database:', error);
        throw error;
    }
}

// FIXED: Schema-aware group fetching
async function fetchGroupFromDatabase(groupId) {
    console.log('fetchGroupFromDatabase called with ID:', groupId);

    if (!groupId) {
        throw new Error('Group ID is required');
    }

    if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
    }

    // Ensure schema is detected
    await detectDatabaseSchema();

    try {
        console.log('Fetching group from database:', groupId);

        const groupSchema = SCHEMA_MAPPING.groups;

        // Fetch group with schema-aware column names
        const { data: group, error: groupError } = await window.supabaseClient
            .from('groups')
            .select('*')
            .eq(groupSchema.id, groupId)
            .single();

        if (groupError) {
            console.error('Group fetch error:', groupError);
            throw groupError;
        }

        if (!group) {
            console.warn('Group not found in database:', groupId);
            return null;
        }

        console.log('Group found:', group[groupSchema.name] || group.name);

        // Fetch expenses for this group
        const expenseSchema = SCHEMA_MAPPING.expenses;
        const { data: expenses, error: expensesError } = await window.supabaseClient
            .from('expenses')
            .select('*')
            .eq(expenseSchema.groupId, groupId)
            .order(expenseSchema.createdAt, { ascending: false });

        if (expensesError) {
            console.warn('Failed to fetch expenses:', expensesError);
            // Continue without expenses rather than failing
        }

        // Structure the group data properly with schema mapping
        // Derive members from stored members OR from expenses (fallback)
        let members = [];
        
        // Try to get members from database (handle JSONB)
        if (groupSchema.members && group[groupSchema.members] !== undefined && group[groupSchema.members] !== null) {
            members = group[groupSchema.members];
        } else if (group.members !== undefined && group.members !== null) {
            members = group.members;
        }
        
        // Handle JSONB/JSON string format
        if (typeof members === 'string') {
            try {
                members = JSON.parse(members);
            } catch (e) {
                console.warn('Failed to parse members JSON:', e);
                members = [];
            }
        }
        
        // Ensure it's an array
        if (!Array.isArray(members)) {
            members = [];
        }
        
        // Fallback: derive members from expenses if still empty
        if (members.length === 0 && expenses && expenses.length > 0) {
            console.log('Members not found in group, deriving from expenses...');
            const memberSet = new Set();
            expenses.forEach(expense => {
                if (expense[expenseSchema.paidBy] || expense.paid_by) {
                    memberSet.add(expense[expenseSchema.paidBy] || expense.paid_by);
                }
                const splitBetween = expense[expenseSchema.splitBetween] || expense.split_between || [];
                if (Array.isArray(splitBetween)) {
                    splitBetween.forEach(m => memberSet.add(m));
                }
            });
            members = Array.from(memberSet);
            console.log('Derived members from expenses:', members);
        }
        
        console.log('Final members for group:', group[groupSchema.name] || group.name, ':', members);
        
        // Store the Supabase ID for future updates
        const supabaseId = group[groupSchema.id] || group.id;
        
        const completeGroup = {
            id: supabaseId, // Use Supabase UUID as the ID
            supabaseId: supabaseId, // Also store as supabaseId for sync
            name: group[groupSchema.name] || group.name,
            members: members,
            expenses: expenses ? expenses.map(expense => ({
                id: expense[expenseSchema.id] || expense.id,
                name: expense[expenseSchema.description] || expense.description || expense.name,
                amount: parseFloat(expense[expenseSchema.amount] || expense.amount || 0),
                paidBy: expense[expenseSchema.paidBy] || expense.paid_by || expense.paidby,
                splitBetween: expense[expenseSchema.splitBetween] || expense.split_between || expense.splitbetween || [],
                date: expense[expenseSchema.createdAt] || expense.created_at || expense.createdat,
                perPersonAmount: expense[expenseSchema.perPersonAmount] || expense.per_person_amount || expense.perpersonamount || 0
            })) : [],
            totalExpenses: 0,
            createdAt: group[groupSchema.createdAt] || group.created_at || group.createdat,
            createdBy: group[groupSchema.createdBy] || group.created_by || group.createdby
        };

        // Calculate total expenses
        if (completeGroup.expenses) {
            completeGroup.totalExpenses = completeGroup.expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
        }

        console.log('Complete group data assembled:', completeGroup.name, 'with', completeGroup.expenses.length, 'expenses');
        return completeGroup;

    } catch (error) {
        console.error('Failed to fetch group from database:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        throw error;
    }
}

// FIXED: Schema-aware expense deletion
async function deleteExpenseFromDatabase(expenseId) {
    console.log('deleteExpenseFromDatabase called with ID:', expenseId);

    if (!expenseId) {
        throw new Error('Expense ID is required for deletion');
    }

    if (window.splitEasySync.isOffline) {
        console.log('Offline - queuing expense deletion for later sync');
        let deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        deleteQueue.push({ type: 'expense', id: expenseId, timestamp: Date.now() });
        localStorage.setItem('spliteasy_delete_queue', JSON.stringify(deleteQueue));
        return;
    }

    if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
    }

    // Ensure schema is detected
    await detectDatabaseSchema();

    try {
        console.log('Attempting to delete expense from database:', expenseId);

        const expenseSchema = SCHEMA_MAPPING.expenses;

        const { data, error: deleteError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq(expenseSchema.id, expenseId)
            .select();

        if (deleteError) {
            console.error('Supabase delete error:', deleteError);
            throw deleteError;
        }

        if (!data || data.length === 0) {
            console.warn('No records deleted - expense might not exist in database');
            return;
        }

        console.log('Expense deleted from database successfully:', data.length, 'records');
        cleanupDeleteQueue('expense', expenseId);

    } catch (error) {
        console.error('Failed to delete expense from database:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        throw error;
    }
}

// FIXED: Schema-aware group deletion
async function deleteGroupFromDatabase(groupId) {
    console.log('deleteGroupFromDatabase called with ID:', groupId);

    if (!groupId) {
        throw new Error('Group ID is required for deletion');
    }

    if (window.splitEasySync.isOffline) {
        console.log('Offline - queuing group deletion for later sync');
        let deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        deleteQueue.push({ type: 'group', id: groupId, timestamp: Date.now() });
        localStorage.setItem('spliteasy_delete_queue', JSON.stringify(deleteQueue));
        return;
    }

    if (!window.supabaseClient) {
        throw new Error('Supabase client not available');
    }

    // Ensure schema is detected
    await detectDatabaseSchema();

    try {
        console.log('Deleting group from database:', groupId);

        const groupSchema = SCHEMA_MAPPING.groups;
        const expenseSchema = SCHEMA_MAPPING.expenses;

        // Delete expenses first
        const { error: expenseError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq(expenseSchema.groupId, groupId);

        if (expenseError) {
            console.warn('Failed to delete group expenses:', expenseError);
        } else {
            console.log('Group expenses deleted');
        }

        // Then delete group
        const { data, error: groupError } = await window.supabaseClient
            .from('groups')
            .delete()
            .eq(groupSchema.id, groupId)
            .select();

        if (groupError) {
            throw groupError;
        }

        console.log('Group deleted from database successfully');
        cleanupDeleteQueue('group', groupId);

    } catch (error) {
        console.error('Failed to delete group from database:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        throw error;
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Clean up delete queue
function cleanupDeleteQueue(type, id) {
    try {
        let deleteQueue = JSON.parse(localStorage.getItem('spliteasy_delete_queue') || '[]');
        deleteQueue = deleteQueue.filter(item => !(item.type === type && item.id === id));
        localStorage.setItem('spliteasy_delete_queue', JSON.stringify(deleteQueue));
        console.log('Cleaned up delete queue for', type, id);
    } catch (error) {
        console.warn('Failed to clean up delete queue:', error);
    }
}

// Safe localStorage functions
function loadFromLocalStorageSafe() {
    try {
        const data = localStorage.getItem('spliteasy_groups');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading from localStorage:', error);
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
        console.log('Groups saved to localStorage:', groups.length, 'groups');
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
    }
}

function showNotificationSafe(message, type = 'success') {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        console.log(`Notification: ${message} (${type})`);
    }
}

// Sync all data to database
async function syncAllDataToDatabase() {
    if (window.splitEasySync.isSyncing || window.splitEasySync.isOffline || !window.supabaseClient || !window.currentUser) {
        console.log('Cannot sync - already syncing, offline, no client, or no user');
        return;
    }

    window.splitEasySync.isSyncing = true;
    console.log('Starting complete data sync with schema detection...');

    try {
        // First, detect database schema
        await detectDatabaseSchema();

        // Sync current user first
        await syncUserToDatabase(window.currentUser);

        // Get all local data
        const localGroups = loadFromLocalStorageSafe();

        if (localGroups.length === 0) {
            console.log('No groups to sync');
            return;
        }

        // Sync all groups
        for (const group of localGroups) {
            console.log('Syncing group:', group.name);

            await syncGroupToDatabase(group);

            if (group.expenses && group.expenses.length > 0) {
                for (const expense of group.expenses) {
                    await syncExpenseToDatabase(expense, group.id);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        window.splitEasySync.lastSyncTime = new Date().toISOString();
        localStorage.setItem('lastsynctime', window.splitEasySync.lastSyncTime);

        console.log('Complete data sync finished successfully');
        showNotificationSafe('All data synced to cloud successfully!');
    } catch (error) {
        console.error('Complete data sync failed:', error);
        showNotificationSafe('Sync failed: ' + error.message, 'error');
    } finally {
        window.splitEasySync.isSyncing = false;
    }
}

// ========================================
// GLOBAL FUNCTION EXPORTS
// ========================================

// Join user to a group
async function joinUserToGroup(groupId, userId) {
    console.log('Joining user to group:', { groupId, userId });

    if (!window.supabaseClient || !groupId || !userId) {
        console.warn('Cannot join group - missing client, groupId, or userId');
        return false;
    }

    try {
        await detectDatabaseSchema();
        const groupSchema = SCHEMA_MAPPING.groups;

        // Fetch current group
        const { data: group, error: fetchError } = await window.supabaseClient
            .from('groups')
            .select('*')
            .eq(groupSchema.id, groupId)
            .single();

        if (fetchError || !group) {
            console.error('Failed to fetch group:', fetchError);
            return false;
        }

        // Get current members
        const currentMembers = group[groupSchema.participants] || group.participants || [];
        
        // Add user if not already a member
        if (!currentMembers.includes(userId)) {
            const updatedMembers = [...currentMembers, userId];

            // Update group with new member
            const { error: updateError } = await window.supabaseClient
                .from('groups')
                .update({
                    [groupSchema.participants]: updatedMembers,
                    [groupSchema.updatedAt]: new Date().toISOString()
                })
                .eq(groupSchema.id, groupId);

            if (updateError) {
                console.error('Failed to update group members:', updateError);
                return false;
            }

            console.log('User joined group successfully');
            return true;
        } else {
            console.log('User is already a member of this group');
            return true;
        }
    } catch (error) {
        console.error('Failed to join group:', error);
        return false;
    }
}

// Start real-time synchronization
window.startRealtimeSync = function() {
    if (!window.supabaseClient || !window.currentUser) {
        console.log('Cannot start real-time sync - missing client or user');
        return;
    }

    // Don't start multiple subscriptions
    if (window.splitEasySync.realtimeSubscription) {
        console.log('Real-time sync already active');
        return;
    }

    console.log('Starting real-time synchronization...');

    try {
        // Subscribe to all groups and expenses changes
        // We'll filter in the handler to only process relevant changes
        const groupsChannel = window.supabaseClient
            .channel('spliteasy-realtime')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'groups'
                },
                async (payload) => {
                    console.log('Group changed:', payload);
                    // Check if user is a member of this group
                    const groupData = payload.new || payload.old;
                    const groupSchema = SCHEMA_MAPPING.groups;
                    const members = groupData?.[groupSchema.participants] || groupData?.participants || [];
                    if (Array.isArray(members) && members.includes(window.currentUser.id)) {
                        await handleGroupChange(payload);
                    }
                }
            )
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'expenses'
                },
                async (payload) => {
                    console.log('Expense changed:', payload);
                    await handleExpenseChange(payload);
                }
            )
            .subscribe((status) => {
                console.log('📡 Real-time subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('Real-time sync active');
                    showNotificationSafe('Real-time sync enabled', 'success');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('Real-time sync error');
                    showNotificationSafe('Real-time sync error', 'error');
                }
            });

        window.splitEasySync.realtimeSubscription = groupsChannel;

    } catch (error) {
        console.error('Failed to start real-time sync:', error);
    }
};

// Handle group changes from real-time sync
async function handleGroupChange(payload) {
    try {
        const { eventType, new: newData, old: oldData } = payload;

        if (eventType === 'UPDATE' || eventType === 'INSERT') {
            const groupId = newData.id || newData[SCHEMA_MAPPING.groups.id];
            
            // Reload the group if it's currently open
            if (window.currentGroupId === groupId || (window.currentGroup && window.currentGroup.id === groupId)) {
                console.log('Reloading current group due to real-time update');
                
                // Fetch updated group from database
                if (typeof fetchGroupFromDatabase === 'function') {
                    const updatedGroup = await fetchGroupFromDatabase(groupId);
                    if (updatedGroup) {
                        // Update local storage
                        const localGroups = loadFromLocalStorageSafe();
                        const groupIndex = localGroups.findIndex(g => g.id === groupId);
                        if (groupIndex !== -1) {
                            localGroups[groupIndex] = updatedGroup;
                            saveGroupsToLocalStorageSafe(localGroups);
                        }

                        // Update current group if it's open
                        if (window.currentGroup && window.currentGroup.id === groupId) {
                            window.currentGroup = updatedGroup;
                            if (typeof updateGroupDisplay === 'function') {
                                updateGroupDisplay();
                            }
                            showNotificationSafe('Group updated by another user', 'info');
                        }
                    }
                }
            } else {
                // Update groups list if on main page
                if (typeof loadGroups === 'function') {
                    loadGroups();
                }
            }
        }
    } catch (error) {
        console.error('Error handling group change:', error);
    }
}

// Handle expense changes from real-time sync
async function handleExpenseChange(payload) {
    try {
        const { eventType, new: newData, old: oldData } = payload;
        const expenseSchema = SCHEMA_MAPPING.expenses;
        const groupId = newData?.[expenseSchema.groupId] || newData?.group_id || oldData?.[expenseSchema.groupId] || oldData?.group_id;

        if (!groupId) return;

        // Only update if this expense belongs to a group we're viewing
        if (window.currentGroupId === groupId || (window.currentGroup && window.currentGroup.id === groupId)) {
            console.log('Reloading expenses due to real-time update');

            // Fetch updated group from database
            if (typeof fetchGroupFromDatabase === 'function') {
                const updatedGroup = await fetchGroupFromDatabase(groupId);
                if (updatedGroup && window.currentGroup) {
                    // Update expenses
                    window.currentGroup.expenses = updatedGroup.expenses;
                    window.currentGroup.totalExpenses = updatedGroup.totalExpenses;

                    // Update local storage
                    const localGroups = loadFromLocalStorageSafe();
                    const groupIndex = localGroups.findIndex(g => g.id === groupId);
                    if (groupIndex !== -1) {
                        localGroups[groupIndex] = window.currentGroup;
                        saveGroupsToLocalStorageSafe(localGroups);
                    }

                    // Update UI
                    if (typeof updateGroupDisplay === 'function') {
                        updateGroupDisplay();
                    } else if (typeof displayExpenses === 'function' && typeof calculateBalances === 'function') {
                        displayExpenses();
                        calculateBalances();
                    }

                    const action = eventType === 'INSERT' ? 'added' : eventType === 'DELETE' ? 'deleted' : 'updated';
                    showNotificationSafe(`Expense ${action} by another user`, 'info');
                }
            }
        }
    } catch (error) {
        console.error('Error handling expense change:', error);
    }
}

// Stop real-time sync
window.stopRealtimeSync = function() {
    if (window.splitEasySync.realtimeSubscription) {
        window.supabaseClient.removeChannel(window.splitEasySync.realtimeSubscription);
        window.splitEasySync.realtimeSubscription = null;
        console.log('🛑 Real-time sync stopped');
    }
};

// Make all functions globally available
window.fetchAllGroupsFromDatabase = fetchAllGroupsFromDatabase;
window.fetchGroupFromDatabase = fetchGroupFromDatabase;
window.deleteExpenseFromDatabase = deleteExpenseFromDatabase;
window.deleteGroupFromDatabase = deleteGroupFromDatabase;
window.syncExpenseToDatabase = syncExpenseToDatabase;
window.syncGroupToDatabase = syncGroupToDatabase;
window.syncUserToDatabase = syncUserToDatabase;
window.syncAllDataToDatabase = syncAllDataToDatabase;
window.detectDatabaseSchema = detectDatabaseSchema;
window.joinUserToGroup = joinUserToGroup;

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

    showNotificationSafe('Starting sync with schema detection...', 'info');
    await syncAllDataToDatabase();
};

window.getSyncStatus = function() {
    return {
        syncing: window.splitEasySync.isSyncing,
        online: !window.splitEasySync.isOffline,
        hasSupabase: !!window.supabaseClient,
        hasUser: !!window.currentUser,
        schemaDetected: window.splitEasySync.schemaChecked,
        canSync: !window.splitEasySync.isOffline && !!window.supabaseClient && !!window.currentUser && !window.splitEasySync.isSyncing,
        lastSync: window.splitEasySync.lastSyncTime || localStorage.getItem('lastsynctime'),
        schemaMapping: SCHEMA_MAPPING
    };
};

// Debug function for development
window.debugSync = function() {
    return {
        status: window.getSyncStatus(),
        groups: window.groups?.length || 0,
        user: window.currentUser?.name || 'Not logged in',
        offline: window.splitEasySync.isOffline,
        syncing: window.splitEasySync.isSyncing,
        schemaChecked: window.splitEasySync.schemaChecked,
        schemaMapping: SCHEMA_MAPPING,
        namespace: 'splitEasySync'
    };
};

console.log('Database schema-aware SplitEasy sync system loaded successfully');