// shared-supabase-enhanced.js - Enhanced Supabase Management
// ========================================
// SUPABASE CONFIGURATION
// ========================================
// Configuration is loaded from js/config.js (gitignored)
// If config.js doesn't exist, Supabase features will be disabled
let SUPABASECONFIG = null;

// Function to get the current config (always reads from window)
function getSupabaseConfig() {
    if (typeof window !== 'undefined' && window.SUPABASECONFIG) {
        if (window.SUPABASECONFIG.url && window.SUPABASECONFIG.anonKey) {
            return window.SUPABASECONFIG;
        }
    }
    return null;
}

// Configuration is loaded from js/config.js (loaded before this script)
// Check both window.SUPABASECONFIG and global SUPABASECONFIG
if ((typeof SUPABASECONFIG === 'undefined' || SUPABASECONFIG === null) &&
    (typeof window.SUPABASECONFIG === 'undefined' || window.SUPABASECONFIG === null)) {
    console.warn('⚠️ Supabase config not found. Sync features will be disabled.');
    console.warn('📝 Please create js/config.js with your Supabase credentials.');
    console.warn('📝 For GitHub Pages: You need to manually add config.js to your repository (or use GitHub Secrets)');
    // Create a dummy config to prevent errors
    SUPABASECONFIG = {
        url: '',
        anonKey: ''
    };
} else {
    // Use window.SUPABASECONFIG if available (loaded via script tag with error handling)
    if (typeof window.SUPABASECONFIG !== 'undefined' && window.SUPABASECONFIG !== null) {
        SUPABASECONFIG = window.SUPABASECONFIG;
    }
}

// Global Supabase variables
// Use a different name to avoid conflicts with window.supabase (the library)
let supabaseClientInstance = null;
let isOffline = false;
let connectionRetryCount = 0;
const maxRetries = 5;

// ========================================
// ENHANCED INITIALIZATION
// ========================================

