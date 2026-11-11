// home/home-service.js
import { store } from '../../store.js';

export async function fetchHomeData() {
    try {
        if (!window.electronAPI) throw new Error('Entorno de Electron no disponible.');
        
        // Carga en paralelo para mayor velocidad
        const [groups, appStatus] = await Promise.all([
            window.electronAPI.getGroups(),
            window.electronAPI.getAppStatus()
        ]);

        // Actualizamos el estado global del store
        store.setState({
            status: { 
                selectedModel: appStatus.selectedModel || '', 
                engineStatus: appStatus.engineStatus || 'Ready' 
            },
            isLlmAvailable: Boolean(appStatus.modelAvailable),
            isLlmChecked: true
        });

        return { groups, error: null };
    } catch (error) {
        return { 
            groups: [], 
            error: error.message || 'Error al cargar los datos iniciales.' 
        };
    }
}