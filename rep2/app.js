// app.js
// ===============================
// CACHE MANAGEMENT SYSTEM
// ===============================
class CacheManager {
    constructor() {
        this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
        this.PREFIX = 'smart_evaluator_';
    }

    set(key, data, customDuration = null) {
        const cacheData = {
            data,
            timestamp: Date.now(),
            expires: Date.now() + (customDuration || this.CACHE_DURATION)
        };
        localStorage.setItem(this.PREFIX + key, JSON.stringify(cacheData));
    }

    get(key) {
        const cached = localStorage.getItem(this.PREFIX + key);
        if (!cached) return null;

        try {
            const { data, timestamp, expires } = JSON.parse(cached);
            
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
}

// ===============================
// APPLICATION CORE - COMPLETE VERSION
// ===============================
class SmartGroupEvaluator {
    constructor() {
        this.cache = new CacheManager();
        this.currentUser = null;
        this.isPublicMode = false;
        
        this.state = {
            groups: [],
            students: [],
            tasks: [],
            evaluations: [],
            admins: [],
            problemStats: {}
        };

        this.filters = {
            membersFilterGroupId: "",
            membersSearchTerm: "",
            cardsFilterGroupId: "",
            cardsSearchTerm: ""
        };

        this.PUBLIC_PAGES = ['dashboard', 'all-students', 'group-policy', 'export'];
        this.PRIVATE_PAGES = ['groups', 'members', 'group-members', 'tasks', 'evaluation', 'admin-management'];

        this.evaluationOptions = [
            { id: 'cannot_do', text: 'আমি পারিনা এই টপিক', marks: -5 },
            { id: 'learned_cannot_write', text: 'আমি টপিক শিখেছি তবে লিখতে পারিনা', marks: 5 },
            { id: 'learned_can_write', text: 'আমি টপিক শিখেছি ও লিখতে পারি', marks: 10 },
            { id: 'weekly_homework', text: 'আমি বাড়ির কাজ সপ্তাহে প্রতিদিন করিছি', marks: 15 },
            { id: 'weekly_attendance', text: 'আমি সপ্তাহে প্রতিদিন উপস্থিত ছিলাম', marks: 5 }
        ];

        this.roleNames = {
            "team-leader": "টিম লিডার",
            "time-keeper": "টাইম কিপার", 
            "reporter": "রিপোর্টার",
            "resource-manager": "রিসোর্স ম্যানেজার",
            "peace-maker": "পিস মেকার",
        };

        this.deleteCallback = null;
        this.editCallback = null;

        this.init();
    }

    async init() {
        this.setupDOMReferences();
        this.setupEventListeners();
        this.setupAuthStateListener();
        this.applySavedTheme();
    }

    setupDOMReferences() {
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
            loadingOverlay: document.getElementById("loadingOverlay"),

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
            evaluationForm: document.getElementById("evaluationForm")
        };
    }

    setupEventListeners() {
        // Auth events
        if (this.dom.showRegister) this.dom.showRegister.addEventListener("click", () => this.toggleAuthForms());
        if (this.dom.showLogin) this.dom.showLogin.addEventListener("click", () => this.toggleAuthForms(false));
        if (this.dom.loginBtn) this.dom.loginBtn.addEventListener("click", () => this.handleLogin());
        if (this.dom.registerBtn) this.dom.registerBtn.addEventListener("click", () => this.handleRegister());
        if (this.dom.googleSignInBtn) this.dom.googleSignInBtn.addEventListener("click", () => this.handleGoogleSignIn());

        // Logout events
        if (this.dom.logoutBtn) this.dom.logoutBtn.addEventListener("click", () => this.showLogoutModal());
        if (this.dom.cancelLogout) this.dom.cancelLogout.addEventListener("click", () => this.hideLogoutModal());
        if (this.dom.confirmLogout) this.dom.confirmLogout.addEventListener("click", () => this.handleLogout());

        // Modal events
        if (this.dom.cancelDelete) this.dom.cancelDelete.addEventListener("click", () => this.hideDeleteModal());
        if (this.dom.confirmDelete) this.dom.confirmDelete.addEventListener("click", () => {
            if (this.deleteCallback) this.deleteCallback();
            this.hideDeleteModal();
        });
        if (this.dom.cancelEdit) this.dom.cancelEdit.addEventListener("click", () => this.hideEditModal());
        if (this.dom.saveEdit) this.dom.saveEdit.addEventListener("click", () => {
            if (this.editCallback) this.editCallback();
            this.hideEditModal();
        });

        // Theme and mobile menu
        if (this.dom.themeToggle) this.dom.themeToggle.addEventListener("click", () => this.toggleTheme());
        if (this.dom.mobileMenuBtn) this.dom.mobileMenuBtn.addEventListener("click", () => this.toggleMobileMenu());

        // Navigation
        this.dom.navBtns.forEach(btn => {
            btn.addEventListener("click", (e) => this.handleNavigation(e));
        });

        // CRUD Operations
        if (this.dom.addGroupBtn) this.dom.addGroupBtn.addEventListener("click", () => this.addGroup());
        if (this.dom.addStudentBtn) this.dom.addStudentBtn.addEventListener("click", () => this.addStudent());
        if (this.dom.addTaskBtn) this.dom.addTaskBtn.addEventListener("click", () => this.addTask());
        if (this.dom.startEvaluationBtn) this.dom.startEvaluationBtn.addEventListener("click", () => this.startEvaluation());

        // Search and filter events
        this.setupSearchAndFilterEvents();
        this.setupModalCloseHandlers();
    }

    setupSearchAndFilterEvents() {
        // Search functionality
        const searchInputs = [
            { id: 'studentSearchInput', callback: (value) => this.handleStudentSearch(value) },
            { id: 'allStudentsSearchInput', callback: (value) => this.handleAllStudentsSearch(value) },
            { id: 'groupSearchInput', callback: (value) => this.handleGroupSearch(value) }
        ];

        searchInputs.forEach(({id, callback}) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', (e) => callback(e.target.value));
            }
        });
    }

    setupModalCloseHandlers() {
        const modals = [this.dom.authModal, this.dom.deleteModal, this.dom.editModal, this.dom.logoutModal];
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
    // MODAL MANAGEMENT
    // ===============================
    showLogoutModal() {
        if (this.dom.logoutModal) this.dom.logoutModal.classList.remove("hidden");
    }

    hideLogoutModal() {
        if (this.dom.logoutModal) this.dom.logoutModal.classList.add("hidden");
    }

    hideDeleteModal() {
        if (this.dom.deleteModal) this.dom.deleteModal.style.display = "none";
    }

    hideEditModal() {
        if (this.dom.editModal) this.dom.editModal.style.display = "none";
    }

    hideModal(modal) {
        if (modal) {
            modal.style.display = 'none';
            if (modal.classList.contains('hidden') === false) {
                modal.classList.add('hidden');
            }
        }
    }

    showDeleteModal(text, callback) {
        if (this.dom.deleteModalText) this.dom.deleteModalText.textContent = text;
        this.deleteCallback = callback;
        if (this.dom.deleteModal) this.dom.deleteModal.style.display = 'flex';
    }

    // ===============================
    // AUTHENTICATION MANAGEMENT
    // ===============================
    setupAuthStateListener() {
        auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            
            if (user) {
                await this.handleUserLogin(user);
            } else {
                this.handleUserLogout();
            }
        });
    }

    async handleUserLogin(user) {
        this.isPublicMode = false;
        if (this.dom.authModal) this.dom.authModal.style.display = "none";
        if (this.dom.appContainer) this.dom.appContainer.classList.remove("hidden");

        try {
            const userData = await this.getUserAdminData(user);
            this.updateUserInterface(userData);
            await this.loadInitialData();
        } catch (error) {
            console.error("Login handling error:", error);
            if (this.dom.userInfo) {
                this.dom.userInfo.innerHTML = `<div class="text-xs text-red-500">ডেটা লোড করতে সমস্যা</div>`;
            }
        }
    }

    handleUserLogout() {
        this.isPublicMode = false;
        if (this.dom.authModal) this.dom.authModal.style.display = "flex";
        if (this.dom.appContainer) this.dom.appContainer.classList.add("hidden");
        this.cache.clearAll();
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

            return null;
        } catch (error) {
            console.error("Error fetching admin data:", error);
            return null;
        }
    }

    async handleLogin() {
        const email = document.getElementById("loginEmail")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;
        
        if (!this.validateEmail(email)) {
            alert("সঠিক ইমেইল ঠিকানা লিখুন");
            return;
        }

        this.showLoading();
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            alert("লগইন ব্যর্থ: " + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleRegister() {
        const email = document.getElementById("registerEmail")?.value.trim();
        const password = document.getElementById("registerPassword")?.value;
        const adminType = document.getElementById("adminType")?.value;

        if (!this.validateEmail(email)) {
            alert("সঠিক ইমেইল ঠিকানা লিখুন");
            return;
        }

        this.showLoading();
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            await db.collection("admins").doc(user.uid).set({
                email,
                type: adminType,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            alert("রেজিস্ট্রেশন সফল!");
            this.toggleAuthForms(false);
        } catch (error) {
            alert("রেজিস্ট্রেশন ব্যর্থ: " + error.message);
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
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            }
        } catch (error) {
            alert("Google লগইন ব্যর্থ: " + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async handleLogout() {
        try {
            await auth.signOut();
            this.hideLogoutModal();
        } catch (error) {
            console.error("Logout error:", error);
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
                this.loadEvaluations()
            ]);
            this.populateSelects();
        } catch (error) {
            console.error("Initial data load error:", error);
        } finally {
            this.hideLoading();
        }
    }

    populateSelects() {
        // Populate student group select
        if (this.dom.studentGroupInput) {
            this.dom.studentGroupInput.innerHTML = this.state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        }

        // Populate evaluation task select
        if (this.dom.evaluationTaskSelect) {
            this.dom.evaluationTaskSelect.innerHTML = this.state.tasks.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }

        // Populate evaluation group select
        if (this.dom.evaluationGroupSelect) {
            this.dom.evaluationGroupSelect.innerHTML = this.state.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        }
    }

    async loadGroups() {
        try {
            const snap = await db.collection("groups").orderBy("name").get();
            this.state.groups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.cache.set('groups', this.state.groups);
            this.renderGroups();
        } catch (error) {
            console.error("Error loading groups:", error);
            const cached = this.cache.get('groups');
            if (cached) this.state.groups = cached;
        }
    }

    async loadStudents() {
        try {
            const snap = await db.collection("students").orderBy("name").get();
            this.state.students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.cache.set('students', this.state.students);
            this.renderStudentsList();
            this.renderStudentCards();
        } catch (error) {
            console.error("Error loading students:", error);
        }
    }

    async loadTasks() {
        try {
            const snap = await db.collection("tasks").orderBy("date", "desc").get();
            this.state.tasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.cache.set('tasks', this.state.tasks);
            this.renderTasks();
        } catch (error) {
            console.error("Error loading tasks:", error);
        }
    }

    async loadEvaluations() {
        try {
            const snap = await db.collection("evaluations").get();
            this.state.evaluations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.cache.set('evaluations', this.state.evaluations);
            this.calculateProblemSolvingStats();
        } catch (error) {
            console.error("Error loading evaluations:", error);
        }
    }

    // ===============================
    // RENDER METHODS - COMPLETE
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
                    <button class="edit-group-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm" data-id="${group.id}">সম্পাদনা</button>
                    <button class="delete-group-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm" data-id="${group.id}">ডিলিট</button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        this.attachGroupEventListeners();
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
                        <div class="text-sm text-gray-500">রোল: ${student.roll} | লিঙ্গ: ${student.gender} | গ্রুপ: ${group?.name || 'না'}</div>
                        <div class="text-sm text-gray-500">একাডেমিক: ${student.academicGroup || 'না'} | সেশন: ${student.session || 'না'}</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="edit-student-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm" data-id="${student.id}">সম্পাদনা</button>
                        <button class="delete-student-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm" data-id="${student.id}">ডিলিট</button>
                    </div>
                </div>
            `;
        }).join('');

        this.attachStudentEventListeners();
    }

    renderStudentCards() {
        if (!this.dom.allStudentsCards) return;

        const filteredStudents = this.getFilteredStudents();
        
        this.dom.allStudentsCards.innerHTML = filteredStudents.map((student, index) => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            const groupIndex = this.state.groups.findIndex(g => g.id === student.groupId);
            const cardColorClass = `group-card-${((groupIndex % 8) + 8) % 8 + 1}`;
            
            const roleBadge = student.role ? 
                `<span class="member-role-badge ${student.role}">${this.roleNames[student.role] || student.role}</span>` :
                `<span class="px-2 py-1 text-xs rounded-md bg-yellow-100 text-yellow-800">দায়িত্ব বাকি</span>`;

            return `
                <div class="student-card ${cardColorClass} glass-card p-4 rounded-xl shadow-md relative overflow-hidden">
                    <span class="group-serial">${index + 1}</span>
                    <div class="flex items-start mb-3">
                        <div class="student-avatar ${student.gender === 'মেয়ে' ? 'bg-pink-500' : 'bg-blue-500'}">
                            ${student.name.charAt(0)}
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-lg">${student.name}</h3>
                            <div class="mt-1">${roleBadge}</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-2 text-sm">
                        <p><i class="fas fa-id-card mr-2"></i> রোল: ${student.roll}</p>
                        <p><i class="fas fa-venus-mars mr-2"></i> লিঙ্গ: ${student.gender}</p>
                        <p><i class="fas fa-users mr-2"></i> গ্রুপ: ${group?.name || 'না'}</p>
                        <p><i class="fas fa-book mr-2"></i> একাডেমিক: ${student.academicGroup || 'না'}</p>
                        <p><i class="fas fa-calendar mr-2"></i> সেশন: ${student.session || 'না'}</p>
                        ${student.contact ? `<p><i class="fas fa-envelope mr-2"></i> ${student.contact}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderTasks() {
        if (!this.dom.tasksList) return;

        this.dom.tasksList.innerHTML = this.state.tasks.map(task => {
            const dateStr = task.date?.seconds ? 
                new Date(task.date.seconds * 1000).toLocaleDateString("bn-BD") : 
                'তারিখ নেই';
                
            return `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div class="p-4 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold">${task.name}</h3>
                            <p class="text-sm text-gray-500">তারিখ: ${dateStr} | সর্বোচ্চ স্কোর: ${task.maxScore}</p>
                        </div>
                        <div class="flex gap-2">
                            <button class="edit-task-btn px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg text-sm" data-id="${task.id}">সম্পাদনা</button>
                            <button class="delete-task-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm" data-id="${task.id}">ডিলিট</button>
                        </div>
                    </div>
                    <div class="p-4">
                        <p class="text-gray-600 dark:text-gray-300">${task.description || 'কোন বিবরণ নেই'}</p>
                    </div>
                </div>
            `;
        }).join('');

        this.attachTaskEventListeners();
    }

    // ===============================
    // DASHBOARD RENDER METHODS
    // ===============================
    renderStatsSummary() {
        const statsEl = document.getElementById("statsSummary");
        if (!statsEl) return;

        const totalGroups = this.state.groups.length;
        const totalStudents = this.state.students.length;
        const withoutRole = this.state.students.filter(s => !s.role).length;

        // Academic groups count
        const academicGroups = new Set(this.state.students.map(s => s.academicGroup)).size;

        // Gender counts
        const genderCount = { 'ছেলে': 0, 'মেয়ে': 0 };
        this.state.students.forEach(s => {
            if (s.gender === 'ছেলে') genderCount['ছেলে']++;
            else if (s.gender === 'মেয়ে') genderCount['মেয়ে']++;
        });

        // Problem solving stats
        const problemStats = this.state.problemStats;

        const card = (title, value, icon, color) => `
            <div class="glass-card rounded-xl p-4 shadow-md flex items-center gap-3">
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
            card("প্রবলেম সলভ", problemStats.totalProblems || 0, "fas fa-tasks", "bg-indigo-500"),
            card("উচ্চ পারদর্শিতা", problemStats.learnedCanWrite || 0, "fas fa-star", "bg-yellow-500")
        ].join("");
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
                <div class="glass-card rounded-lg p-4">
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
        this.renderProblemSolvingStats();
    }

    renderProblemSolvingStats() {
        const container = document.getElementById("problemSolvingStatsList");
        if (!container) return;

        const stats = this.state.problemStats;
        const total = stats.totalProblems || 1;

        const items = [
            { label: 'পারিনা এই টপিক', count: stats.cannotDo, color: 'bg-red-500' },
            { label: 'শিখেছি কিন্তু লিখতে পারিনা', count: stats.learnedCannotWrite, color: 'bg-orange-500' },
            { label: 'শিখেছি ও লিখতে পারি', count: stats.learnedCanWrite, color: 'bg-green-500' },
            { label: 'সাপ্তাহিক বাড়ির কাজ', count: stats.weeklyHomework, color: 'bg-blue-500' },
            { label: 'সাপ্তাহিক উপস্থিতি', count: stats.weeklyAttendance, color: 'bg-purple-500' }
        ];

        container.innerHTML = items.map(item => {
            const percent = Math.round((item.count / total) * 100);
            return `
                <div class="glass-card rounded-lg p-4">
                    <div class="flex justify-between mb-1">
                        <div class="font-medium">${item.label}</div>
                        <div class="text-sm text-gray-500">${item.count} (${percent}%)</div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${item.color}" style="width:${percent}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    calculateGroupScores() {
        const groupScores = {};
        this.state.groups.forEach(g => groupScores[g.id] = {score: 0, members: 0});

        this.state.students.forEach(student => {
            let total = 0;
            this.state.evaluations.forEach(evalItem => {
                if (evalItem.scores && evalItem.scores[student.id]) {
                    const score = evalItem.scores[student.id];
                    let optSum = 0;
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach(opt => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                if (optDef) optSum += optDef.marks;
                            }
                        });
                    }
                    total += (score.taskScore || 0) + (score.teamworkScore || 0) + optSum;
                }
            });
            if (student.groupId && groupScores[student.groupId]) {
                groupScores[student.groupId].score += total;
                groupScores[student.groupId].members++;
            }
        });

        for (const id in groupScores) {
            if (groupScores[id].members > 0) groupScores[id].score /= groupScores[id].members;
        }

        return groupScores;
    }

    renderTopGroups() {
        const container = document.getElementById("topGroupsContainer");
        if (!container) return;

        const scores = this.calculateGroupScores();
        const sortedGroups = [...this.state.groups].sort((a, b) => scores[b.id].score - scores[a.id].score).slice(0, 3);

        container.innerHTML = sortedGroups.map((group, index) => {
            const rank = index + 1;
            return `
                <div class="rank-card rank-${rank}-card card-hover">
                    <div class="rank-title rank-${rank}-title">Rank ${rank}</div>
                    <h3 class="font-bold">${group.name}</h3>
                    <p class="text-lg">স্কোর: ${scores[group.id].score.toFixed(2)}</p>
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
                <div class="group-bar flex items-center p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <span class="rank-badge ${rankClass} mr-3">${index + 1}</span>
                    <div>
                        <h4 class="font-medium">${group.name}</h4>
                        <p class="text-sm text-gray-500">স্কোর: ${scores[group.id].score.toFixed(2)}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===============================
    // CRUD OPERATIONS
    // ===============================
    async addGroup() {
        const name = this.dom.groupNameInput?.value.trim();
        if (!name) {
            alert("গ্রুপের নাম লিখুন");
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
            await this.loadGroups();
        } catch (error) {
            alert("গ্রুপ যোগ করতে সমস্যা: " + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async addStudent() {
        const studentData = this.getStudentFormData();
        if (!studentData) return;

        this.showLoading();
        try {
            // Check uniqueness
            const isDuplicate = await this.checkStudentUniqueness(studentData.roll, studentData.academicGroup);
            if (isDuplicate) {
                alert("এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী already exists");
                this.hideLoading();
                return;
            }

            await db.collection("students").add({
                ...studentData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            this.clearStudentForm();
            await this.loadStudents();
            this.renderGroups(); // Update group counts
        } catch (error) {
            alert("শিক্ষার্থী যোগ করতে সমস্যা: " + error.message);
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
            await this.loadTasks();
        } catch (error) {
            alert("টাস্ক যোগ করতে সমস্যা: " + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async editGroup(id) {
        const group = this.state.groups.find(g => g.id === id);
        if (!group) return;

        this.dom.editModalTitle.textContent = 'গ্রুপ সম্পাদনা';
        this.dom.editModalContent.innerHTML = `
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">গ্রুপ নাম</label>
                <input id="editGroupName" type="text" value="${group.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
            </div>
        `;

        this.editCallback = async () => {
            const name = document.getElementById('editGroupName').value.trim();
            if (!name) return alert('নাম লিখুন');
            this.showLoading();
            try {
                await db.collection('groups').doc(id).update({ name });
                await this.loadGroups();
            } catch (error) {
                alert('সম্পাদনা ব্যর্থ: ' + error.message);
            } finally {
                this.hideLoading();
            }
        };

        this.dom.editModal.style.display = 'flex';
    }

    async deleteGroup(id) {
        this.showDeleteModal('এই গ্রুপ ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection('groups').doc(id).delete();
                await this.loadGroups();
            } catch (error) {
                alert('ডিলিট ব্যর্থ: ' + error.message);
            } finally {
                this.hideLoading();
            }
        });
    }

    async editStudent(id) {
        const student = this.state.students.find(s => s.id === id);
        if (!student) return;

        this.dom.editModalTitle.textContent = 'শিক্ষার্থী সম্পাদনা';
        this.dom.editModalContent.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-2">নাম</label>
                    <input id="editName" type="text" value="${student.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">রোল</label>
                    <input id="editRoll" type="text" value="${student.roll}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">লিঙ্গ</label>
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
                    <input id="editContact" type="text" value="${student.contact || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">একাডেমিক গ্রুপ</label>
                    <input id="editAcademicGroup" type="text" value="${student.academicGroup || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">সেশন</label>
                    <input id="editSession" type="text" value="${student.session || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
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
                return alert('সমস্ত প্রয়োজনীয় তথ্য পূরণ করুন');
            }

            const rollChanged = newData.roll !== student.roll;
            const academicChanged = newData.academicGroup !== student.academicGroup;

            if ((rollChanged || academicChanged) && await this.checkStudentUniqueness(newData.roll, newData.academicGroup, id)) {
                return alert('এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী already exists');
            }

            this.showLoading();
            try {
                await db.collection('students').doc(id).update(newData);
                await this.loadStudents();
            } catch (error) {
                alert('সম্পাদনা ব্যর্থ: ' + error.message);
            } finally {
                this.hideLoading();
            }
        };

        this.dom.editModal.style.display = 'flex';
    }

    async deleteStudent(id) {
        this.showDeleteModal('এই শিক্ষার্থী ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection('students').doc(id).delete();
                await this.loadStudents();
            } catch (error) {
                alert('ডিলিট ব্যর্থ: ' + error.message);
            } finally {
                this.hideLoading();
            }
        });
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
                    <input id="editTaskName" type="text" value="${task.name}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">বিবরণ</label>
                    <textarea id="editTaskDescription" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">${task.description || ''}</textarea>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">সর্বোচ্চ স্কোর</label>
                    <input id="editTaskMaxScore" type="number" value="${task.maxScore}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 dark:bg-gray-700">
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
                return alert('সমস্ত তথ্য পূরণ করুন');
            }

            const date = new Date(dateStr);

            this.showLoading();
            try {
                await db.collection('tasks').doc(id).update({ name, description, maxScore, date });
                await this.loadTasks();
            } catch (error) {
                alert('সম্পাদনা ব্যর্থ: ' + error.message);
            } finally {
                this.hideLoading();
            }
        };

        this.dom.editModal.style.display = 'flex';
    }

    async deleteTask(id) {
        this.showDeleteModal('এই টাস্ক ডিলিট করবেন?', async () => {
            this.showLoading();
            try {
                await db.collection('tasks').doc(id).delete();
                await this.loadTasks();
            } catch (error) {
                alert('ডিলিট ব্যর্থ: ' + error.message);
            } finally {
                this.hideLoading();
            }
        });
    }

    // ===============================
    // UTILITY METHODS
    // ===============================
    getStudentFormData() {
        const fields = [
            'studentNameInput', 'studentRollInput', 'studentGenderInput', 
            'studentGroupInput', 'studentContactInput', 'studentAcademicGroupInput', 'studentSessionInput', 'studentRoleInput'
        ];

        const data = {};
        for (const field of fields) {
            const element = this.dom[field];
            if (!element) continue;
            const value = element.value.trim();
            if (!value && field !== 'studentContactInput' && field !== 'studentRoleInput') {
                alert("সমস্ত প্রয়োজনীয় তথ্য পূরণ করুন");
                return null;
            }
            
            // Convert field name to database field name
            const fieldName = field.replace('student', '').replace('Input', '').toLowerCase();
            data[fieldName] = value;
        }
        return data;
    }

    getTaskFormData() {
        const name = this.dom.taskNameInput?.value.trim();
        const description = this.dom.taskDescriptionInput?.value.trim();
        const maxScore = parseInt(this.dom.taskMaxScoreInput?.value);
        const dateStr = this.dom.taskDateInput?.value;

        if (!name || !description || isNaN(maxScore) || !dateStr) {
            alert("সমস্ত তথ্য পূরণ করুন");
            return null;
        }

        return { name, description, maxScore, date: new Date(dateStr) };
    }

    clearStudentForm() {
        const fields = [
            'studentNameInput', 'studentRollInput', 'studentGenderInput', 
            'studentGroupInput', 'studentContactInput', 'studentAcademicGroupInput', 'studentSessionInput', 'studentRoleInput'
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

    computeMemberCountMap() {
        const map = {};
        this.state.groups.forEach(g => { map[g.id] = 0; });
        this.state.students.forEach(s => {
            if (s.groupId) map[s.groupId] = (map[s.groupId] || 0) + 1;
        });
        return map;
    }

    getFilteredStudents() {
        let students = this.state.students;
        
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
        
        return students;
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async checkStudentUniqueness(roll, academicGroup, excludeId = null) {
        const query = db.collection("students")
            .where("roll", "==", roll)
            .where("academicGroup", "==", academicGroup);
        const snap = await query.get();
        return !snap.empty && snap.docs.some(doc => doc.id !== excludeId);
    }

    // ===============================
    // EVENT HANDLER ATTACHMENT
    // ===============================
    attachGroupEventListeners() {
        document.querySelectorAll('.edit-group-btn').forEach(btn => {
            btn.addEventListener('click', () => this.editGroup(btn.dataset.id));
        });
        document.querySelectorAll('.delete-group-btn').forEach(btn => {
            btn.addEventListener('click', () => this.deleteGroup(btn.dataset.id));
        });
    }

    attachStudentEventListeners() {
        document.querySelectorAll('.edit-student-btn').forEach(btn => {
            btn.addEventListener('click', () => this.editStudent(btn.dataset.id));
        });
        document.querySelectorAll('.delete-student-btn').forEach(btn => {
            btn.addEventListener('click', () => this.deleteStudent(btn.dataset.id));
        });
    }

    attachTaskEventListeners() {
        document.querySelectorAll('.edit-task-btn').forEach(btn => {
            btn.addEventListener('click', () => this.editTask(btn.dataset.id));
        });
        document.querySelectorAll('.delete-task-btn').forEach(btn => {
            btn.addEventListener('click', () => this.deleteTask(btn.dataset.id));
        });
    }

    // ===============================
    // UI MANAGEMENT
    // ===============================
    toggleAuthForms(showRegister = true) {
        if (showRegister) {
            if (this.dom.loginForm) this.dom.loginForm.classList.add("hidden");
            if (this.dom.registerForm) this.dom.registerForm.classList.remove("hidden");
        } else {
            if (this.dom.registerForm) this.dom.registerForm.classList.add("hidden");
            if (this.dom.loginForm) this.dom.loginForm.classList.remove("hidden");
        }
    }

    toggleTheme() {
        const root = document.documentElement;
        if (root.classList.contains("dark")) {
            root.classList.remove("dark");
            if (this.dom.themeToggle) this.dom.themeToggle.innerHTML = '<i class="fas fa-moon text-gray-800 dark:text-yellow-400"></i>';
            localStorage.setItem("theme", "light");
        } else {
            root.classList.add("dark");
            if (this.dom.themeToggle) this.dom.themeToggle.innerHTML = '<i class="fas fa-sun text-gray-800 dark:text-yellow-400"></i>';
            localStorage.setItem("theme", "dark");
        }
    }

    applySavedTheme() {
        if (localStorage.getItem("theme") === "dark") {
            document.documentElement.classList.add("dark");
            if (this.dom.themeToggle) this.dom.themeToggle.innerHTML = '<i class="fas fa-sun text-gray-800 dark:text-yellow-400"></i>';
        }
    }

    toggleMobileMenu() {
        if (this.dom.sidebar) {
            this.dom.sidebar.classList.toggle("hidden-mobile");
            this.dom.sidebar.classList.toggle("active-mobile");
        }
    }

    showLoading() {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.style.display = "flex";
        }
    }

    hideLoading() {
        if (this.dom.loadingOverlay) {
            this.dom.loadingOverlay.style.display = "none";
        }
    }

    updateUserInterface(userData) {
        if (!this.dom.userInfo) return;

        if (userData) {
            this.dom.userInfo.innerHTML = `
                <div class="font-medium">${userData.email}</div>
                <div class="text-xs ${userData.type === "super-admin" ? "text-accent" : "text-gray-500"}">
                    ${userData.type === "super-admin" ? "সুপার অ্যাডমিন" : "অ্যাডমিন"}
                </div>
            `;
            
            if (userData.type === "super-admin") {
                if (this.dom.adminManagementSection) this.dom.adminManagementSection.classList.remove("hidden");
            } else {
                if (this.dom.adminManagementSection) this.dom.adminManagementSection.classList.add("hidden");
            }
        } else {
            this.dom.userInfo.innerHTML = `<div class="text-xs text-gray-500">সাধারণ ব্যবহারকারী</div>`;
            if (this.dom.adminManagementSection) this.dom.adminManagementSection.classList.add("hidden");
        }
    }

    async handleNavigation(event) {
        const btn = event.currentTarget;
        const pageId = btn.getAttribute("data-page");

        if (!this.currentUser && this.PRIVATE_PAGES.includes(pageId)) {
            alert("এই পেজ দেখতে লগইন প্রয়োজন");
            return;
        }

        // Update navigation
        this.dom.navBtns.forEach(navBtn => {
            navBtn.classList.remove("bg-blue-50", "dark:bg-blue-900/30", "text-blue-600", "dark:text-blue-400");
        });
        btn.classList.add("bg-blue-50", "dark:bg-blue-900/30", "text-blue-600", "dark:text-blue-400");

        // Show page
        this.dom.pages.forEach(page => page.classList.add("hidden"));
        const selectedPage = document.getElementById(`page-${pageId}`);
        if (selectedPage) {
            selectedPage.classList.remove("hidden");
            if (this.dom.pageTitle) this.dom.pageTitle.textContent = btn.textContent.trim();

            // Load page data
            if (pageId === 'dashboard') {
                await this.loadDashboard();
            } else if (pageId === 'groups') {
                this.renderGroups();
            } else if (pageId === 'members') {
                this.renderStudentsList();
            } else if (pageId === 'all-students') {
                this.renderStudentCards();
            } else if (pageId === 'tasks') {
                this.renderTasks();
            } else if (pageId === 'evaluation') {
                this.dom.evaluationForm.innerHTML = '';
            }
            // Add other page renders if needed
        }
    }

    async loadDashboard() {
        await this.loadEvaluations();
        this.renderStatsSummary();
        this.renderAcademicGroupStats();
        this.renderProblemSolvingStats();
        this.renderTopGroups();
        this.renderGroupsRanking();
    }

    // Search handlers
    handleStudentSearch(value) {
        this.filters.membersSearchTerm = value.toLowerCase();
        this.renderStudentsList();
    }

    handleAllStudentsSearch(value) {
        this.filters.cardsSearchTerm = value.toLowerCase();
        this.renderStudentCards();
    }

    handleGroupSearch(value) {
        // Implement if needed
    }

    // Evaluation method
    async startEvaluation() {
        const taskId = this.dom.evaluationTaskSelect?.value;
        const groupId = this.dom.evaluationGroupSelect?.value;
        
        if (!taskId || !groupId) {
            alert("একটি টাস্ক এবং গ্রুপ নির্বাচন করুন");
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
            </div>
        `;

        groupStudents.forEach((student) => {
            const existingScore = existingEvaluation?.scores?.[student.id] || {};
            
            formHTML += `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
                    <h4 class="font-semibold mb-3">${student.name} (${student.roll})</h4>
                    
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
                                <label for="${opt.id}-${student.id}" class="ml-2">${opt.text} (${opt.marks})</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        formHTML += `
            <div class="mt-4">
                <button id="saveEvaluationBtn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                    মূল্যায়ন সংরক্ষণ করুন
                </button>
            </div>
        `;

        this.dom.evaluationForm.innerHTML = formHTML;

        // Add event listener for save button
        const saveBtn = document.getElementById('saveEvaluationBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveEvaluation(taskId, groupId, existingEvaluation?.id);
            });
        }
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
            } else {
                payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection("evaluations").add(payload);
            }

            this.hideLoading();
            alert("মূল্যায়ন সফলভাবে সংরক্ষণ করা হয়েছে");
            
            // Refresh data
            await this.loadEvaluations();
            
            if (document.getElementById('page-dashboard') && !document.getElementById('page-dashboard').classList.contains('hidden')) {
                await this.loadDashboard();
            }
        } catch (error) {
            this.hideLoading();
            alert("মূল্যায়ন সংরক্ষণ করতে সমস্যা হয়েছে: " + error.message);
        }
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.smartEvaluator = new SmartGroupEvaluator();
});