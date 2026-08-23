(function () {
    "use strict";

    class ServiceModel {
        constructor(dbManager) { this.db = dbManager; }
        getServices(options) { return this.db.getServices(options); }
        saveService(service) { return this.db.saveService(service); }
        deleteService(id) { return this.db.deleteService(id); }
    }

    window.ServiceModel = ServiceModel;
})();
