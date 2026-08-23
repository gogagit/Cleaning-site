(function () {
    "use strict";
    const data = window.cleaningData;
    const guard = document.getElementById("employeeGuard");
    const ordersContainer = document.getElementById("employeeOrders");
    const summary = document.getElementById("employeeSummary");
    const filter = document.getElementById("employeeFilter");
    const status = document.getElementById("employeeStatus");
    const statusNames = { assigned: "Назначен", in_progress: "Выполняется", completed: "Завершён", confirmed: "Подтверждён", cancelled: "Отменён" };
    let orders = [];

    const currency = (value) => window.EmployeeView.currency(value);
    const setStatus = (message, type = "") => { status.textContent = message; status.classList.remove("is-success", "is-error"); if (type) status.classList.add(type); };
    const addText = (parent, tag, className, text) => window.EmployeeView.appendText(parent, tag, className, text);
    const redirectForRole = (user) => {
        if (!user) { window.location.replace("Index.html?login=1"); return true; }
        if (user.role === "admin") { window.location.replace("admin.html"); return true; }
        if (user.role === "user") { window.location.replace("account.html"); return true; }
        return false;
    };
    const renderSummary = () => {
        const active = orders.filter((order) => ["assigned", "in_progress", "confirmed"].includes(order.status)).length;
        const projected = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.employeeEarning, 0);
        const completed = orders.filter((order) => order.status === "completed");
        const earned = completed.reduce((sum, order) => sum + order.employeeEarning, 0);
        const today = new Date().toISOString().slice(0, 10);
        const todayCount = orders.filter((order) => order.scheduledDate === today && order.status !== "cancelled").length;
        const cards = [["fa-route", active, "Активных выездов"], ["fa-calendar-day", todayCount, "На сегодня"], ["fa-coins", currency(projected), "Начислено всего"], ["fa-wallet", currency(earned), "К выплате"]];
        summary.textContent = "";
        cards.forEach(([icon, value, label]) => { const card = document.createElement("article"); card.className = "summary-card"; card.innerHTML = '<i class="fas ' + icon + '"></i>'; const div = document.createElement("div"); addText(div, "strong", "", String(value)); addText(div, "span", "", label); card.appendChild(div); summary.appendChild(card); });
    };
    const createInfo = (icon, label, value) => {
        const item = document.createElement("div"); item.className = "employee-order-info"; item.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i>';
        const copy = document.createElement("div"); addText(copy, "span", "", label); addText(copy, "strong", "", value); item.appendChild(copy); return item;
    };
    const orderCard = (order) => {
        const customer = order.customer || {};
        const item = order.items?.[0] || {};
        const card = document.createElement("article"); card.className = "employee-order-card";
        const header = document.createElement("div"); header.className = "employee-order-header";
        const heading = document.createElement("div"); addText(heading, "span", "checkout-kicker", order.number); addText(heading, "h3", "", item.service || "Уборка");
        addText(header, "span", "order-status status-" + order.status, statusNames[order.status] || order.status); header.prepend(heading); card.appendChild(header);
        const info = document.createElement("div"); info.className = "employee-order-grid";
        info.append(createInfo("fa-calendar-alt", "Дата и время", (order.scheduledDate || "—") + ", " + (order.scheduledTime || "—")));
        info.append(createInfo("fa-map-marker-alt", "Адрес", customer.address || "Не указан"));
        info.append(createInfo("fa-user", "Клиент", (customer.name || "—") + (customer.phone ? " · " + customer.phone : "")));
        info.append(createInfo("fa-broom", "Объём", (item.area || "—") + " м² · " + (item.bathrooms || "—") + " санузел(а)"));
        card.appendChild(info);
        if (item.extras?.length || customer.message) {
            const note = document.createElement("div"); note.className = "employee-order-note";
            addText(note, "strong", "", "Дополнительная информация"); addText(note, "p", "", [item.extras?.join(", "), customer.message].filter(Boolean).join(". ")); card.appendChild(note);
        }
        const finance = document.createElement("div"); finance.className = "employee-order-finance";
        const cost = document.createElement("div"); addText(cost, "span", "", "Стоимость заказа"); addText(cost, "strong", "", currency(order.total));
        const earning = document.createElement("div"); addText(earning, "span", "", "Ваш заработок"); addText(earning, "strong", "", currency(order.employeeEarning)); finance.append(cost, earning); card.appendChild(finance);
        const actions = document.createElement("div"); actions.className = "employee-order-actions";
        if (customer.address) { const map = document.createElement("a"); map.className = "btn btn-secondary"; map.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(customer.address); map.target = "_blank"; map.rel = "noopener noreferrer"; map.innerHTML = '<i class="fas fa-route"></i> Открыть маршрут'; actions.appendChild(map); }
        if (["assigned", "confirmed"].includes(order.status)) { const start = addText(actions, "button", "btn", "Начать работу"); start.type = "button"; start.dataset.employeeStatus = order.id; start.dataset.status = "in_progress"; }
        if (order.status === "in_progress") { const complete = addText(actions, "button", "btn", "Завершить заказ"); complete.type = "button"; complete.dataset.employeeStatus = order.id; complete.dataset.status = "completed"; }
        card.appendChild(actions); return card;
    };
    const renderOrders = () => {
        const visible = orders.filter((order) => filter.value === "all" || (filter.value === "completed" ? order.status === "completed" : !["completed", "cancelled"].includes(order.status)));
        ordersContainer.textContent = "";
        if (!visible.length) { ordersContainer.innerHTML = '<div class="dashboard-empty"><i class="fas fa-route"></i><h3>В этом разделе заказов нет</h3><p>Новые назначения появятся после распределения администратором.</p></div>'; return; }
        visible.forEach((order) => ordersContainer.appendChild(orderCard(order)));
    };
    const loadOrders = async () => {
        setStatus("Загружаем назначения…");
        try { orders = await data.getOrders(); renderSummary(); renderOrders(); setStatus("Маршрут и начисления обновлены.", "is-success"); }
        catch (error) { setStatus(error.message || "Не удалось загрузить назначения.", "is-error"); }
    };

    filter.addEventListener("change", renderOrders);
    document.getElementById("employeeRefresh").addEventListener("click", loadOrders);
    document.getElementById("employeeLogout").addEventListener("click", async () => { await data.logout(); window.location.replace("Index.html"); });
    ordersContainer.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-employee-status]"); if (!button) return;
        button.disabled = true; setStatus("Обновляем статус…");
        try { await data.updateEmployeeOrderStatus(button.dataset.employeeStatus, button.dataset.status); await loadOrders(); }
        catch (error) { setStatus(error.message || "Не удалось обновить статус.", "is-error"); button.disabled = false; }
    });
    window.addEventListener("cleaning:data-changed", (event) => { if (["orders", "all"].includes(event.detail?.entity)) loadOrders(); });
    window.cleaningDataReady.then(async () => {
        const user = data.getCurrentUser(); if (redirectForRole(user)) return;
        const firstName = user.name.split(/\s+/)[0];
        document.getElementById("employeeName").textContent = user.name; document.getElementById("employeeEmail").textContent = user.email; document.getElementById("employeeAvatar").textContent = firstName.slice(0, 1).toUpperCase(); document.getElementById("employeeMode").textContent = data.getModeInfo().label;
        const share = window.CLEANING_CONFIG?.employeeSharePercent ?? 70; document.getElementById("employeeSplit").textContent = "Сотруднику начисляется " + share + "% от стоимости назначенного заказа. Выполненные заказы входят в сумму к выплате.";
        guard.hidden = true; document.getElementById("employeeWelcome").hidden = false; summary.hidden = false; document.getElementById("employeeFinanceNote").hidden = false; document.getElementById("employeeOrdersSection").hidden = false;
        await loadOrders();
    });
})();
