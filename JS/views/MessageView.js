(function () {
    "use strict";

    class MessageView {
        static get statuses() {
            return { new: "Ожидает ответа", read: "Прочитано", answered: "Есть ответ" };
        }
        static statusLabel(status) { return this.statuses[status] || status; }
    }

    window.MessageView = MessageView;
})();
