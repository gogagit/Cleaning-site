(function () {
    "use strict";

    window.CLEANING_CONSTANTS = Object.freeze({
        roles: Object.freeze({ CLIENT: "user", EMPLOYEE: "employee", ADMIN: "admin" }),
        rolePages: Object.freeze({ user: "account.html", employee: "employee.html", admin: "admin.html" }),
        orderStatuses: Object.freeze({
            new: "Новый",
            confirmed: "Подтверждён",
            assigned: "Назначен специалист",
            in_progress: "Выполняется",
            completed: "Завершён",
            cancelled: "Отменён"
        }),
        storageKeys: Object.freeze({
            users: "cleaning-users",
            session: "cleaning-session",
            services: "cleaning-services",
            orders: "cleaning-orders",
            messages: "cleaning-messages"
        })
    });
})();
