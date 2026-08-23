(function () {
    "use strict";

    const data = window.cleaningData;
    const overlay = document.getElementById("authOverlay");
    const closeButton = document.getElementById("authClose");
    const accountButton = document.getElementById("accountButton");
    const accountLabel = document.getElementById("accountLabel");
    const guestView = document.getElementById("authGuestView");
    const accountView = document.getElementById("accountView");
    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const authStatus = document.getElementById("authStatus");
    const authTitle = document.getElementById("authTitle");
    const authMode = document.getElementById("authMode");
    const demoCredentials = document.getElementById("demoCredentials");
    const accountName = document.getElementById("accountName");
    const accountEmail = document.getElementById("accountEmail");
    const accountAvatar = document.getElementById("accountAvatar");
    const accountRole = document.getElementById("accountRole");
    const accountMode = document.getElementById("accountMode");
    const accountStatus = document.getElementById("accountStatus");
    const dashboardLink = document.getElementById("roleDashboardLink");
    const logoutButton = document.getElementById("logoutButton");
    const feedbackForm = document.getElementById("feedbackForm");
    const feedbackStatus = document.getElementById("feedbackStatus");
    const feedbackSubmit = document.getElementById("feedbackSubmit");
    if (!data || !overlay || !accountButton) return;

    const roleInfo = {
        user: { label: "Клиент", href: "account.html", action: "Открыть личный кабинет" },
        employee: { label: "Сотрудник", href: "employee.html", action: "Открыть кабинет сотрудника" },
        admin: { label: "Администратор", href: "admin.html", action: "Открыть панель администратора" }
    };
    let closeTimer;

    const setStatus = (element, message, type = "") => {
        if (!element) return;
        element.textContent = message;
        element.classList.remove("is-success", "is-error");
        if (type) element.classList.add(type);
    };
    const setBusy = (element, busy) => {
        element?.querySelectorAll("button, input").forEach((control) => { control.disabled = busy; });
    };

    const switchAuthTab = (tab) => {
        const showLogin = tab === "login";
        loginTab.classList.toggle("is-active", showLogin);
        registerTab.classList.toggle("is-active", !showLogin);
        loginTab.setAttribute("aria-selected", String(showLogin));
        registerTab.setAttribute("aria-selected", String(!showLogin));
        loginForm.classList.toggle("is-hidden", !showLogin);
        registerForm.classList.toggle("is-hidden", showLogin);
        setStatus(authStatus, "");
    };

    const prefillFeedback = () => {
        if (!feedbackForm) return;
        const user = data.getCurrentUser();
        if (!user) return;
        const nameField = feedbackForm.elements.namedItem("name");
        const emailField = feedbackForm.elements.namedItem("email");
        if (!nameField.value) nameField.value = user.name || "";
        if (!emailField.value) emailField.value = user.email || "";
    };

    const renderAuthState = () => {
        const user = data.getCurrentUser();
        const modeInfo = data.getModeInfo();
        authMode.textContent = modeInfo.label;
        accountMode.textContent = modeInfo.label;
        demoCredentials.classList.toggle("is-hidden", modeInfo.mode !== "local");
        guestView.classList.toggle("is-hidden", Boolean(user));
        accountView.classList.toggle("is-hidden", !user);
        if (user) {
            const firstName = user.name?.split(/\s+/)[0] || "Пользователь";
            const info = roleInfo[user.role] || roleInfo.user;
            accountLabel.textContent = firstName;
            accountButton.classList.add("is-authorized");
            accountButton.title = info.action;
            accountButton.setAttribute("aria-label", info.action);
            accountName.textContent = user.name || "Пользователь";
            accountName.setAttribute("tabindex", "-1");
            accountEmail.textContent = user.email;
            accountAvatar.textContent = firstName.slice(0, 1).toUpperCase();
            accountRole.textContent = info.label;
            dashboardLink.href = info.href;
            dashboardLink.innerHTML = '<i class="fas fa-arrow-right" aria-hidden="true"></i> ' + info.action;
        } else {
            accountLabel.textContent = "Войти";
            accountButton.classList.remove("is-authorized");
            accountButton.title = "Войти или зарегистрироваться";
            accountButton.setAttribute("aria-label", "Войти или зарегистрироваться");
        }
        prefillFeedback();
    };

    const open = async () => {
        clearTimeout(closeTimer);
        await window.cleaningDataReady;
        renderAuthState();
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add("is-visible"));
        document.body.classList.add("auth-open");
        setTimeout(() => (data.getCurrentUser() ? accountName : authTitle).focus({ preventScroll: true }), 80);
    };
    const close = () => {
        overlay.classList.remove("is-visible");
        document.body.classList.remove("auth-open");
        closeTimer = setTimeout(() => { overlay.hidden = true; }, 250);
    };
    const requireLogin = (destination = "") => {
        if (destination === "checkout") sessionStorage.setItem("cleaning-pending-checkout", "1");
        open().then(() => setStatus(authStatus, "Войдите или зарегистрируйтесь, чтобы продолжить оформление.", "is-error"));
    };

    const finishAuthentication = () => {
        renderAuthState();
        const user = data.getCurrentUser();
        if (sessionStorage.getItem("cleaning-pending-checkout") === "1") {
            sessionStorage.removeItem("cleaning-pending-checkout");
            if (user?.role === "user") {
                window.location.href = "checkout.html";
                return true;
            }
            setStatus(accountStatus, "Оформление заказов доступно только клиентам.", "is-error");
        } else {
            setStatus(accountStatus, "Вход выполнен. Перейдите в свой кабинет.", "is-success");
        }
        return false;
    };

    const demoLogin = async (button, role) => {
        const demoConfig = window.CLEANING_CONFIG || {};
        const credentials = {
            client: { email: demoConfig.demoClientEmail || "client@chistodom.local", password: demoConfig.demoClientPassword || "Client123!" },
            employee: { email: demoConfig.demoEmployeeEmail || "employee@chistodom.local", password: demoConfig.demoEmployeePassword || "Employee123!" },
            admin: { email: demoConfig.demoAdminEmail || "admin@chistodom.local", password: demoConfig.demoAdminPassword || "Admin123!" }
        }[role];
        button.disabled = true;
        setStatus(authStatus, "Выполняется демо-вход…");
        try {
            await data.login(credentials);
            finishAuthentication();
        } catch (error) {
            setStatus(authStatus, error.message || "Не удалось войти.", "is-error");
        } finally {
            button.disabled = false;
        }
    };

    accountButton.addEventListener("click", () => {
        const user = data.getCurrentUser();
        if (user) {
            const info = roleInfo[user.role] || roleInfo.user;
            window.location.href = info.href;
        } else {
            open();
        }
    });
    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    loginTab.addEventListener("click", () => switchAuthTab("login"));
    registerTab.addEventListener("click", () => switchAuthTab("register"));

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!loginForm.reportValidity()) return;
        setBusy(loginForm, true);
        setStatus(authStatus, "Выполняется вход…");
        try {
            await data.login(Object.fromEntries(new FormData(loginForm).entries()));
            loginForm.reset();
            finishAuthentication();
        } catch (error) {
            setStatus(authStatus, error.message || "Не удалось войти.", "is-error");
        } finally {
            setBusy(loginForm, false);
        }
    });

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!registerForm.reportValidity()) return;
        setBusy(registerForm, true);
        setStatus(authStatus, "Создаём аккаунт…");
        try {
            const values = {
                name: document.getElementById("registerName").value.trim(),
                email: document.getElementById("registerEmail").value.trim(),
                password: document.getElementById("registerPassword").value
            };
            const result = await data.register(values);
            registerForm.reset();
            if (result.needsEmailConfirmation) {
                switchAuthTab("login");
                setStatus(authStatus, "Подтвердите регистрацию по почте, затем войдите.", "is-success");
            } else {
                finishAuthentication();
            }
        } catch (error) {
            setStatus(authStatus, error.message || "Не удалось создать аккаунт.", "is-error");
        } finally {
            setBusy(registerForm, false);
        }
    });

    document.getElementById("demoClientLogin")?.addEventListener("click", (event) => demoLogin(event.currentTarget, "client"));
    document.getElementById("demoEmployeeLogin")?.addEventListener("click", (event) => demoLogin(event.currentTarget, "employee"));
    document.getElementById("demoAdminLogin")?.addEventListener("click", (event) => demoLogin(event.currentTarget, "admin"));
    logoutButton.addEventListener("click", async () => {
        try {
            await data.logout();
            renderAuthState();
            switchAuthTab("login");
            setStatus(authStatus, "Вы вышли из аккаунта.", "is-success");
        } catch (error) {
            setStatus(accountStatus, error.message, "is-error");
        }
    });

    if (feedbackForm) {
        feedbackForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!feedbackForm.reportValidity()) return;
            feedbackSubmit.disabled = true;
            setStatus(feedbackStatus, "Отправляем сообщение…");
            try {
                await window.cleaningDataReady;
                await data.createMessage(Object.fromEntries(new FormData(feedbackForm).entries()));
                feedbackForm.reset();
                prefillFeedback();
                setStatus(feedbackStatus, data.getCurrentUser()
                    ? "Сообщение отправлено. Ответ появится в личном кабинете."
                    : "Сообщение отправлено. Для диалога войдите с указанной почтой.", "is-success");
            } catch (error) {
                setStatus(feedbackStatus, error.message || "Не удалось отправить сообщение.", "is-error");
            } finally {
                feedbackSubmit.disabled = false;
            }
        });
    }

    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) close(); });
    window.addEventListener("cleaning:auth-changed", renderAuthState);
    window.cleaningAccount = { open, close, requireLogin };
    window.cleaningDataReady.then(() => {
        renderAuthState();
        const query = new URLSearchParams(window.location.search);
        if (query.get("login") === "1") {
            if (query.get("next") === "checkout") sessionStorage.setItem("cleaning-pending-checkout", "1");
            open();
        }
    });
})();
