(function () {
    "use strict";

    class SiteView {
        static formatPrice(value) { return window.CleaningHelpers.currency(value); }
        static appendText(parent, tag, className, text) {
            return window.CleaningHelpers.appendText(parent, tag, className, text);
        }
    }

    window.SiteView = SiteView;
})();
