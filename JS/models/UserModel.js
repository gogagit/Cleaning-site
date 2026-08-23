(function () {
    "use strict";

    class UserModel {
        constructor(dbManager) { this.db = dbManager; }
        getCurrentUser() { return this.db.getCurrentUser(); }
        getModeInfo() { return this.db.getModeInfo(); }
        isAdmin() { return this.db.isAdmin(); }
        isEmployee() { return this.db.isEmployee(); }
        isClient() { return this.db.isClient(); }
        register(values) { return this.db.register(values); }
        login(values) { return this.db.login(values); }
        logout() { return this.db.logout(); }
        getProfiles() { return this.db.getProfiles(); }
        getEmployees() { return this.db.getEmployees(); }
        createEmployee(values) { return this.db.createEmployee(values); }
        getStaffInvites() { return this.db.getStaffInvites(); }
        updateProfile(id, changes) { return this.db.updateProfile(id, changes); }
    }

    window.UserModel = UserModel;
})();
