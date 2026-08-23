(function () {
    "use strict";

    class MessageController {
        constructor(model) { this.model = model; }
        createMessage(message) { return this.model.createMessage(message); }
        getMessages() { return this.model.getMessages(); }
        addMessageReply(id, text) { return this.model.addMessageReply(id, text); }
        updateMessageStatus(id, status) { return this.model.updateMessageStatus(id, status); }
        deleteMessage(id) { return this.model.deleteMessage(id); }
    }

    window.MessageController = MessageController;
})();
