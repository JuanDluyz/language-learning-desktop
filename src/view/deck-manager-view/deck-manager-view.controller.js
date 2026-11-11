import { store } from '../../store.js';

export class GroupManagerController {
  constructor(view) {
    this.view = view;
  }

  async loadGroups() {
    this.view.loading = true;
    try {
      if (window.electronAPI?.getGroups) {
        this.view.groups = await window.electronAPI.getGroups();
        if (this.view.groups.length > 0 && !this.view.selectedGroupId) {
          this.view.selectedGroupId = this.view.groups[0].id;
          await this.loadPhrases(this.view.selectedGroupId);
        }
      }
      await this.loadStats();
    } catch (err) {
      console.error('Error al cargar grupos:', err);
      this.view.error = 'No se pudieron cargar los grupos';
    } finally {
      this.view.loading = false;
    }
  }

  async loadStats() {
    this.view.loadingStats = true;
    try {
      if (window.electronAPI?.getDatabaseStats) {
        this.view.stats = await window.electronAPI.getDatabaseStats();
      }
    } catch (err) {
      console.error('Error al cargar estadísticas:', err);
    } finally {
      this.view.loadingStats = false;
    }
  }

  async loadPhrases(groupId) {
    if (!groupId) return;
    this.view.loadingPhrases = true;
    try {
      if (window.electronAPI?.getPhrases) {
        this.view.phrases = await window.electronAPI.getPhrases(groupId);
      }
    } catch (err) {
      console.error(`Error al cargar frases del grupo ${groupId}:`, err);
    } finally {
      this.view.loadingPhrases = false;
    }
  }

  async selectGroup(group) {
    this.view.selectedGroupId = group.id;
    this.view.searchPhraseText = '';
    await this.loadPhrases(group.id);
  }

  async createGroup(name, type = 'static', dynamicConfig = null, initialPhrases = [], dailyLimit = 20) {
    if (!name || !name.trim()) return;
    try {
      const newId = await window.electronAPI?.createGroup(name.trim(), type, dynamicConfig, dailyLimit);
      if (newId && Array.isArray(initialPhrases) && initialPhrases.length > 0) {
        for (const phraseText of initialPhrases) {
          const clean = phraseText.trim();
          if (clean) {
            await window.electronAPI?.createPhrase(newId, clean);
          }
        }
      }
      await this.loadGroups();
      if (newId) {
        const createdGroup = this.view.groups.find(g => g.id === newId);
        if (createdGroup) {
          await this.selectGroup(createdGroup);
        }
      }
      return newId;
    } catch (err) {
      console.error('Error al crear grupo:', err);
    }
  }

  async updateGroup(id, name, type = null, dynamicConfig = null, dailyLimit = null) {
    if (!id || !name || !name.trim()) return;
    try {
      await window.electronAPI?.updateGroup(id, name.trim(), type, dynamicConfig, dailyLimit);
      await this.loadGroups();
    } catch (err) {
      console.error('Error al actualizar grupo:', err);
    }
  }

  startPracticePreset(group) {
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
        count: config.count || 5,
        targetWords: config.target_words || '',
        customPrompt: config.custom_prompt || ''
      },
      currentView: 'practice'
    });
  }

  async deleteGroup(id) {
    if (!id) return;
    try {
      await window.electronAPI?.deleteGroup(id);
      this.view.selectedGroupId = null;
      this.view.phrases = [];
      await this.loadGroups();
    } catch (err) {
      console.error('Error al eliminar grupo:', err);
    }
  }

  async createPhrase(groupId, text) {
    if (!groupId || !text || !text.trim()) return;
    try {
      await window.electronAPI?.createPhrase(groupId, text.trim());
      await this.loadPhrases(groupId);
      await this.loadGroups(); // Actualiza conteo en el grupo
    } catch (err) {
      console.error('Error al crear frase:', err);
    }
  }

  async updatePhrase(id, text, cefrLevel = null) {
    if (!id || !text || !text.trim()) return;
    try {
      await window.electronAPI?.updatePhrase(id, text.trim(), cefrLevel);
      if (this.view.selectedGroupId) {
        await this.loadPhrases(this.view.selectedGroupId);
      }
    } catch (err) {
      console.error('Error al actualizar frase:', err);
    }
  }

  async deletePhrase(id) {
    if (!id) return;
    try {
      await window.electronAPI?.deletePhrase(id);
      if (this.view.selectedGroupId) {
        await this.loadPhrases(this.view.selectedGroupId);
        await this.loadGroups(); // Actualiza conteo en el grupo
      }
    } catch (err) {
      console.error('Error al eliminar frase:', err);
    }
  }

  goHome() {
    store.setState({ currentView: 'home' });
  }

  async toggleTheme() {
    await store.toggleTheme();
  }
}
