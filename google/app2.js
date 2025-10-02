// app.js - COMPLETE FIXED VERSION WITH ALL FEATURES
class CacheManager {
    constructor() {
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        this.PREFIX = 'smart_evaluator_';
        this.forceRefresh = false;
    }

    set(key, data, customDuration = null) {
        const cacheData = {
            data,
            timestamp: Date.now(),
            expires: Date.now() + (customDuration || this.CACHE_DURATION)
        };
        try {
            localStorage.setItem(this.PREFIX + key, JSON.stringify(cacheData));
        } catch (e) {
            this.clearOldest();
            localStorage.setItem(this.PREFIX + key, JSON.stringify(cacheData));
        }
    }

    get(key) {
        const cached = localStorage.getItem(this.PREFIX + key);
        if (!cached || this.forceRefresh) return null;

        try {
            const cacheData = JSON.parse(cached);
            const { data, expires } = cacheData;
            
            if (Date.now() > expires) {
                this.clear(key);
                return null;
            }
            return data;
        } catch (e) {
            this.clear(key);
            return null;
        }
    }

    clear(key) {
        localStorage.removeItem(this.PREFIX + key);
    }

    clearAll() {
        Object.keys(localStorage)
            .filter(key => key.startsWith(this.PREFIX))
            .forEach(key => localStorage.removeItem(key));
    }

    clearOldest() {
        const keys = Object.keys(localStorage).filter(key => key.startsWith(this.PREFIX));
        if (keys.length > 50) {
            const sorted = keys.map(key => ({
                key,
                timestamp: JSON.parse(localStorage.getItem(key)).timestamp
            })).sort((a, b) => a.timestamp - b.timestamp);
            
            sorted.slice(0, 10).forEach(item => this.clear(item.key));
        }
    }
}

class SmartGroupEvaluator {
    constructor() {
        this.cache = new CacheManager();
        this.currentUser = null;
        this.isPublicMode = true;
        this.currentChart = null;
        this.isInitialized = false;
        
        this.state = {
            groups: [],
            students: [],
            tasks: [],
            evaluations: [],
            admins: [],
            problemStats: {},
            tabSettings: {
                publicTabs: ['dashboard', 'all-students', 'group-policy', 'export', 'student-ranking', 'group-analysis'],
                privateTabs: ['groups', 'members', 'group-members', 'tasks', 'evaluation', 'admin-management']
            }
        };

        this.filters = {
            membersFilterGroupId: "",
            membersSearchTerm: "",
            cardsFilterGroupId: "",
            cardsSearchTerm: "",
            groupMembersFilterGroupId: "",
            analysisFilterGroupIds: [],
            adminSearchTerm: ""
        };

        // Default tab settings
        this.PUBLIC_PAGES = this.state.tabSettings.publicTabs;
        this.PRIVATE_PAGES = this.state.tabSettings.privateTabs;

        this.evaluationOptions = [
            { id: 'cannot_do', text: 'আমি এই টপিক ্এখনো পারিনা', marks: -5 },
            { id: 'learned_cannot_write', text: 'আমি এই টপিক শুধুমাত্র বুঝেছি কিন্তু ভালো করে শেখা হয়নি', marks: 5 },
            { id: 'learned_can_write', text: 'আমি এই টপিক বুঝেছি ও ভালো করে শিখেছি', marks: 10 },
            { id: 'weekly_homework', text: 'আমি বাড়ির কাজ সপ্তাহে প্রতিদিন করেছি', marks: 5 },
            { id: 'weekly_attendance', text: 'আমি সপ্তাহে প্রতিদিন উপস্থিত ছিলাম', marks: 5 }
        ];

        this.roleNames = {
            "team-leader": "টিম লিডার",
            "time-keeper": "টাইম কিপার", 
            "reporter": "রিপোর্টার",
            "resource-manager": "রিসোর্স ম্যানেজার",
            "peace-maker": "পিস মেকার",
        };

        // Enhanced color palette with better contrast and accessibility
        this.groupColors = {
            'গ্রুপ এ': '#E53E3E', // Vibrant Red
            'গ্রুপ বি': '#3182CE', // Strong Blue
            'গ্রুপ সি': '#38A169', // Rich Green
            'গ্রুপ ডি': '#D69E2E', // Golden Yellow
            'গ্রুপ ই': '#805AD5', // Purple
            'গ্রুপ এফ': '#DD6B20', // Orange
            'গ্রুপ জি': '#319795', // Teal
            'গ্রুপ এইচ': '#D53F8C'  // Pink
        };

        // Card background colors with better contrast for text
        this.cardColors = {
            'গ্রুপ এ': { bg: 'linear-gradient(135deg, #FED7D7 0%, #E53E3E 100%)', text: '#1A202C' },
            'গ্রুপ বি': { bg: 'linear-gradient(135deg, #BEE3F8 0%, #3182CE 100%)', text: '#1A202C' },
            'গ্রুপ সি': { bg: 'linear-gradient(135deg, #C6F6D5 0%, #38A169 100%)', text: '#1A202C' },
            'গ্রুপ ডি': { bg: 'linear-gradient(135deg, #FEFCBF 0%, #D69E2E 100%)', text: '#1A202C' },
            'গ্রুপ ই': { bg: 'linear-gradient(135deg, #E9D8FD 0%, #805AD5 100%)', text: '#1A202C' },
            'গ্রুপ এফ': { bg: 'linear-gradient(135deg, #FBD38D 0%, #DD6B20 100%)', text: '#1A202C' },
            'গ্রুপ জি': { bg: 'linear-gradient(135deg, #81E6D9 0%, #319795 100%)', text: '#1A202C' },
            'গ্রুপ এইচ': { bg: 'linear-gradient(135deg, #FBB6CE 0%, #D53F8C 100%)', text: '#1A202C' }
        };

        this.policySections = [
            {
                title: "গ্রুপ সদস্য নিয়মাবলী",
                content: "১. প্রতিটি গ্রুপে সর্বোচ্চ ৫ জন সদস্য থাকবে।\n২. প্রত্যেক সদস্যের একটি নির্দিষ্ট দায়িত্ব থাকবে।\n৩. গ্রুপ লিডার দায়িত্ব পালন নিশ্চিত করবে।\n৪. সকল সদস্যকে সাপ্তাহিক মিটিং এ উপস্থিত থাকতে হবে।\n৫. গ্রুপ কাজ সময়মতো জমা দিতে হবে।"
            },
            {
                title: "মূল্যায়ন পদ্ধতি",
                content: "১. টাস্ক সম্পূর্ণতা - ৪০%\n২. টিমওয়ার্ক - ৩০%\n৩. সময়ানুবর্তিতা - ২০%\n৪. অতিরিক্ত কাজ - ১০%\n৫. উপস্থিতি - বোনাস পয়েন্ট\n৬. বাড়ির কাজ - বোনাস পয়েন্ট"
            },
            {
                title: "স্কোরিং সিস্টেম",
                content: "টাস্ক স্কোর: ০-১০০ পয়েন্ট\nটিমওয়ার্ক: ০-১০ পয়েন্ট\nঅতিরিক্ত পয়েন্ট: বিশেষ কৃতিত্বের জন্য\nনেগেটিভ পয়েন্ট: দায়িত্ব পালনে ব্যর্থতা\nবোনাস পয়েন্ট: অতিরিক্ত কাজের জন্য"
            },
            {
                title: "গ্রুপ লিডারের দায়িত্ব",
                content: "১. গ্রুপ মিটিং পরিচালনা\n২. কাজ বণ্টন করা\n৩. প্রোগ্রেস ট্র্যাক করা\n৪. সমস্যা সমাধান করা\n৫. রিপোর্ট তৈরি করা"
            },
            {
                title: "সদস্যদের দায়িত্ব",
                content: "১. নির্দিষ্ট কাজ সময়মতো করা\n২. গ্রুপ মিটিং এ উপস্থিত থাকা\n৩. অন্যান্য সদস্যদের সহযোগিতা করা\n৪. সমস্যা হলে লিডারকে জানানো\n৫. গ্রুপের উন্নতির জন্য পরামর্শ দেওয়া"
            }
        ];

        this.deleteCallback = null;
        this.editCallback = null;
        this.currentEditingAdmin = null;
        this.currentEvaluation = null;
        this.csvImportData = null;

        // Initialize debouncers
        this.searchDebouncer = this.createDebouncer(300);

        this.init();
    }

