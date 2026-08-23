(function () {
    "use strict";

    class NotificationView {
        static setStatus(element, message, type = "") {
            if (!element) return;
            element.textContent = message;
            element.classList.remove("is-success", "is-error");
            if (type) element.classList.add(type);
        }

        static setBusy(container, busy) {
            container?.querySelectorAll("button, input, select, textarea")
                .forEach((control) => { control.disabled = busy; });
        }
    }

    window.NotificationView = NotificationView;
})();
