// ... আপনার বাকি কোড ...
// শেষের দিকে, initApp(); এর পরে কিন্তু JSZip লোড হওয়ার আগে

// এই অংশটি খুঁজুন:
// document.querySelectorAll(".filter-btn").forEach((btn) => { ... }
// এবং
// document.getElementById("allStudentsSearchInput").addEventListener("input", (e) => { ... }

// এই দুটি ইভেন্ট লিসেনার আপনার সমস্যার জন্য দায়ী।

// আপনার মূল অ্যাপ্লিকেশন স্ক্রিপ্টটি শেষ হওয়ার পরে, অর্থাৎ `initApp();` কল হওয়ার পরে এবং
// `<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>`
// স্ক্রিপ্ট ট্যাগের আগে আপনি নিচের কোডটি যোগ করুন।

</script> <!-- আপনার মূল </script> ট্যাগ (যেখানে initApp(); আছে) -->

<!-- এই নতুন স্ক্রিপ্টটি এখানে যোগ করুন -->
<script>
    // Add this new function to handle both filtering and searching for the All Students page
    function filterAndSearchStudentsAllCards() {
        const allStudentsPage = document.getElementById("page-all-students");
        if (!allStudentsPage || allStudentsPage.classList.contains("hidden")) {
            // Don't run if the page is not active
            return;
        }

        // Get the currently active filter button within the All Students page
        const activeFilter = allStudentsPage.querySelector(".filter-btn.bg-blue-100, .filter-btn.dark\\:bg-blue-900");
        const searchTerm = document.getElementById("allStudentsSearchInput")?.value.toLowerCase() || "";

        // Determine the active group ID based on the active filter
        const groupId = activeFilter ? activeFilter.getAttribute("data-group") : "";

        // Filter students based on the active group filter first
        let filteredStudents = groupId ? students.filter((student) => student.groupId === groupId) : students;

        // Then apply the search term filter
        const searchedAndFilteredStudents = filteredStudents.filter((student) =>
            student.name.toLowerCase().includes(searchTerm) ||
            student.roll.toLowerCase().includes(searchTerm) ||
            student.contact.toLowerCase().includes(searchTerm) ||
            student.session.toLowerCase().includes(searchTerm)
        );

        // Get the container to render the cards
        const allStudentsCards = document.getElementById("allStudentsCards");
        if (!allStudentsCards) return;

        // Clear the container
        allStudentsCards.innerHTML = "";

        // Render the filtered and searched students
        searchedAndFilteredStudents.forEach((student) => {
            const group = groups.find((g) => g.id === student.groupId);
            const groupName = group ? group.name : "গ্রুপ নেই";
            const groupIndex = groups.findIndex((g) => g.id === student.groupId);
            const cardColorClass = `group-card-${(groupIndex % 8) + 1}`;
            let roleBadge = "";
            if (student.role) {
                const roleNames = {
                    "team-leader": "টিম লিডার",
                    "time-keeper": "টাইম কিপার",
                    reporter: "রিপোর্টার",
                    "resource-manager": "রিসোর্স ম্যানেজার",
                    "peace-maker": "পিস মেকার",
                };
                roleBadge = `<span class="member-role-badge ${student.role}">${roleNames[student.role] || student.role}</span>`;
            }
            const studentCard = document.createElement("div");
            studentCard.className = `student-card ${cardColorClass} p-4 rounded-xl shadow-md relative overflow-hidden`;
            studentCard.innerHTML = `
                <div class="group-serial">${groupIndex + 1}</div>
                <div class="flex items-center mb-3">
                    <div class="student-avatar bg-primary text-white">${student.name.charAt(0)}</div>
                    <div class="ml-3">
                        <h4 class="font-semibold">${student.name}</h4>
                        <p class="text-sm text-gray-600 dark:text-gray-300">${groupName}</p>
                    </div>
                </div>
                <div class="student-details space-y-1 text-sm">
                    <p><strong>রোল:</strong> ${student.roll}</p>
                    <p><strong>সেক্স:</strong> ${student.gender}</p>
                    <p><strong>যোগাযোগ:</strong> ${student.contact}</p>
                    <p><strong>সেশন:</strong> ${student.session}</p>
                    <p><strong>একাডেমিক গ্রুপ:</strong> ${student.academicGroup || "N/A"}</p>
                </div>
                ${roleBadge}
            `;
            allStudentsCards.appendChild(studentCard);
        });
    }

    // Update the search listener for All Students to use the new function
    document.getElementById("allStudentsSearchInput").addEventListener("input", (e) => {
        // Call the unified function
        filterAndSearchStudentsAllCards();
    });

    // Update the filter button listener specifically for the All Students page
    document.querySelectorAll("#page-all-students .filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const groupId = btn.getAttribute("data-group");

            // Update active filter - specifically target buttons within the All Students page
            document.querySelectorAll("#page-all-students .filter-btn").forEach((b) => {
                b.classList.remove("bg-blue-100", "dark:bg-blue-900", "text-blue-800", "dark:text-blue-200");
                b.classList.add("bg-gray-100", "dark:bg-gray-800", "text-gray-800", "dark:text-gray-200");
            });
            btn.classList.add("bg-blue-100", "dark:bg-blue-900", "text-blue-800", "dark:text-blue-200");
            btn.classList.remove("bg-gray-100", "dark:bg-gray-800", "text-gray-800", "dark:text-gray-200");

            // Call the unified function to update the display
            filterAndSearchStudentsAllCards();
        });
    });

    
</script>



<!-- JSZip for exporting all data as zip -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>