// shared-supabase-enhanced.js - Enhanced Supabase Management
console.log('Loading enhanced SplitEasy Supabase integration...');

// ========================================
// SUPABASE CONFIGURATION
// ========================================
// Configuration is loaded from js/config.js (gitignored)
// If config.js doesn't exist, Supabase features will be disabled
let SUPABASECONFIG = null;

// Configuration is loaded from js/config.js (loaded before this script)
// Check both window.SUPABASECONFIG and global SUPABASECONFIG
if ((typeof SUPABASECONFIG === 'undefined' || SUPABASECONFIG === null) &&
    (typeof window.SUPABASECONFIG === 'undefined' || window.SUPABASECONFIG === null)) {
    console.warn('⚠️ Supabase config not found. Supabase features will be disabled.');
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
        console.log('Supabase already initialized');
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
                    persistSession: false, // We handle our own user management
                    autoRefreshToken: false
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

        // Test with a simple query
        const { data, error } = await window.supabaseClient
            .from('users')
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

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
            console.warn('User ID check error:', error);
            return false;
        }

        return !!data;
    } catch (error) {
        console.warn('User ID check failed:', error);
        return false;
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
                createdat: new Date().toISOString(),
                updatedat: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log('User created in database:', userName);
        return data;
    } catch (error) {
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

        // Delete user's expenses first
        const { error: expenseError } = await window.supabaseClient
            .from('expenses')
            .delete()
            .eq('createdby', userId);

        if (expenseError) {
            console.warn('Failed to delete user expenses:', expenseError);
        }

        // Delete user's groups
        const { error: groupError } = await window.supabaseClient
            .from('groups')
            .delete()
            .eq('createdby', userId);

        if (groupError) {
            console.warn('Failed to delete user groups:', groupError);
        }

        // Delete user
        const { error: userError } = await window.supabaseClient
            .from('users')
            .delete()
            .eq('id', userId);

        if (userError) {
            throw userError;
        }

        console.log('User deleted from database successfully');
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