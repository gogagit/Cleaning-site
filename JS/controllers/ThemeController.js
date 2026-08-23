const setupStyleSwitcher = () => {
    const styleSwitcher = document.querySelector(".js-style-switcher");
    const toggler = document.querySelector(".js-style-switcher-toggler");
    if (!styleSwitcher || !toggler) return;

    toggler.addEventListener("click", () => {
        const isOpen = styleSwitcher.classList.toggle("open");
        toggler.setAttribute("aria-expanded", String(isOpen));
        toggler.querySelector("i")?.classList.toggle("fa-times", isOpen);
        toggler.querySelector("i")?.classList.toggle("fa-cog", !isOpen);
    });
};

const setupThemeColor = () => {
    const hueSlider = document.querySelector(".js-hue-slider");
    const hueValue = document.querySelector(".js-hue");
    if (!hueSlider || !hueValue) return;

    const setHue = (value) => {
        const normalized = String(value).trim();
        document.documentElement.style.setProperty("--hue", normalized);
        hueSlider.value = normalized;
        hueValue.textContent = normalized;
    };

    const savedHue = localStorage.getItem("--hue");
    const defaultHue = getComputedStyle(document.documentElement).getPropertyValue("--hue");
    setHue(savedHue ?? defaultHue);

    hueSlider.addEventListener("input", () => {
        setHue(hueSlider.value);
        localStorage.setItem("--hue", hueSlider.value);
    });
};

const setupDarkMode = () => {
    const checkbox = document.querySelector(".js-dark-mode");
    if (!checkbox) return;

    const setDarkMode = (enabled) => {
        document.body.classList.toggle("t-dark", enabled);
        checkbox.checked = enabled;
    };

    setDarkMode(localStorage.getItem("theme-dark") === "true");
    checkbox.addEventListener("change", () => {
        localStorage.setItem("theme-dark", String(checkbox.checked));
        setDarkMode(checkbox.checked);
    });
};

setupStyleSwitcher();
setupThemeColor();
setupDarkMode();
