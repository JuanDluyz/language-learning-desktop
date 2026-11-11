// store.js
function safeGetItem(key, fallback = null) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : fallback;
  } catch {
    return fallback;
  }
}

function safeSetItem(key, val) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(val));
  } catch {}
}

class Store {
  constructor() {
    this.state = {
      currentView: 'home', // 'home', 'settings', 'ai-setup', 'practice'
      darkMode: (() => {
        const saved = safeGetItem('dark_mode');
        return saved === null ? true : saved === 'true';
      })(),
      isLlmAvailable: true,
      isLlmChecked: false,
      practiceMode: null,
      selectedGroup: null,
      config: {},
      cachedGroups: (() => {
        try { return JSON.parse(safeGetItem('cached_groups', '[]') || '[]'); } catch { return []; }
      })(),
      status: {
        selectedModel: '',
        engineStatus: 'Ready'
      }
    };
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  setState(partialState) {
    this.state = { ...this.state, ...partialState };

    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  async loadConfig() {
    if (!window?.electronAPI?.getConfig) {
      return this.state.config;
    }

    try {
      const config = await window.electronAPI.getConfig();
      const storedTheme = safeGetItem('dark_mode');
      const nextDarkMode = storedTheme === null
        ? (config?.dark_mode ?? this.state.darkMode)
        : storedTheme === 'true';
      safeSetItem('dark_mode', nextDarkMode);

      this.setState({
        config,
        darkMode: nextDarkMode
      });

      return config;
    } catch (error) {
      console.warn('No se pudo cargar la configuración:', error);
      return this.state.config;
    }
  }

  async updateConfig(nextConfig) {
    if (!window?.electronAPI?.saveConfig) {
      return this.state.config;
    }

    try {
      const savedConfig = await window.electronAPI.saveConfig(nextConfig);
      const darkMode = savedConfig?.dark_mode ?? this.state.darkMode;

      this.setState({
        config: savedConfig,
        darkMode
      });

      return savedConfig;
    } catch (error) {
      console.warn('No se pudo guardar la configuración:', error);
      return this.state.config;
    }
  }

  async toggleTheme() {
    const darkMode = !this.state.darkMode;
    safeSetItem('dark_mode', darkMode);
    this.setState({
      config: { ...this.state.config, dark_mode: darkMode },
      darkMode
    });

    if (!window?.electronAPI?.saveConfig) return this.state.config;

    try {
      const result = await window.electronAPI.saveConfig({ dark_mode: darkMode });
      if (result?.success === false) throw new Error('La configuración no se guardó.');
      return this.state.config;
    } catch (error) {
      console.error('No se pudo guardar la preferencia de tema:', error);
      return this.state.config;
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const store = new Store();