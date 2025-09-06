// Authentication Service for Dyslexia Screening App
class AuthService {
    constructor() {
        this.user = null;
        this.token = localStorage.getItem('authToken');
        this.isGuest = !this.token;
        this.baseUrl = window.location.origin;
        
        // Initialize user state
        if (this.token) {
            this.validateToken();
        }
        
        this.setupAuthUI();
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    // Get current user
    getCurrentUser() {
        return this.user;
    }

    // Login user
    async login(email, password) {
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            this.token = data.token;
            this.user = data.user;
            this.isGuest = false;

            localStorage.setItem('authToken', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            this.updateAuthUI();
            this.dispatchAuthEvent('login', this.user);

            // Offer to migrate existing data
            await this.offerDataMigration();

            return { success: true, user: this.user };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    // Register new user
    async register(userData) {
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.errors?.[0]?.msg || data.error || 'Registration failed');
            }

            this.token = data.token;
            this.user = data.user;
            this.isGuest = false;

            localStorage.setItem('authToken', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            this.updateAuthUI();
            this.dispatchAuthEvent('register', this.user);

            // Offer to migrate existing data
            await this.offerDataMigration();

            return { success: true, user: this.user };
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: error.message };
        }
    }

    // Logout user
    logout() {
        this.token = null;
        this.user = null;
        this.isGuest = true;

        localStorage.removeItem('authToken');
        localStorage.removeItem('user');

        this.updateAuthUI();
        this.dispatchAuthEvent('logout');
    }

