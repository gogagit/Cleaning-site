(function () {
    "use strict";

    const dbManager = new window.DBManager();
    const userModel = new window.UserModel(dbManager);
    const serviceModel = new window.ServiceModel(dbManager);
    const orderModel = new window.OrderModel(dbManager);
    const messageModel = new window.MessageModel(dbManager);
    const userController = new window.UserController(userModel);
    const serviceController = new window.ServiceController(serviceModel);
    const orderController = new window.OrderController(orderModel);
    const messageController = new window.MessageController(messageModel);
    const controllerChain = [userController, serviceController, orderController, messageController, dbManager];

    const dataFacade = new Proxy({}, {
        get(_target, property) {
            const source = controllerChain.find((controller) => property in controller);
            if (!source) return undefined;
            const value = source[property];
            return typeof value === "function" ? value.bind(source) : value;
        }
    });

    window.App = {
        dbManager,
        userModel,
        serviceModel,
        orderModel,
        messageModel,
        userController,
        serviceController,
        orderController,
        messageController,
        data: dataFacade,
        isInitialized: false
    };
    window.cleaningData = dataFacade;
    window.cleaningDataReady = dbManager.init().then(() => {
        window.App.isInitialized = true;
        window.dispatchEvent(new CustomEvent("cleaning:app-ready"));
        return dataFacade;
    });
})();
