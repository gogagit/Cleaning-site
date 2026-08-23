(function () {
    "use strict";

    class OrderView {
        static currency(value) { return window.CleaningHelpers.currency(value); }
        static dateTime(value, options) { return window.CleaningHelpers.dateTime(value, options); }
        static appendText(parent, tag, className, text) {
            return window.CleaningHelpers.appendText(parent, tag, className, text);
        }
        static get statuses() { return window.CLEANING_CONSTANTS.orderStatuses; }
    }

    window.OrderView = OrderView;
})();
