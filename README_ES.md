# Lifeline Mesh 🌐

**Mensajería de emergencia cifrada de extremo a extremo • Sin conexión primero • Sin servidor necesario**

> *[English version](README.md)*

[![Pruebas](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/hiroshitanaka-creator/lifeline-mesh/actions)
[![Licencia](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Seguridad](https://img.shields.io/badge/security-SRI%20enabled-green)](spec/THREAT_MODEL.md)

Lifeline Mesh es un sistema de mensajería criptográficamente seguro basado en navegador, diseñado para situaciones de emergencia donde la infraestructura tradicional puede estar degradada o no disponible.

> **Misión**: Cuando un desastre ocurre y la infraestructura falla, las personas aún necesitan comunicarse.
> Este proyecto busca proporcionar ese salvavidas.

---

## 🆘 Necesitamos tu ayuda

Este proyecto podría salvar vidas, pero necesita contribuidores para crecer.

**Áreas de contribución abiertas:**

| Prioridad | Tarea | Habilidades | Notas |
|-----------|-------|-------------|-------|
| 🟡 Alta | **Implementación periférica BLE en móviles (experimental → producción)** | Capacitor / puente WebView / APIs BLE nativas | La ruta periférica soportada en v0.1.x es el relay Node (`node-bleno`); periférico móvil/navegador sigue sin resolverse |
| 🟡 Alta | **Rediseño UI/UX** | Diseño, CSS, Accesibilidad | Funcional pero sin pulir |
| 🟢 Primera contribución | **i18n de documentación** | Cualquier idioma | Buena primera contribución |
| 🟢 Primera contribución | **Expansión de pruebas Playwright E2E** | Testing, automatización de navegadores | El entorno de pruebas en navegador real ya existe; se puede ampliar la cobertura |

**Lee el roadmap completo**: [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)

Cada contribución importa. Construyamos esto juntos.

---

## 🚀 Inicio rápido

### Prueba la demo en vivo
**https://hiroshitanaka-creator.github.io/lifeline-mesh/**

### Uso local (servidor de desarrollo)
```bash
git clone https://github.com/hiroshitanaka-creator/lifeline-mesh.git
cd lifeline-mesh
npm ci --prefix app
npm run dev --prefix app   # abre http://localhost:5173
```
Luego: Genera claves → Agrega contactos → Cifra/Descifra

### Construye un archivo offline autónomo

Si quieres un único archivo HTML que funcione sin conexión, sin servidor ni `npm run dev`:

```bash
git clone https://github.com/hiroshitanaka-creator/lifeline-mesh.git
cd lifeline-mesh
npm ci --prefix app
npm run build --prefix app
# Luego abre app/dist/index.html directamente en Chrome o Edge
```

Todo el JavaScript, CSS y WASM se integra en un solo archivo (`app/dist/index.html`) mediante `vite-plugin-singlefile`, por lo que funciona desde `file://` sin problemas de CORS y sin peticiones de red externas.

> **Nota:** Abrir el archivo fuente `app/index.html` directamente como `file://` fallará con errores CORS. Usa siempre `npm run dev` o el archivo compilado `app/dist/index.html`.

---

## ✨ Características

### Seguridad
- 🔐 **Firmas Ed25519** para autenticación de mensajes
- 🔒 **Cifrado X25519-XSalsa20-Poly1305** para confidencialidad
- 🔑 **Claves de cifrado efímeras** (aproximación de sigilo hacia adelante)
- 🎯 **Vinculación al destinatario** previene la redirección de mensajes
- 🛡️ **Protección contra reproducción** con seguimiento de nonce de 30 días
- ✅ **TOFU (Confianza en el primer uso)** con anclaje de claves
- 🔏 **Flujo de verificación de contactos**: marca contactos como verificados o comprometidos, con números de seguridad e insignias de estado por contacto
- 🔗 **Integridad de subrecursos (SRI)** para scripts CDN

### Gestión de claves
- 🔑 Generación automática de pares de claves Ed25519 + X25519
- 💾 Exportar claves (respaldo protegido con contraseña Argon2id/PBKDF2)
- 📥 Importar claves (restaurar desde archivo)
- 🗑️ Reiniciar todos los datos (rotación de claves de emergencia)

### Mensajería de grupo
- 👥 Crear grupos con nombre y lista de miembros
- 🔒 Protocolo Sender Keys (DMESH_GROUP_V1, con separación de dominio)
- 🔄 Derivación de clave de cadena por mensaje (sigilo hacia adelante dentro de la sesión)

### Red mesh BLE
- 📡 **Entorno multienlace**: múltiples conexiones BLE concurrentes con relay real de almacenamiento y reenvío
- 🔀 **Enrutamiento N-saltos**: MeshRouter Fase 2 con anuncios de rutas proactivos (habilitado automáticamente con ≥2 enlaces)
- 🔁 **Motor de sincronización Fase 3**: registro de eventos append-only con eventos de transición outbox/inbox y primitivas anti-entropía Lamport
- 🌉 **Puente gateway Fase 4**: servicio de puente de isla para ingestión local de mesh y sincronización de backhaul sin duplicados
- 📤 Cola de salida (prioridad / TTL / segmentación por enlace) con descarga automática al reconectar
- 📥 Persistencia de bandeja de entrada para mensajes recibidos

### Panel de operador
- 📊 Panel en vivo del estado del mesh: enlaces activos, tabla de rutas, contadores de relay
- 🟢 Salud del enlace con código de colores (verde ≥2 enlaces, amarillo = 1, rojo = 0)

### Experiencia de usuario
- 📱 Sin conexión primero (funciona sin internet)
- 📦 Manifiesto PWA + service worker
- 🆘 Modo de emergencia (mensajería de desastre simplificada basada en formularios)
- 📋 Copiar/pegar mensajes cifrados; atajos de teclado (Ctrl+K/E/D)
- 🌐 Sin servidor necesario

---

## 📖 Documentación

### Para usuarios
- **[Guía de uso](docs/USAGE.md)** - Inicio rápido, prácticas de seguridad, resolución de problemas
- **[FAQ](docs/FAQ.md)** - Más de 30 preguntas sobre seguridad, características y uso
- **[Soporte Web Bluetooth](docs/WEB_BLUETOOTH_SUPPORT.md)** - Compatibilidad de navegador/plataforma y guía alternativa
- **[Modelo de amenazas](spec/THREAT_MODEL.md)** - Análisis de seguridad completo

### Para desarrolladores
- **[Especificación del protocolo](spec/PROTOCOL.md)**
- **[API de Crypto Core](crypto/README.md)**
- **[Guía de contribución](CONTRIBUTING.md)**

---

## 🔬 Pruebas

```bash
# Ejecutar todo
npm run test:unit && npm run test:integration

# Solo pruebas unitarias de crypto
cd crypto && npm test

# Verificación de smoke (sin navegador requerido)
npm run test:e2e:smoke

# E2E Playwright completo (requiere: npm run test:e2e:install primero)
npm run test:e2e:playwright
```

---

## 🔒 Seguridad

### Propiedades garantizadas
✅ **Confidencialidad**: Solo el destinatario puede descifrar  
✅ **Autenticidad**: Remitente verificado mediante firma  
✅ **Integridad**: Manipulación detectada  
✅ **Vinculación al destinatario**: Mensaje ligado a destinatario específico  
✅ **Resistencia a reproducción**: Seguimiento de nonce de 30 días  

### Limitaciones conocidas
❌ **Anonimato**: Claves públicas del remitente/destinatario visibles para los relays  
❌ **Resistencia al análisis de tráfico**: Patrones de mensajes observables  
❌ **Seguridad post-cuántica**: Vulnerable a computadoras cuánticas  
❌ **Sigilo perfecto hacia adelante**: Claves de firma a largo plazo reutilizadas  
⚠️ **Bootstrap sin conexión**: Abrir el archivo fuente `app/index.html` como `file://` falla (CORS). Usa `npm run dev` o el archivo compilado `app/dist/index.html`  

Consulta [THREAT_MODEL.md](spec/THREAT_MODEL.md) para un análisis completo.

---

## 🎯 Casos de uso

### Coordinación de emergencias
- Actualizaciones de estado de refugio
- Solicitudes/ofertas de suministros
- Verificaciones de seguridad
- Coordinación de evacuación

### Escenarios sin conexión
- Desastres naturales (terremotos, inundaciones, huracanes)
- Fallo de infraestructura (cortes de energía, colapso de red)
- Áreas remotas/rurales con conectividad limitada
- Comunicaciones políticamente sensibles

### Métodos de relay
- **Redes mesh**: WiFi Direct, mesh Bluetooth
- **Sneakernet**: memorias USB, tarjetas SD
- **Códigos QR**: mostrar → escanear
- **Radio**: LoRa, radioafición (codificar JSON como texto)
- **Manual**: imprimir JSON cifrado, entrega en mano

---

## 🤝 Contribuir

¡Damos la bienvenida a todos los contribuidores! Así puedes empezar:

1. Lee [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) para entender la visión
2. Consulta los issues etiquetados `good first issue`
3. Lee [CONTRIBUTING.md](CONTRIBUTING.md) para las pautas detalladas

### Formas de contribuir
- **Código**: Backend GATT nativo (Capacitor/noble), mejoras de UI, transporte LoRa/radio
- **Seguridad**: Revisiones, auditorías, investigación de vulnerabilidades
- **Diseño**: UX para escenarios de emergencia, accesibilidad
- **Documentación**: Traducciones, tutoriales, ejemplos
- **Pruebas**: Cobertura E2E, vectores de prueba, casos extremos

---

## 📊 Estado y Roadmap

**Versión actual**: 0.1.0

### Implementado ✅
- Crypto central (Ed25519 + X25519-XSalsa20-Poly1305)
- Gestión de claves: generar, exportar/importar (respaldo protegido Argon2id/PBKDF2)
- Entorno BLE multienlace con relay real
- MeshRouter Fases 1 y 2
- Capa de servidor GATT con `IGATTBackend` conectable
- Almacén esquema v5 con registro de eventos append-only
- Flujo de verificación de contactos
- Servidor relay Node.js con almacén duradero
- CI multi-trabajo y despliegue en GitHub Pages

### Aún no implementado ⚠️
- **Brecha en periférico móvil/navegador**: v0.1.x soporta oficialmente solo el relay Node como endpoint periférico
- Apps móviles, integración LoRa, cripto post-cuántica
- Cobertura completa TypeScript en modo estricto

---

## 🔐 Política de seguridad

**¿Encontraste una vulnerabilidad?**  
Por favor usa el reporte privado de vulnerabilidades de GitHub o contacta directamente a los mantenedores.  
**No** abras issues públicos para reportes de seguridad.

Consulta [SECURITY.md](SECURITY.md) para más detalles.

---

## 📜 Licencia

Licencia MIT - ver archivo [LICENSE](LICENSE).

Copyright (c) 2026 Contribuidores de Lifeline Mesh

---

## 🙏 Agradecimientos

- **TweetNaCl** - Implementación auditada de NaCl por @dchest
- **Socorristas de emergencia** - Inspiración para casos de uso del mundo real
- **Comunidad open source** - Pruebas y retroalimentación

---

## 🌐 Enlaces

- **Demo en vivo**: https://hiroshitanaka-creator.github.io/lifeline-mesh/
- **Documentación**: [docs/](docs/)
- **Issues**: https://github.com/hiroshitanaka-creator/lifeline-mesh/issues

---

### 💡 Significado del nombre

Un **lifeline** (salvavidas) es una cuerda o cadena lanzada para rescatar a alguien en peligro.  
Una red **mesh** garantiza que si una conexión se rompe, las demás permanecen.

**Lifeline Mesh** está construido para mantenerse conectado cuando todo lo demás se apaga.
