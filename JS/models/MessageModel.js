(function () {
    "use strict";

    class MessageModel {
        constructor(dbManager) { this.db = dbManager; }
        createMessage(message) { return this.db.createMessage(message); }
        getMessages() { return this.db.getMessages(); }
        addMessageReply(id, text) { return this.db.addMessageReply(id, text); }
        updateMessageStatus(id, status) { return this.db.updateMessageStatus(id, status); }
        deleteMessage(id) { return this.db.deleteMessage(id); }
    }

    window.MessageModel = MessageModel;
})();
