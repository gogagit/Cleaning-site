(function () {
    "use strict";

    class ScheduleView {
        static availabilityText(count) {
            return count > 0 ? `свободно: ${count}` : "все заняты";
        }
        static durationHours(minutes) { return Math.max(1, Math.round(Number(minutes || 60) / 60)); }
    }

    window.ScheduleView = ScheduleView;
})();
