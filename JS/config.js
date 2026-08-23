/*
 * Оставьте значения пустыми для локального демо-режима.
 * Для подключения Supabase вставьте Project URL и publishable (anon) key.
 * Секретный service_role key нельзя размещать в клиентском коде.
 */
window.CLEANING_CONFIG = {
    supabaseUrl: "",
    supabasePublishableKey: "",
    demoClientEmail: "client@chistodom.local",
    demoClientPassword: "Client123!",
    demoAdminEmail: "admin@chistodom.local",
    demoAdminPassword: "Admin123!",
    demoEmployeeEmail: "employee@chistodom.local",
    demoEmployeePassword: "Employee123!",
    serviceCommissionPercent: 30,
    employeeSharePercent: 70
};
