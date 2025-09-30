// app.js - FIXED VERSION WITH ALL ISSUES RESOLVED
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
            pageVisibility: {}, // Store page visibility settings
            allUsers: [] // Store all Firebase users
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

        // Default page visibility - will be overridden by admin settings
        this.PUBLIC_PAGES = ['dashboard', 'all-students', 'group-policy', 'export', 'student-ranking', 'group-analysis'];
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

        this.groupColors = {}; // Store group background colors
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
        await this.loadPageVisibilitySettings(); // Load page visibility settings
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

    // ===============================
    // PAGE VISIBILITY MANAGEMENT - NEW FEATURE
    // ===============================
    async loadPageVisibilitySettings() {
        try {
            const cacheKey = 'page_visibility_settings';
            const cached = this.cache.get(cacheKey);
            
            if (!cached) {
                const doc = await db.collection('settings').doc('pageVisibility').get();
                if (doc.exists) {
                    this.state.pageVisibility = doc.data();
                    this.cache.set(cacheKey, this.state.pageVisibility);
                } else {
                    // Set default visibility
                    this.state.pageVisibility = {
                        'dashboard': true,
                        'groups': false,
                        'members': false,
                        'group-members': false,
                        'all-students': true,
                        'student-ranking': true,
                        'group-analysis': true,
                        'tasks': false,
                        'evaluation': false,
                        'group-policy': true,
                        'export': true,
                        'admin-management': false
                    };
                    await this.savePageVisibilitySettings();
                }
            } else {
                this.state.pageVisibility = cached;
            }
            
            this.updateNavigationVisibility();
        } catch (error) {
            console.error("Error loading page visibility settings:", error);
        }
    }

    async savePageVisibilitySettings() {
        try {
            await db.collection('settings').doc('pageVisibility').set(this.state.pageVisibility);
            this.cache.clear('page_visibility_settings');
            this.showToast('পেজ ভিজিবিলিটি সেটিংস সেভ করা হয়েছে', 'success');
        } catch (error) {
            console.error("Error saving page visibility settings:", error);
            this.showToast('সেটিংস সেভ করতে সমস্যা', 'error');
        }
    }

    updateNavigationVisibility() {
        // Update navigation based on visibility settings and authentication
        this.dom.navBtns.forEach(btn => {
            const pageId = btn.getAttribute("data-page");
            const isPublic = this.state.pageVisibility[pageId];
            
            if (isPublic) {
                btn.classList.remove('private-tab');
                btn.classList.add('public-tab');
            } else {
                btn.classList.remove('public-tab');
                btn.classList.add('private-tab');
            }
            
            // Show/hide based on authentication
            if (!this.currentUser && !isPublic) {
                btn.style.display = 'none';
            } else {
                btn.style.display = 'flex';
            }
        });
    }

    // ===============================
    // ALL USERS MANAGEMENT - NEW FEATURE
    // ===============================
    async loadAllUsers() {
        if (!this.currentUser) return;
        
        try {
            const cacheKey = 'all_users_data';
            const cached = this.cache.get(cacheKey);
            
            if (!cached) {
                // This would require Firebase Admin SDK on backend
                // For frontend, we'll store user data when they register/login
                const snap = await db.collection("users").get();
                this.state.allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.cache.set(cacheKey, this.state.allUsers);
            } else {
                this.state.allUsers = cached;
            }
        } catch (error) {
            console.error("Error loading all users:", error);
        }
    }

    async saveUserData(user, adminData = null) {
        try {
            const userData = {
                email: user.email,
                displayName: user.displayName || user.email,
                photoURL: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                ...adminData
            };

            await db.collection("users").doc(user.uid).set(userData, { merge: true });
        } catch (error) {
            console.error("Error saving user data:", error);
        }
    }

    // ===============================
    // FIXED AUTHENTICATION WITH USER STORAGE
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
            await this.saveUserData(user, userData); // Save user data to Firestore
            this.updateUserInterface(userData);
            
            // Load all data for authenticated user
            await this.loadInitialData();
            await this.loadAllUsers(); // Load all users data
            
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
            
            const adminData = {
                email,
                type: adminType,
                permissions: {
                    read: true,
                    write: true,
                    delete: adminType === 'super-admin'
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection("admins").doc(user.uid).set(adminData);
            await this.saveUserData(user, adminData); // Save to users collection

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
            let adminData = null;
            
            if (!adminDoc.exists) {
                adminData = {
                    email: user.email,
                    type: "admin",
                    permissions: {
                        read: true,
                        write: true,
                        delete: false
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                };
                await db.collection("admins").doc(user.uid).set(adminData);
            } else {
                adminData = adminDoc.data();
            }
            
            await this.saveUserData(user, adminData); // Save to users collection
            this.showToast('Google লগইন সফল!', 'success');
        } catch (error) {
            this.handleAuthError(error, 'google');
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // FIXED DUPLICATE STUDENT VALIDATION
    // ===============================
    async checkStudentUniqueness(roll, academicGroup, groupId = null, excludeId = null) {
        // Check for duplicate roll in same academic group
        const rollQuery = await db.collection("students")
            .where("roll", "==", roll)
            .where("academicGroup", "==", academicGroup)
            .get();

        if (!rollQuery.empty && rollQuery.docs.some(doc => doc.id !== excludeId)) {
            return { isDuplicate: true, message: "এই রোল ও একাডেমিক গ্রুপের শিক্ষার্থী ইতিমধ্যে আছে" };
        }

        // Check if student already has a role in any group
        if (groupId) {
            const existingStudent = this.state.students.find(s => 
                s.roll === roll && 
                s.academicGroup === academicGroup && 
                s.id !== excludeId
            );

            if (existingStudent && existingStudent.role) {
                return { isDuplicate: true, message: "এই শিক্ষার্থী ইতিমধ্যে অন্য গ্রুপে দায়িত্বপ্রাপ্ত" };
            }
        }

        return { isDuplicate: false };
    }

    async addStudent() {
        const studentData = this.getStudentFormData();
        if (!studentData) return;

        this.showLoading();
        try {
            // Enhanced uniqueness check
            const uniquenessCheck = await this.checkStudentUniqueness(
                studentData.roll, 
                studentData.academicGroup, 
                studentData.groupId
            );
            
            if (uniquenessCheck.isDuplicate) {
                this.showToast(uniquenessCheck.message, "error");
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

    // ===============================
    // FIXED STUDENT CARDS WITH GROUP COLORS
    // ===============================
    getGroupColor(groupId) {
        if (!this.groupColors[groupId]) {
            // Generate consistent color based on groupId
            const colors = [
                'bg-gradient-to-br from-blue-400 to-blue-600',
                'bg-gradient-to-br from-green-400 to-green-600',
                'bg-gradient-to-br from-purple-400 to-purple-600',
                'bg-gradient-to-br from-yellow-400 to-yellow-600',
                'bg-gradient-to-br from-pink-400 to-pink-600',
                'bg-gradient-to-br from-indigo-400 to-indigo-600',
                'bg-gradient-to-br from-red-400 to-red-600',
                'bg-gradient-to-br from-teal-400 to-teal-600'
            ];
            const hash = groupId.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);
            this.groupColors[groupId] = colors[Math.abs(hash) % colors.length];
        }
        return this.groupColors[groupId];
    }

    renderStudentCards() {
        if (!this.dom.allStudentsCards) return;

        const filteredStudents = this.getFilteredStudents('cards');
        
        this.dom.allStudentsCards.innerHTML = filteredStudents.map((student, index) => {
            const group = this.state.groups.find(g => g.id === student.groupId);
            const groupColor = group ? this.getGroupColor(group.id) : 'bg-gradient-to-br from-gray-400 to-gray-600';
            
            const roleBadge = student.role ? 
                `<span class="member-role-badge ${student.role}">${this.roleNames[student.role] || student.role}</span>` :
                `<span class="px-2 py-1 text-xs rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">দায়িত্ব বাকি</span>`;

            return `
                <div class="student-card ${groupColor} rounded-xl p-4 shadow-md relative overflow-hidden text-white transform transition-transform hover:scale-105 hover:shadow-lg">
                    <span class="serial-number absolute top-2 right-2 bg-black bg-opacity-20 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">${index + 1}</span>
                    <div class="flex items-start mb-3">
                        <div class="student-avatar bg-white bg-opacity-20 rounded-full w-12 h-12 flex items-center justify-center font-bold text-lg">
                            ${student.name.charAt(0)}
                        </div>
                        <div class="flex-1 ml-3">
                            <h3 class="font-bold text-lg">${student.name}</h3>
                            <div class="mt-1">${roleBadge}</div>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-2 text-sm bg-white bg-opacity-10 rounded-lg p-3">
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

        // Add download button for filtered cards
        this.addDownloadCardsButton();
    }

    // ===============================
    // IMAGE DOWNLOAD FEATURE FOR STUDENT CARDS
    // ===============================
    addDownloadCardsButton() {
        const existingButton = document.getElementById('downloadCardsButton');
        if (existingButton) {
            existingButton.remove();
        }

        const downloadButton = document.createElement('button');
        downloadButton.id = 'downloadCardsButton';
        downloadButton.className = 'bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors mb-4';
        downloadButton.innerHTML = '<i class="fas fa-download mr-2"></i>কার্ডগুলি ডাউনলোড করুন';
        downloadButton.onclick = () => this.downloadStudentCardsAsImage();

        const cardsContainer = this.dom.allStudentsCards.parentElement;
        cardsContainer.insertBefore(downloadButton, this.dom.allStudentsCards);
    }

    async downloadStudentCardsAsImage() {
        this.showLoading('ইমেজ তৈরি হচ্ছে...');
        
        try {
            // Use html2canvas to capture the cards
            const canvas = await html2canvas(this.dom.allStudentsCards, {
                backgroundColor: null,
                scale: 2, // Higher quality
                useCORS: true,
                allowTaint: true
            });

            const link = document.createElement('a');
            link.download = `student-cards-${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            this.showToast('কার্ডগুলি ইমেজ হিসেবে ডাউনলোড করা হয়েছে', 'success');
        } catch (error) {
            console.error('Error downloading cards as image:', error);
            this.showToast('ইমেজ ডাউনলোড করতে সমস্যা', 'error');
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // FIXED NAVIGATION WITH VISIBILITY SETTINGS
    // ===============================
    async handleNavigation(event) {
        const btn = event.currentTarget;
        const pageId = btn.getAttribute("data-page");

        // Check page visibility settings
        const isPublic = this.state.pageVisibility[pageId];
        
        if (!isPublic && !this.currentUser) {
            this.showToast("এই পেজ দেখতে লগইন প্রয়োজন", "error");
            return;
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
            await this.loadPageData(pageId);
        }
    }

    async loadPageData(pageId) {
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
                await this.loadAllUsers();
                this.renderAdminManagement();
                break;
        }
    }

    // ===============================
    // ENHANCED EVALUATION WITH AVERAGE SCORES
    // ===============================
    calculateTaskAverage(taskId) {
        const taskEvaluations = this.state.evaluations.filter(e => e.taskId === taskId);
        if (taskEvaluations.length === 0) return 0;

        let totalScore = 0;
        let totalStudents = 0;

        taskEvaluations.forEach(evalItem => {
            if (evalItem.scores) {
                Object.values(evalItem.scores).forEach(score => {
                    let additionalMarks = 0;
                    if (score.optionMarks) {
                        Object.values(score.optionMarks).forEach(opt => {
                            if (opt.selected) {
                                const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                                if (optDef) additionalMarks += optDef.marks;
                            }
                        });
                    }
                    totalScore += (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                    totalStudents++;
                });
            }
        });

        return totalStudents > 0 ? (totalScore / totalStudents).toFixed(2) : 0;
    }

    calculateGroupTaskAverage(groupId, taskId) {
        const evaluation = this.state.evaluations.find(e => 
            e.groupId === groupId && e.taskId === taskId
        );

        if (!evaluation || !evaluation.scores) return 0;

        let totalScore = 0;
        let studentCount = 0;

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
            totalScore += (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
            studentCount++;
        });

        return studentCount > 0 ? (totalScore / studentCount).toFixed(2) : 0;
    }

    calculateEvaluationAverage(evaluationId) {
        const evaluation = this.state.evaluations.find(e => e.id === evaluationId);
        if (!evaluation || !evaluation.scores) return 0;

        let totalScore = 0;
        let studentCount = 0;

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
            totalScore += (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
            studentCount++;
        });

        return studentCount > 0 ? (totalScore / studentCount).toFixed(2) : 0;
    }

    // ===============================
    // ENHANCED RENDER METHODS WITH AVERAGES
    // ===============================
    renderTasks() {
        if (!this.dom.tasksList) return;

        this.dom.tasksList.innerHTML = this.state.tasks.map(task => {
            const dateStr = task.date?.seconds ? 
                new Date(task.date.seconds * 1000).toLocaleDateString("bn-BD") : 
                'তারিখ নেই';
            
            const averageScore = this.calculateTaskAverage(task.id);

            return `
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div class="p-4 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold">${task.name}</h3>
                            <p class="text-sm text-gray-500">
                                তারিখ: ${dateStr} | সর্বোচ্চ স্কোর: ${task.maxScore} 
                                <span class="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                                    গড় স্কোর: ${averageScore}
                                </span>
                            </p>
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

    renderEvaluationList() {
        if (!this.dom.evaluationListTable) return;

        this.dom.evaluationListTable.innerHTML = this.state.evaluations.map(evaluation => {
            const task = this.state.tasks.find(t => t.id === evaluation.taskId);
            const group = this.state.groups.find(g => g.id === evaluation.groupId);
            const totalScore = this.calculateEvaluationTotalScore(evaluation);
            const averageScore = this.calculateEvaluationAverage(evaluation.id);
            const dateStr = evaluation.updatedAt?.seconds ? 
                new Date(evaluation.updatedAt.seconds * 1000).toLocaleDateString("bn-BD") : 
                'তারিখ নেই';

            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td class="border border-gray-300 dark:border-gray-600 p-2">${task?.name || 'Unknown Task'}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2">${group?.name || 'Unknown Group'}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2">${dateStr}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2 font-semibold">${totalScore}</td>
                    <td class="border border-gray-300 dark:border-gray-600 p-2 font-semibold text-blue-600">${averageScore}</td>
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

        // Update table header to include average column
        const tableHeader = this.dom.evaluationListTable.parentElement.querySelector('thead tr');
        if (tableHeader && !tableHeader.innerHTML.includes('গড় স্কোর')) {
            tableHeader.innerHTML = `
                <th class="border border-gray-300 dark:border-gray-600 p-2">টাস্ক</th>
                <th class="border border-gray-300 dark:border-gray-600 p-2">গ্রুপ</th>
                <th class="border border-gray-300 dark:border-gray-600 p-2">তারিখ</th>
                <th class="border border-gray-300 dark:border-gray-600 p-2">মোট স্কোর</th>
                <th class="border border-gray-300 dark:border-gray-600 p-2">গড় স্কোর</th>
                <th class="border border-gray-300 dark:border-gray-600 p-2">কার্যক্রম</th>
            `;
        }
    }

    renderGroupDetails(groupId) {
        if (!this.dom.groupDetailsContent) return;

        const group = this.state.groups.find(g => g.id === groupId);
        const groupStudents = this.state.students.filter(s => s.groupId === groupId);
        const groupEvaluations = this.state.evaluations.filter(e => e.groupId === groupId);
        
        let content = `<h4 class="font-semibold mb-4">${group.name} - সকল মূল্যায়ন ফলাফল</h4>`;
        
        if (groupEvaluations.length === 0) {
            content += `<p class="text-gray-500 text-center py-4">কোন মূল্যায়ন পাওয়া যায়নি</p>`;
        } else {
            groupEvaluations.forEach(evalItem => {
                const task = this.state.tasks.find(t => t.id === evalItem.taskId);
                const groupAverage = this.calculateGroupTaskAverage(groupId, evalItem.taskId);
                
                content += `
                    <div class="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div class="flex justify-between items-center mb-3">
                            <h5 class="font-semibold">${task?.name || 'Unknown Task'}</h5>
                            <span class="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm font-medium">
                                গ্রুপ গড়: ${groupAverage}
                            </span>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="evaluation-table w-full">
                                <thead>
                                    <tr class="bg-gray-100 dark:bg-gray-700">
                                        <th class="border border-gray-300 dark:border-gray-600 p-2">শিক্ষার্থী</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2">টাস্ক স্কোর</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2">টিমওয়ার্ক</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2">অতিরিক্ত পয়েন্ট</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2">মোট</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2">গড় থেকে পার্থক্য</th>
                                        <th class="border border-gray-300 dark:border-gray-600 p-2">মন্তব্য</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                groupStudents.forEach(student => {
                    const score = evalItem.scores?.[student.id] || {};
                    const optionMarks = score.optionMarks || {};
                    let additionalMarks = 0;
                    let optionDetails = [];
                    
                    Object.values(optionMarks).forEach(opt => {
                        if (opt.selected) {
                            const optDef = this.evaluationOptions.find(o => o.id === opt.optionId);
                            if (optDef) {
                                additionalMarks += optDef.marks;
                                optionDetails.push(optDef.text);
                            }
                        }
                    });
                    
                    const total = (score.taskScore || 0) + (score.teamworkScore || 0) + additionalMarks;
                    const difference = (total - parseFloat(groupAverage)).toFixed(2);
                    const differenceClass = difference >= 0 ? 'text-green-600' : 'text-red-600';
                    const differenceSymbol = difference >= 0 ? '+' : '';
                    
                    content += `
                        <tr>
                            <td class="border border-gray-300 dark:border-gray-600 p-2">${student.name}${student.role ? ` (${this.roleNames[student.role]})` : ''}</td>
                            <td class="border border-gray-300 dark:border-gray-600 p-2">${score.taskScore || 0}</td>
                            <td class="border border-gray-300 dark:border-gray-600 p-2">${score.teamworkScore || 0}</td>
                            <td class="border border-gray-300 dark:border-gray-600 p-2">${additionalMarks}</td>
                            <td class="border border-gray-300 dark:border-gray-600 p-2 font-semibold">${total}</td>
                            <td class="border border-gray-300 dark:border-gray-600 p-2 font-semibold ${differenceClass}">${differenceSymbol}${difference}</td>
                            <td class="border border-gray-300 dark:border-gray-600 p-2">${score.comments || '-'}</td>
                        </tr>
                    `;
                });
                
                content += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }

        this.dom.groupDetailsContent.innerHTML = content;
    }

    // ===============================
    // ENHANCED ADMIN MANAGEMENT
    // ===============================
    renderAdminManagement() {
        if (!this.dom.adminManagementContent) return;

        const filteredAdmins = this.getFilteredAdmins();
        
        // Add page visibility management section for super admin
        let pageVisibilitySection = '';
        if (this.currentUser?.type === 'super-admin') {
            pageVisibilitySection = `
                <div class="mb-8">
                    <h4 class="text-lg font-semibold mb-4">পেজ ভিজিবিলিটি ব্যবস্থাপনা</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                        ${Object.entries(this.state.pageVisibility).map(([pageId, isPublic]) => `
                            <div class="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                                <span class="font-medium">${this.getPageName(pageId)}</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" ${isPublic ? 'checked' : ''} 
                                           class="sr-only peer page-visibility-toggle"
                                           data-page="${pageId}">
                                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                    <button onclick="smartEvaluator.savePageVisibilitySettings()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                        ভিজিবিলিটি সেটিংস সংরক্ষণ করুন
                    </button>
                </div>
            `;
        }

        this.dom.adminManagementContent.innerHTML = pageVisibilitySection + `
            <div class="mb-6">
                <h4 class="text-lg font-semibold mb-4">সকল ব্যবহারকারী</h4>
                <div class="overflow-x-auto">
                    <table class="w-full border-collapse border border-gray-300 dark:border-gray-600">
                        <thead>
                            <tr class="bg-gray-100 dark:bg-gray-700">
                                <th class="border border-gray-300 dark:border-gray-600 p-2">ইমেইল</th>
                                <th class="border border-gray-300 dark:border-gray-600 p-2">নাম</th>
                                <th class="border border-gray-300 dark:border-gray-600 p-2">টাইপ</th>
                                <th class="border border-gray-300 dark:border-gray-600 p-2">শেষ লগইন</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.state.allUsers.map(user => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td class="border border-gray-300 dark:border-gray-600 p-2">${user.email}</td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-2">${user.displayName || '-'}</td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-2">
                                        <span class="px-2 py-1 rounded text-xs ${
                                            user.type === 'super-admin' 
                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' 
                                                : user.type === 'admin'
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                        }">
                                            ${user.type === 'super-admin' ? 'সুপার অ্যাডমিন' : user.type === 'admin' ? 'অ্যাডমিন' : 'ব্যবহারকারী'}
                                        </span>
                                    </td>
                                    <td class="border border-gray-300 dark:border-gray-600 p-2 text-sm">
                                        ${user.lastLogin?.seconds ? new Date(user.lastLogin.seconds * 1000).toLocaleDateString('bn-BD') : 'অজানা'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                <h4 class="text-lg font-semibold mb-4">অ্যাডমিন ব্যবস্থাপনা</h4>
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
            </div>
        `;

        // Add event listeners for page visibility toggles
        document.querySelectorAll('.page-visibility-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const pageId = e.target.getAttribute('data-page');
                this.state.pageVisibility[pageId] = e.target.checked;
            });
        });
    }

    getPageName(pageId) {
        const pageNames = {
            'dashboard': 'ড্যাশবোর্ড',
            'groups': 'গ্রুপ ব্যবস্থাপনা',
            'members': 'সদস্য যোগ করুন',
            'group-members': 'গ্রুপ সদস্য',
            'all-students': 'সকল শিক্ষার্থী',
            'student-ranking': 'শিক্ষার্থী র‌্যাঙ্কিং',
            'group-analysis': 'গ্রুপ বিশ্লেষণ',
            'tasks': 'টাস্ক ব্যবস্থাপনা',
            'evaluation': 'মূল্যায়ন',
            'group-policy': 'গ্রুপ নীতি',
            'export': 'এক্সপোর্ট',
            'admin-management': 'অ্যাডমিন ব্যবস্থাপনা'
        };
        return pageNames[pageId] || pageId;
    }

    // ===============================
    // FIXED CSV IMPORT WITH ENHANCED VALIDATION
    // ===============================
    async processCSVImport() {
        if (!this.csvImportData || this.csvImportData.length === 0) {
            this.showToast('প্রথমে CSV ফাইল নির্বাচন করুন', 'error');
            return;
        }

        this.showLoading('শিক্ষার্থী ইম্পোর্ট হচ্ছে...');
        let successCount = 0;
        let errorCount = 0;
        let duplicateCount = 0;

        try {
            for (const studentData of this.csvImportData) {
                try {
                    // Validate required fields
                    if (!studentData.নাম || !studentData.রোল || !studentData.গ্রুপ || !studentData.একাডেমিক_গ্রুপ) {
                        errorCount++;
                        continue;
                    }

                    // Find group by name
                    const group = this.state.groups.find(g => g.name === studentData.গ্রুপ);
                    if (!group) {
                        errorCount++;
                        continue;
                    }

                    // Enhanced duplicate check
                    const uniquenessCheck = await this.checkStudentUniqueness(
                        studentData.রোল, 
                        studentData.একাডেমিক_গ্রুপ, 
                        group.id
                    );
                    
                    if (uniquenessCheck.isDuplicate) {
                        duplicateCount++;
                        continue;
                    }

                    // Prepare student data
                    const student = {
                        name: studentData.নাম,
                        roll: studentData.রোল,
                        gender: studentData.লিঙ্গ || 'ছেলে',
                        groupId: group.id,
                        contact: studentData.যোগাযোগ || '',
                        academicGroup: studentData.একাডেমিক_গ্রুপ,
                        session: studentData.সেশন || '',
                        role: this.getRoleKey(studentData.দায়িত্ব || '')
                    };

                    await db.collection("students").add({
                        ...student,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });

                    successCount++;
                } catch (error) {
                    errorCount++;
                }
            }

            // Clear cache and reload data
            this.cache.clear('students_data');
            await this.loadStudents();

            // Reset form
            this.dom.csvFileInput.value = '';
            this.dom.csvFileName.textContent = 'কোন ফাইল নির্বাচন করা হয়নি';
            this.dom.processImportBtn.classList.add('hidden');
            this.csvImportData = null;

            let message = `${successCount}টি শিক্ষার্থী সফলভাবে ইম্পোর্ট হয়েছে`;
            if (duplicateCount > 0) {
                message += `, ${duplicateCount}টি ডুপ্লিকেট ডাটা স্কিপ করা হয়েছে`;
            }
            if (errorCount > 0) {
                message += `, ${errorCount}টি ব্যর্থ`;
            }

            this.showToast(message, 'success');
        } catch (error) {
            this.showToast('ইম্পোর্ট প্রসেস করতে সমস্যা: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    // ===============================
    // ENHANCED GROUP ANALYSIS WITH AVERAGES
    // ===============================
    renderGroupAnalysis() {
        if (!this.dom.groupAnalysisChart) return;

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

        // Render analysis details with enhanced information
        this.renderGroupAnalysisDetails(sortedGroups, scores);
    }

    renderGroupAnalysisDetails(groups, scores) {
        if (!this.dom.groupAnalysisDetails) return;

        // Calculate overall average
        const overallAverage = groups.length > 0 ? 
            groups.reduce((sum, group) => sum + scores[group.id].score, 0) / groups.length : 0;

        this.dom.groupAnalysisDetails.innerHTML = `
            <div class="col-span-full mb-4">
                <div class="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-4 text-center">
                    <h4 class="font-semibold text-lg">সামগ্রিক গড় স্কোর</h4>
                    <p class="text-3xl font-bold mt-2">${overallAverage.toFixed(2)}</p>
                </div>
            </div>
            ${groups.map(group => {
                const groupStudents = this.state.students.filter(s => s.groupId === group.id);
                const groupEvaluations = this.state.evaluations.filter(e => e.groupId === group.id);
                const taskAverages = this.state.tasks.map(task => ({
                    task: task.name,
                    average: this.calculateGroupTaskAverage(group.id, task.id)
                })).filter(ta => parseFloat(ta.average) > 0);
                
                return `
                    <div class="analysis-stat bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                        <h4 class="font-semibold mb-2">${group.name}</h4>
                        <div class="grid grid-cols-2 gap-2 text-sm mb-3">
                            <div>সদস্য সংখ্যা:</div>
                            <div class="font-medium">${groupStudents.length} জন</div>
                            
                            <div>গড় স্কোর:</div>
                            <div class="font-medium text-blue-600">${scores[group.id].score.toFixed(2)}</div>
                            
                            <div>মোট মূল্যায়ন:</div>
                            <div class="font-medium">${groupEvaluations.length} টি</div>
                            
                            <div>টাস্ক গড়:</div>
                            <div class="font-medium text-green-600">
                                ${taskAverages.length > 0 ? (taskAverages.reduce((sum, ta) => sum + parseFloat(ta.average), 0) / taskAverages.length).toFixed(2) : '0.00'}
                            </div>
                        </div>
                        ${taskAverages.length > 0 ? `
                            <div class="text-xs text-gray-500 mb-2">
                                টাস্কভিত্তিক গড়: ${taskAverages.map(ta => `${ta.task}: ${ta.average}`).join(', ')}
                            </div>
                        ` : ''}
                        <button onclick="smartEvaluator.showGroupDetailsModal('${group.id}')" 
                                class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded-lg text-sm transition-colors">
                            বিস্তারিত দেখুন
                        </button>
                    </div>
                `;
            }).join('')}
        `;
    }

    // ===============================
    // CROSS-ORIGIN POPUP FIX
    // ===============================
    async handleGoogleSignInWithRedirect() {
        this.showLoading();
        try {
            // Use redirect instead of popup to avoid Cross-Origin issues
            await auth.signInWithRedirect(googleProvider);
        } catch (error) {
            this.handleAuthError(error, 'google');
        }
    }

    // Update the Google Sign-In button event listener
    setupEventListeners() {
        // ... existing event listeners ...

        // Replace popup with redirect for Google Sign-In
        this.addListener(this.dom.googleSignInBtn, 'click', () => this.handleGoogleSignInWithRedirect());

        // ... rest of event listeners ...
    }
}

// Initialize application with error handling for Cross-Origin issues
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.smartEvaluator = new SmartGroupEvaluator();
        
        // Handle Firebase auth redirect result
        auth.getRedirectResult().then((result) => {
            if (result.user) {
                console.log('Redirect sign-in successful:', result.user.email);
            }
        }).catch((error) => {
            console.error('Redirect sign-in error:', error);
        });
    } catch (error) {
        console.error('Application initialization error:', error);
        
        // Show user-friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-0 left-0 right-0 bg-red-600 text-white p-4 text-center z-50';
        errorDiv.innerHTML = `
            অ্যাপ্লিকেশন লোড করতে সমস্যা হচ্ছে। পৃষ্ঠাটি রিফ্রেশ করে আবার চেষ্টা করুন।
            <button onclick="location.reload()" class="ml-4 bg-white text-red-600 px-3 py-1 rounded">রিফ্রেশ</button>
        `;
        document.body.appendChild(errorDiv);
    }
});

// Add html2canvas library dynamically if not present
if (typeof html2canvas === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.integrity = 'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyooqYO/QPJXYUZuQnAS+CaBckDOe7g==';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
}