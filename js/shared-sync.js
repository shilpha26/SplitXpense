// shared-sync-database-fixed.js - Schema-Aware Sync System
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
        members: 'members',  // JSONB array - registered user IDs only
        participants: 'participants',  // JSONB array - non-registered member names
        pendingDeletion: 'pending_deletion',  // Boolean - group marked for deletion
        deletionInitiatedBy: 'deletion_initiated_by',  // User ID who initiated deletion
        deletionConfirmedBy: 'deletion_confirmed_by',  // JSONB array - user IDs who confirmed
        deletionRestoredBy: 'deletion_restored_by',  // JSONB array - user IDs who want to restore
        deletionInitiatedAt: 'deletion_initiated_at',  // Timestamp
        createdAt: 'created_at',
        updatedAt: 'updated_at'
        // NO: total_expenses (computed from expenses)
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
        perPersonAmount: 'per_person_amount',
        splitType: 'split_type',  // 'equal' or 'custom'
        customAmounts: 'custom_amounts'  // JSONB object for custom split amounts
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
            // Since we know the database uses snake_case, test only those
            // Skip camelCase tests to avoid 400 errors
            const testQueries = [
                // Test users table - only snake_case
                { table: 'users', column: 'created_at', mapping: 'createdAt' },
                { table: 'users', column: 'updated_at', mapping: 'updatedAt' },

                // Test groups table - only snake_case
                { table: 'groups', column: 'created_by', mapping: 'createdBy' },
                { table: 'groups', column: 'created_at', mapping: 'createdAt' },
                { table: 'groups', column: 'members', mapping: 'members' },
                { table: 'groups', column: 'updated_by', mapping: 'updatedBy' },
                { table: 'groups', column: 'updated_at', mapping: 'updatedAt' },

                // Test expenses table - only snake_case
                { table: 'expenses', column: 'group_id', mapping: 'groupId' },
                { table: 'expenses', column: 'paid_by', mapping: 'paidBy' },
                { table: 'expenses', column: 'split_type', mapping: 'splitType' },
                { table: 'expenses', column: 'custom_amounts', mapping: 'customAmounts' }
            ];

            // Test all columns in parallel for faster detection (snake_case only - no camelCase to avoid 400 errors)
            await Promise.all(testQueries.map(async (test) => {
                try {
                    const { error } = await window.supabaseClient
                        .from(test.table)
                        .select(test.column)
                        .limit(0); // Use limit 0 to avoid fetching data, just test column existence

                    if (!error) {
                        SCHEMA_MAPPING[test.table][test.mapping] = test.column;
                        console.log(`Schema detected: ${test.table}.${test.mapping} = ${test.column}`);
                    }
                } catch (e) {
                    // Column doesn't exist - log only if it's unexpected
                    if (e?.code !== 'PGRST204' && e?.status !== 400) {
                        console.warn(`Schema test failed for ${test.table}.${test.column}:`, e.message);
                    }
                }
            }));

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
        const now = new Date().toISOString();
        // Only send id, name, updated_at. Never send created_at so we don't overwrite
        // the original join date when someone signs in again (Joined must stay correct).
        const userRecord = {
            [userSchema.id]: userData.id,
            [userSchema.name]: userData.name,
            [userSchema.updatedAt]: now
        };

        console.log('User record structure:', userRecord);

        const { data, error } = await window.supabaseClient
            .from('users')
            .upsert(userRecord, { onConflict: 'id' })
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
        // Separate registered user IDs (members) from non-registered participant names
        const members = Array.isArray(group.members) ? group.members : [];
        const participants = Array.isArray(group.participants) ? group.participants : [];
        
        const groupRecord = {
            [groupSchema.id]: supabaseId, // Use UUID for Supabase
            [groupSchema.name]: group.name,
            [groupSchema.createdBy]: group.createdBy || window.currentUser.id,
            [groupSchema.updatedBy]: window.currentUser.id,
            [groupSchema.members]: members,  // Registered user IDs only
            [groupSchema.participants]: participants,  // Non-registered member names
            [groupSchema.createdAt]: group.createdAt || new Date().toISOString(),
            [groupSchema.updatedAt]: new Date().toISOString()
        };

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
    // Check if we have the necessary components
    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        console.log('Skipping expense sync - offline or no client');
        return null;
    }
    
    // Ensure currentUser is set (check localStorage if not)
    if (!window.currentUser) {
        const userData = localStorage.getItem('spliteasy_current_user');
        if (userData) {
            try {
                window.currentUser = JSON.parse(userData);
                console.log('Restored user from localStorage for expense sync:', window.currentUser.id);
            } catch (e) {
                console.warn('Failed to parse user data from localStorage');
            }
        }
    }
    
    // If still no user, cannot sync expense
    if (!window.currentUser) {
        console.log('Skipping expense sync - no user logged in');
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
        
        // UUID regex pattern (declare once at function level)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        // Use existing ID if available (for updates), otherwise generate new UUID (for creates)
        // Check both supabaseId and id fields
        let supabaseExpenseId = expense.supabaseId || expense.id;
        
        // If the ID is a UUID format, use it; otherwise generate a new one
        if (!supabaseExpenseId || !uuidRegex.test(supabaseExpenseId)) {
            // Generate new UUID only if we don't have a valid UUID
            supabaseExpenseId = generateUUID();
        }
        
        // Store the supabaseId for future updates
        if (!expense.supabaseId) {
            expense.supabaseId = supabaseExpenseId;
        }
        
        // Get group's Supabase ID (UUID) if available
        // Priority: 1) currentGroup.supabaseId, 2) check if groupId is already UUID, 3) lookup in groups array
        let supabaseGroupId = groupId;
        
        // First check currentGroup (most reliable)
        if (window.currentGroup) {
            if (window.currentGroup.supabaseId) {
                supabaseGroupId = window.currentGroup.supabaseId;
            } else if (window.currentGroup.id === groupId) {
                // If currentGroup.id matches and is a UUID, use it
                if (uuidRegex.test(groupId)) {
                    supabaseGroupId = groupId;
                }
            }
        }
        
        // Fallback: check if groupId is already a UUID
        if (uuidRegex.test(groupId)) {
            supabaseGroupId = groupId;
        }
        
        // Last resort: lookup in groups array
        if (!uuidRegex.test(supabaseGroupId) && window.groups && Array.isArray(window.groups)) {
            const group = window.groups.find(g => g.id === groupId || g.supabaseId === groupId);
            if (group && group.supabaseId) {
                supabaseGroupId = group.supabaseId;
            }
        }
        
        console.log('Using supabaseGroupId for expense:', supabaseGroupId, 'from groupId:', groupId);
        
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
            [expenseSchema.perPersonAmount]: expense.perPersonAmount || (parseFloat(expense.amount) / (expense.splitBetween?.length || 1)),
            [expenseSchema.splitType]: expense.splitType || 'equal',
            [expenseSchema.customAmounts]: expense.customAmounts || null
        };

        console.log('Expense record structure:', expenseRecord);

        // Use upsert with onConflict to ensure updates work correctly
        const { data, error } = await window.supabaseClient
            .from('expenses')
            .upsert(expenseRecord, {
                onConflict: expenseSchema.id || 'id'  // Use 'id' as the conflict column for updates
            })
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

        // Filter groups where user is the creator OR a member
        const userGroups = groups.filter(group => {
            const createdBy = group[groupSchema.createdBy] || group.created_by;
            const userId = window.currentUser.id;
            const userName = window.currentUser.name;
            
            const isCreator = createdBy === userId;
            
            // Also check if user is in the members array (by ID or name)
            // IMPORTANT: If user is not in members array AND not the creator, they won't see the group
            let isMember = false;
            const members = group[groupSchema.members] || group.members;
            if (members) {
                // Handle JSONB/JSON string format
                let membersArray = members;
                if (typeof members === 'string') {
                    try {
                        membersArray = JSON.parse(members);
                    } catch (e) {
                        membersArray = [];
                    }
                }
                if (Array.isArray(membersArray)) {
                    // Check by ID
                    isMember = membersArray.includes(userId) || 
                               membersArray.some(m => m && String(m).toLowerCase() === String(userId).toLowerCase());
                    
                    // Also check by name (in case members array stores names instead of IDs)
                    if (!isMember && userName) {
                        isMember = membersArray.includes(userName) ||
                                  membersArray.some(m => m && String(m).toLowerCase() === String(userName).toLowerCase());
                    }
                }
            }
            
            // User sees group only if they are the creator OR a member
            // If removed from members array, they won't see it (unless they're the creator)
            return isCreator || isMember;
        });

        console.log('User is a member of', userGroups.length, 'groups (filtered by created_by or members array)');

        if (userGroups.length === 0) {
            return [];
        }

        // OPTIMIZATION: Fetch all expenses for all user groups in one query instead of N queries
        const expenseSchema = SCHEMA_MAPPING.expenses;
        const groupIds = userGroups.map(g => g[groupSchema.id] || g.id);
        
        // Fetch all expenses for all groups at once
        const { data: allExpenses, error: expensesError } = await window.supabaseClient
            .from('expenses')
            .select('*')
            .in(expenseSchema.groupId, groupIds)
            .order(expenseSchema.createdAt || 'created_at', { ascending: false });

        if (expensesError) {
            console.warn('Failed to fetch expenses:', expensesError);
        }

        // Group expenses by groupId for faster lookup
        const expensesByGroupId = new Map();
        if (allExpenses && Array.isArray(allExpenses)) {
            allExpenses.forEach(expense => {
                const groupId = expense[expenseSchema.groupId] || expense.group_id;
                if (!expensesByGroupId.has(groupId)) {
                    expensesByGroupId.set(groupId, []);
                }
                expensesByGroupId.get(groupId).push(expense);
            });
        }

        // Process groups with their expenses (synchronously now since expenses are already fetched)
        const completeGroups = userGroups.map((group) => {
            try {
                const groupId = group[groupSchema.id] || group.id;
                const expenses = expensesByGroupId.get(groupId) || [];

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
                
                // Get participants
                let participants = group[groupSchema.participants] || group.participants || [];
                if (typeof participants === 'string') {
                    try {
                        participants = JSON.parse(participants);
                    } catch (e) {
                        participants = [];
                    }
                }
                if (!Array.isArray(participants)) {
                    participants = [];
                }

                // Get deletion tracking fields
                let deletionConfirmedBy = group[groupSchema.deletionConfirmedBy] || group.deletion_confirmed_by || [];
                let deletionRestoredBy = group[groupSchema.deletionRestoredBy] || group.deletion_restored_by || [];
                if (typeof deletionConfirmedBy === 'string') {
                    try {
                        deletionConfirmedBy = JSON.parse(deletionConfirmedBy);
                    } catch (e) {
                        deletionConfirmedBy = [];
                    }
                }
                if (typeof deletionRestoredBy === 'string') {
                    try {
                        deletionRestoredBy = JSON.parse(deletionRestoredBy);
                    } catch (e) {
                        deletionRestoredBy = [];
                    }
                }
                if (!Array.isArray(deletionConfirmedBy)) deletionConfirmedBy = [];
                if (!Array.isArray(deletionRestoredBy)) deletionRestoredBy = [];

                const completeGroup = {
                    id: supabaseId, // Use Supabase UUID as the ID
                    supabaseId: supabaseId, // Also store as supabaseId for sync
                    name: group[groupSchema.name] || group.name,
                    members: members,  // Registered user IDs only
                    participants: participants,  // Non-registered member names
                    pendingDeletion: group[groupSchema.pendingDeletion] || group.pending_deletion || false,
                    deletionInitiatedBy: group[groupSchema.deletionInitiatedBy] || group.deletion_initiated_by,
                    deletionConfirmedBy: deletionConfirmedBy,
                    deletionRestoredBy: deletionRestoredBy,
                    deletionInitiatedAt: group[groupSchema.deletionInitiatedAt] || group.deletion_initiated_at,
                    expenses: expenses ? expenses.map(expense => ({
                        id: expense[expenseSchema.id] || expense.id,
                        name: expense[expenseSchema.description] || expense.description || expense.name,
                        amount: parseFloat(expense[expenseSchema.amount] || expense.amount || 0),
                        paidBy: expense[expenseSchema.paidBy] || expense.paid_by || expense.paidby,
                        splitBetween: expense[expenseSchema.splitBetween] || expense.split_between || expense.splitbetween || [],
                        date: expense[expenseSchema.createdAt] || expense.created_at || expense.createdat,
                        perPersonAmount: expense[expenseSchema.perPersonAmount] || expense.per_person_amount || expense.perpersonamount || 0,
                        splitType: expense[expenseSchema.splitType] || expense.split_type || 'equal',
                        customAmounts: expense[expenseSchema.customAmounts] || expense.custom_amounts || null
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
        }); // End of userGroups.map

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
        // Use .maybeSingle() instead of .single() to handle missing groups gracefully
        const { data: group, error: groupError } = await window.supabaseClient
            .from('groups')
            .select('*')
            .eq(groupSchema.id, groupId)
            .maybeSingle();

        if (groupError) {
            console.error('Group fetch error:', groupError);
            // If it's a "not found" error, return null instead of throwing
            if (groupError.code === 'PGRST116' || groupError.message?.includes('0 rows')) {
                console.warn('Group not found in database:', groupId);
                return null;
            }
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
        // Separate registered user IDs (members) from non-registered participant names
        let members = [];  // Registered user IDs
        let participants = [];  // Non-registered member names
        
        // Get registered user IDs (members)
        if (groupSchema.members && group[groupSchema.members] !== undefined && group[groupSchema.members] !== null) {
            members = group[groupSchema.members];
        } else if (group.members !== undefined && group.members !== null) {
            members = group.members;
        }
        
        // Get non-registered participant names
        if (groupSchema.participants && group[groupSchema.participants] !== undefined && group[groupSchema.participants] !== null) {
            participants = group[groupSchema.participants];
        } else if (group.participants !== undefined && group.participants !== null) {
            participants = group.participants;
        }
        
        // Handle JSONB/JSON string format for both
        if (typeof members === 'string') {
            try {
                members = JSON.parse(members);
            } catch (e) {
                console.warn('Failed to parse members JSON:', e);
                members = [];
            }
        }
        if (typeof participants === 'string') {
            try {
                participants = JSON.parse(participants);
            } catch (e) {
                console.warn('Failed to parse participants JSON:', e);
                participants = [];
            }
        }
        
        // Ensure both are arrays
        if (!Array.isArray(members)) {
            members = [];
        }
        if (!Array.isArray(participants)) {
            participants = [];
        }
        
        console.log('Group members (registered user IDs):', members);
        console.log('Group participants (non-registered names):', participants);
        
        // Store the Supabase ID for future updates
        const supabaseId = group[groupSchema.id] || group.id;
        
        // Get deletion tracking fields
        let deletionConfirmedBy = group[groupSchema.deletionConfirmedBy] || group.deletion_confirmed_by || [];
        let deletionRestoredBy = group[groupSchema.deletionRestoredBy] || group.deletion_restored_by || [];
        if (typeof deletionConfirmedBy === 'string') {
            try {
                deletionConfirmedBy = JSON.parse(deletionConfirmedBy);
            } catch (e) {
                deletionConfirmedBy = [];
            }
        }
        if (typeof deletionRestoredBy === 'string') {
            try {
                deletionRestoredBy = JSON.parse(deletionRestoredBy);
            } catch (e) {
                deletionRestoredBy = [];
            }
        }
        if (!Array.isArray(deletionConfirmedBy)) deletionConfirmedBy = [];
        if (!Array.isArray(deletionRestoredBy)) deletionRestoredBy = [];

        const completeGroup = {
            id: supabaseId, // Use Supabase UUID as the ID
            supabaseId: supabaseId, // Also store as supabaseId for sync
            name: group[groupSchema.name] || group.name,
            members: members,  // Registered user IDs only
            participants: participants,  // Non-registered member names
            pendingDeletion: group[groupSchema.pendingDeletion] || group.pending_deletion || false,
            deletionInitiatedBy: group[groupSchema.deletionInitiatedBy] || group.deletion_initiated_by,
            deletionConfirmedBy: deletionConfirmedBy,
            deletionRestoredBy: deletionRestoredBy,
            deletionInitiatedAt: group[groupSchema.deletionInitiatedAt] || group.deletion_initiated_at,
            expenses: expenses ? expenses.map(expense => ({
                id: expense[expenseSchema.id] || expense.id,
                name: expense[expenseSchema.description] || expense.description || expense.name,
                amount: parseFloat(expense[expenseSchema.amount] || expense.amount || 0),
                paidBy: expense[expenseSchema.paidBy] || expense.paid_by || expense.paidby,
                splitBetween: expense[expenseSchema.splitBetween] || expense.split_between || expense.splitbetween || [],
                date: expense[expenseSchema.createdAt] || expense.created_at || expense.createdat,
                perPersonAmount: expense[expenseSchema.perPersonAmount] || expense.per_person_amount || expense.perpersonamount || 0,
                splitType: expense[expenseSchema.splitType] || expense.split_type || 'equal',
                customAmounts: expense[expenseSchema.customAmounts] || expense.custom_amounts || null
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

// FIXED: Schema-aware group deletion with collaborative confirmation
async function deleteGroupFromDatabase(groupId, forceDelete = false) {
    console.log('deleteGroupFromDatabase called with ID:', groupId, 'forceDelete:', forceDelete);

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
        const groupSchema = SCHEMA_MAPPING.groups;
        const expenseSchema = SCHEMA_MAPPING.expenses;

        // If forceDelete is true, delete immediately (for single-member groups or confirmed deletions)
        if (forceDelete) {
            console.log('Force deleting group and all expenses:', groupId);

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
            return;
        }

        // For collaborative deletion: mark group as pending deletion
        console.log('Marking group for collaborative deletion:', groupId);
        
        // Fetch current group to check members
        // Use .maybeSingle() to handle cases where group might already be deleted
        const { data: group, error: fetchError } = await window.supabaseClient
            .from('groups')
            .select('*')
            .eq(groupSchema.id, groupId)
            .maybeSingle();

        if (fetchError) {
            // Check for specific error codes
            if (fetchError.code === 'PGRST116' || fetchError.message?.includes('406')) {
                console.warn('Group not found or already deleted:', groupId);
                throw new Error('Group not found or already deleted');
            }
            throw fetchError;
        }

        if (!group) {
            throw new Error('Group not found or already deleted');
        }

        // Get members array
        let members = group[groupSchema.members] || group.members || [];
        if (typeof members === 'string') {
            try {
                members = JSON.parse(members);
            } catch (e) {
                members = [];
            }
        }
        if (!Array.isArray(members)) {
            members = [];
        }

        // If only creator is a member, delete immediately
        const creatorId = group[groupSchema.createdBy] || group.created_by;
        if (members.length === 1 && members[0] === creatorId) {
            console.log('Only creator is member, deleting immediately');
            return await deleteGroupFromDatabase(groupId, true); // Force delete
        }

        // Mark group for collaborative deletion
        const { error: updateError } = await window.supabaseClient
            .from('groups')
            .update({
                [groupSchema.pendingDeletion]: true,
                [groupSchema.deletionInitiatedBy]: window.currentUser.id,
                [groupSchema.deletionConfirmedBy]: [window.currentUser.id], // Creator confirms immediately
                [groupSchema.deletionRestoredBy]: [],
                [groupSchema.deletionInitiatedAt]: new Date().toISOString(),
                [groupSchema.updatedAt]: new Date().toISOString()
            })
            .eq(groupSchema.id, groupId);

        if (updateError) {
            throw updateError;
        }

        console.log('Group marked for collaborative deletion. Other members will be notified.');
        // Real-time sync will notify other members

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

// Confirm group deletion (for members)
async function confirmGroupDeletion(groupId) {
    if (!window.supabaseClient || !window.currentUser) {
        throw new Error('Supabase client or user not available');
    }

    await detectDatabaseSchema();
    const groupSchema = SCHEMA_MAPPING.groups;

    // Fetch current group
    const { data: group, error: fetchError } = await window.supabaseClient
        .from('groups')
        .select('*')
        .eq(groupSchema.id, groupId)
        .single();

    if (fetchError || !group) {
        throw new Error('Group not found');
    }

    // Get current confirmation arrays
    let confirmedBy = group[groupSchema.deletionConfirmedBy] || group.deletion_confirmed_by || [];
    if (typeof confirmedBy === 'string') {
        try {
            confirmedBy = JSON.parse(confirmedBy);
        } catch (e) {
            confirmedBy = [];
        }
    }
    if (!Array.isArray(confirmedBy)) {
        confirmedBy = [];
    }

    // Add current user to confirmed list
    if (!confirmedBy.includes(window.currentUser.id)) {
        confirmedBy.push(window.currentUser.id);
    }

    // Get members
    let members = group[groupSchema.members] || group.members || [];
    if (typeof members === 'string') {
        try {
            members = JSON.parse(members);
        } catch (e) {
            members = [];
        }
    }
    if (!Array.isArray(members)) {
        members = [];
    }

        // Get creator ID - creator should never be removed
        const creatorId = group[groupSchema.createdBy] || group.created_by;
        
        // Check if all members have confirmed
        const allMembersConfirmed = members.every(memberId => confirmedBy.includes(memberId));

        if (allMembersConfirmed) {
            // All members confirmed - delete the group
            console.log('All members confirmed deletion, deleting group');
            return await deleteGroupFromDatabase(groupId, true);
        } else {
            // Update confirmation status
            const { error: updateError } = await window.supabaseClient
                .from('groups')
                .update({
                    [groupSchema.deletionConfirmedBy]: confirmedBy,
                    [groupSchema.updatedAt]: new Date().toISOString()
                })
                .eq(groupSchema.id, groupId);

            if (updateError) {
                throw updateError;
            }

            // Remove this member from the group (they confirmed deletion)
            // BUT: Never remove the creator from their own group
            const updatedMembers = members.filter(m => 
                m !== window.currentUser.id || m === creatorId
            );
            
            // If only creator is left (or no members), delete the group
            if (updatedMembers.length === 0 || (updatedMembers.length === 1 && updatedMembers[0] === creatorId)) {
                console.log('All members removed (only creator left), deleting group');
                return await deleteGroupFromDatabase(groupId, true);
            }

            // Update members array
            const { error: memberUpdateError } = await window.supabaseClient
                .from('groups')
                .update({
                    [groupSchema.members]: updatedMembers,
                    [groupSchema.updatedAt]: new Date().toISOString()
                })
                .eq(groupSchema.id, groupId);

            if (memberUpdateError) {
                throw memberUpdateError;
            }

            console.log('Member confirmed deletion and removed from group');
            
            // Remove group from this user's localStorage since they're no longer a member
            const localGroups = loadFromLocalStorageSafe();
            const filteredGroups = localGroups.filter(g => g.id !== groupId && g.supabaseId !== groupId);
            saveGroupsToLocalStorageSafe(filteredGroups);
            console.log('Group removed from user localStorage (user is no longer a member)');
        }
}

// Restore group (cancel deletion)
async function restoreGroup(groupId) {
    if (!window.supabaseClient || !window.currentUser) {
        throw new Error('Supabase client or user not available');
    }

    await detectDatabaseSchema();
    const groupSchema = SCHEMA_MAPPING.groups;

    // Fetch current group
    const { data: group, error: fetchError } = await window.supabaseClient
        .from('groups')
        .select('*')
        .eq(groupSchema.id, groupId)
        .single();

    if (fetchError || !group) {
        throw new Error('Group not found');
    }

    // Get current restoration array
    let restoredBy = group[groupSchema.deletionRestoredBy] || group.deletion_restored_by || [];
    if (typeof restoredBy === 'string') {
        try {
            restoredBy = JSON.parse(restoredBy);
        } catch (e) {
            restoredBy = [];
        }
    }
    if (!Array.isArray(restoredBy)) {
        restoredBy = [];
    }

    // Add current user to restored list
    if (!restoredBy.includes(window.currentUser.id)) {
        restoredBy.push(window.currentUser.id);
    }

    // Cancel deletion - clear all deletion flags
    const { error: updateError } = await window.supabaseClient
        .from('groups')
        .update({
            [groupSchema.pendingDeletion]: false,
            [groupSchema.deletionInitiatedBy]: null,
            [groupSchema.deletionConfirmedBy]: [],
            [groupSchema.deletionRestoredBy]: restoredBy,
            [groupSchema.deletionInitiatedAt]: null,
            [groupSchema.updatedAt]: new Date().toISOString()
        })
        .eq(groupSchema.id, groupId);

    if (updateError) {
        throw updateError;
    }

    console.log('Group restoration requested by member');
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
        // Notification removed for cleaner UI
        console.log('All data synced to cloud successfully!');
    } catch (error) {
        console.error('Complete data sync failed:', error);
        // Notification removed for cleaner UI - only log errors
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

        // Get current members (handle JSONB array)
        let currentMembers = group[groupSchema.members] || group.members || [];
        if (typeof currentMembers === 'string') {
            try {
                currentMembers = JSON.parse(currentMembers);
            } catch (e) {
                console.warn('Failed to parse members JSON:', e);
                currentMembers = [];
            }
        }
        if (!Array.isArray(currentMembers)) {
            currentMembers = [];
        }
        
        // Check if user is already a member (by ID or name for backward compatibility)
        const userName = window.currentUser?.name;
        const isAlreadyMember = currentMembers.includes(userId) || 
                               (userName && currentMembers.includes(userName)) ||
                               currentMembers.some(m => m && String(m).toLowerCase() === String(userId).toLowerCase()) ||
                               (userName && currentMembers.some(m => m && String(m).toLowerCase() === String(userName).toLowerCase()));
        
        // Add user if not already a member
        // ALWAYS use user ID for registered users (IDs are unique and reliable)
        if (!isAlreadyMember) {
            // Always add the user's ID when joining
            // This ensures consistency and uniqueness
            const updatedMembers = [...currentMembers, userId];
            
            // Also remove the user's name if it exists (migrate from name to ID)
            const membersWithoutName = updatedMembers.filter(m => 
                !userName || String(m).toLowerCase() !== String(userName).toLowerCase()
            );
            
            // Ensure we have the ID in the array
            if (!membersWithoutName.includes(userId)) {
                membersWithoutName.push(userId);
            }
            
            const finalMembers = membersWithoutName;

            // Update group with new member (store as JSONB array)
            const { error: updateError } = await window.supabaseClient
                .from('groups')
                .update({
                    [groupSchema.members]: finalMembers,
                    [groupSchema.updatedAt]: new Date().toISOString(),
                    [groupSchema.updatedBy]: userId
                })
                .eq(groupSchema.id, groupId);

            if (updateError) {
                console.error('Failed to update group members:', updateError);
                return { joined: false, wasNewMember: false };
            }

            console.log('User joined group successfully');
            return { joined: true, wasNewMember: true };
        } else {
            console.log('User is already a member of this group');
            return { joined: true, wasNewMember: false };
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
            .channel('splitxpense-realtime')
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
                    let members = groupData?.[groupSchema.members] || groupData?.members || [];
                    // Handle JSONB array (might be string or array)
                    if (typeof members === 'string') {
                        try {
                            members = JSON.parse(members);
                        } catch (e) {
                            console.warn('Failed to parse members JSON in real-time update:', e);
                            members = [];
                        }
                    }
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
            .on('postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'users',
                    filter: `id=eq.${window.currentUser.id}`
                },
                async (payload) => {
                    console.log('👤 User data changed:', payload);
                    await handleUserChange(payload);
                }
            )
            .subscribe((status) => {
                console.log('📡 Real-time subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Real-time sync active - auto-refresh will be disabled');
                    // Mark real-time as active
                    window.splitEasySync.realtimeActive = true;
                    // Notify that real-time is working (for auto-refresh to check)
                    if (typeof window.onRealtimeStatusChange === 'function') {
                        window.onRealtimeStatusChange(true);
                    }
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Real-time sync error - auto-refresh will be used as fallback');
                    window.splitEasySync.realtimeActive = false;
                    if (typeof window.onRealtimeStatusChange === 'function') {
                        window.onRealtimeStatusChange(false);
                    }
                } else {
                    // Other statuses (SUBSCRIBING, TIMED_OUT, CLOSED)
                    window.splitEasySync.realtimeActive = false;
                    if (typeof window.onRealtimeStatusChange === 'function') {
                        window.onRealtimeStatusChange(false);
                    }
                }
            });

        window.splitEasySync.realtimeSubscription = groupsChannel;

    } catch (error) {
        console.error('Failed to start real-time sync:', error);
    }
};

// Handle user changes from real-time sync (for name updates across devices)
async function handleUserChange(payload) {
    try {
        const { new: newData } = payload;
        
        if (!newData || !window.currentUser) return;
        
        const newName = newData.name;
        const currentName = window.currentUser.name;
        
        // Only update if name actually changed
        if (newName && newName !== currentName) {
            console.log(`👤 User name changed: "${currentName}" → "${newName}"`);
            
            // Update current user in memory
            window.currentUser.name = newName;
            
            // Update localStorage
            localStorage.setItem('spliteasy_current_user', JSON.stringify(window.currentUser));
            
            // Update UI - try multiple possible elements
            const nameElements = [
                document.getElementById('currentUserName'),
                document.querySelector('.current-user-name'),
                document.querySelector('[data-user-name]')
            ];
            
            nameElements.forEach(el => {
                if (el) el.textContent = newName;
            });
            
            // Show notification
            if (typeof showNotification === 'function') {
                showNotification(`Your name was updated to "${newName}" from another device`, 'info');
            }
            
            console.log('✅ User name synced from another device');
        }
    } catch (error) {
        console.error('Error handling user change:', error);
    }
}

// Handle group changes from real-time sync
async function handleGroupChange(payload) {
    try {
        const { eventType, new: newData, old: oldData } = payload;
        const groupSchema = SCHEMA_MAPPING.groups;

        if (eventType === 'UPDATE' || eventType === 'INSERT') {
            const groupId = newData.id || newData[groupSchema.id];
            
            // Check if group is marked for deletion
            const pendingDeletion = newData[groupSchema.pendingDeletion] || newData.pending_deletion;
            
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
                            // Also update local currentGroup variable in group-detail.html if it exists
                            if (typeof window.setCurrentGroup === 'function') {
                                window.setCurrentGroup(updatedGroup);
                            }
                            if (typeof updateGroupDisplay === 'function') {
                                await updateGroupDisplay();
                            }
                            
                            // Show notification if deletion was initiated
                            if (pendingDeletion && window.currentUser) {
                                const creatorId = updatedGroup.createdBy || updatedGroup.created_by;
                                if (creatorId !== window.currentUser.id) {
                                    // Member - show deletion confirmation modal
                                    if (typeof showDeletionConfirmationModal === 'function') {
                                        showDeletionConfirmationModal();
                                    }
                                }
                            }
                            
                            console.log('Group updated by another user');
                        }
                    }
                }
            } else {
                // Update groups list if on main page
                if (typeof loadGroups === 'function') {
                    loadGroups();
                }
            }
        } else if (eventType === 'DELETE') {
            // Group was deleted
            const groupId = oldData.id || oldData[groupSchema.id];
            
            // Remove from localStorage
            const localGroups = loadFromLocalStorageSafe();
            const filteredGroups = localGroups.filter(g => {
                const gId = g.id || g.supabaseId;
                const gSupabaseId = g.supabaseId || g.id;
                return gId !== groupId && 
                       gSupabaseId !== groupId &&
                       g.id !== groupId &&
                       g.supabaseId !== groupId;
            });
            if (filteredGroups.length < localGroups.length) {
                saveGroupsToLocalStorageSafe(filteredGroups);
                console.log('Removed deleted group from localStorage:', groupId);
            }
            
            if (window.currentGroupId === groupId || (window.currentGroup && window.currentGroup.id === groupId)) {
                console.log('Group was deleted by creator');
                if (typeof showNotification === 'function') {
                    showNotification('This group has been deleted by the creator', 'info');
                }
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 3000);
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
        const expenseGroupId = newData?.[expenseSchema.groupId] || newData?.group_id || oldData?.[expenseSchema.groupId] || oldData?.group_id;

        if (!expenseGroupId) return;

        // Check if this expense belongs to the current group
        // The expense's group_id is a UUID (supabaseId), so we need to compare with:
        // 1. currentGroup.supabaseId (UUID)
        // 2. currentGroup.id (if it's a UUID)
        // 3. window.currentGroupId (if it's a UUID)
        let isCurrentGroup = false;
        if (window.currentGroup) {
            const currentGroupSupabaseId = window.currentGroup.supabaseId || 
                                          (window.currentGroup.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(window.currentGroup.id) ? window.currentGroup.id : null);
            isCurrentGroup = currentGroupSupabaseId === expenseGroupId || 
                            window.currentGroup.id === expenseGroupId;
        } else if (window.currentGroupId) {
            // Check if currentGroupId is a UUID or matches
            isCurrentGroup = window.currentGroupId === expenseGroupId ||
                            (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(window.currentGroupId) && window.currentGroupId === expenseGroupId);
        }

        if (isCurrentGroup) {
            console.log('Reloading expenses due to real-time update for group:', expenseGroupId);

            // Fetch updated group from database using the expense's group_id (UUID)
            if (typeof fetchGroupFromDatabase === 'function') {
                const updatedGroup = await fetchGroupFromDatabase(expenseGroupId);
                if (updatedGroup && window.currentGroup) {
                    // Update expenses
                    window.currentGroup.expenses = updatedGroup.expenses || [];
                    window.currentGroup.totalExpenses = updatedGroup.totalExpenses || 0;

                    // Update local storage
                    const localGroups = loadFromLocalStorageSafe();
                    // Find group by either supabaseId or id
                    const groupIndex = localGroups.findIndex(g => 
                        g.supabaseId === expenseGroupId || 
                        g.id === expenseGroupId ||
                        (g.supabaseId && g.supabaseId === window.currentGroup.supabaseId) ||
                        (g.id === window.currentGroup.id)
                    );
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
                    // Notification removed for cleaner UI
                    console.log(`Expense ${action} by another user`);
                }
            }
        }
    } catch (error) {
        console.error('Error handling expense change:', error);
    }
}

// Remove user from group (for members who want to leave)
async function removeUserFromGroup(groupId, userId) {
    if (!window.supabaseClient || !userId) {
        throw new Error('Supabase client or user ID not available');
    }

    await detectDatabaseSchema();
    const groupSchema = SCHEMA_MAPPING.groups;

    // Fetch current group
    const { data: group, error: fetchError } = await window.supabaseClient
        .from('groups')
        .select('*')
        .eq(groupSchema.id, groupId)
        .maybeSingle();

    if (fetchError) {
        throw fetchError;
    }

    if (!group) {
        throw new Error('Group not found');
    }

    // Get creator ID - creator should never be removed
    const creatorId = group[groupSchema.createdBy] || group.created_by;
    if (userId === creatorId) {
        throw new Error('Creator cannot leave their own group. Use delete instead.');
    }

    // Get members array
    let members = group[groupSchema.members] || group.members || [];
    if (typeof members === 'string') {
        try {
            members = JSON.parse(members);
        } catch (e) {
            members = [];
        }
    }
    if (!Array.isArray(members)) {
        members = [];
    }

    // Check if user is actually a member
    const isMember = members.includes(userId) || 
                     members.some(m => m && String(m).toLowerCase() === String(userId).toLowerCase());
    
    if (!isMember) {
        console.log('User is not a member of this group');
        // Still return success since the goal is achieved (user is not a member)
        return { removed: true, wasMember: false };
    }

    // Remove user from members array
    const updatedMembers = members.filter(m => 
        m !== userId && 
        String(m).toLowerCase() !== String(userId).toLowerCase()
    );

    // Update group in database
    const { error: updateError } = await window.supabaseClient
        .from('groups')
        .update({
            [groupSchema.members]: updatedMembers,
            [groupSchema.updatedAt]: new Date().toISOString()
        })
        .eq(groupSchema.id, groupId);

    if (updateError) {
        throw updateError;
    }

    console.log('User removed from group members');

    // Remove group from user's local storage
    const localGroups = loadFromLocalStorageSafe();
    const filteredGroups = localGroups.filter(g => {
        const gId = g.id || g.supabaseId;
        const gSupabaseId = g.supabaseId || g.id;
        return gId !== groupId && gSupabaseId !== groupId;
    });
    
    if (filteredGroups.length < localGroups.length) {
        saveGroupsToLocalStorageSafe(filteredGroups);
        console.log('Removed group from user\'s localStorage');
    }

    return { removed: true, wasMember: true };
}

// Stop real-time sync
window.stopRealtimeSync = function() {
    if (window.splitEasySync.realtimeSubscription) {
        window.supabaseClient.removeChannel(window.splitEasySync.realtimeSubscription);
        window.splitEasySync.realtimeSubscription = null;
        window.splitEasySync.realtimeActive = false;
        console.log('🛑 Real-time sync stopped');
        // Notify that real-time is no longer active
        if (typeof window.onRealtimeStatusChange === 'function') {
            window.onRealtimeStatusChange(false);
        }
    }
};

// ========================================
// ADMIN STATS (for admin panel - requires RLS to allow admin read on users/groups/expenses)
// ========================================
async function fetchAllUsersForAdmin() {
    if (!window.supabaseClient) return [];
    await detectDatabaseSchema();
    const userSchema = SCHEMA_MAPPING.users;
    const createdCol = userSchema.createdAt || 'created_at';
    const { data, error } = await window.supabaseClient
        .from('users')
        .select('id, name, ' + createdCol)
        .order(createdCol, { ascending: false });
    if (error) {
        console.warn('Admin: fetch users failed (RLS may block)', error);
        return [];
    }
    return data || [];
}

async function fetchAdminStats() {
    if (!window.supabaseClient) {
        return {
            users: [],
            totalGroups: 0,
            totalExpenses: 0,
            groupsList: [],
            error: 'No Supabase client',
            appHealth: { last_ping_at: null, ping_count: null, error: null, ping_days_ist: [] }
        };
    }
    await detectDatabaseSchema();
    const groupSchema = SCHEMA_MAPPING.groups;
    const createdByCol = groupSchema.createdBy || 'created_by';
    const membersCol = groupSchema.members || 'members';
    const users = await fetchAllUsersForAdmin();
    const { data: groupsList, error: groupsError } = await window.supabaseClient
        .from('groups')
        .select('id, name, ' + createdByCol + ', ' + membersCol);
    if (groupsError) console.warn('Admin: groups fetch failed', groupsError);
    const totalGroups = groupsList ? groupsList.length : 0;
    const { count: expensesCount, error: expensesError } = await window.supabaseClient
        .from('expenses')
        .select('*', { count: 'exact', head: true });
    if (expensesError) console.warn('Admin: expenses count failed', expensesError);
    function toEmail(val) {
        if (val == null) return '';
        if (typeof val === 'object' && val.id != null) return String(val.id).toLowerCase();
        return String(val).toLowerCase();
    }
    var usersWithCounts = users.map(function(u) {
        var uid = (u.id && String(u.id).toLowerCase()) || '';
        var count = 0;
        var groupNames = [];
        if (groupsList) {
            groupsList.forEach(function(g) {
                var creator = g[createdByCol] != null ? g[createdByCol] : g.created_by;
                var creatorE = toEmail(creator);
                var isIn = creatorE && creatorE === uid;
                if (!isIn && g[membersCol]) {
                    var arr = typeof g[membersCol] === 'string' ? (function() { try { return JSON.parse(g[membersCol]); } catch (e) { return []; } })() : g[membersCol];
                    if (Array.isArray(arr)) isIn = arr.some(function(m) { return toEmail(m) === uid; });
                }
                if (isIn) {
                    count++;
                    groupNames.push(g.name || g.id || '—');
                }
            });
        }
        return Object.assign({}, u, { groupCount: count, groupNames: groupNames });
    });
    var appHealth = { last_ping_at: null, ping_count: null, error: null, ping_days_ist: [] };
    try {
        const { data: hRow, error: hErr } = await window.supabaseClient
            .from('app_health')
            .select('last_ping_at, ping_count')
            .eq('id', 1)
            .maybeSingle();
        if (hErr) {
            appHealth.error = hErr.message || String(hErr.code || 'read failed');
        } else if (hRow) {
            appHealth.last_ping_at = hRow.last_ping_at;
            appHealth.ping_count = hRow.ping_count;
        }
    } catch (e) {
        appHealth.error = e && e.message ? e.message : String(e);
    }

    try {
        const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
        const { data: logRows, error: logErr } = await window.supabaseClient
            .from('health_ping_log')
            .select('pinged_at')
            .gte('pinged_at', since);
        if (!logErr && logRows && logRows.length) {
            var seen = {};
            logRows.forEach(function(row) {
                var raw = row.pinged_at;
                if (!raw) return;
                try {
                    var key = new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).format(new Date(raw));
                    if (key) seen[key] = true;
                } catch (e2) {}
            });
            appHealth.ping_days_ist = Object.keys(seen).sort();
        } else if (logErr) {
            console.warn('Admin: health_ping_log read failed', logErr);
        }
    } catch (e3) {
        console.warn('Admin: health_ping_log', e3);
    }

    return {
        users: usersWithCounts,
        totalGroups: totalGroups,
        totalExpenses: expensesCount != null ? expensesCount : 0,
        groupsList: groupsList || [],
        appHealth: appHealth
    };
}

/**
 * Admin: delete a user from app data (public.users, their groups, expenses, memberships).
 * Uses client + RLS only (no Edge Function). Auth user is NOT deleted—remove them in
 * Supabase Dashboard → Authentication → Users if needed.
 * Requires RLS policy allowing admin email to DELETE/UPDATE (see admin-rls.sql).
 * @param {string} userId - User id (same as public.users.id)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function deleteUserInSupabase(userId) {
    console.log('[Admin delete] Starting delete for userId:', userId);
    if (!window.supabaseClient) {
        console.warn('[Admin delete] No Supabase client');
        return { ok: false, error: 'Supabase not connected' };
    }
    if (!userId || typeof userId !== 'string') {
        console.warn('[Admin delete] Invalid userId');
        return { ok: false, error: 'Invalid user id' };
    }
    await detectDatabaseSchema();
    const groupSchema = SCHEMA_MAPPING.groups;
    const expenseSchema = SCHEMA_MAPPING.expenses;
    const createdByCol = groupSchema.createdBy || 'created_by';
    const membersCol = groupSchema.members || 'members';
    const uid = userId.trim();
    try {
        // 1) Groups owned by this user
        const { data: ownedGroups, error: eg } = await window.supabaseClient
            .from('groups')
            .select('id')
            .eq(createdByCol, uid);
        if (eg) {
            console.error('[Admin delete] Failed to fetch groups:', eg);
            return { ok: false, error: eg.message || 'Failed to fetch groups' };
        }
        const groupIds = (ownedGroups || []).map(function(g) { return g.id; });
        console.log('[Admin delete] Owned groups to delete:', groupIds.length, groupIds);
        // 2) Delete expenses in those groups, then the groups
        for (var g = 0; g < groupIds.length; g++) {
            var exErr = (await window.supabaseClient.from('expenses').delete().eq(expenseSchema.groupId, groupIds[g])).error;
            if (exErr) {
                console.error('[Admin delete] Failed to delete expenses for group', groupIds[g], exErr);
                return { ok: false, error: 'Expenses: ' + (exErr.message || exErr.code) };
            }
            var grErr = (await window.supabaseClient.from('groups').delete().eq('id', groupIds[g])).error;
            if (grErr) {
                console.error('[Admin delete] Failed to delete group', groupIds[g], grErr);
                return { ok: false, error: 'Group: ' + (grErr.message || grErr.code) };
            }
        }
        // 3) Expenses where they paid (in other people's groups)
        var paidErr = (await window.supabaseClient.from('expenses').delete().eq(expenseSchema.paidBy, uid)).error;
        if (paidErr) {
            console.error('[Admin delete] Failed to delete expenses by paid_by', paidErr);
            return { ok: false, error: 'Expenses (paid_by): ' + (paidErr.message || paidErr.code) };
        }
        // 4) Remove user from other groups' members
        var { data: groupsWithMember, error: gwErr } = await window.supabaseClient.from('groups').select('id, ' + membersCol);
        if (gwErr) console.warn('[Admin delete] Fetch groups for members update:', gwErr);
        if (groupsWithMember) {
            for (var i = 0; i < groupsWithMember.length; i++) {
                var gr = groupsWithMember[i];
                var members = gr[membersCol];
                if (!Array.isArray(members)) continue;
                var next = members.filter(function(m) { return String(m).toLowerCase() !== uid.toLowerCase(); });
                if (next.length !== members.length) {
                    var upErr = (await window.supabaseClient.from('groups').update({ [membersCol]: next }).eq('id', gr.id)).error;
                    if (upErr) {
                        console.error('[Admin delete] Failed to update group members', gr.id, upErr);
                        return { ok: false, error: 'Update members: ' + (upErr.message || upErr.code) };
                    }
                }
            }
        }
        // 5) Delete from users (use .select() to get deleted rows - if 0, RLS may have blocked)
        var { data: deletedRows, error: uErr } = await window.supabaseClient
            .from('users')
            .delete()
            .eq('id', uid)
            .select('id');
        if (uErr) {
            console.error('[Admin delete] Failed to delete user row:', uErr);
            return { ok: false, error: uErr.message || 'Failed to delete user row' };
        }
        if (!deletedRows || deletedRows.length === 0) {
            console.warn('[Admin delete] No user row was deleted (0 rows). Check RLS or user id.');
            return { ok: false, error: 'User could not be deleted. On the Admin page, sign in with Supabase using the yellow banner (enter your password). If you have no password, add yourself in Supabase Dashboard → Authentication → Users and set one.' };
        }
        console.log('[Admin delete] User deleted successfully, rows removed:', deletedRows.length);
        return { ok: true };
    } catch (e) {
        console.error('[Admin delete] Exception:', e);
        return { ok: false, error: e && e.message ? e.message : String(e) };
    }
}

window.fetchAllUsersForAdmin = fetchAllUsersForAdmin;
window.fetchAdminStats = fetchAdminStats;
window.deleteUserInSupabase = deleteUserInSupabase;

// Make all functions globally available
window.fetchAllGroupsFromDatabase = fetchAllGroupsFromDatabase;
window.fetchGroupFromDatabase = fetchGroupFromDatabase;
window.deleteExpenseFromDatabase = deleteExpenseFromDatabase;
window.deleteGroupFromDatabase = deleteGroupFromDatabase;
window.confirmGroupDeletion = confirmGroupDeletion;
window.restoreGroup = restoreGroup;
window.syncExpenseToDatabase = syncExpenseToDatabase;
window.syncGroupToDatabase = syncGroupToDatabase;
window.syncUserToDatabase = syncUserToDatabase;
window.syncAllDataToDatabase = syncAllDataToDatabase;
window.detectDatabaseSchema = detectDatabaseSchema;
window.joinUserToGroup = joinUserToGroup;
window.removeUserFromGroup = removeUserFromGroup;

// Enhanced sync management functions
window.forceSyncToDatabase = async function() {
    if (window.splitEasySync.isSyncing) {
        // Notification removed for cleaner UI
        console.log('Sync already in progress...');
        return;
    }

    if (window.splitEasySync.isOffline || !window.supabaseClient) {
        // Only log offline errors, don't show notification for cleaner UI
        console.warn('Cannot sync - you are offline');
        return;
    }

    if (!window.currentUser) {
        // Only log login errors, don't show notification for cleaner UI
        console.warn('Please log in to sync data');
        return;
    }

        // Notification removed for cleaner UI
        console.log('Starting sync with schema detection...');
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

// Export SCHEMA_MAPPING to window for access from other scripts
window.SCHEMA_MAPPING = SCHEMA_MAPPING;

// Export saveGroupsToLocalStorageSafe for use in other scripts
window.saveGroupsToLocalStorageSafe = saveGroupsToLocalStorageSafe;

console.log('Database schema-aware SplitXpense sync system loaded successfully');