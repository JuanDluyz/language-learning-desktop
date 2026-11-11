// src/service/system-preferences-service/system-preferences.service.js
import { store } from '../../store.js';

export async function fetchAppConfig() {
  try {
    if (window.electronAPI?.getConfig) {
      const config = await window.electronAPI.getConfig();
      store.setState({ config });
      return config;
    }
  } catch (error) {
    console.error('Error al obtener la configuración:', error);
  }
  return store.getState().config || {};
}

export async function saveAppConfig(newConfig) {
  try {
    if (window.electronAPI?.saveConfig) {
      await window.electronAPI.saveConfig(newConfig);
      store.setState({ config: newConfig });
      return { success: true };
    }
  } catch (error) {
    console.error('Error al guardar la configuración:', error);
    throw error;
  }
  return { success: false };
}

export async function fetchAppStatus() {
  try {
    if (window.electronAPI?.getAppStatus) {
      return await window.electronAPI.getAppStatus();
    }
  } catch (error) {
    console.error('Error al obtener el estado de la app:', error);
  }
  return null;
}
