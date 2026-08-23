(function () {
    "use strict";

    class ServiceController {
        constructor(model) { this.model = model; }
        getServices(options) { return this.model.getServices(options); }
        saveService(service) { return this.model.saveService(service); }
        deleteService(id) { return this.model.deleteService(id); }
    }

    window.ServiceController = ServiceController;
})();
