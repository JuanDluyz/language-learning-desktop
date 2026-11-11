# Language Learning Desktop (SLA Hybrid Engine)

Sistema interactivo de adquisición de segundas lenguas (SLA) para escritorio basado en una arquitectura desacoplada híbrida: inferencia local en el borde (*Edge AI*) mediante modelos de lenguaje cuantizados en formato GGUF sobre CPU de consumo, y delegación remota opcional *Bring Your Own Key* (Cloud BYOK).

---

## 1. Descarga del Ejecutable para Windows

La versión ejecutable compilada para entornos Windows x64 se encuentra disponible directamente en la sección oficial de entregas del repositorio:

* **Descargar paquete ejecutable (v1.0.0):** [Language Learning Desktop Releases v1.0.0](https://github.com/JuanDluyz/language-learning-desktop/releases/tag/v1.0.0)

El paquete pre-empaquetado incluye todas las dependencias nativas de C++ (`node-llama-cpp`, `better-sqlite3`) y el entorno de ejecución Electron preconfigurado.

---

## 2. Arquitectura del Sistema

La solución adopta un desacoplamiento estricto en tres capas concebido para asegurar la soberanía de datos, baja latencia y alta reactividad:

* **Capa de Presentación (Lit 3):** Interfaz reactiva desarrollada bajo el estándar de Web Components con Shadow DOM, garantizando un renderizado fluido a 60 FPS sin colisión de estilos globales.
* **Capa de Aislamiento y Seguridad (Electron IPC):** Comunicación bidireccional asíncrona entre el proceso de renderizado y el proceso principal mediada exclusivamente por `contextBridge` (`preload.cjs`).
* **Capa de Inferencia Híbrida Desacoplada:**
  * **Modo Edge AI (Local):** Motor de inferencia en C++ (`node-llama-cpp`) optimizado para ejecutar modelos GGUF compactos (e.g. Gemma 3 1B QAT a 720 MB) mediante mapeo directo en memoria (`mmap`) y multihilo en CPU pura.
  * **Modo Cloud BYOK:** Adaptador extensible para proveedores remotos (Google Gemini, Groq Llama 3.3, OpenAI-compatible) para delegación opcional sin almacenamiento centralizado de claves.
* **Persistencia Transaccional Local:** Base de datos SQLite integrada mediante `better-sqlite3` en modo WAL (Write-Ahead Logging) para garantizar lecturas simultáneas no bloqueantes durante las sesiones de práctica.

---

## 3. Fundamentos Pedagógicos y Cognitivos

El diseño funcional de la aplicación traduce formalmente dos pilares de la lingüística aplicada y la psicología del aprendizaje:

1. **Hipótesis del Input Comprensible (Stephen Krashen):** Generación de contextos sintácticos graduados ($i+1$) ajustados al descriptor del Marco Común Europeo de Referencia (MCER).
2. **Práctica Distribuida y Algoritmo SuperMemo-2 (SM-2):** Calendarización mnemotécnica determinista de intervalos de repaso basada en el factor de facilidad ($EF$) y la calificación de retención del estudiante.
3. **Regla de Andamiaje 80/20:** Cada sesión adaptativa asigna el 80% de sus ranuras a vocabulario vencido para consolidar la memoria a largo plazo y reducir el filtro afectivo, y el 20% a desafío léxico estructurado.
4. **Verificación Fonético-Ortográfica Determinista:** Detección en 0 ms de variaciones fonéticas toleradas y cálculo de distancias de edición (Levenshtein) para retroalimentación formativa no punitiva.

---

## 4. Requisitos del Entorno

Para compilar y ejecutar el proyecto desde el código fuente:

* **Sistema Operativo:** Windows 10/11 (x64), Linux x86_64 o macOS.
* **Node.js:** Versión 18.x o 20.x LTS.
* **Herramientas de Compilación C++:** 
  * En Windows: Visual Studio Build Tools (C++ x64/x86 build tools v143).
  * En Linux: GCC / G++ (C++17) y Python 3.x.
* **Hardware Mínimo:** Procesador x86_64 de 4 núcleos y 8 GB de memoria RAM.

---

## 5. Instalación y Puesta en Marcha

Clonar el repositorio e instalar las dependencias:

```bash
git clone https://github.com/JuanDluyz/language-learning-desktop.git
cd language-learning-desktop
npm install
```

Iniciar el entorno de desarrollo en Electron:

```bash
npm run dev
```

Para ejecutar únicamente el servidor de interfaz en el navegador web (sin funciones nativas de escritorio):

```bash
npm run dev:web
```

---

## 6. Aseguramiento de Calidad y Pruebas

El repositorio incorpora una suite de pruebas automatizadas:

* **Pruebas Unitarias de Lógica y Algoritmos:**
  ```bash
  npm test
  ```
* **Pruebas de Integración de Extremo a Extremo (E2E) con Playwright:**
  ```bash
  npm run test:e2e
  ```
* **Pruebas E2E con interfaz visual activa:**
  ```bash
  npm run test:e2e:headed
  ```

---

## 7. Licencia

Este proyecto está distribuido bajo la licencia de código abierto **MIT License**. Consulte el archivo `LICENSE` para mayores detalles.
