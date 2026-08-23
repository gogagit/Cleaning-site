(function () {
    "use strict";

    class OrderController {
        constructor(model) { this.model = model; }
        getSlotAvailability(slot) { return this.model.getSlotAvailability(slot); }
        createOrder(order) { return this.model.createOrder(order); }
        getOrders(options) { return this.model.getOrders(options); }
        updateOrderStatus(id, status) { return this.model.updateOrderStatus(id, status); }
        assignOrder(id, employeeId) { return this.model.assignOrder(id, employeeId); }
        cancelOrder(id) { return this.model.cancelOrder(id); }
        getEmployeeAvailabilityForOrder(id) { return this.model.getEmployeeAvailabilityForOrder(id); }
        updateEmployeeOrderStatus(id, status) { return this.model.updateEmployeeOrderStatus(id, status); }
        deleteOrder(id) { return this.model.deleteOrder(id); }
    }

    window.OrderController = OrderController;
})();
