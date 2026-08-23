(function () {
    "use strict";

    class OrderModel {
        constructor(dbManager) { this.db = dbManager; }
        getSlotAvailability(slot) { return this.db.getSlotAvailability(slot); }
        createOrder(order) { return this.db.createOrder(order); }
        getOrders(options) { return this.db.getOrders(options); }
        updateOrderStatus(id, status) { return this.db.updateOrderStatus(id, status); }
        assignOrder(id, employeeId) { return this.db.assignOrder(id, employeeId); }
        cancelOrder(id) { return this.db.cancelOrder(id); }
        getEmployeeAvailabilityForOrder(id) { return this.db.getEmployeeAvailabilityForOrder(id); }
        updateEmployeeOrderStatus(id, status) { return this.db.updateEmployeeOrderStatus(id, status); }
        deleteOrder(id) { return this.db.deleteOrder(id); }
    }

    window.OrderModel = OrderModel;
})();
