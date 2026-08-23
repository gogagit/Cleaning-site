(function () {
    "use strict";

    const data = window.cleaningData;
    const standalone = document.body.dataset.page === "admin";
    const overlay = document.getElementById("adminOverlay");
    const panel = overlay?.querySelector(".admin-panel");
    const closeButton = document.getElementById("adminClose");
    const refreshButton = document.getElementById("adminRefresh");
    const exportButton = document.getElementById("adminExport");
    const importInput = document.getElementById("adminImport");
    const title = document.getElementById("adminTitle");
    const mode = document.getElementById("adminMode");
    const stats = document.getElementById("adminStats");
    const ordersContainer = document.getElementById("adminOrders");
    const scheduleContainer = document.getElementById("adminSchedule");
    const servicesContainer = document.getElementById("adminServices");
    const usersContainer = document.getElementById("adminUsers");
    const messagesContainer = document.getElementById("adminMessages");
    const invitesContainer = document.getElementById("adminInvites");
    const employeeForm = document.getElementById("adminEmployeeForm");
    const status = document.getElementById("adminStatus");
    const serviceForm = document.getElementById("adminServiceForm");
    const serviceCancel = document.getElementById("adminServiceCancel");
    const detailOverlay = document.getElementById("adminDetailOverlay");
    const detailClose = document.getElementById("adminDetailClose");
    const detailContent = document.getElementById("adminDetailContent");
    const detailTitle = document.getElementById("adminDetailTitle");

    if (!data || !overlay) return;

    const orderStatuses = window.AdminView.statuses;
    const messageStatuses = window.MessageView.statuses;
    let snapshot = { orders: [], services: [], profiles: [], employees: [], messages: [], invites: [] };
    let closeTimer;
    let detailTimer;
    let rendering = false;

    const escapeHtml = (value) => window.AdminView.escapeHtml(value);
    const currency = (value) => window.AdminView.currency(value);
    const dateTime = (value) => window.AdminView.dateTime(value);

    const setStatus = (message, type = "") => {
        status.textContent = message;
        status.classList.remove("is-success", "is-error");
        if (type) status.classList.add(type);
    };

    const statusOptions = (selected) => Object.entries(orderStatuses)
        .map(([value, label]) => '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" + label + "</option>")
        .join("");

    const getOrderStart = (order) => new Date(order.scheduledStart || (order.scheduledDate + "T" + order.scheduledTime + ":00"));
    const overlaps = (left, right) => {
        const leftStart = getOrderStart(left).getTime();
        const rightStart = getOrderStart(right).getTime();
        if (Number.isNaN(leftStart) || Number.isNaN(rightStart)) return false;
        return leftStart < rightStart + Number(right.durationMinutes || 120) * 60000 &&
            rightStart < leftStart + Number(left.durationMinutes || 120) * 60000;
    };
    const employeeBusy = (employeeId, order) => snapshot.orders.some((item) => item.id !== order.id &&
        item.employeeId === employeeId && item.status !== "cancelled" && overlaps(item, order));
    const employeeOptions = (selected, order) => '<option value="">Не назначен</option>' + snapshot.employees
        .map((employee) => {
            const busy = employeeBusy(employee.id, order);
            return '<option value="' + escapeHtml(employee.id) + '"' + (employee.id === selected ? " selected" : "") +
                (busy && employee.id !== selected ? " disabled" : "") + '>' + escapeHtml(employee.name) + (busy ? " — занят" : " — свободен") + '</option>';
        })
        .join("");

    const renderStats = () => {
        const validOrders = snapshot.orders.filter((order) => order.status !== "cancelled");
        const revenue = validOrders.reduce((sum, order) => sum + Number(order.total), 0);
        const completedOrders = snapshot.orders.filter((order) => order.status === "completed");
        const completed = completedOrders.length;
        const serviceIncome = completedOrders.reduce((sum, order) => sum + Number(order.serviceCommission || 0), 0);
        const payroll = completedOrders.reduce((sum, order) => sum + Number(order.employeeEarning || 0), 0);
        const newOrders = snapshot.orders.filter((order) => order.status === "new").length;
        const unread = snapshot.messages.filter((message) => message.status === "new").length;
        const activeServices = snapshot.services.filter((service) => service.active).length;
        const cards = [
            { icon: "fa-shopping-basket", value: snapshot.orders.length, label: "Заказов", note: newOrders + " новых" },
            { icon: "fa-ruble-sign", value: currency(revenue), label: "Сумма заказов", note: completed + " завершено" },
            { icon: "fa-percentage", value: currency(serviceIncome), label: "Комиссия сервиса", note: "по завершённым" },
            { icon: "fa-wallet", value: currency(payroll), label: "Заработок сотрудников", note: "к выплате" },
            { icon: "fa-broom", value: activeServices, label: "Активных услуг", note: snapshot.services.length + " всего" },
            { icon: "fa-users", value: snapshot.profiles.length, label: "Пользователей", note: snapshot.employees.length + " сотрудников" },
            { icon: "fa-envelope", value: unread, label: "Новых сообщений", note: snapshot.messages.length + " всего" }
        ];
        stats.innerHTML = cards.map((card) =>
            '<article class="admin-stat-card"><i class="fas ' + card.icon + '"></i><div><strong>' +
            escapeHtml(card.value) + '</strong><span>' + escapeHtml(card.label) + '</span><small>' +
            escapeHtml(card.note) + '</small></div></article>'
        ).join("");
        document.getElementById("ordersBadge").textContent = String(snapshot.orders.length);
        document.getElementById("scheduleBadge").textContent = String(snapshot.orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length);
        document.getElementById("servicesBadge").textContent = String(snapshot.services.length);
        document.getElementById("usersBadge").textContent = String(snapshot.profiles.length);
        document.getElementById("messagesBadge").textContent = String(unread);
    };

    const renderOrders = () => {
        if (!snapshot.orders.length) {
            ordersContainer.innerHTML = '<p class="admin-empty">Заказов пока нет.</p>';
            return;
        }
        ordersContainer.innerHTML = '<table class="admin-table"><thead><tr><th>Заказ</th><th>Клиент</th><th>Выезд</th><th>Сумма</th><th>Сотрудник</th><th>Статус</th><th>Действия</th></tr></thead><tbody>' +
            snapshot.orders.map((order) => {
                const customer = order.customer || {};
                const assignmentLocked = ["completed", "cancelled"].includes(order.status);
                return '<tr><td><strong>' + escapeHtml(order.number) + '</strong><small>' + escapeHtml(dateTime(order.createdAt)) +
                    '</small></td><td>' + escapeHtml(customer.name || "Гость") + '<small>' + escapeHtml(customer.email || customer.phone || "—") +
                    '</small></td><td>' + escapeHtml(order.scheduledDate || customer.date || "—") + '<small>' +
                    escapeHtml(order.scheduledTime || customer.time || "—") + '</small></td><td><strong>' + escapeHtml(currency(order.total)) +
                    '</strong><small>Комиссия: ' + escapeHtml(currency(order.serviceCommission)) + '</small><small>Сотруднику: ' + escapeHtml(currency(order.employeeEarning)) + '</small></td><td><select class="admin-inline-select" data-order-employee="' +
                    escapeHtml(order.id) + '"' + (assignmentLocked ? ' disabled title="Сначала измените статус заказа"' : '') + '>' + employeeOptions(order.employeeId, order) + '</select></td><td><select class="admin-inline-select" data-order-status="' +
                    escapeHtml(order.id) + '">' + statusOptions(order.status) + '</select></td><td><div class="admin-row-actions"><button type="button" class="table-action" data-order-detail="' +
                    escapeHtml(order.id) + '">Детали</button><button type="button" class="table-action is-danger" data-order-delete="' +
                    escapeHtml(order.id) + '">Удалить</button></div></td></tr>';
            }).join("") + "</tbody></table>";
    };

    const renderSchedule = () => {
        const activeOrders = snapshot.orders.filter((order) => order.status !== "cancelled")
            .sort((a, b) => getOrderStart(a) - getOrderStart(b));
        const columns = snapshot.employees.map((employee) => {
            const employeeOrders = activeOrders.filter((order) => order.employeeId === employee.id);
            const cards = employeeOrders.length ? employeeOrders.map((order) =>
                '<article class="schedule-order-card status-border-' + escapeHtml(order.status) + '"><strong>' + escapeHtml(order.scheduledDate || "—") + ', ' + escapeHtml(order.scheduledTime || "—") +
                '</strong><span>' + escapeHtml(order.number) + '</span><span>' + escapeHtml(order.customer?.address || "Адрес не указан") +
                '</span><small>' + escapeHtml(order.items?.[0]?.service || "Уборка") + ' · ' + Math.round(Number(order.durationMinutes || 120) / 60) + ' ч</small></article>'
            ).join("") : '<p class="schedule-empty">Назначений нет</p>';
            return '<section class="schedule-employee-column"><header><i class="fas fa-user-check"></i><div><strong>' + escapeHtml(employee.name) +
                '</strong><span>' + employeeOrders.length + ' назнач.</span></div></header><div class="schedule-order-list">' + cards + '</div></section>';
        }).join("");
        const unassigned = activeOrders.filter((order) => !order.employeeId && !["completed"].includes(order.status));
        scheduleContainer.innerHTML = '<div class="schedule-heading"><div><span class="checkout-kicker">Загрузка команды</span><h2>Расписание сотрудников</h2></div><p>Занятый сотрудник автоматически недоступен в заказах с пересекающимся временем.</p></div><div class="admin-schedule-grid">' + columns +
            '</div><section class="unassigned-orders"><h3>Ожидают назначения — ' + unassigned.length + '</h3>' + (unassigned.length ? unassigned.map((order) =>
                '<span><strong>' + escapeHtml(order.number) + '</strong> ' + escapeHtml(order.scheduledDate) + ', ' + escapeHtml(order.scheduledTime) + '</span>').join("") : '<p>Все заказы распределены.</p>') + '</section>';
    };

    const renderServices = () => {
        if (!snapshot.services.length) {
            servicesContainer.innerHTML = '<p class="admin-empty">Услуги не добавлены.</p>';
            return;
        }
        servicesContainer.innerHTML = snapshot.services.map((service) =>
            '<article class="admin-service-card' + (service.active ? "" : " is-inactive") + '"><div><span class="service-state">' +
            (service.active ? "На сайте" : "Скрыта") + '</span><h3>' + escapeHtml(service.name) + '</h3><p>' +
            escapeHtml(service.description) + '</p><dl><div><dt>Код</dt><dd>' + escapeHtml(service.id) +
            '</dd></div><div><dt>За м²</dt><dd>' + escapeHtml(currency(service.rate)) +
            '</dd></div><div><dt>Минимум</dt><dd>' + escapeHtml(currency(service.minimum)) +
            '</dd></div><div><dt>Скорость</dt><dd>' + escapeHtml(service.speed) + ' м²/ч</dd></div></dl></div><div class="admin-row-actions"><button type="button" class="table-action" data-service-edit="' +
            escapeHtml(service.id) + '">Изменить</button><button type="button" class="table-action is-danger" data-service-delete="' +
            escapeHtml(service.id) + '">Удалить</button></div></article>'
        ).join("");
    };

    const renderUsers = () => {
        if (!snapshot.profiles.length) {
            usersContainer.innerHTML = '<p class="admin-empty">Пользователи не найдены.</p>';
            return;
        }
        usersContainer.innerHTML = '<table class="admin-table"><thead><tr><th>Пользователь</th><th>Дата регистрации</th><th>Роль</th><th>Доступ</th></tr></thead><tbody>' +
            snapshot.profiles.map((user) => {
                const protectedAdmin = user.id === "local-admin";
                return '<tr><td><strong>' + escapeHtml(user.name) + '</strong><small>' + escapeHtml(user.email) +
                    '</small></td><td>' + escapeHtml(dateTime(user.createdAt)) + '</td><td><select class="admin-inline-select" data-user-role="' +
                    escapeHtml(user.id) + '"' + (protectedAdmin ? " disabled" : "") + '><option value="user"' +
                    (user.role === "user" ? " selected" : "") + '>Клиент</option><option value="employee"' +
                    (user.role === "employee" ? " selected" : "") + '>Сотрудник</option><option value="admin"' +
                    (user.role === "admin" ? " selected" : "") + '>Администратор</option></select></td><td><button type="button" class="table-action ' +
                    (user.active ? "" : "is-danger") + '" data-user-active="' + escapeHtml(user.id) + '" data-active="' +
                    String(user.active) + '"' + (protectedAdmin ? " disabled" : "") + '>' + (user.active ? "Активен" : "Отключён") +
                    '</button></td></tr>';
            }).join("") + "</tbody></table>";
        if (invitesContainer) {
            invitesContainer.innerHTML = snapshot.invites.length
                ? '<h3>Приглашения сотрудников</h3>' + snapshot.invites.map((invite) => '<div class="staff-invite-row"><span><strong>' + escapeHtml(invite.name) + '</strong><small>' + escapeHtml(invite.email) + '</small></span><span class="message-status status-' + escapeHtml(invite.status) + '">' + (invite.status === "accepted" ? "Принято" : "Ожидает регистрации") + '</span></div>').join("")
                : "";
        }
    };

    const renderMessages = () => {
        if (!snapshot.messages.length) {
            messagesContainer.innerHTML = '<p class="admin-empty">Сообщений пока нет.</p>';
            return;
        }
        messagesContainer.innerHTML = snapshot.messages.map((message) => {
            const replies = message.replies.map((reply) => '<div class="chat-bubble ' + (reply.authorRole === "admin" ? "is-admin" : "is-client") + '"><strong>' +
                escapeHtml(reply.authorRole === "admin" ? "Администратор" : reply.authorName) + '</strong><p>' + escapeHtml(reply.text) + '</p><time>' + escapeHtml(dateTime(reply.createdAt)) + '</time></div>').join("");
            return '<article class="admin-message-thread' + (message.status === "new" ? " is-unread" : "") + '"><header><div><span class="checkout-kicker">' + escapeHtml(message.name) +
                '</span><h3>' + escapeHtml(message.email) + '</h3><small>' + escapeHtml(message.phone || "Без телефона") + ' · ' + escapeHtml(dateTime(message.createdAt)) +
                '</small></div><span class="message-status status-' + escapeHtml(message.status) + '">' + escapeHtml(messageStatuses[message.status] || message.status) +
                '</span></header><div class="chat-messages"><div class="chat-bubble is-client"><strong>' + escapeHtml(message.name) + '</strong><p>' + escapeHtml(message.message) +
                '</p><time>' + escapeHtml(dateTime(message.createdAt)) + '</time></div>' + replies + '</div><form class="chat-reply-form" data-admin-message-reply="' + escapeHtml(message.id) +
                '"><textarea class="input-control" name="reply" required minlength="2" placeholder="Ответить клиенту"></textarea><button class="btn" type="submit">Отправить ответ</button></form><div class="admin-row-actions message-thread-actions"><button type="button" class="table-action" data-message-toggle="' +
                escapeHtml(message.id) + '" data-status="' + escapeHtml(message.status) + '">' + (message.status === "new" ? "Отметить прочитанным" : "Вернуть в новые") +
                '</button><button type="button" class="table-action is-danger" data-message-delete="' + escapeHtml(message.id) + '">Удалить диалог</button></div></article>';
        }).join("");
    };

    const renderAll = async () => {
        if (rendering) return;
        rendering = true;
        setStatus("Загружаем данные…");
        try {
            const [orders, services, profiles, messages, invites] = await Promise.all([
                data.getOrders({ all: true }),
                data.getServices({ includeInactive: true }),
                data.getProfiles(),
                data.getMessages(),
                data.getStaffInvites()
            ]);
            snapshot = { orders, services, profiles, employees: profiles.filter((profile) => profile.role === "employee" && profile.active), messages, invites };
            renderStats();
            renderOrders();
            renderSchedule();
            renderServices();
            renderUsers();
            renderMessages();
            setStatus("Данные обновлены.", "is-success");
        } catch (error) {
            setStatus(error.message || "Не удалось загрузить данные.", "is-error");
        } finally {
            rendering = false;
        }
    };

    const open = async () => {
        await window.cleaningDataReady;
        if (!data.getCurrentUser()) {
            if (standalone) window.location.replace("Index.html?login=1");
            return;
        }
        if (!data.isAdmin()) {
            if (standalone) window.location.replace(data.isEmployee() ? "employee.html" : "account.html");
            return;
        }
        clearTimeout(closeTimer);
        mode.textContent = data.getModeInfo().label;
        const remoteMode = data.getModeInfo().mode === "supabase";
        const passwordBox = document.getElementById("employeePasswordBox");
        const passwordInput = document.getElementById("employeePasswordInput");
        passwordBox.classList.toggle("is-hidden", remoteMode);
        passwordInput.required = !remoteMode;
        document.getElementById("employeeFormNote").textContent = remoteMode
            ? "Будет создано приглашение. После обычной регистрации по этой почте пользователь автоматически получит роль сотрудника."
            : "Сотрудник будет создан сразу и сможет войти по временному паролю.";
        employeeForm.querySelector('button[type="submit"]').textContent = remoteMode ? "Создать приглашение" : "Создать сотрудника";
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add("is-visible"));
        document.body.classList.add("admin-open");
        setTimeout(() => title.focus({ preventScroll: true }), 80);
        await renderAll();
    };

    const close = () => {
        if (standalone) {
            window.location.href = "Index.html";
            return;
        }
        overlay.classList.remove("is-visible");
        document.body.classList.remove("admin-open");
        closeTimer = setTimeout(() => {
            overlay.hidden = true;
        }, 250);
    };

    const openDetails = (order) => {
        const customer = order.customer || {};
        detailTitle.textContent = "Заказ " + order.number;
        detailContent.innerHTML =
            '<div class="admin-detail-grid"><div><span>Клиент</span><strong>' + escapeHtml(customer.name || "Гость") +
            '</strong><p>' + escapeHtml(customer.email || "—") + '<br>' + escapeHtml(customer.phone || "—") +
            '</p></div><div><span>Выезд</span><strong>' + escapeHtml(order.scheduledDate || customer.date || "—") + ", " +
            escapeHtml(order.scheduledTime || customer.time || "—") + '</strong><p>' + escapeHtml(customer.address || "Адрес не указан") +
            '</p></div><div><span>Оплата</span><strong>' + escapeHtml(customer.payment === "cash" ? "Наличными" : "Картой") +
            '</strong><p>' + escapeHtml(customer.message || "Без комментария") + '</p></div><div><span>Исполнитель</span><strong>' + escapeHtml(order.employeeName || "Не назначен") +
            '</strong><p>Комиссия сервиса: ' + escapeHtml(currency(order.serviceCommission)) + '<br>Заработок сотрудника: ' + escapeHtml(currency(order.employeeEarning)) + '</p></div></div><div class="admin-detail-items"><h3>Состав заказа</h3>' +
            order.items.map((item) => '<div><span><strong>' + escapeHtml(item.service) + '</strong><small>' +
                escapeHtml(item.area) + ' м² · санузлов: ' + escapeHtml(item.bathrooms) +
                (item.extras?.length ? " · " + escapeHtml(item.extras.join(", ")) : "") + '</small></span><strong>' +
                escapeHtml(currency(item.total)) + '</strong></div>').join("") +
            '<div class="admin-detail-total"><span>Предварительная сумма</span><strong>' + escapeHtml(currency(order.total)) + '</strong></div></div>';
        clearTimeout(detailTimer);
        detailOverlay.hidden = false;
        requestAnimationFrame(() => detailOverlay.classList.add("is-visible"));
    };

    const closeDetails = () => {
        detailOverlay.classList.remove("is-visible");
        detailTimer = setTimeout(() => {
            detailOverlay.hidden = true;
        }, 200);
    };

    const resetServiceForm = () => {
        serviceForm.reset();
        document.getElementById("adminServiceOriginalId").value = "";
        document.getElementById("adminServiceId").disabled = false;
        document.getElementById("adminServiceSort").value = "100";
        document.getElementById("adminServiceActive").checked = true;
        document.getElementById("serviceFormTitle").textContent = "Добавить услугу";
    };

    const editService = (service) => {
        document.getElementById("adminServiceOriginalId").value = service.id;
        document.getElementById("adminServiceId").value = service.id;
        document.getElementById("adminServiceId").disabled = true;
        document.getElementById("adminServiceName").value = service.name;
        document.getElementById("adminServiceRate").value = service.rate;
        document.getElementById("adminServiceMinimum").value = service.minimum;
        document.getElementById("adminServiceSpeed").value = service.speed;
        document.getElementById("adminServiceSort").value = service.sortOrder;
        document.getElementById("adminServiceDescription").value = service.description;
        document.getElementById("adminServiceActive").checked = service.active;
        document.getElementById("serviceFormTitle").textContent = "Изменить услугу";
        serviceForm.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            const tab = button.dataset.adminTab;
            document.querySelectorAll("[data-admin-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
            document.querySelectorAll("[data-admin-panel]").forEach((item) => item.classList.toggle("is-hidden", item.dataset.adminPanel !== tab));
        });
    });

    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
        if (!standalone && event.target === overlay) close();
    });
    refreshButton.addEventListener("click", renderAll);
    detailClose.addEventListener("click", closeDetails);
    detailOverlay.addEventListener("click", (event) => {
        if (event.target === detailOverlay) closeDetails();
    });

    ordersContainer.addEventListener("change", async (event) => {
        const select = event.target.closest("[data-order-status]");
        const employeeSelect = event.target.closest("[data-order-employee]");
        if (!select && !employeeSelect) return;
        try {
            if (select) {
                await data.updateOrderStatus(select.dataset.orderStatus, select.value);
                setStatus("Статус заказа обновлён.", "is-success");
            }
            if (employeeSelect) {
                if (!employeeSelect.value) {
                    setStatus("Выберите сотрудника для назначения.", "is-error");
                } else {
                    await data.assignOrder(employeeSelect.dataset.orderEmployee, employeeSelect.value);
                    setStatus("Сотрудник назначен, заработок рассчитан.", "is-success");
                }
            }
            await renderAll();
        } catch (error) {
            setStatus(error.message, "is-error");
        }
    });

    ordersContainer.addEventListener("click", async (event) => {
        const detailsButton = event.target.closest("[data-order-detail]");
        const deleteButton = event.target.closest("[data-order-delete]");
        if (detailsButton) {
            const order = snapshot.orders.find((item) => item.id === detailsButton.dataset.orderDetail);
            if (order) openDetails(order);
        }
        if (deleteButton && window.confirm("Удалить этот заказ без возможности восстановления?")) {
            try {
                await data.deleteOrder(deleteButton.dataset.orderDelete);
                await renderAll();
            } catch (error) {
                setStatus(error.message, "is-error");
            }
        }
    });

    servicesContainer.addEventListener("click", async (event) => {
        const editButton = event.target.closest("[data-service-edit]");
        const deleteButton = event.target.closest("[data-service-delete]");
        if (editButton) {
            const service = snapshot.services.find((item) => item.id === editButton.dataset.serviceEdit);
            if (service) editService(service);
        }
        if (deleteButton && window.confirm("Удалить услугу из каталога?")) {
            try {
                await data.deleteService(deleteButton.dataset.serviceDelete);
                resetServiceForm();
                await renderAll();
            } catch (error) {
                setStatus(error.message, "is-error");
            }
        }
    });

    serviceForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!serviceForm.reportValidity()) return;
        const idField = document.getElementById("adminServiceId");
        const existing = snapshot.services.find((item) => item.id === idField.value);
        const service = {
            id: idField.value.trim(),
            name: document.getElementById("adminServiceName").value.trim(),
            rate: Number(document.getElementById("adminServiceRate").value),
            minimum: Number(document.getElementById("adminServiceMinimum").value),
            speed: Number(document.getElementById("adminServiceSpeed").value),
            sortOrder: Number(document.getElementById("adminServiceSort").value),
            description: document.getElementById("adminServiceDescription").value.trim(),
            active: document.getElementById("adminServiceActive").checked,
            image: existing?.image || "img/service/house.jpg"
        };
        try {
            await data.saveService(service);
            resetServiceForm();
            setStatus("Услуга сохранена.", "is-success");
            await renderAll();
        } catch (error) {
            setStatus(error.message, "is-error");
        }
    });
    serviceCancel.addEventListener("click", resetServiceForm);

    usersContainer.addEventListener("change", async (event) => {
        const roleSelect = event.target.closest("[data-user-role]");
        if (!roleSelect) return;
        try {
            await data.updateProfile(roleSelect.dataset.userRole, { role: roleSelect.value });
            await renderAll();
        } catch (error) {
            setStatus(error.message, "is-error");
        }
    });
    usersContainer.addEventListener("click", async (event) => {
        const activeButton = event.target.closest("[data-user-active]");
        if (!activeButton) return;
        try {
            await data.updateProfile(activeButton.dataset.userActive, { active: activeButton.dataset.active !== "true" });
            await renderAll();
        } catch (error) {
            setStatus(error.message, "is-error");
        }
    });
    employeeForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!employeeForm.reportValidity()) return;
        const submit = employeeForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            const values = Object.fromEntries(new FormData(employeeForm).entries());
            const result = await data.createEmployee(values);
            employeeForm.reset();
            setStatus(result.invited ? "Приглашение создано. Сотрудник должен зарегистрироваться с указанной почтой." : "Сотрудник создан и добавлен в расписание.", "is-success");
            await renderAll();
        } catch (error) {
            setStatus(error.message || "Не удалось создать сотрудника.", "is-error");
        } finally {
            submit.disabled = false;
        }
    });

    messagesContainer.addEventListener("click", async (event) => {
        const toggleButton = event.target.closest("[data-message-toggle]");
        const deleteButton = event.target.closest("[data-message-delete]");
        try {
            if (toggleButton) {
                await data.updateMessageStatus(toggleButton.dataset.messageToggle, toggleButton.dataset.status === "new" ? "read" : "new");
                await renderAll();
            }
            if (deleteButton && window.confirm("Удалить сообщение?")) {
                await data.deleteMessage(deleteButton.dataset.messageDelete);
                await renderAll();
            }
        } catch (error) {
            setStatus(error.message, "is-error");
        }
    });
    messagesContainer.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-admin-message-reply]");
        if (!form) return;
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = form.querySelector("button");
        button.disabled = true;
        try {
            await data.addMessageReply(form.dataset.adminMessageReply, form.elements.reply.value);
            setStatus("Ответ добавлен в диалог клиента.", "is-success");
            await renderAll();
        } catch (error) {
            setStatus(error.message || "Не удалось отправить ответ.", "is-error");
            button.disabled = false;
        }
    });

    exportButton.addEventListener("click", async () => {
        try {
            const backup = await data.exportBackup();
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "chistodom-backup-" + new Date().toISOString().slice(0, 10) + ".json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus("Резервная копия скачана.", "is-success");
        } catch (error) {
            setStatus(error.message, "is-error");
        }
    });

    importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        if (!window.confirm("Импорт обновит услуги, заказы и сообщения. Продолжить?")) {
            importInput.value = "";
            return;
        }
        try {
            const backup = JSON.parse(await file.text());
            await data.importBackup(backup);
            await renderAll();
            setStatus("Резервная копия импортирована.", "is-success");
        } catch (error) {
            setStatus(error.message || "Не удалось импортировать файл.", "is-error");
        } finally {
            importInput.value = "";
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!detailOverlay.hidden) closeDetails();
        else if (!overlay.hidden) close();
    });
    window.addEventListener("cleaning:data-changed", () => {
        if (!overlay.hidden && data.isAdmin()) renderAll();
    });
    window.addEventListener("cleaning:auth-changed", () => {
        if (!data.isAdmin() && !overlay.hidden) {
            if (standalone) window.location.replace("Index.html");
            else close();
        }
    });

    window.cleaningAdmin = { open, close, refresh: renderAll };
    const adminLogout = document.getElementById("adminLogout");
    if (adminLogout) adminLogout.addEventListener("click", async () => {
        await data.logout();
        window.location.replace("Index.html");
    });
    const split = window.CLEANING_CONFIG || {};
    const financeSplit = document.getElementById("financeSplit");
    if (financeSplit) financeSplit.textContent = (split.serviceCommissionPercent ?? 30) + "% — комиссия сервиса, " + (split.employeeSharePercent ?? 70) + "% — заработок сотрудника";
    if (standalone) open();
})();
