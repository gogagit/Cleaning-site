(function () {
    "use strict";

    class Router {
        static dashboardForRole(role) {
            return window.CLEANING_CONSTANTS?.rolePages?.[role] || "account.html";
        }

        static redirectToDashboard(user, { replace = false } = {}) {
            const url = this.dashboardForRole(user?.role);
            if (replace) window.location.replace(url);
            else window.location.href = url;
        }
    }

    window.CleaningRouter = Router;
})();