// Enhanced Supabase initialization with retry logic
window.initializeSupabase = function() {
    if (window.supabase && window.supabaseClient) {
        console.log('Backend already initialized');
        return true;
    }

    if (!window.supabase) {
        console.warn('Supabase library not loaded, retrying...');

        if (connectionRetryCount < maxRetries) {
            connectionRetryCount++;
            setTimeout(window.initializeSupabase, 1000);
        } else {
            console.error('Failed to load Supabase after', maxRetries, 'attempts');
            isOffline = true;
        }
        return false;
    }

    try {
        // Always get fresh config from window (in case it was set after script load)
        var currentConfig = getSupabaseConfig();
        
        // Check if config is valid
        if (!currentConfig || !currentConfig.url || !currentConfig.anonKey || 
            currentConfig.url === '' || currentConfig.anonKey === '' ||
            currentConfig.url === 'YOUR_SUPABASE_URL_HERE' || 
            currentConfig.anonKey === 'YOUR_SUPABASE_ANON_KEY_HERE') {
            console.warn('Invalid Supabase configuration. Please check js/config.js');
            console.warn('Create js/config.js with your Supabase credentials.');
            isOffline = true;
            return false;
        }

        console.log('Initializing Supabase connection...');

        window.supabaseClient = window.supabase.createClient(
            currentConfig.url, 
            currentConfig.anonKey,
            {
                auth: {
                    persistSession: true,  // Used for admin page login
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            }
        );

        supabaseClientInstance = window.supabaseClient; // Store for internal use

        console.log('Supabase initialized successfully');

        // Test connection
        testSupabaseConnection();

        return true;
    } catch (error) {
        console.error('Supabase initialization failed:', error);
        isOffline = true;
        return false;
    }
};

// Test Supabase connection
async function testSupabaseConnection() {
    if (!window.supabaseClient) {
        console.warn('No Supabase client to test');
        return false;
    }

    try {
        console.log('🧪 Testing Supabase connection...');

        // Test with groups table instead (more likely to exist)
        const { data, error } = await window.supabaseClient
            .from('groups')
            .select('count')
            .limit(1);

        if (error) {
            console.warn('Supabase connection test failed:', error.message);
            // Don't throw error, might be table doesn't exist yet
            return false;
        } else {
            console.log('Supabase connection test successful');
            isOffline = false;
            return true;
        }
    } catch (error) {
        console.warn('Supabase connection test error:', error);
        return false;
    }
}

// ========================================
// AUTH (email + password)
// ========================================

/** Get current session; returns { data: { session }, error } */
window.getAuthSession = async function() {
    if (!window.supabaseClient) return { data: { session: null }, error: new Error('No Supabase client') };
    return await window.supabaseClient.auth.getSession();
};

/** Build currentUser from auth user. Use email as id for compatibility with groups/expenses. */
window.getCurrentUserFromAuth = function(authUser) {
    if (!authUser || !authUser.email) return null;
    var email = (authUser.email || '').toLowerCase();
    var name = (authUser.user_metadata && authUser.user_metadata.name) || authUser.email || email;
    return {
        id: email,
        email: email,
        name: name,
        createdAt: authUser.created_at ? new Date(authUser.created_at).toISOString() : new Date().toISOString()
    };
};

/** Sign up with email and password. Optional name in options.data.name. */
window.authSignUp = async function(email, password, options) {
    if (!window.supabaseClient) return { data: null, error: new Error('No Supabase client') };
    return await window.supabaseClient.auth.signUp({
        email: (email || '').toLowerCase().trim(),
        password: password || '',
        options: options || {}
    });
};

/** Sign in with email and password. */
window.authSignIn = async function(email, password) {
    if (!window.supabaseClient) return { data: null, error: new Error('No Supabase client') };
    return await window.supabaseClient.auth.signInWithPassword({
        email: (email || '').toLowerCase().trim(),
        password: password || ''
    });
};

/** Sign out. */
window.authSignOut = async function() {
    if (!window.supabaseClient) return;
    await window.supabaseClient.auth.signOut();
};

/** Check if email is in Supabase admins table (admin list stored in DB). */
window.checkIsAdminEmail = async function(email) {
    if (!window.supabaseClient || !email) return false;
    var e = String(email).toLowerCase().trim();
    var res = await window.supabaseClient.from('admins').select('email').eq('email', e).maybeSingle();
    return !!(res.data && res.data.email);
};

// ========================================
// USER MANAGEMENT FUNCTIONS
// ========================================

// Check if user ID exists in database
window.checkUserIdExists = async function(userId) {
    if (!window.supabaseClient || isOffline) {
        console.log('Offline or no client - cannot check user ID');
        return false;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('id')
            .eq('id', userId)
            .single();

        // If table doesn't exist (404), return false but don't error
        if (error) {
            if (error.code === 'PGRST116' || error.message?.includes('not found') || error.message?.includes('404')) {
                // User not found or table doesn't exist - both are fine
                return false;
            }
            console.warn('User ID check error:', error);
            return false;
        }

        return !!data;
    } catch (error) {
        // If table doesn't exist, that's okay - users table is optional
        if (error.message?.includes('not found') || error.message?.includes('404')) {
            console.log('Users table not found - this is optional, continuing without it');
            return false;
        }
        console.warn('User ID check failed:', error);
        return false;
    }
};

// Fetch user by email from database (for auto-populating name)
window.fetchUserByEmail = async function(email) {
    if (!window.supabaseClient || isOffline) {
        console.log('Offline or no client - cannot fetch user');
        return null;
    }

    console.log('🔍 Fetching user by email:', email);

    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('id, name')
            .eq('id', email.toLowerCase())
            .single();

        if (error) {
            // User not found or table doesn't exist
            if (error.code === 'PGRST116' || error.message?.includes('not found') || error.message?.includes('404')) {
                console.log('User not found in database (new user)');
                return null;
            }
            console.warn('User fetch error:', error);
            return null;
        }

        console.log('✅ User found in database:', data);
        return data;
    } catch (error) {
        console.warn('User fetch failed:', error);
        return null;
    }
};

