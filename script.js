/* =========================================================
   UnitedBANK - FRONT-END DEMO BANKING APPLICATION
   ---------------------------------------------------------
   Sections:
   1.  Config & constants
   2.  DOM references
   3.  Application state
   4.  Storage layer
   5.  Utilities
   6.  Toast notifications
   7.  Public site navigation (mobile menu, home link)
   8.  Modals
   9.  Password visibility toggles
   10. Authentication (sign up, log in, log out, restore)
   11. Dashboard rendering
   12. Transactions
   13. Transfers
   14. Dashboard UI (sidebar, balance eyes, view all)
   15. Init

   NOTE: This is a front-end demo only. Real authentication,
   balances and transfers must be handled by a server.
========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. CONFIG & CONSTANTS
    ===================================================== */

    const STORAGE_KEYS = {
        users: "UnitedBankUsers",
        session: "UnitedBankSession",
        legacySession: "UnitedBankCurrentUser" // old key stored full user + password
    };

    const TOAST_DURATION_MS = 4000;
    const MAX_TRANSACTIONS = 30;
    const MIN_PASSWORD_LENGTH = 6;

    /* The bank must replace this with its own ABA routing number */
    const BANK_ROUTING_NUMBER = "000000000";
    const HIDDEN_BALANCE_TEXT = "••••••••";

    /* Demo account (visible to anyone reading this file) */
    const DEMO_ACCOUNT = {
        id: "flair1234",
        name: "Flair1234",
        username: "Flair1234",
        email: "Flair1234",
        password: "Debby1234",
        checkingBalance: 500000,
        savingsBalance: 0
    };

    /* Starting data for newly created accounts */
    const NEW_ACCOUNT_CHECKING = 60000;
    const NEW_ACCOUNT_SAVINGS = 0;



    /* =====================================================
       2. DOM REFERENCES
    ===================================================== */

    const $ = id => document.getElementById(id);

    const homeView = $("homeView");
    const dashboardView = $("dashboardView");

    const modalOverlay = $("modalOverlay");
    const loginModal = $("loginModal");
    const signupModal = $("signupModal");

    const loginForm = $("loginForm");
    const signupForm = $("signupForm");
    const transferForm = $("transferForm");

    const loginMessage = $("loginMessage");
    const signupMessage = $("signupMessage");
    const transferMessage = $("transferMessage");

    const transactionsList = $("transactionsList");
    const dashboardContent = document.querySelector(".dashboard-content");

    const mobileMenuBtn = $("mobileMenuBtn");
    const navMenu = $("navMenu");

    const logoutBtn = $("logoutBtn");

    const dashboardSidebar = $("dashboardSidebar");
    const dashboardMobileMenu = $("dashboardMobileMenu");

    const toast = $("toast");
    const toastTitle = $("toastTitle");
    const toastMessage = $("toastMessage");
    const toastClose = $("toastClose");


    /* =====================================================
       3. APPLICATION STATE
    ===================================================== */

    let currentUser = null;
    let toastTimeout = null;

    /* Which balances are currently masked */
    const hiddenBalances = {
        checking: false,
        savings: false
    };


    /* =====================================================
       4. STORAGE LAYER
    ===================================================== */

    function getStoredUsers() {
        try {
            const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users));
            return Array.isArray(users) ? users : [];
        } catch (error) {
            console.error("Unable to read users:", error);
            return [];
        }
    }

    function saveStoredUsers(users) {
        try {
            localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
        } catch (error) {
            console.error("Unable to save users:", error);
        }
    }

    /* Replace (or insert) a single user in storage */
    function persistUser(user) {
        const users = getStoredUsers();
        const index = users.findIndex(item => item.id === user.id);

        if (index === -1) {
            users.push(user);
        } else {
            users[index] = user;
        }

        saveStoredUsers(users);
    }

    /* The session stores ONLY the user id - never balances or passwords */
    function getSessionUserId() {
        try {
            return localStorage.getItem(STORAGE_KEYS.session);
        } catch (error) {
            return null;
        }
    }

    function saveSession(userId) {
        try {
            localStorage.setItem(STORAGE_KEYS.session, userId);
        } catch (error) {
            console.error("Unable to save session:", error);
        }
    }

    function clearSession() {
        try {
            localStorage.removeItem(STORAGE_KEYS.session);
            localStorage.removeItem(STORAGE_KEYS.legacySession);
        } catch (error) {
            console.error("Unable to clear session:", error);
        }
    }


    /* =====================================================
       5. UTILITIES
    ===================================================== */

    const currencyFormatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    });

    function formatCurrency(value) {
        return currencyFormatter.format(value);
    }

    /* Avoid floating-point drift (e.g. 0.1 + 0.2) */
    function roundToCents(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function getInitials(name) {
        if (!name) return "U";

        return name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("");
    }

    function getFirstName(name) {
        if (!name) return "User";
        return name.trim().split(" ")[0];
    }

    /* "Saturday, October 24" - used in the dashboard header */
    function getTodayLong() {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric"
        }).format(new Date());
    }

    /* "Oct 24, 2026" - used on transactions (matches seeded data) */
    function getTodayShort() {
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        }).format(new Date());
    }

    function escapeHTML(value) {
        const div = document.createElement("div");
        div.textContent = value;
        return div.innerHTML;
    }

    function showMessage(element, message, type = "error") {
        element.textContent = message;
        element.className = `form-message ${type}`;
    }

    function clearMessage(element) {
        element.textContent = "";
        element.className = "form-message";
    }

    /* SHA-256 hash so passwords aren't stored in plain text.
       Still demo-grade: real apps hash on the server with a salt. */
    async function hashPassword(password) {
        if (!window.crypto || !window.crypto.subtle) {
            return `plain:${password}`; // fallback for non-secure contexts
        }

        const bytes = new TextEncoder().encode(password);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);

        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    function createStartingTransactions() {
        return [{
            description: "Opening Balance",
            date: getTodayShort(),
            amount: NEW_ACCOUNT_CHECKING,
            type: "income",
            status: "Completed"
        }];
    }


    /* =====================================================
       6. TOAST NOTIFICATIONS
    ===================================================== */

    function showToast(title, message) {
        clearTimeout(toastTimeout);

        toastTitle.textContent = title;
        toastMessage.textContent = message;
        toast.classList.add("active");

        toastTimeout = setTimeout(() => {
            toast.classList.remove("active");
        }, TOAST_DURATION_MS);
    }

    toastClose.addEventListener("click", () => {
        clearTimeout(toastTimeout);
        toast.classList.remove("active");
    });


    /* =====================================================
       7. PUBLIC SITE NAVIGATION
    ===================================================== */

    function setMobileMenu(open) {
        navMenu.classList.toggle("active", open);
        mobileMenuBtn.setAttribute("aria-expanded", String(open));
        mobileMenuBtn.innerHTML = open
            ? '<i class="fa-solid fa-xmark"></i>'
            : '<i class="fa-solid fa-bars"></i>';
    }

    mobileMenuBtn.addEventListener("click", () => {
        setMobileMenu(!navMenu.classList.contains("active"));
    });

    document.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("click", () => setMobileMenu(false));
    });

    /* Logo / "home" links. Logs the user out if one is signed in. */
    document.querySelectorAll('[data-view="home"]').forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();

            if (currentUser) {
                currentUser = null;
                clearSession();
            }

            showHome();
        });
    });


    /* =====================================================
       8. MODALS
    ===================================================== */

    function openModal(type) {
        modalOverlay.classList.add("active");
        document.body.classList.add("modal-open");

        loginModal.classList.remove("active");
        signupModal.classList.remove("active");

        clearMessage(loginMessage);
        clearMessage(signupMessage);

        if (type === "login") {
            loginModal.classList.add("active");
            setTimeout(() => $("loginUsername")?.focus(), 50);
        }

        if (type === "signup") {
            signupModal.classList.add("active");
            setTimeout(() => $("signupName")?.focus(), 50);
        }
    }

    function closeModal() {
        modalOverlay.classList.remove("active");
        document.body.classList.remove("modal-open");

        loginModal.classList.remove("active");
        signupModal.classList.remove("active");

        clearMessage(loginMessage);
        clearMessage(signupMessage);
    }

    document.querySelectorAll(".login-trigger").forEach(button => {
        button.addEventListener("click", () => openModal("login"));
    });

    document
        .querySelectorAll(".open-account-trigger, .nav-open-account")
        .forEach(button => {
            button.addEventListener("click", () => openModal("signup"));
        });

    document.querySelectorAll("[data-close-modal]").forEach(button => {
        button.addEventListener("click", closeModal);
    });

    document.querySelectorAll(".switch-modal").forEach(button => {
        button.addEventListener("click", () => openModal(button.dataset.switch));
    });

    /* Click on the backdrop closes the modal */
    modalOverlay.addEventListener("click", event => {
        if (event.target === modalOverlay) closeModal();
    });

    /* Escape closes modal and mobile sidebar */
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        if (modalOverlay.classList.contains("active")) closeModal();
        dashboardSidebar.classList.remove("active");
    });


    /* =====================================================
       9. PASSWORD VISIBILITY TOGGLES
    ===================================================== */

    document.querySelectorAll(".password-toggle").forEach(button => {
        button.addEventListener("click", () => {
            const input = $(button.dataset.target);
            if (!input) return;

            const icon = button.querySelector("i");
            const showing = input.type === "text";

            input.type = showing ? "password" : "text";
            icon.className = showing ? "fa-regular fa-eye" : "fa-regular fa-eye-slash";
            button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        });
    });


    /* =====================================================
       ACCOUNT NUMBERS
    ===================================================== */

    /* Unique 10-digit account number (never starts with 0) */
    function generateAccountNumber(users, extraTaken = []) {
        const taken = new Set(extraTaken);
        users.forEach(user => {
            if (user.checkingNumber) taken.add(user.checkingNumber);
            if (user.savingsNumber) taken.add(user.savingsNumber);
        });

        let number;
        do {
            const bytes = crypto.getRandomValues(new Uint8Array(10));
            number = String(1 + (bytes[0] % 9)) +
                Array.from(bytes.slice(1), b => b % 10).join("");
        } while (taken.has(number));

        return number;
    }

    /* Give every existing account a number if it doesn't have one yet */
    function ensureAccountNumbers() {
        const users = getStoredUsers();
        let changed = false;

        users.forEach(user => {
            if (!user.checkingNumber) { user.checkingNumber = generateAccountNumber(users); changed = true; }
            if (!user.savingsNumber)  { user.savingsNumber  = generateAccountNumber(users); changed = true; }
        });

        if (changed) saveStoredUsers(users);
    }

    const last4 = number => String(number || "").slice(-4);


    /* =====================================================
       TRANSFER PIN
    ===================================================== */

    const PIN_MAX_ATTEMPTS = 3;
    const PIN_LOCK_MINUTES = 15;

    /* Salted with the user id. A 4-digit PIN is always weak against
       offline guessing, so real verification must happen on a server. */
    function hashPin(userId, pin) {
        return hashPassword(`${userId}:pin:${pin}`);
    }

    function validateNewPin(pin, confirm) {
        if (!/^\d{4}$/.test(pin)) return "Your transfer PIN must be exactly 4 digits.";
        if (pin !== confirm) return "The PINs do not match.";
        if (/^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0123", "3210"].includes(pin)) {
            return "Choose a PIN that isn't easy to guess (like 1111 or 1234).";
        }
        return null;
    }

    /* Returns null when the PIN is correct, otherwise an error message */
    async function verifyTransferPin(pin) {
        if (!currentUser) return "Please log in to make a transfer.";

        if (!currentUser.pinHash) {
            return "Set up your transfer PIN in Settings before sending money.";
        }

        const now = Date.now();

        if (currentUser.pinLockedUntil && now < currentUser.pinLockedUntil) {
            const minutes = Math.ceil((currentUser.pinLockedUntil - now) / 60000);
            return `Too many incorrect PIN attempts. Try again in ${minutes} minute(s).`;
        }

        if (!/^\d{4}$/.test(pin)) return "Enter your 4-digit transfer PIN.";

        const matches = (await hashPin(currentUser.id, pin)) === currentUser.pinHash;
        if (!currentUser) return "Please log in to make a transfer.";

        if (matches) {
            currentUser.pinFailures = 0;
            currentUser.pinLockedUntil = 0;
            persistUser(currentUser);
            return null;
        }

        currentUser.pinFailures = (currentUser.pinFailures || 0) + 1;

        if (currentUser.pinFailures >= PIN_MAX_ATTEMPTS) {
            currentUser.pinFailures = 0;
            currentUser.pinLockedUntil = now + PIN_LOCK_MINUTES * 60000;
            persistUser(currentUser);
            return `Incorrect PIN. Transfers are locked for ${PIN_LOCK_MINUTES} minutes.`;
        }

        persistUser(currentUser);
        return `Incorrect PIN. ${PIN_MAX_ATTEMPTS - currentUser.pinFailures} attempt(s) left.`;
    }

    /* Adds the PIN fields to the sign-up form (no HTML change needed) */
    function buildSignupPinFields() {
        const group = $("signupPassword")?.closest(".form-group");
        if (!group || $("signupPin")) return;

        const pinGroup = (id, label, placeholder, help = "") => `
            <div class="form-group">
                <label for="${id}">${label}</label>
                <div class="input-wrapper">
                    <i class="fa-solid fa-key"></i>
                    <input type="password" id="${id}" inputmode="numeric" maxlength="4"
                           placeholder="${placeholder}" autocomplete="off" required>
                </div>
                ${help ? `<small class="input-help">${help}</small>` : ""}
            </div>`;

        group.insertAdjacentHTML(
            "afterend",
            pinGroup("signupPin", "Transfer PIN", "Create a 4-digit PIN", "You'll enter this PIN to approve every transfer.") +
            pinGroup("signupPin2", "Confirm transfer PIN", "Re-enter your PIN")
        );
    }


    /* =====================================================
       10. AUTHENTICATION
    ===================================================== */

    /* Make sure the demo account exists in storage so that
       sessions restore and transfers persist for it. */
    async function ensureDemoAccount() {
        const users = getStoredUsers();

        if (users.some(user => user.id === DEMO_ACCOUNT.id)) return;

        const { password, ...rest } = DEMO_ACCOUNT;

        users.push({
            ...rest,
            passwordHash: await hashPassword(password),
            transactions: [
                {
                    description: "Opening Balance",
                    date: getTodayShort(),
                    amount: DEMO_ACCOUNT.checkingBalance,
                    type: "income",
                    status: "Completed"
                }
            ]
        });

        saveStoredUsers(users);
    }

    /* ---------- Sign up ---------- */

    signupForm.addEventListener("submit", async event => {
        event.preventDefault();
        clearMessage(signupMessage);

        const name = $("signupName").value.trim();
        const email = $("signupEmail").value.trim().toLowerCase();
        const password = $("signupPassword").value;

        if (name.length < 2) {
            showMessage(signupMessage, "Please enter your full name.");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showMessage(signupMessage, "Please enter a valid email address.");
            return;
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            showMessage(
                signupMessage,
                `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
            );
            return;
        }

        const pinError = validateNewPin($("signupPin").value, $("signupPin2").value);
        if (pinError) {
            showMessage(signupMessage, pinError);
            return;
        }

        const users = getStoredUsers();

        if (users.some(user => user.email === email)) {
            showMessage(signupMessage, "An account with this email already exists.");
            return;
        }

        const id = `user-${Date.now()}`;
        const pinHash = await hashPin(id, $("signupPin").value);
        const checkingNumber = generateAccountNumber(users);
        const savingsNumber = generateAccountNumber(users, [checkingNumber]);

        users.push({
            id,
            pinHash,
            checkingNumber,
            savingsNumber,
            name,
            username: email,
            email,
            passwordHash: await hashPassword(password),
            checkingBalance: NEW_ACCOUNT_CHECKING,
            savingsBalance: NEW_ACCOUNT_SAVINGS,
            transactions: createStartingTransactions()
        });

        saveStoredUsers(users);

        showMessage(signupMessage, "Account created successfully!", "success");

        setTimeout(() => {
            signupForm.reset();
            openModal("login");

            $("loginUsername").value = email;

            showMessage(
                loginMessage,
                "Your account is ready. Please log in.",
                "success"
            );
        }, 900);
    });

    /* ---------- Log in ---------- */

    loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        clearMessage(loginMessage);

        const identifier = $("loginUsername").value.trim();
        const password = $("loginPassword").value;

        if (!identifier || !password) {
            showMessage(loginMessage, "Please enter your username and password.");
            return;
        }

        const lookup = identifier.toLowerCase();
        const passwordHash = await hashPassword(password);

        const user = getStoredUsers().find(item =>
            (item.username || "").toLowerCase() === lookup ||
            (item.email || "").toLowerCase() === lookup
        );

        /* Same message for unknown user and wrong password */
        if (!user || user.passwordHash !== passwordHash) {
            showMessage(loginMessage, "Incorrect username or password.");
            return;
        }

        currentUser = user;
        saveSession(user.id);

        closeModal();
        loginForm.reset();
        showDashboard();

        showToast("Welcome back", `Good to see you, ${getFirstName(user.name)}.`);
    });

    /* ---------- Log out ---------- */

    logoutBtn.addEventListener("click", () => {
        currentUser = null;
        clearSession();

        showHome();

        showToast("Logged out", "You have been safely logged out.");
    });

    /* ---------- Restore session on page load ---------- */

    function restoreSession() {
        /* Remove the old session format (it contained the password) */
        try {
            localStorage.removeItem(STORAGE_KEYS.legacySession);
        } catch (error) { /* ignore */ }

        const userId = getSessionUserId();
        if (!userId) return;

        const storedUser = getStoredUsers().find(user => user.id === userId);

        if (storedUser) {
            currentUser = storedUser;
            showDashboard();
        } else {
            clearSession();
        }
    }


    /* =====================================================
       11. DASHBOARD RENDERING
    ===================================================== */

    function showDashboard() {
        homeView.classList.remove("active");
        dashboardView.classList.add("active");
        settlePendingTransfers();
        refreshSupportChat();

        updateDashboard();

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function showHome() {
        dashboardView.classList.remove("active");
        homeView.classList.add("active");

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function updateDashboard() {
        if (!currentUser) return;

        const initials = getInitials(currentUser.name);

        $("dashboardUserName").textContent = getFirstName(currentUser.name);
        $("sidebarUserName").textContent = currentUser.name;

        $("dashboardAvatar").textContent = initials;
        $("sidebarAvatar").textContent = initials;

        $("dashboardDate").textContent = getTodayLong();

        renderBalances();
        renderTransactions();
    }

    /* Balances are always rendered from state, so the hide/show
       toggle can never get out of sync after a transfer. */
    function renderBalances() {
        if (!currentUser) return;

        const checkingTag = document.querySelector(".balance-card.checking .balance-card-top small");
        const savingsTag = document.querySelector(".balance-card.savings .balance-card-top small");
        if (checkingTag) checkingTag.textContent = `•••• ${last4(currentUser.checkingNumber)}`;
        if (savingsTag) savingsTag.textContent = `•••• ${last4(currentUser.savingsNumber)}`;

        const balances = {
            checking: { elementId: "checkingBalance", value: currentUser.checkingBalance },
            savings:  { elementId: "savingsBalance",  value: currentUser.savingsBalance }
        };

        Object.entries(balances).forEach(([type, { elementId, value }]) => {
            const element = $(elementId);
            const hidden = hiddenBalances[type];

            element.textContent = hidden ? HIDDEN_BALANCE_TEXT : formatCurrency(value);
            element.dataset.hidden = String(hidden);

            const icon = document.querySelector(`.balance-eye[data-balance="${type}"] i`);
            if (icon) {
                icon.className = hidden ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
            }
        });
    }


    /* =====================================================
       12. TRANSACTIONS
    ===================================================== */

    function renderTransactions() {
        if (!currentUser) return;

        transactionsList.innerHTML = "";

        const transactions = currentUser.transactions || [];

        if (transactions.length === 0) {
            transactionsList.innerHTML = `
                <div class="empty-transactions">No transactions yet.</div>
            `;
            return;
        }

        transactions.forEach(transaction => {
            const isIncome = transaction.type === "income";

            const amount = isIncome
                ? `+${formatCurrency(transaction.amount)}`
                : formatCurrency(transaction.amount);

            const row = document.createElement("div");
            row.className = "transaction-row";

            row.innerHTML = `
                <div class="transaction-info">
                    <div class="transaction-icon ${isIncome ? "income" : ""}">
                        <i class="fa-solid ${isIncome ? "fa-arrow-down" : "fa-arrow-up"}"></i>
                    </div>
                    <div>
                        <strong>${escapeHTML(transaction.description)}</strong>
                        <span>${isIncome ? "Money received" : "Payment"}</span>
                    </div>
                </div>

                <div class="transaction-date">${escapeHTML(transaction.date)}</div>

                <div class="transaction-amount ${isIncome ? "income" : ""}">${amount}</div>

                <div class="transaction-status status-${escapeHTML(String(transaction.status).toLowerCase())}">${escapeHTML(transaction.status)}</div>
            `;

            transactionsList.appendChild(row);
        });
    }


    /* =====================================================
       13. TRANSFERS & RECEIPTS
    ===================================================== */

    const TRANSFER_TYPES = {
        ach:  { label: "ACH transfer",  fee: 0,  eta: "1–3 business days", delayMs: 2 * 60 * 1000 },
        wire: { label: "Domestic wire", fee: 25, eta: "Same business day if sent before 4:00 PM ET", delayMs: 30 * 1000 }
    };

    const esc = value => escapeHTML(String(value ?? "")).replace(/"/g, "&quot;");

    /* ABA routing number checksum */
    function isValidRoutingNumber(value) {
        if (!/^\d{9}$/.test(value)) return false;
        const d = value.split("").map(Number);
        return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
    }

    function generateConfirmationNumber() {
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        return `NXB-${Date.now().toString(36).toUpperCase()}-${rand}`;
    }

    function buildTransferForm() {
        transferForm.className = "transfer-form transfer-form-full";
        transferForm.innerHTML = `
            <div class="form-group">
                <label for="transferType">Transfer type</label>
                <div class="input-wrapper plain"><select id="transferType">
                    <option value="ach">ACH transfer – free, 1–3 business days</option>
                    <option value="wire">Domestic wire – $25 fee, same day</option>
                </select></div>
            </div>
            <div class="form-group">
                <label for="recipient">Recipient full name</label>
                <div class="input-wrapper plain"><input type="text" id="recipient" placeholder="Name on the account" autocomplete="off" required></div>
            </div>
            <div class="form-group">
                <label for="routingNumber">Routing number (ABA)</label>
                <div class="input-wrapper plain"><input type="text" id="routingNumber" inputmode="numeric" maxlength="9" placeholder="9 digits" autocomplete="off" required></div>
            </div>
            <div class="form-group">
                <label for="accountNumber">Account number</label>
                <div class="input-wrapper plain"><input type="text" id="accountNumber" inputmode="numeric" maxlength="17" placeholder="4–17 digits" autocomplete="off" required></div>
            </div>
            <div class="form-group">
                <label for="recipientAccountType">Recipient account type</label>
                <div class="input-wrapper plain"><select id="recipientAccountType">
                    <option value="Checking">Checking</option>
                    <option value="Savings">Savings</option>
                </select></div>
            </div>
            <div class="form-group">
                <label for="transferAmount">Amount (USD)</label>
                <div class="input-wrapper">
                    <span class="currency-symbol">$</span>
                    <input type="number" id="transferAmount" placeholder="0.00" min="0.01" step="0.01" required>
                </div>
            </div>
            <div class="form-group span-2">
                <label for="transferMemo">Memo (optional)</label>
                <div class="input-wrapper plain"><input type="text" id="transferMemo" maxlength="60" placeholder="e.g. Rent for November"></div>
            </div>
            <div class="form-group span-2">
                <label for="transferPin">Transfer PIN</label>
                <div class="input-wrapper plain"><input type="password" id="transferPin" inputmode="numeric" maxlength="4" placeholder="Enter your 4-digit PIN" autocomplete="off" required></div>
            </div>
            <label class="checkbox-label span-2">
                <input type="checkbox" id="transferAuthorize">
                <span></span>
                I authorize UnitedBank to send this transfer and confirm the details above are correct.
            </label>
            <button type="submit" class="btn btn-primary transfer-btn span-2">
                Send money <i class="fa-solid fa-arrow-right"></i>
            </button>`;
    }

    function findAccountByNumber(users, number) {
        for (const user of users) {
            if (user.checkingNumber === number) return { user, kind: "checking" };
            if (user.savingsNumber === number) return { user, kind: "savings" };
        }
        return null;
    }

    /* Simulated settlement. PLACEHOLDER: a real bank's servers decide
       when a transfer completes or is returned. */
    const SIMULATED_FAILURE_RATE = 0;     // 0 to 1: chance an outgoing transfer is returned
    const SIMULATED_FAIL_SUFFIX = "0000"; // account numbers ending like this always fail (for testing)

    async function handleTransfer() {
        clearMessage(transferMessage);

        if (!currentUser) return showMessage(transferMessage, "Please log in to make a transfer.");

        /* Pick up changes made elsewhere (e.g. an incoming transfer in another tab) */
        const latest = getStoredUsers().find(user => user.id === currentUser.id);
        if (latest) currentUser = latest;

        const type = TRANSFER_TYPES[$("transferType").value] || TRANSFER_TYPES.ach;
        const recipient = $("recipient").value.trim();
        const routing = $("routingNumber").value.replace(/\s/g, "");
        const accountNumber = $("accountNumber").value.replace(/\s/g, "");
        const accountType = $("recipientAccountType").value;
        const memo = $("transferMemo").value.trim();
        const amount = roundToCents(Number($("transferAmount").value));

        if (recipient.length < 2) return showMessage(transferMessage, "Enter the recipient's full name.");
        if (!isValidRoutingNumber(routing)) return showMessage(transferMessage, "Enter a valid 9-digit routing number.");
        if (!/^\d{4,17}$/.test(accountNumber)) return showMessage(transferMessage, "Account number must be 4–17 digits.");
        if (!Number.isFinite(amount) || amount < 0.01) return showMessage(transferMessage, "Please enter a valid amount.");

        const isBankRouting = routing === BANK_ROUTING_NUMBER;
        const resolve = () => {
            const users = getStoredUsers();
            return { users, match: isBankRouting ? findAccountByNumber(users, accountNumber) : null };
        };

        const notFound = "We couldn't find a UnitedBank account with that number.";
        let { match } = resolve();

        if (isBankRouting && !match) return showMessage(transferMessage, notFound);
        if (match && match.user.id === currentUser.id && match.kind === "checking") {
            return showMessage(transferMessage, "You can't send money to the account you're sending from.");
        }

        const internal = Boolean(match);
        const fee = internal ? 0 : type.fee;
        const total = roundToCents(amount + fee);

        if (total > currentUser.checkingBalance) {
            return showMessage(transferMessage, "Insufficient funds (the amount plus any fee exceeds your available balance).");
        }
        if (!$("transferAuthorize").checked) {
            return showMessage(transferMessage, "Please authorize the transfer to continue.");
        }

        const pinError = await verifyTransferPin($("transferPin").value);
        if (!currentUser) return;
        if (pinError) {
            $("transferPin").value = "";
            return showMessage(transferMessage, pinError);
        }

        /* Re-read after the PIN check in case anything changed */
        const fresh = resolve();
        const users = fresh.users;
        match = fresh.match;
        if (internal && !match) return showMessage(transferMessage, notFound);

        const willFail = !internal &&
            (accountNumber.endsWith(SIMULATED_FAIL_SUFFIX) || Math.random() < SIMULATED_FAILURE_RATE);

        const receipt = {
            id: generateConfirmationNumber(),
            createdAt: new Date().toISOString(),
            typeLabel: type.label,
            status: internal ? "Completed" : "Processing",
            internal,
            settlesAt: internal ? null : Date.now() + type.delayMs,
            outcome: willFail ? "failed" : "completed",
            fromLabel: `Checking •••• ${last4(currentUser.checkingNumber)}`,
            senderName: currentUser.name,
            recipient,
            routing,
            accountLast4: accountNumber.slice(-4),
            accountType,
            amount,
            fee,
            total,
            eta: internal ? "Instant" : type.eta,
            memo
        };

        currentUser.checkingBalance = roundToCents(currentUser.checkingBalance - total);
        if (!Array.isArray(currentUser.transactions)) currentUser.transactions = [];

        currentUser.transactions.unshift({
            description: `${type.label} to ${recipient}`,
            date: getTodayShort(),
            amount: -total,
            type: "expense",
            status: receipt.status,
            receipt
        });

        if (internal) {
            const sameUser = match.user.id === currentUser.id;
            const target = sameUser ? currentUser : match.user;
            const balanceKey = match.kind === "checking" ? "checkingBalance" : "savingsBalance";

            target[balanceKey] = roundToCents((target[balanceKey] || 0) + amount);
            target.transactions = [{
                description: sameUser ? "Transfer from Checking" : `Transfer from ${currentUser.name}`,
                date: getTodayShort(),
                amount,
                type: "income",
                status: "Completed",
                receipt: {
                    ...receipt,
                    direction: "in",
                    recipient: target.name,
                    toLabel: `${match.kind === "checking" ? "Checking" : "Savings"} •••• ${last4(target[match.kind === "checking" ? "checkingNumber" : "savingsNumber"])}`,
                    fee: 0,
                    total: amount
                }
            }, ...(target.transactions || [])].slice(0, MAX_TRANSACTIONS);
        }

        currentUser.transactions = currentUser.transactions.slice(0, MAX_TRANSACTIONS);

        /* Save sender and recipient together */
        const index = users.findIndex(user => user.id === currentUser.id);
        if (index === -1) users.push(currentUser); else users[index] = currentUser;
        saveStoredUsers(users);

        transferForm.reset();
        updateDashboard();
        showReceipt(receipt);
    }

    /* ---------- Settlement of outgoing transfers ---------- */

    function settlePendingTransfers() {
        if (!currentUser || !Array.isArray(currentUser.transactions)) return;

        const now = Date.now();
        const returns = [];
        const events = [];

        currentUser.transactions.forEach(tx => {
            const r = tx.receipt;
            if (!r || r.status !== "Processing" || !r.settlesAt || r.settlesAt > now) return;

            if (r.outcome === "failed") {
                r.status = "Failed";
                tx.status = "Failed";
                r.failureReason = "The receiving bank could not locate the account.";
                currentUser.checkingBalance = roundToCents(currentUser.checkingBalance + r.total);
                returns.push({
                    description: `Returned transfer – ${r.recipient}`,
                    date: getTodayShort(),
                    amount: r.total,
                    type: "income",
                    status: "Completed"
                });
            } else {
                r.status = "Completed";
                tx.status = "Completed";
            }

            events.push(r);
        });

        if (events.length === 0) return;

        currentUser.transactions = [...returns, ...currentUser.transactions].slice(0, MAX_TRANSACTIONS);
        persistUser(currentUser);
        updateDashboard();

        events.forEach(r => {
            if (r.status === "Failed") {
                showToast("Transfer failed", `${formatCurrency(r.total)} was returned to your checking account.`);
            } else {
                showToast("Transfer completed", `${formatCurrency(r.amount)} to ${r.recipient} was delivered.`);
            }
            if (openReceiptId === r.id) showReceipt(r);
        });
    }

    function startBackgroundTasks() {
        setInterval(() => {
            settlePendingTransfers();
            refreshSupportChat();
        }, 5000);

        /* Another tab changed the data (e.g. an incoming transfer) */
        window.addEventListener("storage", event => {
            if (event.key !== STORAGE_KEYS.users || !currentUser) return;

            const latest = getStoredUsers().find(user => user.id === currentUser.id);
            if (latest) {
                currentUser = latest;
                updateDashboard();
            }
        });
    }

        /* Ignore double-clicks while a transfer is being verified */
    let transferBusy = false;

    transferForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (transferBusy) return;

        transferBusy = true;
        try {
            await handleTransfer();
        } finally {
            transferBusy = false;
        }
    });

    /* ---------- Receipt ---------- */

    let receiptOverlay = null;
    let openReceiptId = null;

    function showReceipt(r) {
        openReceiptId = r.id;
        if (!receiptOverlay) {
            receiptOverlay = document.createElement("div");
            receiptOverlay.id = "receiptOverlay";
            receiptOverlay.className = "modal-overlay";
            document.body.appendChild(receiptOverlay);

            receiptOverlay.addEventListener("click", e => {
                if (e.target === receiptOverlay || e.target.closest("[data-receipt-close]")) closeReceipt();
                else if (e.target.closest("[data-receipt-print]")) window.print();
            });
        }

        const when = new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium", timeStyle: "short", timeZoneName: "short"
        }).format(new Date(r.createdAt));

        const row = (label, value) => `<div class="receipt-row"><span>${label}</span><strong>${value}</strong></div>`;

        const failed = r.status === "Failed";
        const incoming = r.direction === "in";
        const heading = incoming ? "Payment received" : failed ? "Transfer failed" : r.status === "Completed" ? "Transfer completed" : "Transfer submitted";
        const icon = failed ? "fa-circle-xmark" : r.status === "Completed" ? "fa-circle-check" : "fa-clock";

        receiptOverlay.innerHTML = `
            <div class="modal receipt active" role="dialog" aria-modal="true" aria-label="Transfer receipt">
                <button class="modal-close" data-receipt-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
                <div class="receipt-head">
                    <div class="modal-icon ${failed ? "failed-icon" : "signup-icon"}"><i class="fa-solid ${icon}"></i></div>
                    <h2>${heading}</h2>
                    <p class="receipt-amount">${formatCurrency(r.amount)}</p>
                    <span class="transaction-status status-${esc(r.status.toLowerCase())}">${esc(r.status)}</span>
                </div>
                <div class="receipt-body">
                    ${row("Confirmation no.", esc(r.id))}
                    ${row("Date &amp; time", esc(when))}
                    ${row("Transfer type", esc(r.typeLabel))}
                    ${row("From", `${esc(r.senderName)} · ${esc(r.fromLabel)}`)}
                    ${row("To", incoming ? `${esc(r.recipient)} · ${esc(r.toLabel)}` : esc(r.recipient))}
                    ${incoming ? "" : row("Recipient account", `${esc(r.accountType)} •••• ${esc(r.accountLast4)}`)}
                    ${row("Routing number", esc(r.routing))}
                    ${r.memo ? row("Memo", esc(r.memo)) : ""}
                    ${row("Estimated arrival", esc(r.eta))}
                    ${r.failureReason ? row("Reason", esc(r.failureReason)) : ""}
                    ${row("Amount", formatCurrency(r.amount))}
                    ${row("Fee", formatCurrency(r.fee))}
                    <div class="receipt-row receipt-total"><span>${incoming ? "Amount received" : "Total debited"}</span><strong>${formatCurrency(r.total)}</strong></div>
                </div>
                <p class="receipt-note">${failed ? "This transfer was not completed. The full amount, including any fee, has been returned to your checking account." : "Keep this receipt for your records. Contact support promptly if you did not authorize this transfer."}</p>
                <div class="receipt-actions">
                    <button class="btn btn-outline" data-receipt-print><i class="fa-solid fa-print"></i> Print / Save PDF</button>
                    <button class="btn btn-primary" data-receipt-close>Done</button>
                </div>
            </div>`;

        receiptOverlay.classList.add("active");
        document.body.classList.add("modal-open");
    }

    function closeReceipt() {
        openReceiptId = null;
        if (!receiptOverlay) return;
        receiptOverlay.classList.remove("active");
        document.body.classList.remove("modal-open");
    }

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeReceipt();
    });

    /* Click a past transaction to reopen its receipt */
    transactionsList.addEventListener("click", event => {
        const row = event.target.closest(".transaction-row");
        if (!row || !currentUser) return;

        const index = Array.from(transactionsList.children).indexOf(row);
        const receipt = currentUser.transactions[index]?.receipt;
        if (receipt) showReceipt(receipt);
    });


    /* =====================================================
       13b. DASHBOARD PANELS (Cards, Insights, Settings)
    ===================================================== */

    const PANEL_ORDER = ["overview", "transfers", "cards", "insights", "settings"];

    const DEFAULT_SETTINGS = {
        twoStep: false, biometric: false,
        alertTransactions: true, alertLowBalance: true, alertSecurity: true,
        channelEmail: true, channelSms: false, channelPush: true,
        paperless: true, marketing: false,
        profile: { phone: "", street: "", city: "", state: "", zip: "" }
    };

    let overviewNodes = [];
    let panelEl = null;

    function getSettings() {
        const saved = currentUser?.settings || {};
        return { ...DEFAULT_SETTINGS, ...saved, profile: { ...DEFAULT_SETTINGS.profile, ...(saved.profile || {}) } };
    }

    function comingSoonHTML(icon, title, text) {
        return `<div class="coming-soon">
            <div class="coming-soon-icon"><i class="fa-solid ${icon}"></i></div>
            <span class="section-label">COMING SOON</span>
            <h2>${title}</h2>
            <p>${text}</p>
        </div>`;
    }

    function toggleRow(key, label, description, checked) {
        return `<label class="setting-row">
            <span><strong>${label}</strong><small>${description}</small></span>
            <span class="switch"><input type="checkbox" data-setting="${key}" ${checked ? "checked" : ""}><i></i></span>
        </label>`;
    }

    function field(id, label, value = "", extra = "") {
        return `<div class="form-group"><label for="${id}">${label}</label>
            <div class="input-wrapper plain"><input id="${id}" value="${esc(value)}" ${extra}></div></div>`;
    }

    function settingsHTML() {
        const s = getSettings(), p = s.profile;

        return `
        <div class="dashboard-section-header"><div><span class="section-label">ACCOUNT</span><h2>Settings</h2></div></div>
        <div class="settings-grid">
            <section class="settings-card">
                <h3>Account details</h3>
                <div class="acct-row"><span>Checking</span><strong data-masked="•••• ${last4(currentUser.checkingNumber)}" data-full="${esc(currentUser.checkingNumber)}">•••• ${last4(currentUser.checkingNumber)}</strong><button type="button" class="link-btn" data-reveal>Show</button><button type="button" class="link-btn" data-copy="${esc(currentUser.checkingNumber)}">Copy</button></div>
                <div class="acct-row"><span>Savings</span><strong data-masked="•••• ${last4(currentUser.savingsNumber)}" data-full="${esc(currentUser.savingsNumber)}">•••• ${last4(currentUser.savingsNumber)}</strong><button type="button" class="link-btn" data-reveal>Show</button><button type="button" class="link-btn" data-copy="${esc(currentUser.savingsNumber)}">Copy</button></div>
                <div class="acct-row"><span>Routing number</span><strong>${esc(BANK_ROUTING_NUMBER)}</strong><button type="button" class="link-btn" data-copy="${esc(BANK_ROUTING_NUMBER)}">Copy</button></div>
            </section>

            <section class="settings-card">
                <h3>Transfer PIN</h3>
                <p class="settings-note">${currentUser.pinHash ? "Your transfer PIN is set. You can change it below." : "You haven't set a transfer PIN yet. You need one to send money."}</p>
                <form id="pinForm" novalidate>
                    <div class="form-group"><label for="pinPw">Account password</label><div class="input-wrapper plain"><input id="pinPw" type="password" autocomplete="current-password"></div></div>
                    <div class="form-group"><label for="newPin">${currentUser.pinHash ? "New" : "Create"} 4-digit PIN</label><div class="input-wrapper plain"><input id="newPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div></div>
                    <div class="form-group"><label for="newPin2">Confirm PIN</label><div class="input-wrapper plain"><input id="newPin2" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div></div>
                    <button class="btn btn-outline" type="submit">${currentUser.pinHash ? "Change PIN" : "Set PIN"}</button>
                    <div class="form-message" role="alert"></div>
                </form>
            </section>

            <section class="settings-card">
                <h3>Profile &amp; contact</h3>
                <form id="profileForm" novalidate>
                    ${field("setName", "Full name", currentUser.name, 'autocomplete="name"')}
                    ${field("setEmail", "Email / username", currentUser.email || "", "readonly")}
                    ${field("setPhone", "Mobile phone", p.phone, 'inputmode="tel" placeholder="(555) 555-5555" autocomplete="tel"')}
                    ${field("setStreet", "Mailing address", p.street, 'autocomplete="address-line1"')}
                    ${field("setCity", "City", p.city, 'autocomplete="address-level2"')}
                    <div class="settings-two">
                        ${field("setState", "State", p.state, 'maxlength="2" placeholder="NY" autocomplete="address-level1"')}
                        ${field("setZip", "ZIP code", p.zip, 'inputmode="numeric" maxlength="10" autocomplete="postal-code"')}
                    </div>
                    <button class="btn btn-primary" type="submit">Save changes</button>
                    <div class="form-message" role="alert"></div>
                </form>
            </section>

            <section class="settings-card">
                <h3>Security</h3>
                <form id="passwordForm" novalidate>
                    <div class="form-group"><label for="curPw">Current password</label><div class="input-wrapper plain"><input id="curPw" type="password" autocomplete="current-password"></div></div>
                    <div class="form-group"><label for="newPw">New password</label><div class="input-wrapper plain"><input id="newPw" type="password" autocomplete="new-password"></div><small class="input-help">At least 8 characters.</small></div>
                    <div class="form-group"><label for="newPw2">Confirm new password</label><div class="input-wrapper plain"><input id="newPw2" type="password" autocomplete="new-password"></div></div>
                    <button class="btn btn-outline" type="submit">Update password</button>
                    <div class="form-message" role="alert"></div>
                </form>
                ${toggleRow("twoStep", "Two-step verification", "Require a one-time code on new devices", s.twoStep)}
                ${toggleRow("biometric", "Face ID / fingerprint", "Quick sign-in on supported mobile devices", s.biometric)}
            </section>

            <section class="settings-card">
                <h3>Alerts &amp; notifications</h3>
                ${toggleRow("alertTransactions", "Transaction alerts", "Transfers and payments on your account", s.alertTransactions)}
                ${toggleRow("alertLowBalance", "Low balance alerts", "When checking falls below $100", s.alertLowBalance)}
                ${toggleRow("alertSecurity", "Security alerts", "Password changes and new sign-ins", s.alertSecurity)}
                ${toggleRow("channelEmail", "Email", "Send alerts by email", s.channelEmail)}
                ${toggleRow("channelSms", "Text message", "Send alerts by SMS", s.channelSms)}
                ${toggleRow("channelPush", "Push notifications", "Send alerts to the mobile app", s.channelPush)}
            </section>

            <section class="settings-card">
                <h3>Statements &amp; privacy</h3>
                ${toggleRow("paperless", "Paperless statements", "Receive e-statements and tax documents online", s.paperless)}
                ${toggleRow("marketing", "Offers &amp; promotions", "Allow marketing messages from UnitedBank", s.marketing)}
                <div class="settings-links"><a href="#">Privacy policy</a><a href="#">Terms &amp; conditions</a><a href="#">Contact support</a></div>
            </section>
        </div>`;
    }

    function buildPanels() {
        overviewNodes = Array.from(dashboardContent.children);

        panelEl = document.createElement("div");
        panelEl.id = "dashboardPanel";
        panelEl.hidden = true;
        dashboardContent.appendChild(panelEl);

        document.querySelectorAll(".dashboard-nav-item").forEach((button, i) => {
            button.addEventListener("click", () => showPanel(PANEL_ORDER[i] || "overview"));
        });

        logoutBtn.addEventListener("click", () => showPanel("overview"));

        panelEl.addEventListener("click", async event => {
            const reveal = event.target.closest("[data-reveal]");
            const copy = event.target.closest("[data-copy]");

            if (reveal) {
                const value = reveal.previousElementSibling;
                const showing = reveal.textContent === "Hide";
                value.textContent = showing ? value.dataset.masked : value.dataset.full;
                reveal.textContent = showing ? "Show" : "Hide";
            }

            if (copy) {
                try {
                    await navigator.clipboard.writeText(copy.dataset.copy);
                    showToast("Copied", "Copied to your clipboard.");
                } catch (error) {
                    showToast("Copy failed", "Select the number and copy it manually.");
                }
            }
        });

        panelEl.addEventListener("change", event => {
            const key = event.target.dataset.setting;
            if (!key || !currentUser) return;

            currentUser.settings = { ...getSettings(), [key]: event.target.checked };
            persistUser(currentUser);
            showToast("Settings saved", "Your preference has been updated.");
        });

        panelEl.addEventListener("submit", async event => {
            event.preventDefault();
            const form = event.target;
            const message = form.querySelector(".form-message");
            clearMessage(message);

            if (form.id === "profileForm") {
                const name = $("setName").value.trim();
                const phone = $("setPhone").value.replace(/\D/g, "");
                const state = $("setState").value.trim().toUpperCase();
                const zip = $("setZip").value.trim();

                if (name.length < 2) return showMessage(message, "Please enter your full name.");
                if (phone && phone.length !== 10) return showMessage(message, "Enter a 10-digit US phone number.");
                if (state && !/^[A-Z]{2}$/.test(state)) return showMessage(message, "Use the 2-letter state code.");
                if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return showMessage(message, "Enter a valid ZIP code.");

                currentUser.name = name;
                currentUser.settings = {
                    ...getSettings(),
                    profile: { phone, street: $("setStreet").value.trim(), city: $("setCity").value.trim(), state, zip }
                };
                persistUser(currentUser);
                updateDashboard();
                showMessage(message, "Profile updated.", "success");
            }

            if (form.id === "pinForm") {
                if ((await hashPassword($("pinPw").value)) !== currentUser.passwordHash) {
                    return showMessage(message, "Account password is incorrect.");
                }

                const pinError = validateNewPin($("newPin").value, $("newPin2").value);
                if (pinError) return showMessage(message, pinError);

                currentUser.pinHash = await hashPin(currentUser.id, $("newPin").value);
                currentUser.pinFailures = 0;
                currentUser.pinLockedUntil = 0;
                persistUser(currentUser);

                showPanel("settings");
                const fresh = panelEl.querySelector("#pinForm .form-message");
                if (fresh) showMessage(fresh, "Transfer PIN saved.", "success");
                return;
            }

            if (form.id === "passwordForm") {
                const current = $("curPw").value, next = $("newPw").value;

                if ((await hashPassword(current)) !== currentUser.passwordHash) return showMessage(message, "Current password is incorrect.");
                if (next.length < 8) return showMessage(message, "New password must be at least 8 characters.");
                if (next !== $("newPw2").value) return showMessage(message, "New passwords do not match.");

                currentUser.passwordHash = await hashPassword(next);
                persistUser(currentUser);
                form.reset();
                showMessage(message, "Password updated.", "success");
            }
        });
    }

    function showPanel(name) {
        if (!panelEl) return;

        document.querySelectorAll(".dashboard-nav-item").forEach((item, i) => {
            item.classList.toggle("active", PANEL_ORDER[i] === name);
        });

        const showOverview = name === "overview" || name === "transfers";

        overviewNodes.forEach(node => { node.hidden = !showOverview; });
        panelEl.hidden = showOverview;

        if (name === "cards") {
            panelEl.innerHTML = comingSoonHTML("fa-credit-card", "Cards", "Manage your debit cards, freeze and unfreeze, and set travel notices. We're putting the finishing touches on this.");
        } else if (name === "insights") {
            panelEl.innerHTML = comingSoonHTML("fa-chart-pie", "Insights", "Spending breakdowns, trends and savings tips are on the way.");
        } else if (name === "settings" && currentUser) {
            panelEl.innerHTML = settingsHTML();
        }

        if (name === "transfers") transferForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }


    /* =====================================================
       14. DASHBOARD UI
    ===================================================== */

    dashboardMobileMenu.addEventListener("click", () => {
        dashboardSidebar.classList.toggle("active");
    });

    document.querySelectorAll(".dashboard-nav-item").forEach(button => {
        button.addEventListener("click", () => {
            document
                .querySelectorAll(".dashboard-nav-item")
                .forEach(item => item.classList.remove("active"));

            button.classList.add("active");
            dashboardSidebar.classList.remove("active");
        });
    });

    /* Hide / show balances */
    document.querySelectorAll(".balance-eye").forEach(button => {
        button.addEventListener("click", () => {
            if (!currentUser) return;

            const type = button.dataset.balance === "checking" ? "checking" : "savings";

            hiddenBalances[type] = !hiddenBalances[type];
            renderBalances();
        });
    });

    $("viewAllTransactions").addEventListener("click", () => {
        if (!currentUser) return;

        showToast(
            "Transaction history",
            `Showing your ${currentUser.transactions.length} most recent transactions.`
        );
    });


    /* =====================================================
       CUSTOMER CARE CHAT (customer side)
       Agents reply from support.html
    ===================================================== */

    const SUPPORT_KEY = "UnitedBankSupport";
    const SUPPORT_CATEGORIES = ["General question", "Complaint", "Transfer issue", "Card issue", "Unauthorized activity"];
    let chatOpen = false;

    function getTickets() {
        try {
            const tickets = JSON.parse(localStorage.getItem(SUPPORT_KEY));
            return Array.isArray(tickets) ? tickets : [];
        } catch (error) {
            return [];
        }
    }

    function saveTickets(tickets) {
        try {
            localStorage.setItem(SUPPORT_KEY, JSON.stringify(tickets));
        } catch (error) {
            console.error("Unable to save support data:", error);
        }
    }

    function currentTicket() {
        if (!currentUser) return null;
        return getTickets()
            .filter(ticket => ticket.userId === currentUser.id)
            .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    }

    function sendSupportMessage(text, category) {
        const tickets = getTickets();
        const now = Date.now();

        let ticket = tickets.find(t => t.userId === currentUser.id && t.status === "open");

        if (!ticket) {
            ticket = {
                id: `CMP-${now.toString(36).toUpperCase().slice(-6)}`,
                userId: currentUser.id,
                userName: currentUser.name,
                userEmail: currentUser.email || "",
                category,
                status: "open",
                createdAt: now,
                updatedAt: now,
                unreadAgent: true,
                unreadUser: false,
                messages: []
            };
            tickets.push(ticket);
        }

        ticket.messages.push({ from: "user", text, at: now });
        ticket.updatedAt = now;
        ticket.unreadAgent = true;
        saveTickets(tickets);
    }

    function buildSupportChat() {
        const fab = document.createElement("button");
        fab.id = "chatFab";
        fab.className = "chat-fab";
        fab.setAttribute("aria-label", "Open customer care chat");
        fab.innerHTML = '<i class="fa-solid fa-headset"></i><span class="chat-badge" id="chatBadge" hidden></span>';

        const panel = document.createElement("div");
        panel.id = "chatPanel";
        panel.className = "chat-panel";
        panel.hidden = true;
        panel.innerHTML = `
            <div class="chat-head">
                <div><strong>Customer care</strong><small id="chatRef">We usually reply within a few hours</small></div>
                <button type="button" class="chat-x" id="chatClose" aria-label="Close chat"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="chat-msgs" id="chatMsgs" aria-live="polite"></div>
            <form class="chat-form" id="chatForm">
                <select id="chatCategory" aria-label="Topic">
                    ${SUPPORT_CATEGORIES.map(c => `<option>${c}</option>`).join("")}
                </select>
                <div class="chat-input">
                    <input id="chatInput" maxlength="1000" placeholder="Type your message…" autocomplete="off">
                    <button class="btn btn-primary" type="submit" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
                </div>
            </form>`;

        dashboardView.append(fab, panel);

        const setOpen = open => {
            chatOpen = open;
            panel.hidden = !open;
            if (open) {
                refreshSupportChat();
                $("chatInput").focus();
            }
        };

        fab.addEventListener("click", () => setOpen(!chatOpen));
        $("chatClose").addEventListener("click", () => setOpen(false));
        logoutBtn.addEventListener("click", () => setOpen(false));

        $("chatForm").addEventListener("submit", event => {
            event.preventDefault();
            const text = $("chatInput").value.trim();
            if (!text || !currentUser) return;

            sendSupportMessage(text, $("chatCategory").value);
            $("chatInput").value = "";
            refreshSupportChat();
        });

        window.addEventListener("storage", event => {
            if (event.key === SUPPORT_KEY) refreshSupportChat();
        });
    }

    function refreshSupportChat() {
        const badge = $("chatBadge");
        if (!badge || !currentUser) return;

        const ticket = currentTicket();

        if (chatOpen && ticket?.unreadUser) {
            const tickets = getTickets();
            const stored = tickets.find(t => t.id === ticket.id);
            if (stored) {
                stored.unreadUser = false;
                saveTickets(tickets);
            }
            ticket.unreadUser = false;
        }

        badge.hidden = chatOpen || !ticket?.unreadUser;
        if (!chatOpen) return;

        const isOpen = ticket && ticket.status === "open";
        const time = at => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const bubble = (from, text, at) =>
            `<div class="chat-msg ${from}">${esc(text)}<small>${from === "agent" ? "UnitedBank Support · " : ""}${time(at)}</small></div>`;

        const greeting = `Hi ${esc(getFirstName(currentUser.name))}, how can we help? Choose a topic below and tell us about your question or complaint.`;
        let html = `<div class="chat-msg agent">${greeting}</div>`;

        if (ticket) {
            html += ticket.messages.map(m => bubble(m.from, m.text, m.at)).join("");
            if (!isOpen) html += '<p class="chat-note">This conversation was closed. Send a message to start a new one.</p>';
        }

        const box = $("chatMsgs");
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;

        $("chatRef").textContent = isOpen ? `Ref ${ticket.id} · ${ticket.category}` : "We usually reply within a few hours";
        $("chatCategory").hidden = Boolean(isOpen);
    }


    /* =====================================================
       15. INIT
    ===================================================== */

    async function init() {
        await ensureDemoAccount();
        ensureAccountNumbers();
        buildSignupPinFields();
        buildTransferForm();
        buildPanels();
        buildSupportChat();
        startBackgroundTasks();
        restoreSession();
    }

    document.addEventListener("DOMContentLoaded", init);


})();