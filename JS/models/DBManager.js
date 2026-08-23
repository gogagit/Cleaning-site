(function () {
    "use strict";

    const config = window.CLEANING_CONFIG || {};
    const keys = {
        users: "cleaning-users",
        session: "cleaning-session",
        services: "cleaning-services",
        orders: "cleaning-orders",
        messages: "cleaning-messages",
        updated: "cleaning-data-updated"
    };

    const defaultServices = [
        {
            id: "regular",
            name: "Поддерживающая уборка",
            rate: 65,
            minimum: 2500,
            speed: 22,
            description: "Регулярная уборка жилых комнат, кухни и санузла.",
            image: "img/service/house.jpg",
            active: true,
            sortOrder: 10
        },
        {
            id: "general",
            name: "Генеральная уборка",
            rate: 125,
            minimum: 5200,
            speed: 15,
            description: "Глубокая очистка поверхностей и труднодоступных мест.",
            image: "img/service/bathroom.jpg",
            active: true,
            sortOrder: 20
        },
        {
            id: "afterRepair",
            name: "Уборка после ремонта",
            rate: 175,
            minimum: 7500,
            speed: 11,
            description: "Удаление строительной пыли, следов смесей и загрязнений.",
            image: "img/service/window.jpg",
            active: true,
            sortOrder: 30
        },
        {
            id: "office",
            name: "Уборка офиса",
            rate: 75,
            minimum: 3500,
            speed: 25,
            description: "Разовая или регулярная уборка рабочих помещений.",
            image: "img/service/furniture.png",
            active: true,
            sortOrder: 40
        }
    ];

    const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

    const readLocal = (key, fallback) => {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch (error) {
            return fallback;
        }
    };

    const writeLocal = (key, value, entity) => {
        localStorage.setItem(key, JSON.stringify(value));
        localStorage.setItem(keys.updated, JSON.stringify({ entity, at: Date.now() }));
        window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity } }));
    };

    const bytesToBase64 = (bytes) => {
        let value = "";
        bytes.forEach((byte) => {
            value += String.fromCharCode(byte);
        });
        return btoa(value);
    };

    const randomSalt = () => {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return bytesToBase64(bytes);
    };

    const hashPassword = async (password, salt) => {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits"]
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: encoder.encode(salt),
                iterations: 120000,
                hash: "SHA-256"
            },
            key,
            256
        );
        return bytesToBase64(new Uint8Array(bits));
    };

    const createId = (prefix) => {
        if (crypto.randomUUID) return crypto.randomUUID();
        return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    };

    const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

    const getOrderDurationMinutes = (order) => {
        const explicit = Number(order.durationMinutes ?? order.duration_minutes);
        if (explicit > 0) return Math.max(60, Math.round(explicit));
        const durations = (Array.isArray(order.items) ? order.items : [])
            .map((item) => Number(item.duration) * 60)
            .filter((value) => value > 0);
        return Math.max(120, durations.length ? Math.max(...durations) : 120);
    };

    const getOrderStart = (order) => {
        const explicit = order.scheduledStart ?? order.scheduled_start;
        if (explicit) {
            const date = new Date(explicit);
            if (!Number.isNaN(date.getTime())) return date;
        }
        const dateValue = order.scheduledDate ?? order.scheduled_date ?? order.customer?.date;
        const timeValue = order.scheduledTime ?? order.scheduled_time ?? order.customer?.time;
        if (!dateValue || !timeValue) return null;
        const date = new Date(dateValue + "T" + timeValue + ":00");
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const ordersOverlap = (left, right) => {
        const leftStart = getOrderStart(left);
        const rightStart = getOrderStart(right);
        if (!leftStart || !rightStart) return false;
        const leftEnd = leftStart.getTime() + getOrderDurationMinutes(left) * 60000;
        const rightEnd = rightStart.getTime() + getOrderDurationMinutes(right) * 60000;
        return leftStart.getTime() < rightEnd && rightStart.getTime() < leftEnd;
    };

    const publicUser = (user) => {
        if (!user) return null;
        const rawName = String(user.name || "").trim();
        const safeName = rawName && rawName !== "undefined"
            ? rawName
            : normalizeEmail(user.email).split("@")[0] || "Клиент";
        return {
            id: user.id,
            name: safeName,
            email: normalizeEmail(user.email),
            role: user.role || "user",
            active: user.active !== false,
            createdAt: user.createdAt || user.created_at
        };
    };

    const loadSupabaseSdk = () => new Promise((resolve, reject) => {
        if (window.supabase && typeof window.supabase.createClient === "function") {
            resolve(window.supabase);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        script.async = true;
        script.onload = () => resolve(window.supabase);
        script.onerror = () => reject(new Error("Не удалось загрузить Supabase SDK."));
        document.head.appendChild(script);
    });

    /**
     * Низкоуровневый менеджер данных приложения.
     * Инкапсулирует localStorage, Supabase и правила доступа к данным.
     */
    class DBManager {
        constructor() {
            this.mode = "local";
            this.client = null;
            this.currentUser = null;
            this.connectionMessage = "";
            this.authSubscription = null;
        }

        isSupabaseConfigured() {
            return /^https:\/\/.+\.supabase\.co$/i.test(String(config.supabaseUrl || "").trim()) &&
                String(config.supabasePublishableKey || "").trim().length > 30;
        }

        async init() {
            await this.ensureLocalSeeds();
            this.restoreLocalSession();

            if (this.isSupabaseConfigured()) {
                try {
                    const sdk = await loadSupabaseSdk();
                    this.client = sdk.createClient(
                        config.supabaseUrl.trim(),
                        config.supabasePublishableKey.trim(),
                        {
                            auth: {
                                autoRefreshToken: true,
                                persistSession: true,
                                detectSessionInUrl: true
                            }
                        }
                    );
                    const { data, error } = await this.client.auth.getSession();
                    if (error) throw error;
                    this.mode = "supabase";
                    await this.setSupabaseUser(data.session ? data.session.user : null);
                    const { data: listener } = this.client.auth.onAuthStateChange((_event, session) => {
                        setTimeout(async () => {
                            await this.setSupabaseUser(session ? session.user : null);
                            this.emitAuthChange();
                        }, 0);
                    });
                    this.authSubscription = listener.subscription;
                } catch (error) {
                    this.mode = "local";
                    this.client = null;
                    this.connectionMessage = "Supabase недоступен — включён локальный режим.";
                    this.restoreLocalSession();
                }
            }

            window.dispatchEvent(new CustomEvent("cleaning:data-ready", {
                detail: { mode: this.mode, message: this.connectionMessage }
            }));
            return this;
        }

        async ensureLocalSeeds() {
            const services = readLocal(keys.services, null);
            if (!Array.isArray(services) || services.length === 0) {
                writeLocal(keys.services, defaultServices, "services");
            }

            const users = readLocal(keys.users, []);
            const seedUser = async ({ id, name, email, password, role }) => {
                const normalizedEmail = normalizeEmail(email);
                if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) return;
                const salt = randomSalt();
                const passwordHash = await hashPassword(password, salt);
                users.push({
                    id,
                    name,
                    email: normalizedEmail,
                    passwordHash,
                    passwordSalt: salt,
                    role,
                    active: true,
                    createdAt: new Date().toISOString()
                });
                writeLocal(keys.users, users, "users");
            };
            await seedUser({ id: "local-client", name: "Иван Петров", email: config.demoClientEmail || "client@chistodom.local", password: config.demoClientPassword || "Client123!", role: "user" });
            await seedUser({ id: "local-admin", name: "Администратор", email: config.demoAdminEmail || "admin@chistodom.local", password: config.demoAdminPassword || "Admin123!", role: "admin" });
            await seedUser({ id: "local-employee", name: "Алексей Орлов", email: config.demoEmployeeEmail || "employee@chistodom.local", password: config.demoEmployeePassword || "Employee123!", role: "employee" });
            await seedUser({ id: "local-employee-maria", name: "Мария Волкова", email: "maria@chistodom.local", password: "Staff123!", role: "employee" });
            await seedUser({ id: "local-employee-anna", name: "Анна Смирнова", email: "anna@chistodom.local", password: "Staff123!", role: "employee" });

            if (!Array.isArray(readLocal(keys.orders, null))) {
                writeLocal(keys.orders, [], "orders");
            }
            if (!Array.isArray(readLocal(keys.messages, null))) {
                writeLocal(keys.messages, [], "messages");
            }
        }

        restoreLocalSession() {
            const session = readLocal(keys.session, null);
            const users = readLocal(keys.users, []);
            const user = session ? users.find((item) => item.id === session.userId && item.active !== false) : null;
            this.currentUser = publicUser(user);
        }

        async setSupabaseUser(authUser) {
            if (!authUser || !this.client) {
                this.currentUser = null;
                return;
            }
            const { data } = await this.client
                .from("profiles")
                .select("id,name,email,role,is_active,created_at")
                .eq("id", authUser.id)
                .maybeSingle();
            this.currentUser = {
                id: authUser.id,
                name: data?.name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "Клиент",
                email: data?.email || authUser.email,
                role: data?.role || "user",
                active: data?.is_active !== false,
                createdAt: data?.created_at || authUser.created_at
            };
            if (!this.currentUser.active) {
                await this.client.auth.signOut();
                this.currentUser = null;
            }
        }

        emitAuthChange() {
            window.dispatchEvent(new CustomEvent("cleaning:auth-changed", {
                detail: { user: this.getCurrentUser(), mode: this.mode }
            }));
        }

        getCurrentUser() {
            return clone(this.currentUser);
        }

        isAdmin() {
            return this.currentUser?.role === "admin";
        }

        isEmployee() {
            return this.currentUser?.role === "employee";
        }

        isClient() {
            return this.currentUser?.role === "user";
        }

        getModeInfo() {
            return {
                mode: this.mode,
                label: this.mode === "supabase" ? "Supabase" : "Локальный режим",
                message: this.connectionMessage
            };
        }

        async register({ name, email, password }) {
            const normalizedEmail = normalizeEmail(email);
            const normalizedName = String(name || "").trim();
            if (normalizedName.length < 2 || normalizedName === "undefined") {
                throw new Error("Укажите имя длиной не менее двух символов.");
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                throw new Error("Укажите корректную электронную почту.");
            }
            if (String(password || "").length < 8) {
                throw new Error("Пароль должен содержать не менее восьми символов.");
            }
            if (this.mode === "supabase") {
                const { data, error } = await this.client.auth.signUp({
                    email: normalizedEmail,
                    password,
                    options: { data: { name: normalizedName } }
                });
                if (error) throw error;
                if (data.session) {
                    await this.setSupabaseUser(data.user);
                    this.emitAuthChange();
                }
                return {
                    user: data.user,
                    needsEmailConfirmation: !data.session
                };
            }

            const users = readLocal(keys.users, []);
            if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
                throw new Error("Пользователь с такой почтой уже зарегистрирован.");
            }
            const salt = randomSalt();
            const user = {
                id: createId("user"),
                name: normalizedName,
                email: normalizedEmail,
                passwordHash: await hashPassword(password, salt),
                passwordSalt: salt,
                role: "user",
                active: true,
                createdAt: new Date().toISOString()
            };
            users.push(user);
            writeLocal(keys.users, users, "users");
            writeLocal(keys.session, { userId: user.id }, "session");
            this.currentUser = publicUser(user);
            this.emitAuthChange();
            return { user: this.getCurrentUser(), needsEmailConfirmation: false };
        }

        async login({ email, password }) {
            const normalizedEmail = normalizeEmail(email);
            if (!normalizedEmail || !password) throw new Error("Введите электронную почту и пароль.");
            if (this.mode === "supabase") {
                const { data, error } = await this.client.auth.signInWithPassword({
                    email: normalizedEmail,
                    password
                });
                if (error) throw error;
                await this.setSupabaseUser(data.user);
                if (!this.currentUser) throw new Error("Учётная запись отключена.");
                this.emitAuthChange();
                return this.getCurrentUser();
            }

            const users = readLocal(keys.users, []);
            const user = users.find((item) => normalizeEmail(item.email) === normalizedEmail);
            if (!user || await hashPassword(password, user.passwordSalt) !== user.passwordHash) {
                throw new Error("Неверная почта или пароль.");
            }
            if (user.active === false) throw new Error("Учётная запись отключена администратором.");
            writeLocal(keys.session, { userId: user.id }, "session");
            this.currentUser = publicUser(user);
            this.emitAuthChange();
            return this.getCurrentUser();
        }

        async logout() {
            if (this.mode === "supabase") {
                const { error } = await this.client.auth.signOut();
                if (error) throw error;
            } else {
                localStorage.removeItem(keys.session);
            }
            this.currentUser = null;
            this.emitAuthChange();
        }

        normalizeService(service) {
            return {
                id: service.id,
                name: service.name,
                rate: Number(service.rate),
                minimum: Number(service.minimum),
                speed: Number(service.speed),
                description: service.description || "",
                image: service.image || "img/service/house.jpg",
                active: service.active !== false,
                sortOrder: Number(service.sortOrder ?? service.sort_order ?? 100)
            };
        }

        async getServices({ includeInactive = false } = {}) {
            if (this.mode === "supabase") {
                let query = this.client.from("services").select("*").order("sort_order");
                if (!includeInactive || !this.isAdmin()) query = query.eq("active", true);
                const { data, error } = await query;
                if (error) throw error;
                return data.map((service) => this.normalizeService(service));
            }
            return readLocal(keys.services, defaultServices)
                .map((service) => this.normalizeService(service))
                .filter((service) => includeInactive || service.active)
                .sort((a, b) => a.sortOrder - b.sortOrder);
        }

        async saveService(service) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            const normalized = this.normalizeService(service);
            if (this.mode === "supabase") {
                const payload = {
                    id: normalized.id,
                    name: normalized.name,
                    rate: normalized.rate,
                    minimum: normalized.minimum,
                    speed: normalized.speed,
                    description: normalized.description,
                    image: normalized.image,
                    active: normalized.active,
                    sort_order: normalized.sortOrder,
                    updated_at: new Date().toISOString()
                };
                const { error } = await this.client.from("services").upsert(payload);
                if (error) throw error;
            } else {
                const services = readLocal(keys.services, defaultServices);
                const index = services.findIndex((item) => item.id === normalized.id);
                if (index >= 0) services[index] = normalized;
                else services.push(normalized);
                writeLocal(keys.services, services, "services");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "services" } }));
            return normalized;
        }

        async deleteService(id) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode === "supabase") {
                const { error } = await this.client.from("services").delete().eq("id", id);
                if (error) throw error;
            } else {
                const services = readLocal(keys.services, defaultServices).filter((item) => item.id !== id);
                writeLocal(keys.services, services, "services");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "services" } }));
        }

        normalizeOrder(order) {
            return {
                id: order.id || order.number,
                number: order.number,
                userId: order.userId ?? order.user_id ?? null,
                customer: order.customer || {},
                items: Array.isArray(order.items) ? order.items : [],
                total: Number(order.total),
                status: order.status || "new",
                employeeId: order.employeeId ?? order.employee_id ?? null,
                employeeName: order.employeeName ?? order.employee_name ?? "",
                commissionPercent: Number(order.commissionPercent ?? order.commission_percent ?? config.serviceCommissionPercent ?? 30),
                serviceCommission: Number(order.serviceCommission ?? order.service_commission ?? 0),
                employeeEarning: Number(order.employeeEarning ?? order.employee_earning ?? 0),
                assignedAt: order.assignedAt ?? order.assigned_at ?? null,
                scheduledDate: order.scheduledDate ?? order.scheduled_date ?? order.customer?.date,
                scheduledTime: order.scheduledTime ?? order.scheduled_time ?? order.customer?.time,
                scheduledStart: order.scheduledStart ?? order.scheduled_start ?? getOrderStart(order)?.toISOString() ?? null,
                durationMinutes: getOrderDurationMinutes(order),
                createdAt: order.createdAt ?? order.created_at ?? new Date().toISOString()
            };
        }

        async getSlotAvailability({ date, time, durationMinutes }) {
            const candidate = this.normalizeOrder({
                scheduledDate: date,
                scheduledTime: time,
                durationMinutes,
                items: []
            });
            if (!candidate.scheduledStart) return { totalEmployees: 0, occupiedEmployees: 0, availableEmployees: 0 };
            if (this.mode === "supabase") {
                const { data, error } = await this.client.rpc("get_slot_availability", {
                    p_start: candidate.scheduledStart,
                    p_duration_minutes: candidate.durationMinutes
                });
                if (error) throw error;
                const row = Array.isArray(data) ? data[0] : data;
                return {
                    totalEmployees: Number(row?.total_employees || 0),
                    occupiedEmployees: Number(row?.occupied_employees || 0),
                    availableEmployees: Number(row?.available_employees || 0)
                };
            }
            const users = readLocal(keys.users, []);
            const totalEmployees = users.filter((user) => user.role === "employee" && user.active !== false).length;
            const occupiedEmployees = readLocal(keys.orders, [])
                .map((order) => this.normalizeOrder(order))
                .filter((order) => order.status !== "cancelled" && ordersOverlap(order, candidate)).length;
            return { totalEmployees, occupiedEmployees, availableEmployees: Math.max(0, totalEmployees - occupiedEmployees) };
        }

        async createOrder(order) {
            if (!this.currentUser) throw new Error("Перед оформлением заказа необходимо войти.");
            if (!this.isClient()) throw new Error("Оформление заказов доступно только клиентам.");
            const normalized = this.normalizeOrder({
                ...order,
                id: order.id || createId("order"),
                userId: this.currentUser?.id || null,
                status: "new"
            });
            const availability = await this.getSlotAvailability({
                date: normalized.scheduledDate,
                time: normalized.scheduledTime,
                durationMinutes: normalized.durationMinutes
            });
            if (availability.availableEmployees < 1) {
                throw new Error("На это время все сотрудники заняты. Выберите другой интервал.");
            }
            if (this.mode === "supabase") {
                const payload = {
                    number: normalized.number,
                    user_id: normalized.userId,
                    customer: normalized.customer,
                    items: normalized.items,
                    total: normalized.total,
                    status: normalized.status,
                    commission_percent: normalized.commissionPercent,
                    service_commission: normalized.serviceCommission,
                    employee_earning: normalized.employeeEarning,
                    scheduled_date: normalized.scheduledDate,
                    scheduled_time: normalized.scheduledTime,
                    scheduled_start: normalized.scheduledStart,
                    duration_minutes: normalized.durationMinutes
                };
                const { data, error } = await this.client.from("orders").insert(payload).select().single();
                if (error) throw error;
                window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "orders" } }));
                return this.normalizeOrder(data);
            }
            const orders = readLocal(keys.orders, []);
            orders.push(normalized);
            writeLocal(keys.orders, orders.slice(-500), "orders");
            return normalized;
        }

        async getOrders({ all = false } = {}) {
            if (this.mode === "supabase") {
                let query = this.client.from("orders").select("*").order("created_at", { ascending: false });
                if (all && !this.isAdmin()) throw new Error("Недостаточно прав.");
                const { data, error } = await query;
                if (error) throw error;
                return data.map((order) => this.normalizeOrder(order));
            }
            const orders = readLocal(keys.orders, []).map((order) => this.normalizeOrder(order));
            if (all && this.isAdmin()) return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            if (!this.currentUser) return [];
            if (this.isEmployee()) {
                return orders
                    .filter((order) => order.employeeId === this.currentUser.id)
                    .sort((a, b) => String(a.scheduledDate + "T" + a.scheduledTime).localeCompare(String(b.scheduledDate + "T" + b.scheduledTime)));
            }
            return orders
                .filter((order) => order.userId === this.currentUser.id ||
                    normalizeEmail(order.customer?.email) === normalizeEmail(this.currentUser.email))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }

        async updateOrderStatus(id, status) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode === "supabase") {
                const { error } = await this.client.from("orders").update({ status }).eq("id", id);
                if (error) throw error;
            } else {
                const orders = readLocal(keys.orders, []).map((order) => {
                    const normalized = this.normalizeOrder(order);
                    return normalized.id === id ? { ...normalized, status } : normalized;
                });
                writeLocal(keys.orders, orders, "orders");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "orders" } }));
        }

        async assignOrder(id, employeeId) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            const employees = (await this.getProfiles()).filter((profile) => profile.role === "employee" && profile.active);
            const employee = employees.find((profile) => profile.id === employeeId);
            if (!employee) throw new Error("Выберите активного сотрудника.");
            const orders = await this.getOrders({ all: true });
            const order = orders.find((item) => item.id === id);
            if (!order) throw new Error("Заказ не найден.");
            if (["completed", "cancelled"].includes(order.status)) {
                throw new Error("Завершённый или отменённый заказ нельзя назначить сотруднику.");
            }
            const conflict = orders.some((item) => item.id !== order.id &&
                item.employeeId === employee.id && item.status !== "cancelled" && ordersOverlap(item, order));
            if (conflict) throw new Error("Этот сотрудник уже занят в выбранное время.");
            const commissionPercent = Number(config.serviceCommissionPercent ?? 30);
            const employeeSharePercent = Number(config.employeeSharePercent ?? 70);
            const changes = {
                employeeId: employee.id,
                employeeName: employee.name,
                commissionPercent,
                serviceCommission: Math.round(order.total * commissionPercent / 100),
                employeeEarning: Math.round(order.total * employeeSharePercent / 100),
                assignedAt: new Date().toISOString(),
                status: ["new", "confirmed"].includes(order.status) ? "assigned" : order.status
            };
            if (this.mode === "supabase") {
                const { error } = await this.client.from("orders").update({
                    employee_id: changes.employeeId,
                    employee_name: changes.employeeName,
                    commission_percent: changes.commissionPercent,
                    service_commission: changes.serviceCommission,
                    employee_earning: changes.employeeEarning,
                    assigned_at: changes.assignedAt,
                    status: changes.status
                }).eq("id", id);
                if (error) throw error;
            } else {
                const updatedOrders = readLocal(keys.orders, []).map((item) => {
                    const normalized = this.normalizeOrder(item);
                    return normalized.id === id ? { ...normalized, ...changes } : normalized;
                });
                writeLocal(keys.orders, updatedOrders, "orders");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "orders" } }));
        }

        async cancelOrder(id) {
            if (!this.isClient()) throw new Error("Отменить заказ может только клиент.");
            const orders = await this.getOrders();
            const order = orders.find((item) => item.id === id);
            if (!order) throw new Error("Заказ не найден.");
            if (!["new", "confirmed", "assigned"].includes(order.status)) {
                throw new Error("Этот заказ уже нельзя отменить.");
            }
            if (this.mode === "supabase") {
                const { error } = await this.client.from("orders").update({ status: "cancelled" }).eq("id", id);
                if (error) throw error;
            } else {
                const updatedOrders = readLocal(keys.orders, []).map((item) => {
                    const normalized = this.normalizeOrder(item);
                    return normalized.id === id ? { ...normalized, status: "cancelled" } : normalized;
                });
                writeLocal(keys.orders, updatedOrders, "orders");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "orders" } }));
        }

        async getEmployeeAvailabilityForOrder(orderId) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            const [orders, employees] = await Promise.all([this.getOrders({ all: true }), this.getEmployees()]);
            const order = orders.find((item) => item.id === orderId);
            if (!order) throw new Error("Заказ не найден.");
            return employees.map((employee) => ({
                ...employee,
                available: !orders.some((item) => item.id !== order.id && item.employeeId === employee.id &&
                    item.status !== "cancelled" && ordersOverlap(item, order))
            }));
        }

        async updateEmployeeOrderStatus(id, status) {
            if (!this.isEmployee()) throw new Error("Действие доступно только сотруднику.");
            if (!["in_progress", "completed"].includes(status)) throw new Error("Недопустимый статус.");
            const orders = await this.getOrders();
            if (!orders.some((order) => order.id === id && order.employeeId === this.currentUser.id)) {
                throw new Error("Заказ не назначен этому сотруднику.");
            }
            if (this.mode === "supabase") {
                const { error } = await this.client.from("orders").update({ status }).eq("id", id);
                if (error) throw error;
            } else {
                const updatedOrders = readLocal(keys.orders, []).map((item) => {
                    const normalized = this.normalizeOrder(item);
                    return normalized.id === id ? { ...normalized, status } : normalized;
                });
                writeLocal(keys.orders, updatedOrders, "orders");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "orders" } }));
        }

        async deleteOrder(id) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode === "supabase") {
                const { error } = await this.client.from("orders").delete().eq("id", id);
                if (error) throw error;
            } else {
                const orders = readLocal(keys.orders, [])
                    .map((order) => this.normalizeOrder(order))
                    .filter((order) => order.id !== id);
                writeLocal(keys.orders, orders, "orders");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "orders" } }));
        }

        normalizeMessage(message) {
            return {
                id: message.id,
                userId: message.userId ?? message.user_id ?? null,
                name: message.name,
                email: message.email,
                phone: message.phone || "",
                message: message.message,
                status: message.status || "new",
                replies: (Array.isArray(message.replies) ? message.replies : []).map((reply) => ({
                    id: reply.id || createId("reply"),
                    authorId: reply.authorId ?? reply.author_id ?? null,
                    authorName: reply.authorName ?? reply.author_name ?? "Пользователь",
                    authorRole: reply.authorRole ?? reply.author_role ?? "user",
                    text: String(reply.text || ""),
                    createdAt: reply.createdAt ?? reply.created_at ?? new Date().toISOString()
                })),
                createdAt: message.createdAt ?? message.created_at ?? new Date().toISOString()
            };
        }

        async createMessage(message) {
            const normalized = this.normalizeMessage({
                ...message,
                id: message.id || createId("message"),
                userId: this.currentUser?.id || null,
                status: "new"
            });
            if (this.mode === "supabase") {
                const { error } = await this.client
                    .from("messages")
                    .insert({
                        name: normalized.name,
                        user_id: normalized.userId,
                        email: normalized.email,
                        phone: normalized.phone,
                        message: normalized.message,
                        status: normalized.status
                    });
                if (error) throw error;
                window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "messages" } }));
                return normalized;
            }
            const messages = readLocal(keys.messages, []);
            messages.push(normalized);
            writeLocal(keys.messages, messages.slice(-500), "messages");
            return normalized;
        }

        async getMessages() {
            if (!this.currentUser) throw new Error("Войдите, чтобы открыть обращения.");
            if (this.mode === "supabase") {
                const { data, error } = await this.client.from("messages").select("*").order("created_at", { ascending: false });
                if (error) throw error;
                return data.map((message) => this.normalizeMessage(message));
            }
            const messages = readLocal(keys.messages, [])
                .map((message) => this.normalizeMessage(message))
                .filter((message) => this.isAdmin() || message.userId === this.currentUser.id ||
                    normalizeEmail(message.email) === normalizeEmail(this.currentUser.email))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return messages;
        }

        async addMessageReply(id, text) {
            if (!this.currentUser) throw new Error("Войдите, чтобы ответить.");
            const normalizedText = String(text || "").trim();
            if (normalizedText.length < 2) throw new Error("Ответ должен содержать не менее двух символов.");
            const reply = {
                id: createId("reply"),
                authorId: this.currentUser.id,
                authorName: this.currentUser.name,
                authorRole: this.currentUser.role,
                text: normalizedText,
                createdAt: new Date().toISOString()
            };
            if (this.mode === "supabase") {
                const { error } = await this.client.rpc("append_message_reply", {
                    p_message_id: id,
                    p_text: normalizedText
                });
                if (error) throw error;
            } else {
                let found = false;
                const messages = readLocal(keys.messages, []).map((message) => {
                    const normalized = this.normalizeMessage(message);
                    if (normalized.id !== id) return normalized;
                    const ownsMessage = normalized.userId === this.currentUser.id ||
                        normalizeEmail(normalized.email) === normalizeEmail(this.currentUser.email);
                    if (!this.isAdmin() && !ownsMessage) throw new Error("Нет доступа к этому обращению.");
                    found = true;
                    return {
                        ...normalized,
                        status: this.isAdmin() ? "answered" : "new",
                        replies: [...normalized.replies, reply]
                    };
                });
                if (!found) throw new Error("Обращение не найдено.");
                writeLocal(keys.messages, messages, "messages");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "messages" } }));
            return reply;
        }

        async updateMessageStatus(id, status) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode === "supabase") {
                const { error } = await this.client.from("messages").update({ status }).eq("id", id);
                if (error) throw error;
            } else {
                const messages = readLocal(keys.messages, []).map((message) => {
                    const normalized = this.normalizeMessage(message);
                    return normalized.id === id ? { ...normalized, status } : normalized;
                });
                writeLocal(keys.messages, messages, "messages");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "messages" } }));
        }

        async deleteMessage(id) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode === "supabase") {
                const { error } = await this.client.from("messages").delete().eq("id", id);
                if (error) throw error;
            } else {
                const messages = readLocal(keys.messages, [])
                    .map((message) => this.normalizeMessage(message))
                    .filter((message) => message.id !== id);
                writeLocal(keys.messages, messages, "messages");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "messages" } }));
        }

        async getProfiles() {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode === "supabase") {
                const { data, error } = await this.client
                    .from("profiles")
                    .select("id,name,email,role,is_active,created_at")
                    .order("created_at", { ascending: false });
                if (error) throw error;
                return data.map((profile) => ({
                    id: profile.id,
                    name: profile.name,
                    email: profile.email,
                    role: profile.role,
                    active: profile.is_active !== false,
                    createdAt: profile.created_at
                }));
            }
            return readLocal(keys.users, []).map(publicUser);
        }

        async getEmployees() {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            return (await this.getProfiles()).filter((profile) => profile.role === "employee" && profile.active);
        }

        async createEmployee({ name, email, password }) {
            if (!this.isAdmin()) throw new Error("Создавать сотрудников может только администратор.");
            const normalizedName = String(name || "").trim();
            const normalizedEmail = normalizeEmail(email);
            if (normalizedName.length < 2) throw new Error("Укажите имя сотрудника не короче двух символов.");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Укажите корректную электронную почту.");
            if (this.mode === "supabase") {
                const { data, error } = await this.client.from("staff_invites").upsert({
                    email: normalizedEmail,
                    name: normalizedName,
                    role: "employee",
                    status: "pending",
                    invited_by: this.currentUser.id
                }, { onConflict: "email" }).select().single();
                if (error) throw error;
                window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "users" } }));
                return { ...data, invited: true };
            }
            if (String(password || "").length < 8) throw new Error("Временный пароль должен содержать не менее восьми символов.");
            const users = readLocal(keys.users, []);
            if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) throw new Error("Пользователь с такой почтой уже существует.");
            const salt = randomSalt();
            const user = {
                id: createId("employee"), name: normalizedName, email: normalizedEmail,
                passwordHash: await hashPassword(password, salt), passwordSalt: salt,
                role: "employee", active: true, createdAt: new Date().toISOString()
            };
            users.push(user);
            writeLocal(keys.users, users, "users");
            return publicUser(user);
        }

        async getStaffInvites() {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode !== "supabase") return [];
            const { data, error } = await this.client.from("staff_invites").select("*").order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        }

        async updateProfile(id, changes) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (this.mode === "supabase") {
                const payload = {};
                if (changes.role) payload.role = changes.role;
                if (typeof changes.active === "boolean") payload.is_active = changes.active;
                const { error } = await this.client.from("profiles").update(payload).eq("id", id);
                if (error) throw error;
            } else {
                const users = readLocal(keys.users, []).map((user) => {
                    if (user.id !== id) return user;
                    if (user.id === "local-admin" && changes.role && changes.role !== "admin") {
                        throw new Error("Роль главного демо-администратора нельзя изменить.");
                    }
                    if (user.id === "local-admin" && changes.active === false) {
                        throw new Error("Главного демо-администратора нельзя отключить.");
                    }
                    return {
                        ...user,
                        role: changes.role || user.role,
                        active: typeof changes.active === "boolean" ? changes.active : user.active
                    };
                });
                writeLocal(keys.users, users, "users");
                if (this.currentUser?.id === id) this.restoreLocalSession();
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "users" } }));
        }

        async exportBackup() {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            const [services, orders, messages, profiles] = await Promise.all([
                this.getServices({ includeInactive: true }),
                this.getOrders({ all: true }),
                this.getMessages(),
                this.getProfiles()
            ]);
            return {
                version: 1,
                exportedAt: new Date().toISOString(),
                mode: this.mode,
                services,
                orders,
                messages,
                profiles
            };
        }

        async importBackup(backup) {
            if (!this.isAdmin()) throw new Error("Недостаточно прав.");
            if (!backup || backup.version !== 1) throw new Error("Неподдерживаемый формат резервной копии.");
            const services = Array.isArray(backup.services) ? backup.services : [];
            const orders = Array.isArray(backup.orders) ? backup.orders : [];
            const messages = Array.isArray(backup.messages) ? backup.messages : [];

            if (this.mode === "supabase") {
                if (services.length) {
                    const payload = services.map((service) => {
                        const item = this.normalizeService(service);
                        return {
                            id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)
                                ? item.id
                                : createId("order"),
                            name: item.name,
                            rate: item.rate,
                            minimum: item.minimum,
                            speed: item.speed,
                            description: item.description,
                            image: item.image,
                            active: item.active,
                            sort_order: item.sortOrder
                        };
                    });
                    const { error } = await this.client.from("services").upsert(payload);
                    if (error) throw error;
                }
                if (orders.length) {
                    const payload = orders.map((order) => {
                        const item = this.normalizeOrder(order);
                        return {
                            id: item.id,
                            number: item.number,
                            user_id: item.userId,
                            customer: item.customer,
                            items: item.items,
                            total: item.total,
                            status: item.status,
                            employee_id: item.employeeId,
                            employee_name: item.employeeName,
                            commission_percent: item.commissionPercent,
                            service_commission: item.serviceCommission,
                            employee_earning: item.employeeEarning,
                            assigned_at: item.assignedAt,
                            scheduled_date: item.scheduledDate,
                            scheduled_time: item.scheduledTime,
                            scheduled_start: item.scheduledStart,
                            duration_minutes: item.durationMinutes,
                            created_at: item.createdAt
                        };
                    });
                    const { error } = await this.client.from("orders").upsert(payload);
                    if (error) throw error;
                }
                if (messages.length) {
                    const payload = messages.map((message) => {
                        const item = this.normalizeMessage(message);
                        return {
                            id: item.id,
                            user_id: item.userId,
                            name: item.name,
                            email: item.email,
                            phone: item.phone,
                            message: item.message,
                            status: item.status,
                            replies: item.replies,
                            created_at: item.createdAt
                        };
                    });
                    const { error } = await this.client.from("messages").upsert(payload);
                    if (error) throw error;
                }
            } else {
                writeLocal(keys.services, services.map((service) => this.normalizeService(service)), "services");
                writeLocal(keys.orders, orders.map((order) => this.normalizeOrder(order)), "orders");
                writeLocal(keys.messages, messages.map((message) => this.normalizeMessage(message)), "messages");
            }
            window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: { entity: "all" } }));
        }
    }

    window.addEventListener("storage", (event) => {
        if (event.key !== keys.updated || !event.newValue) return;
        const update = readLocal(keys.updated, { entity: "all" });
        window.dispatchEvent(new CustomEvent("cleaning:data-changed", { detail: update }));
    });

    window.CLEANING_DEFAULT_SERVICES = clone(defaultServices);
    window.DBManager = DBManager;
})();
