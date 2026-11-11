// home/home.controller.js
import { store } from '../../store.js';
import { fetchHomeData } from '../../service/dashboard-service/dashboard.service.js';

export class HomeController {
  constructor(host) {
    this.host = host; // Referencia al componente Lit (HomeView)
  }

  async init() {
    // 1. Mostrar grupos en caché instantáneamente si existen
    const cached = store.getState().cachedGroups || (() => {
      try { return JSON.parse(localStorage.getItem('cached_groups') || '[]'); } catch { return []; }
    })();

    if (cached && cached.length > 0) {
      this.host.groups = cached;
      this.host.loading = false;
    } else {
      this.host.loading = true;
    }

    // 2. Carga en segundo plano sin bloquear la UI
    try {
      const result = await fetchHomeData();
      if (result.groups) {
        this.host.groups = result.groups;
        store.setState({ cachedGroups: result.groups });
        try { localStorage.setItem('cached_groups', JSON.stringify(result.groups)); } catch {}
      }
      this.host.error = result.error || null;
    } catch (err) {
      console.error('Error al actualizar grupos en Home:', err);
    } finally {
      this.host.loading = false;
    }
  }

  async toggleTheme() {
    await store.toggleTheme();
  }

  goToSettings() {
    store.setState({ currentView: 'settings' });
  }

  goToGroupManager() {
    store.setState({ currentView: 'group-manager' });
  }

  onAiSetupClicked() {
    store.setState({ currentView: 'ai-setup' });
  }

  startGroup(group) {
    if (typeof group === 'number' || typeof group === 'string') {
      const found = this.host.groups.find(g => g.id === Number(group));
      group = found || { id: Number(group), type: 'static' };
    }

    if (group.type === 'dynamic_preset' || group.dynamic_config) {
      let config = {};
      try {
        config = typeof group.dynamic_config === 'string' ? JSON.parse(group.dynamic_config) : (group.dynamic_config || {});
      } catch (err) {
        console.error('Error al parsear dynamic_config:', err);
      }

      store.setState({
        practiceMode: 'dynamic',
        sessionOptions: {
          level: config.level || 'B1',
          topic: config.topic || 'General',
          tone: config.tone || 'Casual',
          count: config.count || 5,
          targetWords: config.target_words || '',
          customPrompt: config.custom_prompt || ''
        },
        currentView: 'practice'
      });
    } else {
      store.setState({
        practiceMode: 'group',
        selectedGroup: group.id,
        currentView: 'practice'
      });
    }
  }

  async createGroup(name, type = 'static', dynamicConfig = null, initialPhrases = []) {
    try {
      const groupId = await window.electronAPI.createGroup(name, type, dynamicConfig);
      if (groupId && Array.isArray(initialPhrases) && initialPhrases.length > 0) {
        for (const phraseText of initialPhrases) {
          const clean = phraseText.trim();
          if (clean) {
            await window.electronAPI.createPhrase(groupId, clean);
          }
        }
      }
      await this.init();
      return groupId;
    } catch (error) {
      alert(error.message || 'No se pudo crear el grupo.');
    }
  }

  async updateGroup(id, name) {
    try {
      await window.electronAPI.updateGroup(id, name);
      await this.init();
    } catch (error) {
      alert(error.message || 'No se pudo actualizar el grupo.');
    }
  }

  async deleteGroup(id) {
    try {
      await window.electronAPI.deleteGroup(id);
      await this.init();
    } catch (error) {
      alert(error.message || 'No se pudo eliminar el grupo.');
    }
  }

  async getPhrases(groupId) {
    return await window.electronAPI.getPhrases(groupId);
  }

  async createPhrase(groupId, text) {
    await window.electronAPI.createPhrase(groupId, text);
    await this.init();
  }

  async updatePhrase(id, text) {
    await window.electronAPI.updatePhrase(id, text);
    await this.init();
  }

  async deletePhrase(id) {
    await window.electronAPI.deletePhrase(id);
    await this.init();
  }
}