// Sync user to database (upsert - create or update)
window.syncUserToDatabase = async function(user) {
    if (!window.supabaseClient || isOffline) {
        console.log('Offline or no client - cannot sync user');
        return false;
    }

    if (!user || !user.id) {
        console.warn('Cannot sync user - no user data provided');
        return false;
    }

    console.log('🔄 Syncing user to database:', user.id, user.name);

    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .upsert({
                id: user.id.toLowerCase(),
                name: user.name,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'id'
            })
            .select()
            .single();

        if (error) {
            // If users table doesn't exist, that's okay
            if (error.message?.includes('not found') || error.message?.includes('404') || error.code === 'PGRST204' || error.code === '42P01') {
                console.log('⚠️ Users table not found - user will be stored locally only');
                return null;
            }
            console.error('User sync error:', error);
            throw error;
        }

        console.log('✅ User synced to database:', data);
        return data;
    } catch (error) {
        // If table doesn't exist, log but don't fail
        if (error.message?.includes('not found') || error.message?.includes('404') || error.code === '42P01') {
            console.log('⚠️ Users table not found - user will be stored locally only');
            return null;
        }
        console.error('User sync failed:', error);
        throw error;
    }
};

// Create user in database
window.createUserInDatabase = async function(userId, userName) {
    if (!window.supabaseClient || isOffline) {
        console.log('Offline or no client - cannot create user');
        return false;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .insert({
                id: userId,
                name: userName,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            // If users table doesn't exist, that's okay - it's optional
            if (error.message?.includes('not found') || error.message?.includes('404') || error.code === 'PGRST204') {
                console.log('⚠️ Users table not found - user will be stored locally only. This is fine!');
                console.log('💡 To enable user sync, run the migration SQL in Supabase to create the users table.');
                return null; // Return null instead of throwing - app can work without users table
            }
            throw error;
        }

        console.log('✅ User created in database:', userName);
        return data;
    } catch (error) {
        // If table doesn't exist, log warning but don't fail
        if (error.message?.includes('not found') || error.message?.includes('404') || error.code === 'PGRST204') {
            console.log('⚠️ Users table not found - user will be stored locally only. This is fine!');
            console.log('💡 To enable user sync, run the migration SQL in Supabase to create the users table.');
            return null;
        }
        console.error('Failed to create user:', error);
        throw error;
    }
};

// Delete user from database
window.deleteUserFromDatabase = async function(userId) {
    if (!window.supabaseClient || isOffline) {
        console.log('Offline or no client - cannot delete user');
        return false;
    }

    try {
        console.log('Deleting user from database:', userId);
        console.log('This will delete ALL groups created by this user and ALL expenses in those groups');

        // Step 1: Get all groups created by this user
        const { data: userGroups, error: fetchGroupsError } = await window.supabaseClient
            .from('groups')
            .select('id')
            .eq('created_by', userId);

        if (fetchGroupsError) {
            console.warn('Failed to fetch user groups:', fetchGroupsError);
        }

        // Step 2: Delete ALL expenses in groups created by this user
        // (This includes expenses created by other users in the group)
        if (userGroups && userGroups.length > 0) {
            const groupIds = userGroups.map(g => g.id);
            console.log(`Deleting all expenses from ${groupIds.length} groups...`);
            
            const { error: expenseError } = await window.supabaseClient
                .from('expenses')
                .delete()
                .in('group_id', groupIds);

            if (expenseError) {
                console.warn('Failed to delete expenses from user groups:', expenseError);
            } else {
                console.log('All expenses in user groups deleted successfully');
            }
        }

        // Step 3: Delete user's groups (this will also cascade delete any remaining expenses)
        const { error: groupError } = await window.supabaseClient
            .from('groups')
            .delete()
            .eq('created_by', userId);

        if (groupError) {
            console.warn('Failed to delete user groups:', groupError);
        } else {
            console.log('User groups deleted successfully');
        }

        // Step 4: Delete any remaining expenses created by this user (in groups they didn't create)
        const { error: remainingExpenseError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('created_by', userId);

        if (remainingExpenseError) {
            console.warn('Failed to delete remaining user expenses:', remainingExpenseError);
        }

        // Step 5: Delete user record
        const { error: userError } = await window.supabaseClient
            .from('users')
            .delete()
            .eq('id', userId);

        if (userError) {
            throw userError;
        }

        console.log('User and all associated data deleted from database successfully');
        return true;
    } catch (error) {
        console.error('Failed to delete user:', error);
        throw error;
    }
};

// ========================================
// CONNECTION MONITORING
// ========================================

// Monitor connection status
function startConnectionMonitoring() {
    setInterval(async () => {
        if (!isOffline && window.supabaseClient) {
            const isConnected = await testSupabaseConnection();
            if (!isConnected && !isOffline) {
                console.warn('Lost connection to Supabase');
                isOffline = true;
                if (typeof showNotification === 'function') {
                    showNotification('Database connection lost', 'warning');
                }
            } else if (isConnected && isOffline) {
                console.log('Reconnected to Supabase');
                isOffline = false;
                if (typeof showNotification === 'function') {
                    showNotification('Database connection restored', 'success');
                }
            }
        }
    }, 30000); // Check every 30 seconds
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Get connection status
window.getSupabaseStatus = function() {
    return {
        initialized: !!window.supabaseClient,
        connected: !isOffline,
        url: SUPABASECONFIG.url,
        retryCount: connectionRetryCount,
        maxRetries: maxRetries
    };
};

// Force reconnection
window.reconnectSupabase = async function() {
    console.log('Forcing Supabase reconnection...');
    connectionRetryCount = 0;
    isOffline = false;

    if (window.supabaseClient) {
        // Try to test existing connection first
        const connected = await testSupabaseConnection();
        if (connected) {
            console.log('Existing connection is working');
            return true;
        }
    }

    // Reinitialize if needed
    return window.initializeSupabase();
};

// ========================================
// AUTO-INITIALIZATION
// ========================================

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, initializing Supabase...');

    // Try immediate initialization
    window.initializeSupabase();

    // Start connection monitoring
    setTimeout(startConnectionMonitoring, 5000);
});

// Retry initialization if Supabase library loads later
if (!window.supabase) {
    console.log('Waiting for Supabase library to load...');

    const checkSupabaseLibrary = setInterval(() => {
        if (window.supabase) {
            console.log('Supabase library loaded, initializing...');
            clearInterval(checkSupabaseLibrary);
            window.initializeSupabase();
        }
    }, 500);

    // Stop checking after 10 seconds
    setTimeout(() => {
        clearInterval(checkSupabaseLibrary);
        if (!window.supabase) {
            console.error('Supabase library failed to load');
        }
    }, 10000);
}

// ========================================
// ERROR HANDLING & DEBUGGING
// ========================================

// Global error handler for Supabase operations
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('supabase')) {
        console.error('Unhandled Supabase error:', event.reason);

        if (event.reason.message.includes('Failed to fetch')) {
            isOffline = true;
            if (typeof showNotification === 'function') {
                showNotification('Database connection lost - working offline', 'warning');
            }
        }
    }
});

// Debug function
window.debugSupabase = function() {
    return {
        status: window.getSupabaseStatus(),
        client: !!window.supabaseClient,
        config: {
            url: SUPABASECONFIG.url,
            hasKey: !!SUPABASECONFIG.anonKey
        },
        error: null
    };
};

console.log('Enhanced Supabase management loaded successfully');