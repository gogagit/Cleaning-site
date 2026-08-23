(function () {
    "use strict";

    class AuthView {
        static get roles() {
            return {
                user: { label: "Клиент", href: "account.html", action: "Открыть личный кабинет" },
                employee: { label: "Сотрудник", href: "employee.html", action: "Открыть кабинет сотрудника" },
                admin: { label: "Администратор", href: "admin.html", action: "Открыть панель администратора" }
            };
        }
        static setStatus(element, message, type) { window.NotificationView.setStatus(element, message, type); }
        static setBusy(form, busy) { window.NotificationView.setBusy(form, busy); }
    }

    window.AuthView = AuthView;
})();
