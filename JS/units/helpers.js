(function () {
    "use strict";

    const currency = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0)) + " ₽";
    const dateTime = (value, options = {}) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return new Intl.DateTimeFormat("ru-RU", {
            day: "2-digit", month: options.longMonth ? "long" : "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        }).format(date);
    };
    const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    const appendText = (parent, tagName, className, textValue) => {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = textValue;
        parent.appendChild(element);
        return element;
    };

    window.CleaningHelpers = Object.freeze({ currency, dateTime, escapeHtml, appendText });
})();
