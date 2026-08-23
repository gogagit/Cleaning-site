(function () {
    "use strict";
    const data = window.cleaningData;
    const content = document.getElementById("accountContent");
    const summary = document.getElementById("accountSummary");
    const ordersSection = document.getElementById("ordersSection");
    const guard = document.getElementById("accountGuard");
    const ordersContainer = document.getElementById("clientOrders");
    const status = document.getElementById("clientStatus");
    const messagesContainer = document.getElementById("clientMessages");
    const supportStatus = document.getElementById("supportStatus");
    const statusNames = window.ClientView.statuses;
    const currency = (value) => window.ClientView.currency(value);
    const dateTime = (value) => window.ClientView.dateTime(value, { longMonth: true });
    const setStatus = (message, type = "") => {
        status.textContent = message;
        status.classList.remove("is-success", "is-error");
        if (type) status.classList.add(type);
    };
    const addText = (parent, tag, className, text) => window.ClientView.appendText(parent, tag, className, text);
    const redirectForRole = (user) => {
        if (!user) { window.location.replace("Index.html?login=1"); return true; }
        if (user.role === "admin") { window.location.replace("admin.html"); return true; }
        if (user.role === "employee") { window.location.replace("employee.html"); return true; }
        return false;
    };
    const orderCard = (order) => {
        const card = document.createElement("article");
        card.className = "account-page-order-card";
        const header = document.createElement("div"); header.className = "account-order-heading";
        const heading = document.createElement("div");
        addText(heading, "strong", "", order.number || "Заказ"); addText(heading, "span", "", "Создан " + dateTime(order.createdAt));
        addText(header, "span", "order-status status-" + order.status, statusNames[order.status] || order.status);
        header.prepend(heading); card.appendChild(header);
        const service = order.items?.[0] || {};
        const grid = document.createElement("div"); grid.className = "order-info-grid";
        [["fa-broom", service.service || "Уборка"], ["fa-calendar", (order.scheduledDate || "—") + ", " + (order.scheduledTime || "—")], ["fa-map-marker-alt", order.customer?.address || "Адрес не указан"]].forEach(([icon, value]) => {
            const item = document.createElement("span"); item.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i>'; item.append(" " + value); grid.appendChild(item);
        });
        card.appendChild(grid);
        const footer = document.createElement("div"); footer.className = "order-card-footer";
        addText(footer, "span", "", order.employeeName ? "Специалист: " + order.employeeName : "Специалист ещё не назначен");
        const actions = document.createElement("div"); actions.className = "order-client-actions";
        addText(actions, "strong", "", currency(order.total));
        if (["new", "confirmed", "assigned"].includes(order.status)) {
            const cancel = addText(actions, "button", "table-action is-danger", "Отменить заказ");
            cancel.type = "button";
            cancel.dataset.cancelOrder = order.id;
        }
        footer.appendChild(actions); card.appendChild(footer);
        return card;
    };

    const messageThread = (message) => {
        const thread = document.createElement("article");
        thread.className = "support-thread";
        const heading = document.createElement("div"); heading.className = "support-thread-heading";
        const title = document.createElement("div");
        addText(title, "strong", "", "Обращение от " + dateTime(message.createdAt));
        addText(title, "span", "", message.status === "answered" ? "Администратор ответил" : window.MessageView.statusLabel(message.status));
        heading.appendChild(title); thread.appendChild(heading);
        const chat = document.createElement("div"); chat.className = "chat-messages";
        const initial = document.createElement("div"); initial.className = "chat-bubble is-client";
        addText(initial, "strong", "", message.name || "Вы"); addText(initial, "p", "", message.message); addText(initial, "time", "", dateTime(message.createdAt)); chat.appendChild(initial);
        message.replies.forEach((reply) => {
            const bubble = document.createElement("div"); bubble.className = "chat-bubble " + (reply.authorRole === "admin" ? "is-admin" : "is-client");
            addText(bubble, "strong", "", reply.authorRole === "admin" ? "Администратор" : "Вы"); addText(bubble, "p", "", reply.text); addText(bubble, "time", "", dateTime(reply.createdAt)); chat.appendChild(bubble);
        });
        thread.appendChild(chat);
        const form = document.createElement("form"); form.className = "chat-reply-form"; form.dataset.messageReply = message.id;
        const textarea = document.createElement("textarea"); textarea.className = "input-control"; textarea.name = "reply"; textarea.required = true; textarea.minLength = 2; textarea.placeholder = "Напишите уточнение или ответ";
        const button = addText(form, "button", "btn", "Отправить"); button.type = "submit"; form.prepend(textarea); thread.appendChild(form);
        return thread;
    };
    const renderSummary = (orders) => {
        const active = orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
        const completed = orders.filter((order) => order.status === "completed").length;
        const total = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0);
        const cards = [["fa-clock", active, "Активных"], ["fa-check-circle", completed, "Завершено"], ["fa-ruble-sign", currency(total), "Сумма заказов"]];
        summary.textContent = "";
        cards.forEach(([icon, value, label]) => {
            const card = document.createElement("article"); card.className = "summary-card"; card.innerHTML = '<i class="fas ' + icon + '"></i>';
            const div = document.createElement("div"); addText(div, "strong", "", String(value)); addText(div, "span", "", label); card.appendChild(div); summary.appendChild(card);
        });
    };
    const loadOrders = async () => {
        ordersContainer.innerHTML = '<p class="dashboard-empty">Загружаем заказы…</p>';
        try {
            const orders = await data.getOrders();
            renderSummary(orders);
            ordersContainer.textContent = "";
            if (!orders.length) {
                ordersContainer.innerHTML = '<div class="dashboard-empty"><i class="fas fa-broom"></i><h3>Заказов пока нет</h3><p>Выполните предварительный расчёт и выберите дату уборки.</p><a class="btn" href="Index.html#calculator">Рассчитать стоимость</a></div>';
            } else orders.forEach((order) => ordersContainer.appendChild(orderCard(order)));
            setStatus("Данные актуальны.", "is-success");
        } catch (error) { setStatus(error.message || "Не удалось загрузить заказы.", "is-error"); }
    };

    const loadMessages = async () => {
        messagesContainer.innerHTML = '<p class="dashboard-empty">Загружаем диалоги…</p>';
        try {
            const messages = await data.getMessages();
            messagesContainer.textContent = "";
            if (!messages.length) {
                messagesContainer.innerHTML = '<div class="dashboard-empty"><i class="far fa-comment-dots"></i><h3>Диалогов пока нет</h3><p>Задайте вопрос на главной странице — ответ появится здесь.</p></div>';
            } else messages.forEach((message) => messagesContainer.appendChild(messageThread(message)));
            supportStatus.textContent = "";
        } catch (error) {
            supportStatus.textContent = error.message || "Не удалось загрузить диалоги.";
            supportStatus.className = "form-status is-error";
        }
    };

    document.getElementById("refreshClientOrders").addEventListener("click", loadOrders);
    ordersContainer.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-cancel-order]");
        if (!button) return;
        if (button.dataset.confirmCancel !== "true") {
            button.dataset.confirmCancel = "true";
            button.textContent = "Подтвердить отмену";
            button.classList.add("is-confirming");
            setStatus("Нажмите ещё раз, чтобы отменить заказ и освободить время сотрудника.");
            return;
        }
        button.disabled = true;
        try { await data.cancelOrder(button.dataset.cancelOrder); await loadOrders(); setStatus("Заказ отменён. Время сотрудника снова доступно.", "is-success"); }
        catch (error) { setStatus(error.message || "Не удалось отменить заказ.", "is-error"); button.disabled = false; }
    });
    messagesContainer.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-message-reply]");
        if (!form) return;
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = form.querySelector("button"); button.disabled = true;
        try { await data.addMessageReply(form.dataset.messageReply, form.elements.reply.value); await loadMessages(); }
        catch (error) { supportStatus.textContent = error.message || "Не удалось отправить ответ."; supportStatus.className = "form-status is-error"; button.disabled = false; }
    });
    document.getElementById("pageLogout").addEventListener("click", async () => { await data.logout(); window.location.replace("Index.html"); });
    window.addEventListener("cleaning:data-changed", (event) => {
        if (["orders", "all"].includes(event.detail?.entity)) loadOrders();
        if (["messages", "all"].includes(event.detail?.entity)) loadMessages();
    });
    window.cleaningDataReady.then(async () => {
        const user = data.getCurrentUser();
        if (redirectForRole(user)) return;
        const firstName = user.name.split(/\s+/)[0];
        document.getElementById("clientName").textContent = firstName;
        document.getElementById("clientFullName").textContent = user.name;
        document.getElementById("clientEmail").textContent = user.email;
        document.getElementById("clientAvatar").textContent = firstName.slice(0, 1).toUpperCase();
        document.getElementById("clientMode").textContent = data.getModeInfo().label;
        guard.hidden = true; content.hidden = false; summary.hidden = false; ordersSection.hidden = false; document.getElementById("supportSection").hidden = false;
        await Promise.all([loadOrders(), loadMessages()]);
    });
})();
