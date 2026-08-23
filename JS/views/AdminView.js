(function () {
    "use strict";

    window.AdminView = class AdminView extends window.OrderView {
        static escapeHtml(value) { return window.CleaningHelpers.escapeHtml(value); }
    };
})();
