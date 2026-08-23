(function () {
    "use strict";

    class UserController {
        constructor(model) { this.model = model; }
        getCurrentUser() { return this.model.getCurrentUser(); }
        getModeInfo() { return this.model.getModeInfo(); }
        isAdmin() { return this.model.isAdmin(); }
        isEmployee() { return this.model.isEmployee(); }
        isClient() { return this.model.isClient(); }
        register(values) { return this.model.register(values); }
        login(values) { return this.model.login(values); }
        logout() { return this.model.logout(); }
        getProfiles() { return this.model.getProfiles(); }
        getEmployees() { return this.model.getEmployees(); }
        createEmployee(values) { return this.model.createEmployee(values); }
        getStaffInvites() { return this.model.getStaffInvites(); }
        updateProfile(id, changes) { return this.model.updateProfile(id, changes); }
    }

    window.UserController = UserController;
})();