    createDebouncer(delay) {
        let timeoutId;
        return (callback) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(callback, delay);
        };
    }

    async init() {
        this.setupDOMReferences();
        await this.initializeFirebase();
        this.setupEventListeners();
        this.setupAuthStateListener();
        this.applySavedTheme();
        await this.loadTabSettings();
        this.isInitialized = true;
    }

    async initializeFirebase() {
        try {
            // Test Firebase connection
            await db.collection('groups').limit(1).get();
            console.log('Firebase connected successfully');
        } catch (error) {
            console.error('Firebase connection failed:', error);
            this.showToast('ডেটাবেস সংযোগ ব্যর্থ', 'error');
        }
    }

    // Load tab settings from Firebase
    async loadTabSettings() {
        try {
            const settingsDoc = await db.collection('settings').doc('tabSettings').get();
            if (settingsDoc.exists) {
                const settings = settingsDoc.data();
                this.state.tabSettings = settings;
                this.PUBLIC_PAGES = settings.publicTabs || this.PUBLIC_PAGES;
                this.PRIVATE_PAGES = settings.privateTabs || this.PRIVATE_PAGES;
                
                // Update navigation visibility after loading settings
                this.updateNavigationVisibility();
            }
        } catch (error) {
            console.error('Error loading tab settings:', error);
        }
    }

    // Save tab settings to Firebase (for super admin)
    async saveTabSettings() {
        if (!this.currentUser) return;
        
        try {
            const userData = await this.getUserAdminData(this.currentUser);
            if (userData.type === 'super-admin') {
                await db.collection('settings').doc('tabSettings').set(this.state.tabSettings);
                this.PUBLIC_PAGES = this.state.tabSettings.publicTabs;
                this.PRIVATE_PAGES = this.state.tabSettings.privateTabs;
                this.updateNavigationVisibility();
                this.showToast('ট্যাব সেটিংস সংরক্ষিত হয়েছে', 'success');
            }
        } catch (error) {
            console.error('Error saving tab settings:', error);
            this.showToast('ট্যাব সেটিংস সংরক্ষণ ব্যর্থ', 'error');
        }
    }

    setupDOMReferences() {
        // Core DOM elements
        this.dom = {
            authModal: document.getElementById("authModal"),
            appContainer: document.getElementById("appContainer"),
            loginForm: document.getElementById("loginForm"),
            registerForm: document.getElementById("registerForm"),
            showRegister: document.getElementById("showRegister"),
            showLogin: document.getElementById("showLogin"),
            loginBtn: document.getElementById("loginBtn"),
            registerBtn: document.getElementById("registerBtn"),
            googleSignInBtn: document.getElementById("googleSignInBtn"),
            logoutBtn: document.getElementById("logoutBtn"),
            themeToggle: document.getElementById("themeToggle"),
            mobileMenuBtn: document.getElementById("mobileMenuBtn"),
            sidebar: document.querySelector(".sidebar"),
            pageTitle: document.getElementById("pageTitle"),
            userInfo: document.getElementById("userInfo"),
            adminManagementSection: document.getElementById("adminManagementSection"),
            pages: document.querySelectorAll(".page"),
            navBtns: document.querySelectorAll(".nav-btn"),
            
            // Modals
            logoutModal: document.getElementById("logoutModal"),
            cancelLogout: document.getElementById("cancelLogout"),
            confirmLogout: document.getElementById("confirmLogout"),
            deleteModal: document.getElementById("deleteModal"),
            cancelDelete: document.getElementById("cancelDelete"),
            confirmDelete: document.getElementById("confirmDelete"),
            editModal: document.getElementById("editModal"),
            cancelEdit: document.getElementById("cancelEdit"),
            saveEdit: document.getElementById("saveEdit"),
            editModalTitle: document.getElementById("editModalTitle"),
            editModalContent: document.getElementById("editModalContent"),
            deleteModalText: document.getElementById("deleteModalText"),
            groupDetailsModal: document.getElementById("groupDetailsModal"),
            groupDetailsTitle: document.getElementById("groupDetailsTitle"),
            groupDetailsContent: document.getElementById("groupDetailsContent"),
            closeGroupDetails: document.getElementById("closeGroupDetails"),
            adminModal: document.getElementById("adminModal"),
            adminModalTitle: document.getElementById("adminModalTitle"),
            adminModalContent: document.getElementById("adminModalContent"),
            tabSettingsModal: document.getElementById("tabSettingsModal"),
            tabSettingsContent: document.getElementById("tabSettingsContent"),
            saveTabSettings: document.getElementById("saveTabSettings"),
            
            // UI Elements
            loadingOverlay: document.getElementById("loadingOverlay"),
            toast: document.getElementById("toast"),
            toastMessage: document.getElementById("toastMessage"),

            // Form elements
            groupNameInput: document.getElementById("groupNameInput"),
            addGroupBtn: document.getElementById("addGroupBtn"),
            groupsList: document.getElementById("groupsList"),
            studentNameInput: document.getElementById("studentNameInput"),
            studentRollInput: document.getElementById("studentRollInput"),
            studentGenderInput: document.getElementById("studentGenderInput"),
            studentGroupInput: document.getElementById("studentGroupInput"),
            studentContactInput: document.getElementById("studentContactInput"),
            studentAcademicGroupInput: document.getElementById("studentAcademicGroupInput"),
            studentSessionInput: document.getElementById("studentSessionInput"),
            studentRoleInput: document.getElementById("studentRoleInput"),
            addStudentBtn: document.getElementById("addStudentBtn"),
            studentsList: document.getElementById("studentsList"),
            allStudentsCards: document.getElementById("allStudentsCards"),
            tasksList: document.getElementById("tasksList"),
            taskNameInput: document.getElementById("taskNameInput"),
            taskDescriptionInput: document.getElementById("taskDescriptionInput"),
            taskMaxScoreInput: document.getElementById("taskMaxScoreInput"),
            taskDateInput: document.getElementById("taskDateInput"),
            addTaskBtn: document.getElementById("addTaskBtn"),
            evaluationTaskSelect: document.getElementById("evaluationTaskSelect"),
            evaluationGroupSelect: document.getElementById("evaluationGroupSelect"),
            startEvaluationBtn: document.getElementById("startEvaluationBtn"),
            evaluationForm: document.getElementById("evaluationForm"),
            csvFileInput: document.getElementById("csvFileInput"),
            importStudentsBtn: document.getElementById("importStudentsBtn"),
            processImportBtn: document.getElementById("processImportBtn"),
            csvFileName: document.getElementById("csvFileName"),
            downloadTemplateBtn: document.getElementById("downloadTemplateBtn"),
            membersFilterGroup: document.getElementById("membersFilterGroup"),
            studentSearchInput: document.getElementById("studentSearchInput"),
            cardsFilterGroup: document.getElementById("cardsFilterGroup"),
            allStudentsSearchInput: document.getElementById("allStudentsSearchInput"),
            refreshRanking: document.getElementById("refreshRanking"),
            studentRankingList: document.getElementById("studentRankingList"),
            groupAnalysisChart: document.getElementById("groupAnalysisChart"),
            policySections: document.getElementById("policySections"),
            exportAllData: document.getElementById("exportAllData"),
            exportStudentsCSV: document.getElementById("exportStudentsCSV"),
            exportGroupsCSV: document.getElementById("exportGroupsCSV"),
            exportEvaluationsCSV: document.getElementById("exportEvaluationsCSV"),
            groupMembersGroupSelect: document.getElementById("groupMembersGroupSelect"),
            groupMembersList: document.getElementById("groupMembersList"),
            downloadCardsImage: document.getElementById("downloadCardsImage"),

            // Admin Management
            adminManagementContent: document.getElementById("adminManagementContent"),
            addAdminBtn: document.getElementById("addAdminBtn"),
            adminSearchInput: document.getElementById("adminSearchInput"),
            adminEmail: document.getElementById("adminEmail"),
            adminPassword: document.getElementById("adminPassword"),
            adminTypeSelect: document.getElementById("adminTypeSelect"),
            permissionsSection: document.getElementById("permissionsSection"),
            permissionRead: document.getElementById("permissionRead"),
            permissionWrite: document.getElementById("permissionWrite"),
            permissionDelete: document.getElementById("permissionDelete"),
            cancelAdmin: document.getElementById("cancelAdmin"),
            saveAdmin: document.getElementById("saveAdmin"),
            manageTabSettings: document.getElementById("manageTabSettings"),

            // Evaluation List
            evaluationListTable: document.getElementById("evaluationListTable"),

            // Group Analysis
            analysisGroupSelect: document.getElementById("analysisGroupSelect"),
            updateAnalysisBtn: document.getElementById("updateAnalysisBtn"),
            groupAnalysisDetails: document.getElementById("groupAnalysisDetails")
        };
    }

    setupEventListeners() {
        // Auth events
        this.addListener(this.dom.showRegister, 'click', () => this.toggleAuthForms());
        this.addListener(this.dom.showLogin, 'click', () => this.toggleAuthForms(false));
        this.addListener(this.dom.loginBtn, 'click', () => this.handleLogin());
        this.addListener(this.dom.registerBtn, 'click', () => this.handleRegister());
        this.addListener(this.dom.googleSignInBtn, 'click', () => this.handleGoogleSignIn());

        // Logout events
        this.addListener(this.dom.logoutBtn, 'click', () => this.showLogoutModal());
        this.addListener(this.dom.cancelLogout, 'click', () => this.hideLogoutModal());
        this.addListener(this.dom.confirmLogout, 'click', () => this.handleLogout());

        // Modal events
        this.addListener(this.dom.cancelDelete, 'click', () => this.hideDeleteModal());
        this.addListener(this.dom.confirmDelete, 'click', () => {
            if (this.deleteCallback) this.deleteCallback();
            this.hideDeleteModal();
        });
        this.addListener(this.dom.cancelEdit, 'click', () => this.hideEditModal());
        this.addListener(this.dom.saveEdit, 'click', () => {
            if (this.editCallback) this.editCallback();
            this.hideEditModal();
        });
        this.addListener(this.dom.closeGroupDetails, 'click', () => this.hideGroupDetailsModal());

        // Admin Management events
        this.addListener(this.dom.addAdminBtn, 'click', () => this.showAdminModal());
        this.addListener(this.dom.cancelAdmin, 'click', () => this.hideAdminModal());
        this.addListener(this.dom.saveAdmin, 'click', () => this.saveAdmin());
        this.addListener(this.dom.adminTypeSelect, 'change', (e) => this.handleAdminTypeChange(e));
        this.addListener(this.dom.manageTabSettings, 'click', () => this.showTabSettingsModal());
        this.addListener(this.dom.saveTabSettings, 'click', () => this.saveTabSettings());

        // Group Analysis events
        this.addListener(this.dom.updateAnalysisBtn, 'click', () => this.updateGroupAnalysis());

        // Theme and mobile menu
        this.addListener(this.dom.themeToggle, 'click', () => this.toggleTheme());
        this.addListener(this.dom.mobileMenuBtn, 'click', () => this.toggleMobileMenu());

        // Navigation
        this.dom.navBtns.forEach(btn => {
            this.addListener(btn, 'click', (e) => this.handleNavigation(e));
        });

        // CRUD Operations
        this.addListener(this.dom.addGroupBtn, 'click', () => this.addGroup());
        this.addListener(this.dom.addStudentBtn, 'click', () => this.addStudent());
        this.addListener(this.dom.addTaskBtn, 'click', () => this.addTask());
        this.addListener(this.dom.startEvaluationBtn, 'click', () => this.startEvaluation());

        // CSV Operations
        this.addListener(this.dom.importStudentsBtn, 'click', () => this.importCSV());
        this.addListener(this.dom.processImportBtn, 'click', () => this.processCSVImport());
        this.addListener(this.dom.csvFileInput, 'change', (e) => this.handleCSVFileSelect(e));
        this.addListener(this.dom.downloadTemplateBtn, 'click', () => this.downloadCSVTemplate());

        // Export Operations
        this.addListener(this.dom.exportAllData, 'click', () => this.exportAllData());
        this.addListener(this.dom.exportStudentsCSV, 'click', () => this.exportStudentsCSV());
        this.addListener(this.dom.exportGroupsCSV, 'click', () => this.exportGroupsCSV());
        this.addListener(this.dom.exportEvaluationsCSV, 'click', () => this.exportEvaluationsCSV());

        // Refresh and Download
        this.addListener(this.dom.refreshRanking, 'click', () => this.refreshRanking());
        this.addListener(this.dom.downloadCardsImage, 'click', () => this.downloadCardsImage());

        // Search and filter events
        this.setupSearchAndFilterEvents();
        this.setupModalCloseHandlers();
    }

    addListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    setupSearchAndFilterEvents() {
        // Search functionality with debouncing
        const searchInputs = [
            { id: 'studentSearchInput', callback: (value) => this.handleStudentSearch(value) },
            { id: 'allStudentsSearchInput', callback: (value) => this.handleAllStudentsSearch(value) },
            { id: 'adminSearchInput', callback: (value) => this.handleAdminSearch(value) }
        ];

        searchInputs.forEach(({id, callback}) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', (e) => {
                    this.searchDebouncer(() => callback(e.target.value));
                });
            }
        });

        // Filter events
        const groupFilters = [
            { id: 'membersFilterGroup', callback: (value) => this.handleMembersFilter(value) },
            { id: 'cardsFilterGroup', callback: (value) => this.handleCardsFilter(value) },
            { id: 'groupMembersGroupSelect', callback: (value) => this.handleGroupMembersFilter(value) }
        ];

        groupFilters.forEach(({id, callback}) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', (e) => callback(e.target.value));
            }
        });
    }

    setupModalCloseHandlers() {
        const modals = [
            this.dom.authModal, this.dom.deleteModal, this.dom.editModal, 
            this.dom.logoutModal, this.dom.groupDetailsModal, this.dom.adminModal,
            this.dom.tabSettingsModal
        ];
        
        modals.forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.hideModal(modal);
                    }
                });
            }
        });
    }

    // ===============================
    // AUTHENTICATION - FIXED AUTO LOGIN/LOGOUT
    // ===============================
    setupAuthStateListener() {
        auth.onAuthStateChanged(async (user) => {
            console.log('Auth State Changed:', user);
            this.currentUser = user;
            
            if (user) {
                console.log('User automatically logged in:', user.email);
                await this.handleAutoLogin(user);
            } else {
                console.log('User automatically logged out');
                await this.handleAutoLogout();
            }
        });
    }

    async handleAutoLogin(user) {
        this.isPublicMode = false;
        
        // Update UI immediately
        this.updateAuthUI(false);
        
        try {
            const userData = await this.getUserAdminData(user);
            this.updateUserInterface(userData);
            
            // Load all data for authenticated user
            await this.loadInitialData();
            
            // Update dashboard with fresh data
            if (document.getElementById('page-dashboard') && !document.getElementById('page-dashboard').classList.contains('hidden')) {
                await this.loadDashboard();
            }
            
            this.showToast(`স্বয়ংক্রিয় লগইন সফল! ${user.email}`, 'success');
            
        } catch (error) {
            console.error("Auto login handling error:", error);
            this.showToast('স্বয়ংক্রিয় লগইন সম্পন্ন কিন্তু ডেটা লোড করতে সমস্যা', 'warning');
        }
    }

    async handleAutoLogout() {
        this.isPublicMode = true;
        this.currentUser = null;
        
        // Update UI immediately
        this.updateAuthUI(true);
        
        // Clear all cached data
        this.cache.clearAll();
        
        // Reset UI state
        this.updateUserInterface(null);
        
        // Load public data
        await this.loadPublicData();
        
        this.showToast('স্বয়ংক্রিয় লগআউট সম্পন্ন', 'info');
    }

    updateAuthUI(showAuthModal) {
        if (showAuthModal) {
            // Show auth modal, hide app
            if (this.dom.authModal) this.dom.authModal.classList.remove('hidden');
            if (this.dom.appContainer) this.dom.appContainer.classList.add('hidden');
        } else {
            // Hide auth modal, show app
            if (this.dom.authModal) this.dom.authModal.classList.add('hidden');
            if (this.dom.appContainer) this.dom.appContainer.classList.remove('hidden');
        }
    }

    async handleLogin() {
        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;
        
        // Enhanced validation
        if (!email || !password) {
            this.showToast("ইমেইল এবং পাসওয়ার্ড প্রয়োজন", "error");
            return;
        }

        if (!this.validateEmail(email)) {
            this.showToast("সঠিক ইমেইল ঠিকানা লিখুন", "error");
            return;
        }

        if (password.length < 6) {
            this.showToast("পাসওয়ার্ড ন্যূনতম ৬ অক্ষর হতে হবে", "error");
            return;
        }

        this.showLoading();
        try {
            await auth.signInWithEmailAndPassword(email, password);
            // Clear form fields on success
            if (document.getElementById("loginEmail")) document.getElementById("loginEmail").value = '';
            if (document.getElementById("loginPassword")) document.getElementById("loginPassword").value = '';
        } catch (error) {
            this.handleAuthError(error, 'login');
        } finally {
            this.hideLoading();
        }
    }

    async handleRegister() {
        const email = document.getElementById("registerEmail")?.value.trim();
        const password = document.getElementById("registerPassword")?.value;
        const adminType = document.getElementById("adminType")?.value;

        if (!this.validateEmail(email)) {
            this.showToast("সঠিক ইমেইল ঠিকানা লিখুন", "error");
            return;
        }

        if (password.length < 6) {
            this.showToast("পাসওয়ার্ড ন্যূনতম ৬ অক্ষর হতে হবে", "error");
            return;
        }

        this.showLoading();
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            await db.collection("admins").doc(user.uid).set({
                email,
                type: adminType,
                permissions: {
                    read: true,
                    write: true,
                    delete: adminType === 'super-admin'
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            this.showToast("রেজিস্ট্রেশন সফল!", "success");
            this.toggleAuthForms(false);
            
            // Clear form fields
            if (document.getElementById("registerEmail")) document.getElementById("registerEmail").value = '';
            if (document.getElementById("registerPassword")) document.getElementById("registerPassword").value = '';
            
        } catch (error) {
            this.handleAuthError(error, 'register');
        } finally {
            this.hideLoading();
        }
    }

    async handleGoogleSignIn() {
        this.showLoading();
        try {
            const result = await auth.signInWithPopup(googleProvider);
            const user = result.user;
            
            const adminDoc = await db.collection("admins").doc(user.uid).get();
            if (!adminDoc.exists) {
                await db.collection("admins").doc(user.uid).set({
                    email: user.email,
                    type: "admin",
                    permissions: {
                        read: true,
                        write: true,
                        delete: false
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            }
            this.showToast('Google লগইন সফল!', 'success');
        } catch (error) {
            this.handleAuthError(error, 'google');
        } finally {
            this.hideLoading();
        }
    }

    handleAuthError(error, type) {
        let errorMessage = "";
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = "এই ইমেইলে কোনো অ্যাকাউন্ট নেই";
                break;
            case 'auth/wrong-password':
                errorMessage = "ভুল পাসওয়ার্ড";
                break;
            case 'auth/invalid-email':
                errorMessage = "অবৈধ ইমেইল ঠিকানা";
                break;
            case 'auth/email-already-in-use':
                errorMessage = "এই ইমেইল ইতিমধ্যে ব্যবহার করা হয়েছে";
                break;
            case 'auth/weak-password':
                errorMessage = "পাসওয়ার্ড খুব দুর্বল";
                break;
            case 'auth/too-many-requests':
                errorMessage = "বহুবার চেষ্টা করা হয়েছে। পরে আবার চেষ্টা করুন";
                break;
            case 'auth/network-request-failed':
                errorMessage = "নেটওয়ার্ক সংযোগ ব্যর্থ";
                break;
            case 'auth/popup-closed-by-user':
                errorMessage = "লগইন পপআপ বন্ধ করা হয়েছে";
                break;
            default:
                errorMessage = `${type === 'login' ? 'লগইন' : type === 'register' ? 'রেজিস্ট্রেশন' : 'Google লগইন'} ব্যর্থ: ${error.message}`;
        }
        
        this.showToast(errorMessage, "error");
    }

    async handleLogout() {
        try {
            await auth.signOut();
            this.hideLogoutModal();
        } catch (error) {
            console.error("Logout error:", error);
            this.showToast("লগআউট করতে সমস্যা: " + error.message, "error");
        }
    }

    async getUserAdminData(user) {
        const cacheKey = `admin_${user.uid}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        try {
            const byUid = await db.collection("admins").doc(user.uid).get();
            if (byUid.exists) {
                const data = byUid.data();
                this.cache.set(cacheKey, data);
                return data;
            }

            const byEmailSnap = await db.collection("admins").where("email", "==", user.email).limit(1).get();
            if (!byEmailSnap.empty) {
                const data = byEmailSnap.docs[0].data();
                this.cache.set(cacheKey, data);
                return data;
            }

            // Return basic user data if not in admin collection
            return {
                email: user.email,
                type: "user",
                permissions: { read: true, write: false, delete: false }
            };
        } catch (error) {
            console.error("Error fetching admin data:", error);
            // Return basic access on error
            return {
                email: user.email,
                type: "user",
                permissions: { read: true, write: false, delete: false }
            };
        }
    }

    // ===============================
    // PUBLIC ACCESS MANAGEMENT
    // ===============================
    async loadPublicData() {
        this.showLoading();
        try {
            await Promise.all([
                this.loadGroups(),
                this.loadStudents(),
                this.loadTasks(),
                this.loadEvaluations()
            ]);
            this.populateSelects();
            this.renderPolicySections();
            
            // Update dashboard if it's active
            if (document.getElementById('page-dashboard') && !document.getElementById('page-dashboard').classList.contains('hidden')) {
                await this.loadDashboard();
            }
            
        } catch (error) {
            console.error("Public data load error:", error);
            this.showToast('পাবলিক ডেটা লোড করতে সমস্যা', 'error');
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // TOAST NOTIFICATIONS
    // ===============================
    showToast(message, type = 'success') {
        const toast = this.dom.toast;
        const toastMessage = this.dom.toastMessage;
        
        if (!toast || !toastMessage) return;

        // Set message and style based on type
        toastMessage.textContent = message;
        
        // Remove existing classes and add new ones
        toast.className = 'toast fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition-all duration-300';
        
        switch(type) {
            case 'success':
                toast.classList.add('bg-green-500', 'text-white');
                break;
            case 'error':
                toast.classList.add('bg-red-500', 'text-white');
                break;
            case 'warning':
                toast.classList.add('bg-yellow-500', 'text-white');
                break;
            case 'info':
                toast.classList.add('bg-blue-500', 'text-white');
                break;
        }

        // Show toast with animation
        toast.classList.remove('hidden', 'opacity-0', 'translate-x-full');
        toast.classList.add('flex', 'opacity-100', 'translate-x-0');

        // Auto hide after 4 seconds
        setTimeout(() => {
            this.hideToast();
        }, 4000);
    }

    hideToast() {
        const toast = this.dom.toast;
        if (toast) {
            toast.classList.add('opacity-0', 'translate-x-full');
            setTimeout(() => {
                toast.classList.add('hidden');
                toast.classList.remove('flex', 'opacity-100', 'translate-x-0');
            }, 300);
        }
    }

    // ===============================
    // MODAL MANAGEMENT
    // ===============================
    showLogoutModal() {
        this.showModal(this.dom.logoutModal);
    }

    hideLogoutModal() {
        this.hideModal(this.dom.logoutModal);
    }

    showDeleteModal(text, callback) {
        if (this.dom.deleteModalText) this.dom.deleteModalText.textContent = text;
        this.deleteCallback = callback;
        this.showModal(this.dom.deleteModal);
    }

    hideDeleteModal() {
        this.hideModal(this.dom.deleteModal);
    }

    showEditModal() {
        this.showModal(this.dom.editModal);
    }

    hideEditModal() {
        this.hideModal(this.dom.editModal);
    }

    showGroupDetailsModal(groupId) {
        const group = this.state.groups.find(g => g.id === groupId);
        if (!group) return;

        this.dom.groupDetailsTitle.textContent = `${group.name} - বিস্তারিত ফলাফল`;
        this.renderGroupDetails(groupId);
        this.showModal(this.dom.groupDetailsModal);
    }

    hideGroupDetailsModal() {
        this.hideModal(this.dom.groupDetailsModal);
    }

    showAdminModal(admin = null) {
        this.dom.adminModalTitle.textContent = admin ? 'অ্যাডমিন সম্পাদনা' : 'নতুন অ্যাডমিন';
        
        if (admin) {
            this.dom.adminEmail.value = admin.email;
            this.dom.adminPassword.value = '';
            this.dom.adminTypeSelect.value = admin.type;
            this.dom.permissionRead.checked = admin.permissions?.read || false;
            this.dom.permissionWrite.checked = admin.permissions?.write || false;
            this.dom.permissionDelete.checked = admin.permissions?.delete || false;
            this.currentEditingAdmin = admin;
        } else {
            this.dom.adminEmail.value = '';
            this.dom.adminPassword.value = '';
            this.dom.adminTypeSelect.value = 'admin';
            this.dom.permissionRead.checked = true;
            this.dom.permissionWrite.checked = true;
            this.dom.permissionDelete.checked = false;
            this.currentEditingAdmin = null;
        }
        
        this.handleAdminTypeChange({ target: this.dom.adminTypeSelect });
        this.showModal(this.dom.adminModal);
    }

    hideAdminModal() {
        this.hideModal(this.dom.adminModal);
        this.currentEditingAdmin = null;
    }

    showTabSettingsModal() {
        this.renderTabSettings();
        this.showModal(this.dom.tabSettingsModal);
    }

    renderTabSettings() {
        if (!this.dom.tabSettingsContent) return;

        const allPages = [...this.PUBLIC_PAGES, ...this.PRIVATE_PAGES];
        const uniquePages = [...new Set(allPages)];

        this.dom.tabSettingsContent.innerHTML = `
            <div class="space-y-4">
                <h3 class="text-lg font-semibold">ট্যাব ভিজিবিলিটি সেটিংস</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <h4 class="font-medium mb-2">পাবলিক ট্যাব (লগইন ছাড়াই দেখা যাবে)</h4>
                        ${uniquePages.map(page => `
                            <div class="flex items-center mb-2">
                                <input type="checkbox" id="public-${page}" 
                                    ${this.state.tabSettings.publicTabs.includes(page) ? 'checked' : ''}
                                    class="mr-2 public-tab-checkbox" data-page="${page}">
                                <label for="public-${page}">${this.getPageDisplayName(page)}</label>
                            </div>
                        `).join('')}
                    </div>
                    <div>
                        <h4 class="font-medium mb-2">প্রাইভেট ট্যাব (শুধু লগইন ইউজার দেখতে পারবে)</h4>
                        ${uniquePages.map(page => `
                            <div class="flex items-center mb-2">
                                <input type="checkbox" id="private-${page}" 
                                    ${this.state.tabSettings.privateTabs.includes(page) ? 'checked' : ''}
                                    class="mr-2 private-tab-checkbox" data-page="${page}">
                                <label for="private-${page}">${this.getPageDisplayName(page)}</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <p class="text-sm text-gray-600">নোট: একটি ট্যাব শুধুমাত্র একটি ক্যাটাগরিতে থাকতে পারে</p>
            </div>
        `;

        // Add event listeners
        document.querySelectorAll('.public-tab-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.handleTabSettingChange(e, 'public'));
        });

        document.querySelectorAll('.private-tab-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.handleTabSettingChange(e, 'private'));
        });
    }

    getPageDisplayName(page) {
        const pageNames = {
            'dashboard': 'ড্যাশবোর্ড',
            'groups': 'গ্রুপসমূহ',
            'members': 'সদস্যরা',
            'group-members': 'গ্রুপ সদস্য',
            'all-students': 'সকল শিক্ষার্থী',
            'student-ranking': 'শিক্ষার্থী র‌্যাঙ্কিং',
            'group-analysis': 'গ্রুপ বিশ্লেষণ',
            'tasks': 'টাস্কসমূহ',
            'evaluation': 'মূল্যায়ন',
            'group-policy': 'গ্রুপ পলিসি',
            'export': 'এক্সপোর্ট',
            'admin-management': 'অ্যাডমিন ব্যবস্থাপনা'
        };
        return pageNames[page] || page;
    }

    handleTabSettingChange(event, type) {
        const page = event.target.dataset.page;
        const isChecked = event.target.checked;

        if (type === 'public') {
            if (isChecked) {
                // Remove from private and add to public
                this.state.tabSettings.privateTabs = this.state.tabSettings.privateTabs.filter(p => p !== page);
                if (!this.state.tabSettings.publicTabs.includes(page)) {
                    this.state.tabSettings.publicTabs.push(page);
                }
            } else {
                this.state.tabSettings.publicTabs = this.state.tabSettings.publicTabs.filter(p => p !== page);
            }
        } else {
            if (isChecked) {
                // Remove from public and add to private
                this.state.tabSettings.publicTabs = this.state.tabSettings.publicTabs.filter(p => p !== page);
                if (!this.state.tabSettings.privateTabs.includes(page)) {
                    this.state.tabSettings.privateTabs.push(page);
                }
            } else {
                this.state.tabSettings.privateTabs = this.state.tabSettings.privateTabs.filter(p => p !== page);
            }
        }

        // Update global arrays
        this.PUBLIC_PAGES = this.state.tabSettings.publicTabs;
        this.PRIVATE_PAGES = this.state.tabSettings.privateTabs;

        // Update UI
        this.updateNavigationVisibility();
    }

    updateNavigationVisibility() {
        this.dom.navBtns.forEach(btn => {
            const pageId = btn.getAttribute("data-page");
            if (this.PUBLIC_PAGES.includes(pageId)) {
                btn.style.display = 'flex';
            } else if (this.PRIVATE_PAGES.includes(pageId) && this.currentUser) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        });
    }

    showModal(modal) {
        if (modal) {
            modal.classList.remove("hidden");
        }
    }

    hideModal(modal) {
        if (modal) {
            modal.classList.add("hidden");
        }
    }

    // ===============================
    // DATA MANAGEMENT
    // ===============================
    async loadInitialData() {
        this.showLoading();
        try {
            await Promise.all([
                this.loadGroups(),
                this.loadStudents(),
                this.loadTasks(),
                this.loadEvaluations(),
                this.loadAdmins()
            ]);
            this.populateSelects();
            this.renderPolicySections();
            this.updateNavigationVisibility();
        } catch (error) {
            console.error("Initial data load error:", error);
            this.showToast("ডেটা লোড করতে সমস্যা", "error");
        } finally {
            this.hideLoading();
        }
    }

    populateSelects() {
        // Populate student group select
        if (this.dom.studentGroupInput) {
            this.dom.studentGroupInput.innerHTML = this.state.groups.map(g => 
                `<option value="${g.id}">${g.name}</option>`
            ).join('');
        }

        // Populate filter selects
        const filterSelects = ['membersFilterGroup', 'cardsFilterGroup', 'evaluationGroupSelect', 'groupMembersGroupSelect'];
        filterSelects.forEach(selectId => {
            const element = document.getElementById(selectId);
            if (element) {
                element.innerHTML = '<option value="">সকল গ্রুপ</option>' + 
                    this.state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            }
        });

        // Populate analysis group select (multiple)
        if (this.dom.analysisGroupSelect) {
            this.dom.analysisGroupSelect.innerHTML = this.state.groups.map(g => 
                `<option value="${g.id}">${g.name}</option>`
            ).join('');
        }

        // Populate evaluation task select
        if (this.dom.evaluationTaskSelect) {
            this.dom.evaluationTaskSelect.innerHTML = this.state.tasks.map(t => 
                `<option value="${t.id}">${t.name}</option>`
            ).join('');
        }
    }

    async loadGroups() {
        try {
            const cacheKey = 'groups_data';
            const cached = this.cache.get(cacheKey);
            
            if (!cached) {
                const snap = await db.collection("groups").orderBy("name").get();
                this.state.groups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.cache.set(cacheKey, this.state.groups);
            } else {
                this.state.groups = cached;
            }
            
            this.renderGroups();
        } catch (error) {
            console.error("Error loading groups:", error);
            const cached = this.cache.get('groups_data');
            if (cached) this.state.groups = cached;
            this.showToast('গ্রুপ লোড করতে সমস্যা', 'error');
        }
    }

    async loadStudents() {
        try {
            const cacheKey = 'students_data';
            const cached = this.cache.get(cacheKey);
            
            if (!cached) {
                const snap = await db.collection("students").orderBy("name").get();
                this.state.students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.cache.set(cacheKey, this.state.students);
            } else {
                this.state.students = cached;
            }
            
            this.renderStudentsList();
            this.renderStudentCards();
        } catch (error) {
            console.error("Error loading students:", error);
            this.showToast('শিক্ষার্থী লোড করতে সমস্যা', 'error');
        }
    }

    async loadTasks() {
        try {
            const cacheKey = 'tasks_data';
            const cached = this.cache.get(cacheKey);
            
            if (!cached) {
                const snap = await db.collection("tasks").orderBy("date", "desc").get();
                this.state.tasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.cache.set(cacheKey, this.state.tasks);
            } else {
                this.state.tasks = cached;
            }
            
            this.renderTasks();
        } catch (error) {
            console.error("Error loading tasks:", error);
            this.showToast('টাস্ক লোড করতে সমস্যা', 'error');
        }
    }

    async loadEvaluations() {
        try {
            const cacheKey = 'evaluations_data';
            const cached = this.cache.get(cacheKey);
            
            if (!cached) {
                const snap = await db.collection("evaluations").get();
                this.state.evaluations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.cache.set(cacheKey, this.state.evaluations);
            } else {
                this.state.evaluations = cached;
            }
            
            this.calculateProblemSolvingStats();
            this.renderEvaluationList();
        } catch (error) {
            console.error("Error loading evaluations:", error);
            this.showToast('মূল্যায়ন লোড করতে সমস্যা', 'error');
        }
    }

    async loadAdmins() {
        if (!this.currentUser) return;
        
        try {
            const userData = await this.getUserAdminData(this.currentUser);
            if (userData && userData.type === 'super-admin') {
                const cacheKey = 'admins_data';
                const cached = this.cache.get(cacheKey);
                
                if (!cached) {
                    const snap = await db.collection("admins").get();
                    this.state.admins = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    this.cache.set(cacheKey, this.state.admins);
                } else {
                    this.state.admins = cached;
                }
                
                this.renderAdminManagement();
            }
        } catch (error) {
            console.error("Error loading admins:", error);
        }
    }

    // ===============================
    // RENDERING METHODS
    // ===============================
    renderGroups() {
        if (!this.dom.groupsList) return;
        
        const memberCountMap = this.computeMemberCountMap();
        
        this.dom.groupsList.innerHTML = this.state.groups.map(group => `
            <div class="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div>
                    <div class="font-medium">${group.name}</div>
                    <div class="text-sm text-gray-500">সদস্য: ${memberCountMap[group.id] || 0} জন</div>
                </div>
                <div class="flex gap-2">
                    ${this.currentUser ? `
                        <button onclick="smartEvaluator.editGroup('${group.id}')" class="edit-group-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                        <button onclick="smartEvaluator.deleteGroup('${group.id}')" class="delete-group-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                    ` : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'}
                </div>
            </div>
        `).join('');
    }

    renderStudentsList() {
        if (!this.dom.studentsList) return;

        const filteredStudents = this.getFilteredStudents();
        
        this.dom.studentsList.innerHTML = filteredStudents.map(student => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            const roleBadge = student.role ? 
                `<span class="member-role-badge ${student.role}">${this.roleNames[student.role] || student.role}</span>` : '';
            return `
                <div class="flex justify-between items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                        <div class="font-medium">${student.name} ${roleBadge}</div>
                        <div class="text-sm text-gray-500">রোল: ${student.roll} | জেন্ডার: ${student.gender} | গ্রুপ: ${group?.name || 'না'}</div>
                        <div class="text-sm text-gray-500">একাডেমিক: ${student.academicGroup || 'না'} | সেশন: ${student.session || 'না'}</div>
                    </div>
                    <div class="flex gap-2">
                        ${this.currentUser ? `
                            <button onclick="smartEvaluator.editStudent('${student.id}')" class="edit-student-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                            <button onclick="smartEvaluator.deleteStudent('${student.id}')" class="delete-student-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                        ` : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderStudentCards() {
        if (!this.dom.allStudentsCards) return;

        const filteredStudents = this.getFilteredStudents('cards');
        
        this.dom.allStudentsCards.innerHTML = filteredStudents.map((student, index) => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            const cardColor = this.cardColors[group?.name] || this.generateCardColor(group?.name);
        //     <div class="student-avatar ${student.gender === 'মেয়ে' ? 'bg-pink-500' : 'bg-blue-500'}">
        //     ${student.name.charAt(0)}
           // </div>
            const roleBadge = student.role ? 
                `<span class="member-role-badge ${student.role}">${this.roleNames[student.role] || student.role}</span>` :
                `<span class="px-2 py-1 text-xs rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">দায়িত্ব বাকি</span>`;

            return `
                <div class="student-card rounded-xl p-4 shadow-md relative overflow-hidden border-l-4" style="${cardColor.bg ? `background: ${cardColor.bg};` : ''} ${cardColor.text ? `color: ${cardColor.text};` : ''} border-color: ${this.groupColors[group?.name] || '#6B7280'}">
                    <span class="serial-number">${index + 1}</span>
                    <div class="flex items-start mb-3">
                       
                        <div class="flex-1">
                            <h3 class="font-bold text-lg">${student.name}</h3>
                            <div class="mt-1">${roleBadge}</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-2 text-sm">
                        <p><i class="fas fa-id-card mr-2"></i> রোল: ${student.roll}</p>
                        <p><i class="fas fa-venus-mars mr-2"></i> জেন্ডার: ${student.gender}</p>
                        <p><i class="fas fa-users mr-2"></i> গ্রুপ: ${group?.name || 'না'}</p>
                        <p><i class="fas fa-book mr-2"></i> একাডেমিক: ${student.academicGroup || 'না'}</p>
                        <p><i class="fas fa-calendar mr-2"></i> সেশন: ${student.session || 'না'}</p>
                        ${student.contact ? `<p><i class="fas fa-envelope mr-2"></i> ${student.contact}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    generateCardColor(groupName) {
        if (!groupName) return { bg: '#6B7280', text: '#FFFFFF' };
        
        // Generate consistent color based on group name
        let hash = 0;
        for (let i = 0; i < groupName.length; i++) {
            hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const colors = [
            { bg: 'linear-gradient(135deg, #FED7D7 0%, #E53E3E 100%)', text: '#1A202C' },
            { bg: 'linear-gradient(135deg, #BEE3F8 0%, #3182CE 100%)', text: '#1A202C' },
            { bg: 'linear-gradient(135deg, #C6F6D5 0%, #38A169 100%)', text: '#1A202C' },
            { bg: 'linear-gradient(135deg, #FEFCBF 0%, #D69E2E 100%)', text: '#1A202C' },
            { bg: 'linear-gradient(135deg, #E9D8FD 0%, #805AD5 100%)', text: '#1A202C' },
            { bg: 'linear-gradient(135deg, #FBD38D 0%, #DD6B20 100%)', text: '#1A202C' },
            { bg: 'linear-gradient(135deg, #81E6D9 0%, #319795 100%)', text: '#1A202C' },
            { bg: 'linear-gradient(135deg, #FBB6CE 0%, #D53F8C 100%)', text: '#1A202C' }
        ];
        
        return colors[Math.abs(hash) % colors.length];
    }

    renderTasks() {
        if (!this.dom.tasksList) return;

        this.dom.tasksList.innerHTML = this.state.tasks.map(task => {
            const dateStr = task.date?.seconds ? 
                new Date(task.date.seconds * 1000).toLocaleDateString("bn-BD") : 
                'তারিখ নেই';
            
            const taskAverage = this.calculateTaskAverage(task.id);
                
            return `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div class="p-4 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold">${task.name}</h3>
                            <div class="flex items-center gap-4 mt-1">
                                <p class="text-sm text-gray-500">তারিখ: ${dateStr}</p>
                                <p class="text-sm text-gray-500">সর্বোচ্চ স্কোর: ${task.maxScore}</p>
                                <div class="flex items-center gap-1">
                                    <span class="text-sm font-medium text-blue-600">গড় স্কোর:</span>
                                    <span class="text-sm font-bold text-blue-800 dark:text-blue-300">${taskAverage.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            ${this.currentUser ? `
                                <button onclick="smartEvaluator.editTask('${task.id}')" class="edit-task-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                                <button onclick="smartEvaluator.deleteTask('${task.id}')" class="delete-task-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                            ` : '<span class="text-sm text-gray-500">লগইন প্রয়োজন</span>'}
                        </div>
                    </div>
                    <div class="p-4">
                        <p class="text-gray-600 dark:text-gray-300">${task.description || 'কোন বিবরণ নেই'}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // FIXED: Calculate task average correctly
    calculateTaskAverage(taskId) {
        const taskEvaluations = this.state.evaluations.filter(e => e.taskId === taskId);
        if (taskEvaluations.length === 0) return 0;
    
        let totalScore = 0;
        let totalStudents = 0;
    
        taskEvaluations.forEach(evaluation => {
            if (evaluation.scores) {
                Object.values(evaluation.scores).forEach(score => {
                    let studentScore = (score.taskScore || 0) + (score.teamworkScore || 0);
                    
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach(opt => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                if (optDef) studentScore += optDef.marks;
                            }
                        });
                    }
                    
                    totalScore += studentScore;
                    totalStudents++;
                });
            }
        });
    
        return totalStudents > 0 ? (totalScore / totalStudents) : 0;
    }

    renderEvaluationList() {
        if (!this.dom.evaluationListTable) return;

        this.dom.evaluationListTable.innerHTML = this.state.evaluations.map(evaluation => {
            const task = this.state.tasks.find(t => t.id === evaluation.taskId);
            const group = this.state.groups.find(g => g.id === evaluation.groupId);
            const totalScore = this.calculateEvaluationTotalScore(evaluation);
            const averageScore = this.calculateEvaluationAverageScore(evaluation);
            const dateStr = evaluation.updatedAt?.seconds ? 
                new Date(evaluation.updatedAt.seconds * 1000).toLocaleDateString("bn-BD") : 
                'তারিখ নেই';

            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td class="border border-gray-300 dark:border-gray-600 p-2">${task?.name || 'Unknown Task'}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2">${group?.name || 'Unknown Group'}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2">${dateStr}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2 font-semibold">${totalScore}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2 font-semibold text-blue-600">${averageScore.toFixed(2)}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2">
                        <div class="flex gap-2">
                            <button onclick="smartEvaluator.editEvaluation('${evaluation.id}')" class="edit-evaluation-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">সম্পাদনা</button>
                            ${this.currentUser?.type === 'super-admin' ? `
                                <button onclick="smartEvaluator.deleteEvaluation('${evaluation.id}')" class="delete-evaluation-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">ডিলিট</button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // FIXED: Calculate evaluation average score correctly
    calculateEvaluationAverageScore(evaluation) {
        if (!evaluation.scores || Object.keys(evaluation.scores).length === 0) return 0;
        
        let total = 0;
        let studentCount = 0;
        
        Object.values(evaluation.scores).forEach(score => {
            let studentTotal = (score.taskScore || 0) + (score.teamworkScore || 0);
            
            // Add option marks
            if (score.optionMarks) {
                Object.values(score.optionMarks).forEach(opt => {
                    if (opt.selected) {
                        const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                        if (optDef) studentTotal += optDef.marks;
                    }
                });
            }
            
            total += studentTotal;
            studentCount++;
        });
        
        return studentCount > 0 ? total / studentCount : 0;
    }
    
    // Evaluation টোটাল স্কোরও সংশোধন প্রয়োজন
    calculateEvaluationTotalScore(evaluation) {
        if (!evaluation.scores) return 0;
        
        let total = 0;
        Object.values(evaluation.scores).forEach(score => {
            let studentTotal = (score.taskScore || 0) + (score.teamworkScore || 0);
            
            if (score.optionMarks) {
                Object.values(score.optionMarks).forEach(opt => {
                    if (opt.selected) {
                        const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                        if (optDef) studentTotal += optDef.marks;
                    }
                });
            }
            
            total += studentTotal;
        });
        
        return total;
    }

    renderPolicySections() {
        if (!this.dom.policySections) return;

        this.dom.policySections.innerHTML = this.policySections.map((section, index) => `
            <div class="policy-section">
                <div class="policy-header" onclick="smartEvaluator.togglePolicySection(${index})">
                    <h4 class="font-semibold">${section.title}</h4>
                    <i class="fas fa-chevron-down transform transition-transform" id="policyIcon-${index}"></i>
                </div>
                <div class="policy-content" id="policyContent-${index}">
                    <div class="whitespace-pre-line">${section.content}</div>
                </div>
            </div>
        `).join('');
    }

    renderAdminManagement() {
        if (!this.dom.adminManagementContent) return;

        const filteredAdmins = this.getFilteredAdmins();
        
        this.dom.adminManagementContent.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead>
                        <tr class="bg-gray-100 dark:bg-gray-700">
                            <th class="border border-gray-300 dark:border-gray-600 p-2">ইমেইল</th>
                            <th class="border border-gray-300 dark:border-gray-600 p-2">টাইপ</th>
                            <th class="border border-gray-300 dark:border-gray-600 p-2">পারমিশন</th>
                            <th class="border border-gray-300 dark:border-gray-600 p-2">কার্যক্রম</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredAdmins.map(admin => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td class="border border-gray-300 dark:border-gray-600 p-2">${admin.email}</td>
                                <td class="border border-gray-300 dark:border-gray-600 p-2">
                                    <span class="px-2 py-1 rounded text-xs ${
                                        admin.type === 'super-admin' 
                                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    }">
                                        ${admin.type === 'super-admin' ? 'সুপার অ্যাডমিন' : 'সাধারণ অ্যাডমিন'}
                                    </span>
                                </td>
                                <td class="border border-gray-300 dark:border-gray-600 p-2">
                                    <div class="flex flex-wrap gap-1">
                                        <span class="px-2 py-1 rounded text-xs ${
                                            admin.permissions?.read 
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                        }">
                                            রিড
                                        </span>
                                        <span class="px-2 py-1 rounded text-xs ${
                                            admin.permissions?.write 
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                        }">
                                            এডিট
                                        </span>
                                        <span class="px-2 py-1 rounded text-xs ${
                                            admin.permissions?.delete 
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                        }">
                                            ডিলিট
                                        </span>
                                    </div>
                                </td>
                                <td class="border border-gray-300 dark:border-gray-600 p-2">
                                    <div class="flex gap-2">
                                        <button onclick="smartEvaluator.showAdminModal(${JSON.stringify(admin).replace(/"/g, '&quot;')})" class="edit-admin-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm">
                                            সম্পাদনা
                                        </button>
                                        ${admin.id !== this.currentUser.uid ? `
                                            <button onclick="smartEvaluator.deleteAdmin('${admin.id}')" class="delete-admin-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">
                                                ডিলিট
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ===============================
    // HELPER METHODS
    // ===============================
    getStudentsInGroup(groupId) {
        return this.state.students.filter(student => student.groupId === groupId);
    }

    computeMemberCountMap() {
        const map = {};
        this.state.groups.forEach(g => { map[g.id] = 0; });
        this.state.students.forEach(s => {
            if (s.groupId) map[s.groupId] = (map[s.groupId] || 0) + 1;
        });
        return map;
    }

    getFilteredStudents(type = 'members') {
        let students = this.state.students;
        
        if (type === 'members') {
            // Apply group filter
            if (this.filters.membersFilterGroupId) {
                students = students.filter(s => s.groupId === this.filters.membersFilterGroupId);
            }
            
            // Apply search filter
            if (this.filters.membersSearchTerm) {
                const term = this.filters.membersSearchTerm.toLowerCase();
                students = students.filter(s => 
                    s.name.toLowerCase().includes(term) ||
                    s.roll.toLowerCase().includes(term) ||
                    (s.academicGroup && s.academicGroup.toLowerCase().includes(term))
                );
            }
        } else if (type === 'cards') {
            // Apply group filter
            if (this.filters.cardsFilterGroupId) {
                students = students.filter(s => s.groupId === this.filters.cardsFilterGroupId);
            }
            
            // Apply search filter
            if (this.filters.cardsSearchTerm) {
                const term = this.filters.cardsSearchTerm.toLowerCase();
                students = students.filter(s => 
                    s.name.toLowerCase().includes(term) ||
                    s.roll.toLowerCase().includes(term) ||
                    (s.academicGroup && s.academicGroup.toLowerCase().includes(term))
                );
            }
        }
        
        return students;
    }

    getFilteredAdmins() {
        let admins = this.state.admins;
        
        if (this.filters.adminSearchTerm) {
            const term = this.filters.adminSearchTerm.toLowerCase();
            admins = admins.filter(admin => 
                admin.email.toLowerCase().includes(term) ||
                admin.type.toLowerCase().includes(term)
            );
        }
        
        return admins;
    }

    // FIXED: Calculate student total score correctly
    calculateStudentTotalScore(studentId) {
        let totalScore = 0;
        
        this.state.evaluations.forEach(evaluation => {
            if (evaluation.scores && evaluation.scores[studentId]) {
                const score = evaluation.scores[studentId];
                let studentScore = (score.taskScore || 0) + (score.teamworkScore || 0);
                
                // Add option marks
                if (score.optionMarks) {
                    Object.values(score.optionMarks).forEach(opt => {
                        if (opt.selected) {
                            const optionDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                            if (optionDef) {
                                studentScore += optionDef.marks;
                            }
                        }
                    });
                }
                totalScore += studentScore;
            }
        });
        
        return totalScore;
    }

    // FIXED: Calculate evaluation total score correctly
    calculateEvaluationTotalScore(evaluation) {
        if (!evaluation.scores) return 0;
        
        let total = 0;
        Object.values(evaluation.scores).forEach(score => {
            let additionalMarks = 0;
            if (score.optionMarks) {
                Object.values(score.optionMarks).forEach(opt => {
                    if (opt.selected) {
                        const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                        if (optDef) additionalMarks += optDef.marks;
                    }
                });
            }
            
            total += (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
        });
        
        return total;
    }

    calculateProblemSolvingStats() {
        const stats = {
            totalProblems: 0,
            cannotDo: 0,
            learnedCannotWrite: 0,
            learnedCanWrite: 0,
            weeklyHomework: 0,
            weeklyAttendance: 0
        };

        this.state.evaluations.forEach(evalItem => {
            if (!evalItem.scores) return;
            Object.values(evalItem.scores).forEach(score => {
                stats.totalProblems++;
                if (score.optionMarks) {
                    Object.values(score.optionMarks).forEach(opt => {
                        if (opt.selected) {
                            switch(opt.optionId) {
                                case 'cannot_do': stats.cannotDo++; break;
                                case 'learned_cannot_write': stats.learnedCannotWrite++; break;
                                case 'learned_can_write': stats.learnedCanWrite++; break;
                                case 'weekly_homework': stats.weeklyHomework++; break;
                                case 'weekly_attendance': stats.weeklyAttendance++; break;
                            }
                        }
                    });
                }
            });
        });

        this.state.problemStats = stats;
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Enhanced duplicate validation
    async validateStudentUniqueness(student, excludeId = null) {
        const errors = [];

        // Check for duplicate roll in same academic group
        const duplicateStudent = this.state.students.find(s => 
            s.id !== excludeId &&
            s.roll === student.roll && 
            s.academicGroup === student.academicGroup
        );

        if (duplicateStudent) {
            errors.push('এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী ইতিমধ্যে আছে');
        }

        // Check for multiple roles in same group
        if (student.role && student.groupId) {
            const existingRole = this.state.students.find(s => 
                s.id !== excludeId &&
                s.groupId === student.groupId && 
                s.role === student.role
            );

            if (existingRole) {
                errors.push('এই গ্রুপে এই দায়িত্ব ইতিমধ্যে অন্য শিক্ষার্থীর আছে');
            }
        }

        // Check for same student in multiple groups
        if (student.groupId && excludeId) {
            const studentInOtherGroups = this.state.students.find(s => 
                s.id === excludeId && 
                s.groupId !== student.groupId
            );

            if (studentInOtherGroups) {
                errors.push('একজন শিক্ষার্থী একাধিক গ্রুপে থাকতে পারবে না');
            }
        }

        return errors;
    }

    // ===============================
    // UI MANAGEMENT
    // ===============================
    async handleNavigation(event) {
        const btn = event.currentTarget;
        const pageId = btn.getAttribute("data-page");

        // Check authentication for private pages
        if (!this.currentUser && this.PRIVATE_PAGES.includes(pageId)) {
            this.showToast("এই পেজ দেখতে লগইন প্রয়োজন", "error");
            return;
        }

        // Check permissions for admin pages
        if (pageId === 'admin-management' && this.currentUser) {
            const userData = await this.getUserAdminData(this.currentUser);
            if (userData.type !== 'super-admin') {
                this.showToast("এই পেজ দেখতে সুপার অ্যাডমিন প্রয়োজন", "error");
                return;
            }
        }

        // Update navigation
        this.dom.navBtns.forEach(navBtn => {
            navBtn.classList.remove("active");
        });
        btn.classList.add("active");

        // Show page
        this.dom.pages.forEach(page => page.classList.add("hidden"));
        const selectedPage = document.getElementById(`page-${pageId}`);
        if (selectedPage) {
            selectedPage.classList.remove("hidden");
            if (this.dom.pageTitle) this.dom.pageTitle.textContent = btn.textContent.trim();

            // Load page-specific data
            switch(pageId) {
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'groups':
                    this.renderGroups();
                    break;
                case 'members':
                    this.renderStudentsList();
                    break;
                case 'group-members':
                    this.renderGroupMembers();
                    break;
                case 'all-students':
                    this.renderStudentCards();
                    break;
                case 'student-ranking':
                    this.renderStudentRanking();
                    break;
                case 'group-analysis':
                    this.renderGroupAnalysis();
                    break;
                case 'tasks':
                    this.renderTasks();
                    break;
                case 'evaluation':
                    this.renderEvaluationList();
                    break;
                case 'group-policy':
                    this.renderPolicySections();
                    break;
                case 'export':
                    // Export page doesn't need additional loading
                    break;
                case 'admin-management':
                    await this.loadAdmins();
                    break;
            }
        }
    }

    updateUserInterface(userData) {
        if (!this.dom.userInfo || !this.dom.logoutBtn) return;

        if (userData && this.currentUser) {
            // User is logged in
            this.dom.userInfo.innerHTML = `
                <div class="font-medium">${userData.email}</div>
                <div class="text-xs ${userData.type === "super-admin" ? "text-purple-600" : "text-gray-500"}">
                    ${userData.type === "super-admin" ? "সুপার অ্যাডমিন" : userData.type === "admin" ? "অ্যাডমিন" : "ব্যবহারকারী"}
                </div>
            `;
            
            // Show logout button
            this.dom.logoutBtn.classList.remove('hidden');
            
            // Add user-logged-in class to body for CSS
            document.body.classList.add('user-logged-in');
            
            // Show admin section if super admin
            if (userData.type === "super-admin") {
                if (this.dom.adminManagementSection) this.dom.adminManagementSection.classList.remove("hidden");
                if (this.dom.manageTabSettings) this.dom.manageTabSettings.classList.remove("hidden");
            } else {
                if (this.dom.adminManagementSection) this.dom.adminManagementSection.classList.add("hidden");
                if (this.dom.manageTabSettings) this.dom.manageTabSettings.classList.add("hidden");
            }
        } else {
            // User is logged out
            this.dom.userInfo.innerHTML = `<div class="text-xs text-gray-500">সাধারণ ব্যবহারকারী</div>`;
            
            // Hide logout button
            this.dom.logoutBtn.classList.add('hidden');
            
            // Remove user-logged-in class
            document.body.classList.remove('user-logged-in');
            
            // Hide admin section
            if (this.dom.adminManagementSection) this.dom.adminManagementSection.classList.add("hidden");
            if (this.dom.manageTabSettings) this.dom.manageTabSettings.classList.add("hidden");
        }

        // Update navigation visibility
        this.updateNavigationVisibility();
    }

    toggleAuthForms(showRegister = true) {
        if (this.dom.loginForm && this.dom.registerForm) {
            if (showRegister) {
                this.dom.loginForm.classList.add('hidden');
                this.dom.registerForm.classList.remove('hidden');
            } else {
                this.dom.loginForm.classList.remove('hidden');
                this.dom.registerForm.classList.add('hidden');
            }
        }
    }

    toggleTheme() {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
    }

    applySavedTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    toggleMobileMenu() {
        if (this.dom.sidebar) {
            this.dom.sidebar.classList.toggle('hidden');
        }
    }

    showLoading(message = "লোড হচ্ছে...") {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.classList.remove("hidden");
            const messageEl = this.dom.loadingOverlay.querySelector('p');
            if (messageEl) messageEl.textContent = message;
        }
    }

    hideLoading() {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.classList.add("hidden");
        }
    }

    togglePolicySection(index) {
        const content = document.getElementById(`policyContent-${index}`);
        const icon = document.getElementById(`policyIcon-${index}`);
        
        if (content.classList.contains('open')) {
            content.classList.remove('open');
            icon.classList.remove('rotate-180');
        } else {
            content.classList.add('open');
            icon.classList.add('rotate-180');
        }
    }

    // ===============================
    // CRUD OPERATIONS
    // ===============================
    async addGroup() {
        const name = this.dom.groupNameInput?.value.trim();
        if (!name) {
            this.showToast("গ্রুপের নাম লিখুন", "error");
            return;
        }

        if (name.length > 50) {
            this.showToast("গ্রুপ নাম ৫০ অক্ষরের মধ্যে হতে হবে", "error");
            return;
        }

        this.showLoading();
        try {
            await db.collection("groups").add({
                name,
                memberCount: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            if (this.dom.groupNameInput) this.dom.groupNameInput.value = "";
            // Clear cache and reload data
            this.cache.clear('groups_data');
            await this.loadGroups();
            this.showToast('গ্রুপ সফলভাবে যোগ করা হয়েছে', 'success');
        } catch (error) {
            this.showToast("গ্রুপ যোগ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    async addStudent() {
        const studentData = this.getStudentFormData();
        if (!studentData) return;

        this.showLoading();
        try {
            // Enhanced validation
            const validationErrors = await this.validateStudentUniqueness(studentData);
            if (validationErrors.length > 0) {
                this.showToast(validationErrors.join(', '), 'error');
                this.hideLoading();
                return;
            }

            await db.collection("students").add({
                ...studentData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            this.clearStudentForm();
            // Clear cache and reload data
            this.cache.clear('students_data');
            await this.loadStudents();
            this.renderGroups();
            this.showToast('শিক্ষার্থী সফলভাবে যোগ করা হয়েছে', 'success');
        } catch (error) {
            this.showToast("শিক্ষার্থী যোগ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    async addTask() {
        const taskData = this.getTaskFormData();
        if (!taskData) return;

        this.showLoading();
        try {
            await db.collection("tasks").add({
                ...taskData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            this.clearTaskForm();
            // Clear cache and reload data
            this.cache.clear('tasks_data');
            await this.loadTasks();
            this.showToast('টাস্ক সফলভাবে যোগ করা হয়েছে', 'success');
        } catch (error) {
            this.showToast("টাস্ক যোগ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // FORM DATA METHODS
    // ===============================
    getStudentFormData() {
        const name = this.dom.studentNameInput?.value.trim();
        const roll = this.dom.studentRollInput?.value.trim();
        const gender = this.dom.studentGenderInput?.value;
        const groupId = this.dom.studentGroupInput?.value;
        const contact = this.dom.studentContactInput?.value.trim();
        const academicGroup = this.dom.studentAcademicGroupInput?.value.trim();
        const session = this.dom.studentSessionInput?.value.trim();
        const role = this.dom.studentRoleInput?.value;

        if (!name || !roll || !gender || !groupId || !academicGroup || !session) {
            this.showToast("সমস্ত প্রয়োজনীয় তথ্য পূরণ করুন", "error");
            return null;
        }

        if (name.length > 100) {
            this.showToast("নাম ১০০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        if (roll.length > 20) {
            this.showToast("রোল ২০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        return {
            name,
            roll,
            gender,
            groupId,
            contact,
            academicGroup,
            session,
            role
        };
    }

    getTaskFormData() {
        const name = this.dom.taskNameInput?.value.trim();
        const description = this.dom.taskDescriptionInput?.value.trim();
        const maxScore = parseInt(this.dom.taskMaxScoreInput?.value);
        const dateStr = this.dom.taskDateInput?.value;

        if (!name || !description || isNaN(maxScore) || !dateStr) {
            this.showToast("সমস্ত তথ্য পূরণ করুন", "error");
            return null;
        }

        if (name.length > 100) {
            this.showToast("টাস্ক নাম ১০০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        if (description.length > 500) {
            this.showToast("বিবরণ ৫০০ অক্ষরের মধ্যে হতে হবে", "error");
            return null;
        }

        if (maxScore < 1 || maxScore > 1000) {
            this.showToast("সর্বোচ্চ স্কোর ১-১০০০ এর মধ্যে হতে হবে", "error");
            return null;
        }

        return { 
            name, 
            description, 
            maxScore, 
            date: new Date(dateStr) 
        };
    }

    clearStudentForm() {
        const fields = [
            'studentNameInput', 'studentRollInput', 'studentContactInput', 
            'studentAcademicGroupInput', 'studentSessionInput'
        ];
        fields.forEach(field => {
            if (this.dom[field]) this.dom[field].value = '';
        });
    }

    clearTaskForm() {
        if (this.dom.taskNameInput) this.dom.taskNameInput.value = '';
        if (this.dom.taskDescriptionInput) this.dom.taskDescriptionInput.value = '';
        if (this.dom.taskMaxScoreInput) this.dom.taskMaxScoreInput.value = '';
        if (this.dom.taskDateInput) this.dom.taskDateInput.value = '';
    }

    // ===============================
    // EDIT OPERATIONS
    // ===============================
    async editStudent(id) {
        const student = this.state.students.find(s => s.id === id);
        if (!student) return;

        this.dom.editModalTitle.textContent = 'শিক্ষার্থী সম্পাদনা';
        this.dom.editModalContent.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-2">নাম</label>
                    <input id="editName" type="text" value="${student.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="100">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">রোল</label>
                    <input id="editRoll" type="text" value="${student.roll}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="20">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">জেন্ডার</label>
                    <select id="editGender" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                        <option value="ছেলে" ${student.gender === 'ছেলে' ? 'selected' : ''}>ছেলে</option>
                        <option value="মেয়ে" ${student.gender === 'মেয়ে' ? 'selected' : ''}>মেয়ে</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">গ্রুপ</label>
                    <select id="editGroup" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                        ${this.state.groups.map(g => `<option value="${g.id}" ${student.groupId === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">যোগাযোগ</label>
                    <input id="editContact" type="text" value="${student.contact || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="100">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">একাডেমিক গ্রুপ</label>
                    <input id="editAcademicGroup" type="text" value="${student.academicGroup || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="50">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">সেশন</label>
                    <input id="editSession" type="text" value="${student.session || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="20">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">দায়িত্ব</label>
                    <select id="editRole" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                        <option value="">কোনোটি না</option>
                        ${Object.entries(this.roleNames).map(([key, value]) => `<option value="${key}" ${student.role === key ? 'selected' : ''}>${value}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;

        this.editCallback = async () => {
            const newData = {
                name: document.getElementById('editName').value.trim(),
                roll: document.getElementById('editRoll').value.trim(),
                gender: document.getElementById('editGender').value,
                groupId: document.getElementById('editGroup').value,
                contact: document.getElementById('editContact').value.trim(),
                academicGroup: document.getElementById('editAcademicGroup').value.trim(),
                session: document.getElementById('editSession').value.trim(),
                role: document.getElementById('editRole').value
            };

            if (!newData.name || !newData.roll || !newData.gender || !newData.groupId || !newData.academicGroup || !newData.session) {
                this.showToast('সমস্ত প্রয়োজনীয় তথ্য পূরণ করুন', 'error');
                return;
            }

            // Enhanced validation for editing
            const validationErrors = await this.validateStudentUniqueness(newData, id);
            if (validationErrors.length > 0) {
                this.showToast(validationErrors.join(', '), 'error');
                return;
            }

            this.showLoading();
            try {
                await db.collection('students').doc(id).update(newData);
                // Clear cache and reload data
                this.cache.clear('students_data');
                await this.loadStudents();
                this.showToast('শিক্ষার্থী সফলভাবে আপডেট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('সম্পাদনা ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        };

        this.showEditModal();
    }

    async editGroup(id) {
        const group = this.state.groups.find(g => g.id === id);
        if (!group) return;

        this.dom.editModalTitle.textContent = 'গ্রুপ সম্পাদনা';
        this.dom.editModalContent.innerHTML = `
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">গ্রুপ নাম</label>
                <input id="editGroupName" type="text" value="${group.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="50">
            </div>
        `;

        this.editCallback = async () => {
            const name = document.getElementById('editGroupName').value.trim();
            if (!name) {
                this.showToast('নাম লিখুন', 'error');
                return;
            }
            this.showLoading();
            try {
                await db.collection('groups').doc(id).update({ name });
                // Clear cache and reload data
                this.cache.clear('groups_data');
                await this.loadGroups();
                this.showToast('গ্রুপ সফলভাবে আপডেট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('সম্পাদনা ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        };

        this.showEditModal();
    }

    async editTask(id) {
        const task = this.state.tasks.find(t => t.id === id);
        if (!task) return;

        const dateStr = task.date?.seconds ? new Date(task.date.seconds * 1000).toISOString().split('T')[0] : '';

        this.dom.editModalTitle.textContent = 'টাস্ক সম্পাদনা';
        this.dom.editModalContent.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-2">টাস্ক নাম</label>
                    <input id="editTaskName" type="text" value="${task.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="100">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">বিবরণ</label>
                    <textarea id="editTaskDescription" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" maxlength="500">${task.description || ''}</textarea>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">সর্বোচ্চ স্কোর</label>
                    <input id="editTaskMaxScore" type="number" value="${task.maxScore}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700" min="1" max="1000">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">তারিখ</label>
                    <input id="editTaskDate" type="date" value="${dateStr}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                </div>
            </div>
        `;

        this.editCallback = async () => {
            const name = document.getElementById('editTaskName').value.trim();
            const description = document.getElementById('editTaskDescription').value.trim();
            const maxScore = parseInt(document.getElementById('editTaskMaxScore').value);
            const dateStr = document.getElementById('editTaskDate').value;

            if (!name || !description || isNaN(maxScore) || !dateStr) {
                this.showToast('সমস্ত তথ্য পূরণ করুন', 'error');
                return;
            }

            const date = new Date(dateStr);

            this.showLoading();
            try {
                await db.collection('tasks').doc(id).update({ name, description, maxScore, date });
                // Clear cache and reload data
                this.cache.clear('tasks_data');
                await this.loadTasks();
                this.showToast('টাস্ক সফলভাবে আপডেট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('সম্পাদনা ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        };

        this.showEditModal();
    }

    async editEvaluation(id) {
        const evaluation = this.state.evaluations.find(e => e.id === id);
        if (!evaluation) return;

        this.dom.editModalTitle.textContent = 'মূল্যায়ন সম্পাদনা';
        
        // Find task and group
        const task = this.state.tasks.find(t => t.id === evaluation.taskId);
        const group = this.state.groups.find(g => g.id === evaluation.groupId);
        
        this.dom.editModalContent.innerHTML = `
            <div class="mb-4">
                <p><strong>টাস্ক:</strong> ${task?.name || 'Unknown'}</p>
                <p><strong>গ্রুপ:</strong> ${group?.name || 'Unknown'}</p>
            </div>
            <p class="text-gray-600 dark:text-gray-400">মূল্যায়ন সম্পাদনা করতে মূল্যায়ন পৃষ্ঠায় যান এবং সংশ্লিষ্ট টাস্ক ও গ্রুপ নির্বাচন করুন।</p>
        `;

        this.editCallback = () => {
            // Navigate to evaluation page with pre-selected values
            this.handleNavigation({ currentTarget: document.querySelector('[data-page="evaluation"]') });
            setTimeout(() => {
                if (this.dom.evaluationTaskSelect) this.dom.evaluationTaskSelect.value = evaluation.taskId;
                if (this.dom.evaluationGroupSelect) this.dom.evaluationGroupSelect.value = evaluation.groupId;
                this.startEvaluation();
            }, 500);
            this.hideEditModal();
        };

        this.showEditModal();
    }

    // ===============================
    // DELETE OPERATIONS
    // ===============================
    async deleteStudent(id) {
        this.showDeleteModal('এই শিক্ষার্থী ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection('students').doc(id).delete();
                // Clear cache and reload data
                this.cache.clear('students_data');
                await this.loadStudents();
                this.showToast('শিক্ষার্থী সফলভাবে ডিলিট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('ডিলিট ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        });
    }

    async deleteGroup(id) {
        this.showDeleteModal('এই গ্রুপ ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection('groups').doc(id).delete();
                // Clear cache and reload data
                this.cache.clear('groups_data');
                await this.loadGroups();
                this.showToast('গ্রুপ সফলভাবে ডিলিট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('ডিলিট ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        });
    }

    async deleteTask(id) {
        this.showDeleteModal('এই টাস্ক ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection('tasks').doc(id).delete();
                // Clear cache and reload data
                this.cache.clear('tasks_data');
                await this.loadTasks();
                this.showToast('টাস্ক সফলভাবে ডিলিট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('ডিলিট ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        });
    }

    async deleteEvaluation(id) {
        this.showDeleteModal('এই মূল্যায়ন ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection('evaluations').doc(id).delete();
                // Clear cache and reload data
                this.cache.clear('evaluations_data');
                await this.loadEvaluations();
                this.showToast('মূল্যায়ন সফলভাবে ডিলিট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('ডিলিট ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        });
    }

    async deleteAdmin(id) {
        this.showDeleteModal('এই অ্যাডমিন ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection("admins").doc(id).delete();
                await this.loadAdmins();
                this.showToast('অ্যাডমিন সফলভাবে ডিলিট করা হয়েছে', 'success');
            } catch (error) {
                this.showToast('ডিলিট ব্যর্থ: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        });
    }

    // ===============================
    // SEARCH AND FILTER HANDLERS
    // ===============================
    handleStudentSearch(value) {
        this.filters.membersSearchTerm = value.toLowerCase();
        this.renderStudentsList();
    }

    handleAllStudentsSearch(value) {
        this.filters.cardsSearchTerm = value.toLowerCase();
        this.renderStudentCards();
    }

    handleMembersFilter(value) {
        this.filters.membersFilterGroupId = value;
        this.renderStudentsList();
    }

    handleCardsFilter(value) {
        this.filters.cardsFilterGroupId = value;
        this.renderStudentCards();
    }

    handleGroupMembersFilter(value) {
        this.filters.groupMembersFilterGroupId = value;
        this.renderGroupMembers();
    }

    handleAdminSearch(value) {
        this.filters.adminSearchTerm = value.toLowerCase();
        this.renderAdminManagement();
    }

    handleAdminTypeChange(e) {
        const isSuperAdmin = e.target.value === 'super-admin';
        if (this.dom.permissionsSection) {
            this.dom.permissionsSection.classList.toggle('hidden', !isSuperAdmin);
        }
    }

    // ===============================
    // DASHBOARD METHODS
    // ===============================
    async loadDashboard() {
        await this.loadEvaluations();
        this.renderStatsSummary();
        this.renderAcademicGroupStats();
        this.renderTaskStats();
        this.renderEvaluationStats();
        this.renderTopGroups();
        this.renderGroupsRanking();
    }

    renderStatsSummary() {
        const statsEl = document.getElementById("statsSummary");
        if (!statsEl) return;

        const totalGroups = this.state.groups.length;
        const totalStudents = this.state.students.length;
        const withoutRole = this.state.students.filter(s => !s.role).length;
        const academicGroups = new Set(this.state.students.map(s => s.academicGroup)).size;

        // Gender counts
        const genderCount = { 'ছেলে': 0, 'মেয়ে': 0 };
        this.state.students.forEach(s => {
            if (s.gender === 'ছেলে') genderCount['ছেলে']++;
            else if (s.gender === 'মেয়ে') genderCount['মেয়ে']++;
        });

        // Task stats
        const totalTasks = this.state.tasks.length;
        const evaluatedTasks = new Set(this.state.evaluations.map(e => e.taskId)).size;
        const pendingTasks = totalTasks - evaluatedTasks;

        const card = (title, value, icon, color) => `
            <div class="glass-card rounded-xl p-4 shadow-md flex items-center gap-3 card-hover">
                <div class="p-3 rounded-lg ${color} text-white"><i class="${icon}"></i></div>
                <div>
                    <div class="text-xs text-gray-500 dark:text-gray-300">${title}</div>
                    <div class="text-2xl font-bold">${value}</div>
                </div>
            </div>
        `;

        statsEl.innerHTML = [
            card("মোট গ্রুপ", totalGroups, "fas fa-layer-group", "bg-blue-500"),
            card("মোট শিক্ষার্থী", totalStudents, "fas fa-user-graduate", "bg-green-500"),
            card("একাডেমিক গ্রুপ", academicGroups, "fas fa-book", "bg-purple-500"),
            card("দায়িত্ব বাকি", withoutRole, "fas fa-hourglass-half", "bg-amber-500"),
            card("ছেলে", genderCount['ছেলে'], "fas fa-male", "bg-blue-400"),
            card("মেয়ে", genderCount['মেয়ে'], "fas fa-female", "bg-pink-400"),
            card("মোট টাস্ক", totalTasks, "fas fa-tasks", "bg-indigo-500"),
            card("বাকি মূল্যায়ন", pendingTasks, "fas fa-clipboard-list", "bg-red-500")
        ].join("");
    }

    renderTaskStats() {
        const container = document.getElementById("taskStats");
        if (!container) return;

        const totalTasks = this.state.tasks.length;
        const evaluatedTasks = new Set(this.state.evaluations.map(e => e.taskId)).size;
        const pendingTasks = totalTasks - evaluatedTasks;

        container.innerHTML = `
            <div class="flex justify-between items-center">
                <span>মোট টাস্ক:</span>
                <span class="font-semibold">${totalTasks}</span>
            </div>
            <div class="flex justify-between items-center">
                <span>মূল্যায়ন completed:</span>
                <span class="font-semibold text-green-600">${evaluatedTasks}</span>
            </div>
            <div class="flex justify-between items-center">
                <span>বাকি মূল্যায়ন:</span>
                <span class="font-semibold text-red-600">${pendingTasks}</span>
            </div>
            <div class="progress-bar mt-2">
                <div class="progress-fill bg-green-500" style="width:${totalTasks ? (evaluatedTasks / totalTasks) * 100 : 0}%"></div>
            </div>
        `;
    }

    renderEvaluationStats() {
        const container = document.getElementById("evaluationStats");
        if (!container) return;

        const totalEvaluations = this.state.evaluations.length;
        const totalScore = this.state.evaluations.reduce((sum, evalItem) => {
            if (!evalItem.scores) return sum;
            return sum + Object.values(evalItem.scores).reduce((scoreSum, score) => {
                return scoreSum + (score.taskScore || 0) + (score.teamworkScore || 0);
            }, 0);
        }, 0);

        const avgScore = totalEvaluations > 0 ? (totalScore / totalEvaluations).toFixed(2) : 0;

        container.innerHTML = `
            <div class="flex justify-between items-center">
                <span>মোট মূল্যায়ন:</span>
                <span class="font-semibold">${totalEvaluations}</span>
            </div>
            <div class="flex justify-between items-center">
                <span>গড় স্কোর:</span>
                <span class="font-semibold text-blue-600">${avgScore}</span>
            </div>
            <div class="flex justify-between items-center">
                <span>শেষ আপডেট:</span>
                <span class="text-sm text-gray-500">${new Date().toLocaleDateString('bn-BD')}</span>
            </div>
        `;
    }

    renderAcademicGroupStats() {
        const container = document.getElementById("academicGroupStatsList");
        if (!container) return;

        const academicCounts = {};
        this.state.students.forEach(s => {
            const ag = s.academicGroup || 'অজানা';
            academicCounts[ag] = (academicCounts[ag] || 0) + 1;
        });

        const total = this.state.students.length;
        container.innerHTML = Object.entries(academicCounts).map(([group, count]) => {
            const percent = total > 0 ? Math.round((count / total) * 100) : 0;
            return `
                <div class="glass-card rounded-lg p-4 card-hover">
                    <div class="flex justify-between mb-1">
                        <div class="font-medium">${group}</div>
                        <div class="text-sm text-gray-500">${count} (${percent}%)</div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill bg-purple-500" style="width:${percent}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderTopGroups() {
        const container = document.getElementById("topGroupsContainer");
        if (!container) return;

        const scores = this.calculateGroupScores();
        const sortedGroups = [...this.state.groups].sort((a, b) => scores[b.id].score - scores[a.id].score).slice(0, 3);

        container.innerHTML = sortedGroups.map((group, index) => {
            const rank = index + 1;
            return `
                <div class="rank-card rank-${rank}-card card-hover" onclick="smartEvaluator.showGroupDetailsModal('${group.id}')" style="cursor: pointer;">
                    <div class="rank-title rank-${rank}-title">Rank ${rank}</div>
                    <h3 class="font-bold text-lg">${group.name}</h3>
                    <p class="text-xl font-semibold">স্কোর: ${scores[group.id].score.toFixed(2)}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">সদস্য: ${scores[group.id].members} জন</p>
                </div>
            `;
        }).join('');
    }

    renderGroupsRanking() {
        const container = document.getElementById("groupsRankingList");
        if (!container) return;

        const scores = this.calculateGroupScores();
        const sortedGroups = [...this.state.groups].sort((a, b) => scores[b.id].score - scores[a.id].score);

        container.innerHTML = sortedGroups.map((group, index) => {
            const rankClass = index < 3 ? `rank-${index + 1}` : 'rank-other';
            return `
                <div class="group-bar flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg card-hover" 
                     onclick="smartEvaluator.showGroupDetailsModal('${group.id}')" style="cursor: pointer;">
                    <span class="rank-badge ${rankClass} mr-3">${index + 1}</span>
                    <div class="flex-1">
                        <h4 class="font-medium">${group.name}</h4>
                        <p class="text-sm text-gray-500">স্কোর: ${scores[group.id].score.toFixed(2)} | সদস্য: ${scores[group.id].members} জন</p>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </div>
            `;
        }).join('');
    }

    // FIXED: Calculate group scores correctly
    calculateGroupScores() {
        const groupScores = {};
        
        // Initialize groups
        this.state.groups.forEach(g => {
            groupScores[g.id] = {
                totalScore: 0,
                totalStudents: 0,
                averageScore: 0,
                name: g.name
            };
        });
    
        // Calculate scores for each student in their group
        this.state.students.forEach(student => {
            if (student.groupId && groupScores[student.groupId]) {
                const studentScore = this.calculateStudentTotalScore(student.id);
                const studentEvaluationCount = this.getStudentEvaluationCount(student.id);
                
                if (studentEvaluationCount > 0) {
                    const studentAverage = studentScore / studentEvaluationCount;
                    groupScores[student.groupId].totalScore += studentAverage;
                    groupScores[student.groupId].totalStudents++;
                }
            }
        });
    
        // Calculate final averages
        Object.keys(groupScores).forEach(groupId => {
            if (groupScores[groupId].totalStudents > 0) {
                groupScores[groupId].averageScore = groupScores[groupId].totalScore / groupScores[groupId].totalStudents;
            } else {
                groupScores[groupId].averageScore = 0;
            }
        });
    
        return groupScores;
    }
    
    // নতুন হেল্পার মেথড
    getStudentEvaluationCount(studentId) {
        let count = 0;
        this.state.evaluations.forEach(evaluation => {
            if (evaluation.scores && evaluation.scores[studentId]) {
                count++;
            }
        });
        return count;
    }
    // ===============================
    // STUDENT RANKING
    // ===============================
    calculateStudentRankings() {
        const studentScores = {};
        
        // Initialize all students
        this.state.students.forEach(student => {
            studentScores[student.id] = {
                student,
                totalScore: 0,
                evaluationCount: 0,
                averageScore: 0
            };
        });
    
        // Calculate scores from evaluations
        this.state.evaluations.forEach(evalItem => {
            if (!evalItem.scores) return;
            
            Object.entries(evalItem.scores).forEach(([studentId, score]) => {
                if (studentScores[studentId]) {
                    let studentScore = (score.taskScore || 0) + (score.teamworkScore || 0);
                    
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach(opt => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                if (optDef) studentScore += optDef.marks;
                            }
                        });
                    }
                    
                    studentScores[studentId].totalScore += studentScore;
                    studentScores[studentId].evaluationCount++;
                }
            });
        });
    
        // Calculate averages
        Object.values(studentScores).forEach(scoreData => {
            if (scoreData.evaluationCount > 0) {
                scoreData.averageScore = scoreData.totalScore / scoreData.evaluationCount;
            }
        });
    
        return Object.values(studentScores)
            .filter(scoreData => scoreData.evaluationCount > 0) // শুধু মূল্যায়ন করা স্টুডেন্ট
            .sort((a, b) => b.averageScore - a.averageScore);
    }

    renderStudentRanking() {
        if (!this.dom.studentRankingList) return;

        const rankings = this.calculateStudentRankings();
        
        if (rankings.length === 0) {
            this.dom.studentRankingList.innerHTML = '<p class="text-center text-gray-500 py-8">কোন র‌্যাঙ্কিং ডেটা পাওয়া যায়নি</p>';
            return;
        }

        this.dom.studentRankingList.innerHTML = rankings.map((rankData, index) => {
            const student = rankData.student;
            const group = this.state.groups.find(g => g.id === student.groupId);
            const roleBadge = student.role ? 
                `<span class="member-role-badge ${student.role}">${this.roleNames[student.role]}</span>` : '';

            return `
                <div class="student-rank-item bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-4">
                            <span class="rank-badge ${index < 3 ? `rank-${index + 1}` : 'rank-other'}">${index + 1}</span>
                            <div>
                                <h4 class="font-semibold">${student.name} ${roleBadge}</h4>
                                <p class="text-sm text-gray-500">
                                    ${group?.name || 'No Group'} | ${student.academicGroup || 'No Academic Group'} | ${student.roll}
                                </p>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-lg font-bold text-blue-600">${rankData.averageScore.toFixed(2)}</div>
                            <div class="text-sm text-gray-500">${rankData.evaluationCount} মূল্যায়ন</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    refreshRanking() {
        this.cache.forceRefresh = true;
        this.loadDashboard();
        this.showToast('র‌্যাঙ্কিং রিফ্রেশ করা হয়েছে', 'success');
        setTimeout(() => {
            this.cache.forceRefresh = false;
        }, 1000);
    }

    // ===============================
    // GROUP ANALYSIS
    // ===============================
    updateGroupAnalysis() {
        const selectedOptions = Array.from(this.dom.analysisGroupSelect.selectedOptions);
        this.filters.analysisFilterGroupIds = selectedOptions.map(option => option.value);
        this.renderGroupAnalysis();
    }

    renderGroupAnalysis() {
        if (!this.dom.groupAnalysisChart) return;

        // Ensure it's a canvas element
        if (this.dom.groupAnalysisChart.tagName !== 'CANVAS') {
            console.error('groupAnalysisChart is not a canvas element');
            return;
        }

        const scores = this.calculateGroupScores();
        let groupsToShow = this.state.groups;
        
        // Apply filter if groups are selected
        if (this.filters.analysisFilterGroupIds.length > 0) {
            groupsToShow = groupsToShow.filter(g => this.filters.analysisFilterGroupIds.includes(g.id));
        }
        
        const sortedGroups = [...groupsToShow].sort((a, b) => scores[b.id].score - scores[a.id].score);

        const ctx = this.dom.groupAnalysisChart.getContext('2d');
        
        // Destroy previous chart if exists
        if (this.currentChart) {
            this.currentChart.destroy();
        }

        this.currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedGroups.map(g => g.name),
                datasets: [{
                    label: 'গ্রুপ স্কোর',
                    data: sortedGroups.map(g => scores[g.id].score),
                    backgroundColor: sortedGroups.map((g, index) => 
                        index < 3 ? 
                        ['#FFD700', '#C0C0C0', '#CD7F32'][index] : 
                        '#3B82F6'
                    ),
                    borderColor: sortedGroups.map((g, index) => 
                        index < 3 ? 
                        ['#FFA500', '#A0A0A0', '#A56A3A'][index] : 
                        '#2563EB'
                    ),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'গ্রুপ ভিত্তিক স্কোর বিশ্লেষণ'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `স্কোর: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'স্কোর'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'গ্রুপ'
                        }
                    }
                },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const groupId = sortedGroups[index].id;
                        this.showGroupDetailsModal(groupId);
                    }
                }
            }
        });

        // Render analysis details
        this.renderGroupAnalysisDetails(sortedGroups, scores);
    }

    renderGroupAnalysisDetails(sortedGroups, scores) {
        if (!this.dom.groupAnalysisDetails) return;

        this.dom.groupAnalysisDetails.innerHTML = sortedGroups.map(group => {
            const groupStudents = this.state.students.filter(s => s.groupId === group.id);
            const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
            
            return `
                <div class="analysis-stat bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h4 class="font-semibold mb-2">${group.name}</h4>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div>সদস্য সংখ্যা:</div>
                        <div class="font-medium">${groupStudents.length} জন</div>
                        
                        <div>গড় স্কোর:</div>
                        <div class="font-medium text-blue-600">${scores[group.id].score.toFixed(2)}</div>
                        
                        <div>মোট মূল্যায়ন:</div>
                        <div class="font-medium">${groupEvaluations.length} টি</div>
                        
                        <div>শেষ আপডেট:</div>
                        <div class="text-xs text-gray-500">${new Date().toLocaleDateString('bn-BD')}</div>
                    </div>
                    <button onclick="smartEvaluator.showGroupDetailsModal('${group.id}')" 
                            class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-lg text-sm transition-colors">
                        বিস্তারিত দেখুন
                    </button>
                </div>
            `;
        }).join('');
    }

    // ===============================
    // GROUP MEMBERS MANAGEMENT
    // ===============================
    renderGroupMembers() {
        if (!this.dom.groupMembersList) return;

        const groupId = this.filters.groupMembersFilterGroupId || '';
        let students = this.state.students;
        
        if (groupId) {
            students = students.filter(s => s.groupId === groupId);
        }

        this.dom.groupMembersList.innerHTML = students.map(student => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            return `
                <div class="flex justify-between items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div class="flex-1">
                        <div class="font-medium">${student.name}</div>
                        <div class="text-sm text-gray-500">
                            রোল: ${student.roll} | গ্রুপ: ${group?.name || 'না'} | 
                            একাডেমিক: ${student.academicGroup || 'না'}
                        </div>
                    </div>
                    <div class="flex gap-2 items-center">
                        <select class="role-select border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700" 
                                data-student="${student.id}" ${!this.currentUser ? 'disabled' : ''}>
                            <option value="">দায়িত্ব নির্বাচন</option>
                            ${Object.entries(this.roleNames).map(([key, value]) => 
                                `<option value="${key}" ${student.role === key ? 'selected' : ''}>${value}</option>`
                            ).join('')}
                        </select>
                        ${this.currentUser ? `
                            <button onclick="smartEvaluator.updateStudentRole('${student.id}', this.previousElementSibling.value)" class="update-role-btn px-3 py-2 bg-green-600 text-white rounded-lg text-sm">
                                আপডেট
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners for role changes
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', function() {
                const studentId = this.getAttribute('data-student');
                const newRole = this.value;
                // The update button will handle the click
            });
        });
    }

    async updateStudentRole(studentId, newRole) {
        this.showLoading();
        try {
            // Validate role assignment
            const student = this.state.students.find(s => s.id === studentId);
            if (student && newRole) {
                const existingRole = this.state.students.find(s => 
                    s.id !== studentId &&
                    s.groupId === student.groupId && 
                    s.role === newRole
                );

                if (existingRole) {
                    this.showToast('এই গ্রুপে এই দায়িত্ব ইতিমধ্যে অন্য শিক্ষার্থীর আছে', 'error');
                    return;
                }
            }

            await db.collection('students').doc(studentId).update({
                role: newRole
            });
            // Clear cache and reload data
            this.cache.clear('students_data');
            await this.loadStudents();
            this.showToast('দায়িত্ব সফলভাবে আপডেট করা হয়েছে', 'success');
        } catch (error) {
            this.showToast('দায়িত্ব আপডেট করতে সমস্যা: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // EVALUATION SYSTEM
    // ===============================
    async startEvaluation() {
        const taskId = this.dom.evaluationTaskSelect?.value;
        const groupId = this.dom.evaluationGroupSelect?.value;
        
        if (!taskId || !groupId) {
            this.showToast("একটি টাস্ক এবং গ্রুপ নির্বাচন করুন", "error");
            return;
        }

        // Find existing evaluation
        let existingEvaluation = null;
        try {
            const evalQuery = await db.collection("evaluations")
                .where("taskId", "==", taskId)
                .where("groupId", "==", groupId)
                .get();
                
            if (!evalQuery.empty) {
                existingEvaluation = {
                    id: evalQuery.docs[0].id,
                    ...evalQuery.docs[0].data()
                };
            }
        } catch (error) {
            console.error("Error checking existing evaluation:", error);
        }

        this.renderEvaluationForm(taskId, groupId, existingEvaluation);
    }

    renderEvaluationForm(taskId, groupId, existingEvaluation = null) {
        if (!this.dom.evaluationForm) return;

        const task = this.state.tasks.find(t => t.id === taskId);
        const group = this.state.groups.find(g => g.id === groupId);
        const groupStudents = this.state.students.filter(s => s.groupId === groupId);

        if (!task || !group || groupStudents.length === 0) {
            this.dom.evaluationForm.innerHTML = '<p class="text-center text-gray-500 py-8">গ্রুপে কোন সদস্য নেই</p>';
            return;
        }

        let formHTML = `
            <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-4">
                <p class="text-sm"><strong>টাস্ক:</strong> ${task.name}</p>
                <p class="text-sm"><strong>সর্বোচ্চ স্কোর:</strong> ${task.maxScore}</p>
                <p class="text-sm"><strong>গ্রুপ:</strong> ${group.name}</p>
                ${existingEvaluation ? '<p class="text-sm text-green-600"><strong>মূল্যায়ন বিদ্যমান - সম্পাদনা করুন</strong></p>' : ''}
            </div>
        `;

        groupStudents.forEach((student) => {
            const existingScore = existingEvaluation?.scores?.[student.id] || {};
            
            formHTML += `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
                    <h4 class="font-semibold mb-3">${student.name} (${student.roll}) ${student.role ? `- ${this.roleNames[student.role]}` : ''}</h4>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">টাস্ক স্কোর (০-${task.maxScore})</label>
                            <input type="number" min="0" max="${task.maxScore}" 
                                class="task-score w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700" 
                                value="${existingScore.taskScore || 0}" 
                                data-student="${student.id}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">টিমওয়ার্ক স্কোর (০-১০)</label>
                            <input type="number" min="0" max="10" 
                                class="teamwork-score w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700" 
                                value="${existingScore.teamworkScore || 0}" 
                                data-student="${student.id}">
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="block text-sm font-medium mb-2">মন্তব্য</label>
                        <textarea class="comments w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700" 
                            rows="2" 
                            data-student="${student.id}" 
                            placeholder="মন্তব্য লিখুন...">${existingScore.comments || ''}</textarea>
                    </div>

                    <div class="mb-3">
                        <label class="block text-sm font-medium mb-2">অপশনস</label>
                        ${this.evaluationOptions.map(opt => `
                            <div class="flex items-center mb-1">
                                <input type="checkbox" id="${opt.id}-${student.id}" class="option-checkbox" data-student="${student.id}" data-option="${opt.id}" ${existingScore.optionMarks?.[opt.id]?.selected ? 'checked' : ''}>
                                <label for="${opt.id}-${student.id}" class="ml-2 text-sm">${opt.text} (${opt.marks > 0 ? '+' : ''}${opt.marks})</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        formHTML += `
            <div class="mt-4 flex gap-2">
                <button onclick="smartEvaluator.saveEvaluation('${taskId}', '${groupId}', '${existingEvaluation ? existingEvaluation.id : ''}')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                    ${existingEvaluation ? 'মূল্যায়ন আপডেট করুন' : 'মূল্যায়ন সংরক্ষণ করুন'}
                </button>
                ${existingEvaluation && this.currentUser?.type === 'super-admin' ? `
                    <button onclick="smartEvaluator.deleteEvaluation('${existingEvaluation.id}')" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors">
                        মূল্যায়ন ডিলিট করুন
                    </button>
                ` : ''}
            </div>
        `;

        this.dom.evaluationForm.innerHTML = formHTML;
    }

    async saveEvaluation(taskId, groupId, evaluationId = null) {
        const taskScores = document.querySelectorAll(".task-score");
        const teamworkScores = document.querySelectorAll(".teamwork-score");
        const comments = document.querySelectorAll(".comments");
        const optionCheckboxes = document.querySelectorAll('.option-checkbox');
        
        const scores = {};

        taskScores.forEach((input, index) => {
            const studentId = input.getAttribute("data-student");
            const taskScore = parseInt(input.value) || 0;
            const teamworkScore = parseInt(teamworkScores[index].value) || 0;
            const comment = comments[index].value || "";

            const optionMarks = {};
            optionCheckboxes.forEach(cb => {
                if (cb.dataset.student === studentId) {
                    const optId = cb.dataset.option;
                    optionMarks[optId] = { selected: cb.checked, optionId: optId };
                }
            });

            scores[studentId] = { 
                taskScore, 
                teamworkScore, 
                comments: comment,
                optionMarks
            };
        });

        this.showLoading();

        const payload = {
            taskId, 
            groupId, 
            scores,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        try {
            if (evaluationId) {
                await db.collection("evaluations").doc(evaluationId).update(payload);
                this.showToast('মূল্যায়ন সফলভাবে আপডেট করা হয়েছে', 'success');
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("evaluations").add(payload);
                this.showToast('মূল্যায়ন সফলভাবে সংরক্ষণ করা হয়েছে', 'success');
            }
            
            // Clear cache and reload data
            this.cache.clear('evaluations_data');
            await this.loadEvaluations();
            this.renderEvaluationList();
        } catch (error) {
            this.showToast("মূল্যায়ন সংরক্ষণ করতে সমস্যা: " + error.message, "error");
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // GROUP DETAILS MODAL
    // ===============================
    renderGroupDetails(groupId) {
        if (!this.dom.groupDetailsContent) return;

        const group = this.state.groups.find(g => g.id === groupId);
        const groupStudents = this.state.students.filter(s => s.groupId === groupId);
        const groupEvaluations = this.state.evaluations.filter(e => e.groupId === groupId);
        
        // Calculate group statistics
        const groupStats = this.calculateGroupStatistics(groupId);
        
        this.dom.groupDetailsContent.innerHTML = `
            <div class="mb-4">
                <h3 class="font-semibold">গ্রুপ পরিসংখ্যান</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                        <div class="text-sm text-blue-600">সদস্য</div>
                        <div class="text-lg font-bold">${groupStudents.length}</div>
                    </div>
                    <div class="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                        <div class="text-sm text-green-600">মোট মূল্যায়ন</div>
                        <div class="text-lg font-bold">${groupEvaluations.length}</div>
                    </div>
                    <div class="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                        <div class="text-sm text-purple-600">গড় স্কোর</div>
                        <div class="text-lg font-bold">${groupStats.averageScore.toFixed(2)}</div>
                    </div>
                    <div class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                        <div class="text-sm text-amber-600">সর্বোচ্চ স্কোর</div>
                        <div class="text-lg font-bold">${groupStats.maxScore.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div class="mb-4">
                <h3 class="font-semibold">সদস্য তালিকা</h3>
                <div class="mt-2 space-y-2">
                    ${groupStudents.map(student => {
                        const studentStats = this.calculateStudentStatistics(student.id);
                        return `
                            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                                <div class="flex justify-between items-center">
                                    <div>
                                        <div class="font-medium">${student.name} (${student.roll})</div>
                                        <div class="text-sm text-gray-500">
                                            ${student.role ? this.roleNames[student.role] : 'দায়িত্ব নেই'} | 
                                            গড় স্কোর: ${studentStats.averageScore.toFixed(2)}
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-sm font-semibold">${studentStats.totalScore}</div>
                                        <div class="text-xs text-gray-500">${studentStats.evaluationCount} মূল্যায়ন</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <div>
                <h3 class="font-semibold">টাস্ক ভিত্তিক পারফরমেন্স</h3>
                <div class="mt-2 space-y-2">
                    ${groupStats.taskPerformance.map(task => `
                        <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="font-medium">${task.taskName}</div>
                                    <div class="text-sm text-gray-500">গড় স্কোর: ${task.averageScore.toFixed(2)}</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-sm font-semibold">${task.completionRate}%</div>
                                    <div class="text-xs text-gray-500">সম্পূর্ণতা</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    calculateGroupStatistics(groupId) {
        const groupStudents = this.state.students.filter(s => s.groupId === groupId);
        const groupEvaluations = this.state.evaluations.filter(e => e.groupId === groupId);
        
        let totalScore = 0;
        let maxScore = 0;
        let totalEvaluations = 0;
        
        const taskPerformance = [];
        
        groupStudents.forEach(student => {
            const studentStats = this.calculateStudentStatistics(student.id);
            totalScore += studentStats.totalScore;
            totalEvaluations += studentStats.evaluationCount;
            maxScore = Math.max(maxScore, studentStats.averageScore);
        });
        
        // Calculate task-wise performance
        this.state.tasks.forEach(task => {
            const taskEvals = groupEvaluations.filter(e => e.taskId === task.id);
            if (taskEvals.length > 0) {
                let taskTotal = 0;
                let taskCount = 0;
                
                taskEvals.forEach(evalItem => {
                    if (evalItem.scores) {
                        Object.values(evalItem.scores).forEach(score => {
                            taskTotal += (score.taskScore || 0) + (score.teamworkScore || 0);
                            taskCount++;
                        });
                    }
                });
                
                taskPerformance.push({
                    taskName: task.name,
                    averageScore: taskCount > 0 ? taskTotal / taskCount : 0,
                    completionRate: Math.round((taskEvals.length / groupStudents.length) * 100)
                });
            }
        });
        
        return {
            averageScore: totalEvaluations > 0 ? totalScore / totalEvaluations : 0,
            maxScore: maxScore,
            totalEvaluations: totalEvaluations,
            taskPerformance: taskPerformance
        };
    }

    calculateStudentStatistics(studentId) {
        let totalScore = 0;
        let evaluationCount = 0;
        
        this.state.evaluations.forEach(evalItem => {
            if (evalItem.scores && evalItem.scores[studentId]) {
                const score = evalItem.scores[studentId];
                totalScore += (score.taskScore || 0) + (score.teamworkScore || 0);
                evaluationCount++;
            }
        });
        
        return {
            totalScore: totalScore,
            evaluationCount: evaluationCount,
            averageScore: evaluationCount > 0 ? totalScore / evaluationCount : 0
        };
    }

    // ===============================
    // ADMIN MANAGEMENT
    // ===============================
    async saveAdmin() {
        const email = this.dom.adminEmail?.value.trim();
        const password = this.dom.adminPassword?.value;
        const type = this.dom.adminTypeSelect?.value;
        const permissions = {
            read: this.dom.permissionRead?.checked || false,
            write: this.dom.permissionWrite?.checked || false,
            delete: this.dom.permissionDelete?.checked || false
        };

        if (!email || !this.validateEmail(email)) {
            this.showToast('সঠিক ইমেইল লিখুন', 'error');
            return;
        }

        if (!this.currentEditingAdmin && !password) {
            this.showToast('পাসওয়ার্ড লিখুন', 'error');
            return;
        }

        if (password && password.length < 6) {
            this.showToast('পাসওয়ার্ড ন্যূনতম ৬ অক্ষর হতে হবে', 'error');
            return;
        }

        this.showLoading();
        try {
            if (this.currentEditingAdmin) {
                // Update existing admin
                const updateData = { email, type, permissions };
                await db.collection("admins").doc(this.currentEditingAdmin.id).update(updateData);
                this.showToast('অ্যাডমিন সফলভাবে আপডেট করা হয়েছে', 'success');
            } else {
                // Create new admin
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                
                await db.collection("admins").doc(user.uid).set({
                    email,
                    type,
                    permissions,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
                this.showToast('অ্যাডমিন সফলভাবে তৈরি করা হয়েছে', 'success');
            }
            
            this.hideAdminModal();
            await this.loadAdmins();
        } catch (error) {
            this.showToast('অ্যাডমিন সংরক্ষণ ব্যর্থ: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // CSV IMPORT/EXPORT
    // ===============================
  // ===============================
// CSV IMPORT/EXPORT
// ===============================
importCSV() {
    // Trigger the file input click
    if (this.dom.csvFileInput) {
        this.dom.csvFileInput.click();
    } else {
        this.showToast('CSV ফাইল ইনপুট পাওয়া যায়নি', 'error');
    }
}

handleCSVFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
        this.showToast('শুধুমাত্র CSV ফাইল নির্বাচন করুন', 'error');
        return;
    }

    if (this.dom.csvFileName) {
        this.dom.csvFileName.textContent = file.name;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        this.csvImportData = e.target.result;
        if (this.dom.processImportBtn) {
            this.dom.processImportBtn.disabled = false;
        }
    };
    reader.readAsText(file);
}
    async processCSVImport() {
        if (!this.csvImportData) {
            this.showToast('প্রথমে CSV ফাইল নির্বাচন করুন', 'error');
            return;
        }

        this.showLoading('শিক্ষার্থী ইম্পোর্ট হচ্ছে...');
        try {
            const students = this.parseCSVData(this.csvImportData);
            let successCount = 0;
            let errorCount = 0;

            for (const student of students) {
                try {
                    // Validate student data
                    const validationErrors = await this.validateStudentUniqueness(student);
                    if (validationErrors.length === 0) {
                        await db.collection("students").add({
                            ...student,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        });
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    errorCount++;
                }
            }

            // Clear cache and reload data
            this.cache.clear('students_data');
            await this.loadStudents();
            
            this.showToast(`${successCount} জন শিক্ষার্থী সফলভাবে ইম্পোর্ট হয়েছে, ${errorCount} জন ব্যর্থ`, 
                          successCount > 0 ? 'success' : 'error');
            
            // Reset form
            this.csvImportData = null;
            if (this.dom.csvFileInput) this.dom.csvFileInput.value = '';
            if (this.dom.csvFileName) this.dom.csvFileName.textContent = 'কোন ফাইল নির্বাচন করা হয়নি';
            if (this.dom.processImportBtn) this.dom.processImportBtn.disabled = true;
            
        } catch (error) {
            this.showToast('CSV ইম্পোর্ট করতে সমস্যা: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    parseCSVData(csvData) {
        const students = [];
        const lines = csvData.split('\n').filter(line => line.trim());
        
        // Skip header row if exists
        let startIndex = 0;
        if (lines[0].includes('নাম') || lines[0].includes('রোল')) {
            startIndex = 1;
        }

        for (let i = startIndex; i < lines.length; i++) {
            const fields = this.parseCSVLine(lines[i]);
            if (fields.length >= 6) {
                const student = {
                    name: fields[0]?.trim(),
                    roll: fields[1]?.trim(),
                    gender: fields[2]?.trim(),
                    groupId: fields[3]?.trim(),
                    contact: fields[4]?.trim(),
                    academicGroup: fields[5]?.trim(),
                    session: fields[6]?.trim(),
                    role: fields[7]?.trim() || ''
                };
                
                // Basic validation
                if (student.name && student.roll && student.gender && student.groupId) {
                    students.push(student);
                }
            }
        }

        return students;
    }

    parseCSVLine(line) {
        const fields = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(currentField);
                currentField = '';
            } else {
                currentField += char;
            }
        }
        
        fields.push(currentField);
        return fields;
    }

    downloadCSVTemplate() {
        const headers = ['নাম', 'রোল', 'জেন্ডার', 'গ্রুপ আইডি', 'যোগাযোগ', 'একাডেমিক গ্রুপ', 'সেশন', 'দায়িত্ব'];
        const example = ['জাহিদ হাসান', '১০১', 'ছেলে', 'group1', '০১৭১২৩৪৫৬৭৮', 'বিজ্ঞান', '২০২৩-২৪', 'team-leader'];
        
        let csvContent = headers.join(',') + '\n';
        csvContent += example.join(',') + '\n';
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', 'student_template.csv');
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async exportAllData() {
        this.showLoading('এক্সপোর্ট তৈরি হচ্ছে...');
        try {
            await Promise.all([
                this.exportStudentsCSV(),
                this.exportGroupsCSV(), 
                this.exportEvaluationsCSV()
            ]);
            this.showToast('সমস্ত ডেটা সফলভাবে এক্সপোর্ট হয়েছে', 'success');
        } catch (error) {
            this.showToast('এক্সপোর্ট করতে সমস্যা: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async exportStudentsCSV() {
        const headers = ['নাম', 'রোল', 'জেন্ডার', 'গ্রুপ', 'যোগাযোগ', 'একাডেমিক গ্রুপ', 'সেশন', 'দায়িত্ব'];
        let csvContent = headers.join(',') + '\n';
        
        this.state.students.forEach(student => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            const row = [
                student.name,
                student.roll,
                student.gender,
                group?.name || '',
                student.contact || '',
                student.academicGroup || '',
                student.session || '',
                student.role ? this.roleNames[student.role] : ''
            ].map(field => `"${field}"`).join(',');
            
            csvContent += row + '\n';
        });
        
        this.downloadCSVFile(csvContent, 'students.csv');
    }

    async exportGroupsCSV() {
        const memberCountMap = this.computeMemberCountMap();
        const headers = ['গ্রুপ নাম', 'সদস্য সংখ্যা'];
        let csvContent = headers.join(',') + '\n';
        
        this.state.groups.forEach(group => {
            const row = [
                group.name,
                memberCountMap[group.id] || 0
            ].map(field => `"${field}"`).join(',');
            
            csvContent += row + '\n';
        });
        
        this.downloadCSVFile(csvContent, 'groups.csv');
    }

    async exportEvaluationsCSV() {
        const headers = ['টাস্ক', 'গ্রুপ', 'শিক্ষার্থী', 'টাস্ক স্কোর', 'টিমওয়ার্ক স্কোর', 'মোট স্কোর', 'তারিখ'];
        let csvContent = headers.join(',') + '\n';
        
        this.state.evaluations.forEach(evaluation => {
            const task = this.state.tasks.find(t => t.id === evaluation.taskId);
            const group = this.state.groups.find(g => g.id === evaluation.groupId);
            
            if (evaluation.scores) {
                Object.entries(evaluation.scores).forEach(([studentId, score]) => {
                    const student = this.state.students.find(s => s.id === studentId);
                    if (student) {
                        const totalScore = (score.taskScore || 0) + (score.teamworkScore || 0);
                        const dateStr = evaluation.updatedAt?.seconds ? 
                            new Date(evaluation.updatedAt.seconds * 1000).toLocaleDateString('bn-BD') : '';
                        
                        const row = [
                            task?.name || '',
                            group?.name || '',
                            student.name,
                            score.taskScore || 0,
                            score.teamworkScore || 0,
                            totalScore,
                            dateStr
                        ].map(field => `"${field}"`).join(',');
                        
                        csvContent += row + '\n';
                    }
                });
            }
        });
        
        this.downloadCSVFile(csvContent, 'evaluations.csv');
    }

    downloadCSVFile(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    downloadCardsImage() {
        this.showToast('এই ফিচারটি শীঘ্রই আসছে', 'info');
    }
}

// Initialize the application
let smartEvaluator;

document.addEventListener('DOMContentLoaded', function() {
    smartEvaluator = new SmartGroupEvaluator();
});