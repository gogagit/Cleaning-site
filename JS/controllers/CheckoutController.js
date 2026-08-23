(function () {
    "use strict";
    const data = window.cleaningData;
    const guard = document.getElementById("checkoutGuard");
    const content = document.getElementById("checkoutContent");
    const form = document.getElementById("checkoutForm");
    const status = document.getElementById("formStatus");
    const submitButton = document.getElementById("submitOrder");
    const dateField = document.getElementById("requestDate");
    const timeField = document.getElementById("requestTime");
    const slotStatus = document.getElementById("slotAvailabilityStatus");
    const draftKey = "cleaning-checkout-draft";
    const calculationKey = "cleaning-checkout-calculation";
    let calculation;
    let draftTimer;
    let availabilityRequest = 0;

    const currency = (value) => window.CheckoutView.currency(value);
    const setStatus = (message, type = "") => {
        status.textContent = message;
        status.classList.remove("is-success", "is-error");
        if (type) status.classList.add(type);
    };
    const read = (key) => {
        try { return JSON.parse(localStorage.getItem(key)); } catch (error) { return null; }
    };
    const write = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* Draft persistence is optional. */ }
    };
    const redirectForRole = (user) => {
        if (!user) {
            sessionStorage.setItem("cleaning-pending-checkout", "1");
            window.location.replace("Index.html?login=1&next=checkout");
            return true;
        }
        if (user.role === "admin") { window.location.replace("admin.html"); return true; }
        if (user.role === "employee") { window.location.replace("employee.html"); return true; }
        return false;
    };
    const showEmptyCalculation = () => {
        guard.innerHTML = '<i class="fas fa-calculator"></i><h2>Сначала выполните расчёт</h2><p>На этой странице оформляется один выбранный вариант уборки.</p><a class="btn" href="Index.html#calculator">Перейти к калькулятору</a>';
    };
    const renderCalculation = () => {
        document.getElementById("summaryService").textContent = calculation.service;
        document.getElementById("summaryTotal").textContent = currency(calculation.total);
        const rows = [
            ["Площадь", calculation.area + " м²"],
            ["Санузлы", String(calculation.bathrooms)],
            ["Периодичность", calculation.frequency],
            ["Дополнительно", calculation.extras?.length ? calculation.extras.join(", ") : "Без дополнительных услуг"],
            ["Время работ", calculation.duration + "–" + (Number(calculation.duration) + 1) + " ч"]
        ];
        const details = document.getElementById("summaryDetails");
        details.textContent = "";
        rows.forEach(([label, value]) => {
            const row = document.createElement("div");
            const term = document.createElement("dt");
            const description = document.createElement("dd");
            term.textContent = label;
            description.textContent = value;
            row.append(term, description);
            details.appendChild(row);
        });
    };
    const restoreDraft = (user) => {
        const draft = read(draftKey);
        if (draft && typeof draft === "object") {
            Object.entries(draft).forEach(([name, value]) => {
                const field = form.elements.namedItem(name);
                if (!field) return;
                field.type === "checkbox" ? field.checked = value === field.value : field.value = value;
            });
        }
        const nameField = form.elements.namedItem("name");
        const emailField = form.elements.namedItem("email");
        if (!nameField.value) nameField.value = user.name || "";
        if (!emailField.value) emailField.value = user.email || "";
    };
    const saveDraft = () => write(draftKey, Object.fromEntries(new FormData(form).entries()));
    const getDurationMinutes = () => Math.max(120, (Number(calculation?.duration) + 1) * 60);
    const refreshAvailability = async () => {
        const requestId = ++availabilityRequest;
        const date = dateField.value;
        const options = [...timeField.options].filter((option) => option.value);
        if (!date) {
            options.forEach((option) => { option.disabled = true; option.textContent = option.dataset.label || option.value; });
            timeField.value = "";
            slotStatus.className = "slot-availability";
            slotStatus.querySelector("span").textContent = "Выберите дату — покажем свободные интервалы.";
            return;
        }
        slotStatus.className = "slot-availability is-loading";
        slotStatus.querySelector("span").textContent = "Проверяем расписание сотрудников…";
        try {
            const checks = await Promise.all(options.map(async (option) => ({
                option,
                availability: await data.getSlotAvailability({ date, time: option.value, durationMinutes: getDurationMinutes() })
            })));
            if (requestId !== availabilityRequest) return;
            let availableSlots = 0;
            checks.forEach(({ option, availability }) => {
                const count = availability.availableEmployees;
                option.disabled = count < 1;
                option.textContent = (option.dataset.label || option.value) + " · " + window.ScheduleView.availabilityText(count);
                if (count > 0) availableSlots += 1;
            });
            if (timeField.selectedOptions[0]?.disabled) timeField.value = "";
            slotStatus.className = "slot-availability " + (availableSlots ? "is-available" : "is-unavailable");
            slotStatus.querySelector("span").textContent = availableSlots
                ? "Свободных интервалов: " + availableSlots + ". Учитывается полная длительность уборки."
                : "На эту дату свободных интервалов нет. Выберите другой день.";
        } catch (error) {
            if (requestId !== availabilityRequest) return;
            slotStatus.className = "slot-availability is-unavailable";
            slotStatus.querySelector("span").textContent = "Не удалось проверить расписание. Обновите страницу.";
        }
    };
    const orderNumber = () => "ЧД-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + String(Date.now()).slice(-6);
    const openConfirmation = (order) => {
        document.getElementById("confirmationOrderNumber").textContent = order.number;
        const details = document.getElementById("confirmationDetails");
        details.textContent = "";
        [["Дата и время", order.scheduledDate + ", " + order.scheduledTime], ["Предварительная сумма", currency(order.total)]].forEach(([label, value]) => {
            const row = document.createElement("div");
            const name = document.createElement("span");
            const result = document.createElement("strong");
            name.textContent = label;
            result.textContent = value;
            row.append(name, result);
            details.appendChild(row);
        });
        const overlay = document.getElementById("confirmationOverlay");
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add("is-visible"));
        setTimeout(() => document.getElementById("confirmationTitle").focus({ preventScroll: true }), 80);
    };

    form.addEventListener("input", () => {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraft, 250);
        if (status.classList.contains("is-error")) setStatus("");
    });
    form.addEventListener("change", saveDraft);
    dateField.addEventListener("change", refreshAvailability);
    document.getElementById("clearDraft").addEventListener("click", () => {
        form.reset();
        localStorage.removeItem(draftKey);
        const user = data.getCurrentUser();
        restoreDraft(user);
        dateField.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        setStatus("Поля очищены.");
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        submitButton.disabled = true;
        setStatus("Оформляем заказ…");
        try {
            const customer = Object.fromEntries(new FormData(form).entries());
            const availability = await data.getSlotAvailability({
                date: customer.date,
                time: customer.time,
                durationMinutes: getDurationMinutes()
            });
            if (availability.availableEmployees < 1) throw new Error("Этот интервал уже занят. Выберите другое время.");
            const order = await data.createOrder({
                number: orderNumber(),
                customer,
                items: [calculation],
                total: calculation.total,
                scheduledDate: customer.date,
                scheduledTime: customer.time,
                durationMinutes: getDurationMinutes()
            });
            localStorage.removeItem(draftKey);
            localStorage.removeItem(calculationKey);
            setStatus("Заказ оформлен.", "is-success");
            openConfirmation(order);
        } catch (error) {
            setStatus(error.message || "Не удалось оформить заказ.", "is-error");
            submitButton.disabled = false;
        }
    });

    window.cleaningDataReady.then(() => {
        const user = data.getCurrentUser();
        if (redirectForRole(user)) return;
        calculation = read(calculationKey);
        if (!calculation || !calculation.service || !Number(calculation.total)) { showEmptyCalculation(); return; }
        const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        dateField.min = today;
        renderCalculation();
        restoreDraft(user);
        guard.hidden = true;
        content.hidden = false;
        refreshAvailability();
    });
})();