    // Validate existing token
    async validateToken() {
        if (!this.token) return false;

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.isGuest = false;
                localStorage.setItem('user', JSON.stringify(this.user));
                this.updateAuthUI();
                return true;
            } else {
                // Token invalid, clear it
                this.logout();
                return false;
            }
        } catch (error) {
            console.error('Token validation error:', error);
            this.logout();
            return false;
        }
    }

    // Update user profile
    async updateProfile(profileData) {
        if (!this.token) throw new Error('Not authenticated');

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(profileData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Profile update failed');
            }

            // Refresh user data
            await this.validateToken();

            return { success: true };
        } catch (error) {
            console.error('Profile update error:', error);
            return { success: false, error: error.message };
        }
    }

    // Migrate localStorage data to server
    async migrateData() {
        if (!this.token) return { success: false, error: 'Not authenticated' };

        try {
            // Collect localStorage data
            const gameResults = {};
            const surveyResults = {};
            const problemsetStats = {};

            // Get game results from app state
            const appStateData = localStorage.getItem('testResults');
            if (appStateData) {
                Object.assign(gameResults, JSON.parse(appStateData).testResults || {});
            }

            // Get survey results
            const surveyData = localStorage.getItem('surveyResults');
            if (surveyData) {
                Object.assign(surveyResults, JSON.parse(surveyData));
            }

            // Get problem set stats
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('stats-set-')) {
                    problemsetStats[key] = JSON.parse(localStorage.getItem(key));
                }
            });

            // Send migration request
            const response = await fetch(`${this.baseUrl}/api/games/migrate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    gameResults,
                    surveyResults,
                    problemsetStats
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Migration failed');
            }

            // Clear localStorage data after successful migration
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('stats-set-') || 
                    key === 'testResults' || 
                    key === 'surveyResults' ||
                    key === 'gameHistory') {
                    localStorage.removeItem(key);
                }
            });

            return { success: true };
        } catch (error) {
            console.error('Data migration error:', error);
            return { success: false, error: error.message };
        }
    }

    // Offer data migration to user
    async offerDataMigration() {
        // Check if there's any localStorage data to migrate
        const hasData = Object.keys(localStorage).some(key => 
            key.startsWith('stats-set-') || 
            key === 'testResults' || 
            key === 'surveyResults'
        );

        if (hasData) {
            const migrate = confirm(
                'We found existing game data on this device. Would you like to import it to your account?\n\n' +
                'This will preserve your previous progress and scores.'
            );

            if (migrate) {
                const result = await this.migrateData();
                if (result.success) {
                    alert('Your previous data has been successfully imported!');
                } else {
                    alert('Failed to import data: ' + result.error);
                }
            }
        }
    }

    // Setup authentication UI
    setupAuthUI() {
        this.createAuthModal();
        this.setupExistingUI();
        this.updateAuthUI();
    }

    // Create authentication modal
    createAuthModal() {
        if (document.getElementById('auth-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'auth-modal';
        modal.innerHTML = `
            <div class="auth-modal-overlay"></div>
            <div class="auth-modal-content">
                <button class="auth-modal-close">&times;</button>
                
                <div id="auth-login-form" class="auth-form active">
                    <h2>Sign In</h2>
                    <form id="login-form">
                        <div class="form-group">
                            <label for="login-email">Email:</label>
                            <input type="email" id="login-email" required>
                        </div>
                        <div class="form-group">
                            <label for="login-password">Password:</label>
                            <input type="password" id="login-password" required>
                        </div>
                        <button type="submit" class="btn btn-primary">Sign In</button>
                        <p class="auth-switch">Don't have an account? <a href="#" id="show-register">Sign Up</a></p>
                    </form>
                </div>

                <div id="auth-register-form" class="auth-form">
                    <h2>Sign Up</h2>
                    <form id="register-form">
                        <div class="form-group">
                            <label for="register-email">Email:</label>
                            <input type="email" id="register-email" required>
                        </div>
                        <div class="form-group">
                            <label for="register-username">Username:</label>
                            <input type="text" id="register-username" required minlength="3">
                        </div>
                        <div class="form-group">
                            <label for="register-password">Password:</label>
                            <input type="password" id="register-password" required minlength="6">
                        </div>
                        <div class="form-group">
                            <label for="register-name">Full Name (optional):</label>
                            <input type="text" id="register-name">
                        </div>
                        <div class="form-group">
                            <label for="register-age">Age (optional):</label>
                            <input type="number" id="register-age" min="1" max="150">
                        </div>
                        <div class="form-group">
                            <label for="register-grade">Grade Level (optional):</label>
                            <input type="text" id="register-grade" placeholder="e.g., 3rd Grade, High School">
                        </div>
                        <button type="submit" class="btn btn-primary">Sign Up</button>
                        <p class="auth-switch">Already have an account? <a href="#" id="show-login">Sign In</a></p>
                    </form>
                </div>

                <div id="auth-loading" class="auth-loading" style="display: none;">
                    <div class="spinner"></div>
                    <p>Please wait...</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.setupAuthModalEvents();
    }

    // Setup auth modal event listeners
    setupAuthModalEvents() {
        const modal = document.getElementById('auth-modal');
        const overlay = modal.querySelector('.auth-modal-overlay');
        const closeBtn = modal.querySelector('.auth-modal-close');
        
        // Close modal events
        [overlay, closeBtn].forEach(element => {
            element.addEventListener('click', () => this.hideAuthModal());
        });

        // Form switching
        document.getElementById('show-register').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterForm();
        });

        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });

        // Form submissions
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });
    }

    // Handle login form submission
    async handleLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        this.showAuthLoading(true);

        const result = await this.login(email, password);

        this.showAuthLoading(false);

        if (result.success) {
            this.hideAuthModal();
        } else {
            alert('Login failed: ' + result.error);
        }
    }

    // Handle register form submission
    async handleRegister() {
        const userData = {
            email: document.getElementById('register-email').value,
            username: document.getElementById('register-username').value,
            password: document.getElementById('register-password').value,
            name: document.getElementById('register-name').value || null,
            age: document.getElementById('register-age').value || null,
            grade_level: document.getElementById('register-grade').value || null
        };

        this.showAuthLoading(true);

        const result = await this.register(userData);

        this.showAuthLoading(false);

        if (result.success) {
            this.hideAuthModal();
        } else {
            alert('Registration failed: ' + result.error);
        }
    }

    // Setup existing UI elements
    setupExistingUI() {
        // Wire up the existing auth button
        const authButton = document.getElementById('auth-button');
        if (authButton) {
            authButton.addEventListener('click', () => {
                this.showAuthModal();
            });
        }

        // Wire up guest banner signup link
        const guestSignupLink = document.getElementById('guest-signup-link');
        if (guestSignupLink) {
            guestSignupLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAuthModal();
                this.showRegisterForm(); // Start with registration form
            });
        }

        // Add logout functionality to auth button when logged in
        this.setupAuthButtonToggle();
    }

    // Setup auth button toggle behavior
    setupAuthButtonToggle() {
        const authButton = document.getElementById('auth-button');
        if (!authButton) return;

        // Create dropdown menu for authenticated users
        const dropdownMenu = document.createElement('div');
        dropdownMenu.id = 'auth-dropdown';
        dropdownMenu.className = 'auth-dropdown-menu';
        dropdownMenu.style.cssText = `
            position: absolute;
            top: 100%;
            right: 0;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            display: none;
            min-width: 150px;
            z-index: 1000;
        `;
        dropdownMenu.innerHTML = `
            <a href="#" id="profile-menu-link" style="display: block; padding: 8px 16px; text-decoration: none; color: #333; border-bottom: 1px solid #eee;">Profile</a>
            <a href="#" id="logout-menu-link" style="display: block; padding: 8px 16px; text-decoration: none; color: #333;">Logout</a>
        `;

        // Insert dropdown after auth button
        authButton.parentElement.style.position = 'relative';
        authButton.parentElement.appendChild(dropdownMenu);

        // Setup dropdown toggle
        authButton.addEventListener('click', (e) => {
            if (this.isAuthenticated()) {
                e.stopPropagation();
                const isVisible = dropdownMenu.style.display === 'block';
                dropdownMenu.style.display = isVisible ? 'none' : 'block';
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdownMenu.style.display = 'none';
        });

        // Setup dropdown menu items
        document.getElementById('logout-menu-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
            dropdownMenu.style.display = 'none';
        });
    }

    // This method is no longer needed as we use existing UI
    setupUserDropdownEvents() {
        // Handled in setupExistingUI
    }

    // Show/hide auth modal
    showAuthModal() {
        document.getElementById('auth-modal').style.display = 'flex';
    }

    hideAuthModal() {
        document.getElementById('auth-modal').style.display = 'none';
    }

    showLoginForm() {
        document.getElementById('auth-login-form').classList.add('active');
        document.getElementById('auth-register-form').classList.remove('active');
    }

    showRegisterForm() {
        document.getElementById('auth-register-form').classList.add('active');
        document.getElementById('auth-login-form').classList.remove('active');
    }

    showAuthLoading(show) {
        document.getElementById('auth-loading').style.display = show ? 'block' : 'none';
    }

    // Update UI based on authentication state
    updateAuthUI() {
        const userDisplay = document.getElementById('user-display');
        const authButton = document.getElementById('auth-button');
        const guestBanner = document.getElementById('guest-banner');

        if (this.isAuthenticated()) {
            // Authenticated user
            if (userDisplay) {
                userDisplay.textContent = this.user.name || this.user.username || this.user.email;
            }
            if (authButton) {
                authButton.textContent = 'Account';
                authButton.className = 'btn btn-outline';
            }
            if (guestBanner) {
                guestBanner.style.display = 'none';
            }
        } else {
            // Guest user
            if (userDisplay) {
                userDisplay.textContent = 'Guest User';
            }
            if (authButton) {
                authButton.textContent = 'Login';
                authButton.className = 'btn';
            }
            if (guestBanner) {
                guestBanner.style.display = 'block';
            }
        }
    }

    // Dispatch authentication events
    dispatchAuthEvent(type, user = null) {
        const event = new CustomEvent('authStateChange', {
            detail: { type, user, isAuthenticated: this.isAuthenticated() }
        });
        document.dispatchEvent(event);
    }

    // API request helper with authentication
    async apiRequest(endpoint, options = {}) {
        const url = `${this.baseUrl}/api${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            // Token expired, logout
            this.logout();
            throw new Error('Authentication expired');
        }

        return response;
    }
}

// Global auth service instance
window.authService = new AuthService();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}