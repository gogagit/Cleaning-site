"use strict";

const formatPrice = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0)) + " ₽";

const appendTextElement = (parent, tagName, className, textValue) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = textValue;
    parent.appendChild(element);
    return element;
};

window.addEventListener("load", () => {
    const preloader = document.querySelector(".js-preloader");
    if (preloader) {
        preloader.classList.add("fade-out");
        setTimeout(() => { preloader.style.display = "none"; }, 600);
    }
    if (window.AOS) AOS.init({ once: true, offset: 40 });
});

const setupHeader = () => {
    const header = document.querySelector(".js-header");
    if (!header) return;
    const updateHeader = () => header.classList.toggle("bg-reveal", window.scrollY > 0);
    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();
};

const setupNavigation = () => {
    const navToggler = document.querySelector(".js-nav-toggler");
    const nav = document.querySelector(".js-nav");
    if (!navToggler || !nav) return;
    const setMenuState = (isOpen) => {
        nav.classList.toggle("open", isOpen);
        navToggler.classList.toggle("active", isOpen);
        navToggler.setAttribute("aria-expanded", String(isOpen));
        navToggler.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
    };
    navToggler.addEventListener("click", () => setMenuState(!nav.classList.contains("open")));
    nav.querySelectorAll("a, button").forEach((control) => control.addEventListener("click", () => setMenuState(false)));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setMenuState(false);
    });
};

const setupCalculator = () => {
    const form = document.getElementById("priceCalculator");
    if (!form) return;
    const serviceType = document.getElementById("serviceType");
    const areaRange = document.getElementById("areaRange");
    const areaInput = document.getElementById("areaInput");
    const bathrooms = document.getElementById("bathrooms");
    const frequency = document.getElementById("frequency");
    const checkoutButton = document.getElementById("goToCheckout");
    const actionStatus = document.getElementById("calculatorActionStatus");
    const servicesGrid = document.getElementById("servicesGrid");
    const extras = [...form.querySelectorAll('input[name="extras"]')];

    let services = Object.fromEntries((window.CLEANING_DEFAULT_SERVICES || [
        { id: "regular", name: "Поддерживающая уборка", rate: 65, minimum: 2500, speed: 22 },
        { id: "general", name: "Генеральная уборка", rate: 125, minimum: 5200, speed: 15 },
        { id: "afterRepair", name: "Уборка после ремонта", rate: 175, minimum: 7500, speed: 11 },
        { id: "office", name: "Уборка офиса", rate: 75, minimum: 3500, speed: 25 }
    ]).map((service) => [service.id, service]));
    const discounts = { once: 0, weekly: 0.15, twiceMonth: 0.10, monthly: 0.05 };
    const frequencyNames = { once: "Разовая уборка", weekly: "Каждую неделю", twiceMonth: "Два раза в месяц", monthly: "Раз в месяц" };
    const extraNames = { windows: "мойка окон", sofa: "химчистка дивана", oven: "духовой шкаф", fridge: "холодильник" };
    let currentCalculation = null;

    const setActionStatus = (message, type = "") => {
        actionStatus.textContent = message;
        actionStatus.classList.remove("is-success", "is-error");
        if (type) actionStatus.classList.add(type);
    };
    const clampArea = (value) => Math.min(300, Math.max(20, Number(value) || 20));

    const calculate = () => {
        const service = services[serviceType.value] || Object.values(services)[0];
        if (!service) return;
        const area = clampArea(areaInput.value);
        const bathroomCount = Number(bathrooms.value);
        const base = Math.max(service.minimum, area * service.rate);
        const bathroomCost = Math.max(0, bathroomCount - 1) * 600;
        const selectedExtras = extras.filter((item) => item.checked);
        const extrasCost = selectedExtras.reduce((sum, item) => sum + Number(item.dataset.price), 0);
        const discount = Math.round(base * discounts[frequency.value]);
        const total = base + bathroomCost + extrasCost - discount;
        const duration = Math.max(2, Math.ceil(area / service.speed + (bathroomCount - 1) * 0.5 + selectedExtras.length * 0.5));
        currentCalculation = {
            serviceId: service.id,
            service: service.name,
            area,
            bathrooms: bathroomCount,
            frequency: frequencyNames[frequency.value],
            extras: selectedExtras.map((item) => extraNames[item.value]),
            total,
            duration
        };
        document.getElementById("basePrice").textContent = formatPrice(base);
        document.getElementById("bathroomPrice").textContent = formatPrice(bathroomCost);
        document.getElementById("extrasPrice").textContent = formatPrice(extrasCost);
        document.getElementById("discountPrice").textContent = "−" + formatPrice(discount);
        document.getElementById("discountRow").classList.toggle("is-hidden", discount === 0);
        document.getElementById("resultPrice").textContent = formatPrice(total);
        document.getElementById("resultDuration").textContent = duration + "–" + (duration + 1) + " ч";
    };

    const setArea = (value) => {
        const normalized = clampArea(value);
        areaInput.value = normalized;
        areaRange.value = normalized;
        calculate();
    };

    const updateAccess = () => {
        const user = window.cleaningData?.getCurrentUser();
        checkoutButton.disabled = Boolean(user && user.role !== "user");
        if (!user) {
            checkoutButton.innerHTML = '<i class="fas fa-sign-in-alt" aria-hidden="true"></i> Войти и оформить';
            setActionStatus("Перед оформлением потребуется вход или регистрация.");
        } else if (user.role === "user") {
            checkoutButton.innerHTML = '<i class="fas fa-arrow-right" aria-hidden="true"></i> Перейти к оформлению';
            setActionStatus("Расчёт будет перенесён на отдельную страницу оформления.", "is-success");
        } else {
            checkoutButton.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i> Заказ доступен только клиентам';
            setActionStatus(user.role === "admin"
                ? "Администратор управляет заказами в панели и не может оформлять их."
                : "Сотрудник работает с назначенными выездами и не может оформлять заказы.", "is-error");
        }
    };

    checkoutButton.addEventListener("click", async () => {
        if (!currentCalculation) return;
        try {
            localStorage.setItem("cleaning-checkout-calculation", JSON.stringify(currentCalculation));
        } catch (error) {
            setActionStatus("Не удалось сохранить расчёт в браузере.", "is-error");
            return;
        }
        await window.cleaningDataReady;
        const user = window.cleaningData.getCurrentUser();
        if (!user) {
            sessionStorage.setItem("cleaning-pending-checkout", "1");
            window.cleaningAccount?.requireLogin("checkout");
            return;
        }
        if (user.role === "user") window.location.href = "checkout.html";
    });

    areaRange.addEventListener("input", () => setArea(areaRange.value));
    areaInput.addEventListener("input", () => setArea(areaInput.value));
    [serviceType, bathrooms, frequency, ...extras].forEach((element) => element.addEventListener("change", calculate));
    servicesGrid?.addEventListener("click", (event) => {
        const button = event.target.closest(".js-service-select");
        if (!button || !services[button.dataset.service]) return;
        serviceType.value = button.dataset.service;
        calculate();
        document.getElementById("calculator").scrollIntoView({ behavior: "smooth" });
    });
    document.querySelectorAll(".js-plan-select").forEach((button) => button.addEventListener("click", () => {
        serviceType.value = services[button.dataset.service] ? button.dataset.service : Object.keys(services)[0];
        setArea(button.dataset.area);
        document.getElementById("calculator").scrollIntoView({ behavior: "smooth" });
    }));

    const renderPublicServices = (catalog) => {
        if (!servicesGrid) return;
        servicesGrid.textContent = "";
        catalog.forEach((service, index) => {
            const article = document.createElement("article");
            article.className = "services-item";
            article.setAttribute("data-aos", "fade-up");
            article.setAttribute("data-aos-duration", "600");
            article.setAttribute("data-aos-delay", String(Math.min(index, 3) * 100));
            const imageBox = document.createElement("div");
            imageBox.className = "img-box";
            const image = document.createElement("img");
            image.src = service.image || "img/service/house.jpg";
            image.alt = service.name;
            imageBox.appendChild(image);
            article.appendChild(imageBox);
            appendTextElement(article, "h3", "", service.name);
            appendTextElement(article, "p", "", service.description);
            appendTextElement(article, "strong", "service-price", "от " + formatPrice(service.minimum));
            const button = appendTextElement(article, "button", "service-link js-service-select", "Рассчитать");
            button.type = "button";
            button.dataset.service = service.id;
            servicesGrid.appendChild(article);
        });
        if (window.AOS) AOS.refreshHard();
    };

    const loadServices = async () => {
        try {
            await window.cleaningDataReady;
            const catalog = await window.cleaningData.getServices();
            if (!catalog.length) return;
            services = Object.fromEntries(catalog.map((service) => [service.id, service]));
            const previousValue = serviceType.value;
            serviceType.textContent = "";
            catalog.forEach((service) => {
                const option = document.createElement("option");
                option.value = service.id;
                option.textContent = service.name;
                serviceType.appendChild(option);
            });
            serviceType.value = services[previousValue] ? previousValue : catalog[0].id;
            renderPublicServices(catalog);
            calculate();
        } catch (error) {
            setActionStatus("Каталог временно недоступен, используется базовый расчёт.");
        }
    };

    window.addEventListener("cleaning:data-changed", (event) => {
        if (["services", "all"].includes(event.detail?.entity)) loadServices();
    });
    window.addEventListener("cleaning:auth-changed", updateAccess);
    calculate();
    loadServices().finally(updateAccess);
};

setupHeader();
setupNavigation();
setupCalculator();
