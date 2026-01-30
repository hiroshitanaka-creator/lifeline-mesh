[🇺🇸 English version](README.md)

# Lifeline Mesh 🌐

**Mensajería de emergencia cifrada de extremo a extremo • Primero sin conexión • No requiere servidor**

[![Tests](https://img.shields.io/badge/tests-37%2F37%20passing-brightgreen)](https://github.com/hiroshitanaka-creator/lifeline-mesh/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-SRI%20enabled-green)](spec/THREAT_MODEL.md)

Lifeline Mesh es un sistema de mensajería seguro, basado en el navegador y con criptografía sólida, diseñado para situaciones de emergencia en las que la infraestructura tradicional puede estar degradada o no disponible.

> **Misión**: Cuando ocurre un desastre y la infraestructura falla, las personas aún necesitan comunicarse.
> Este proyecto busca proporcionar ese salvavidas.

---

## 🆘 Necesitamos tu ayuda

Este proyecto podría salvar vidas, pero necesita colaboradores para hacerse realidad.

**Lo más urgente ahora mismo:**

| Prioridad       | Tarea                               | Habilidades                   | Issue            |
| --------------- | ----------------------------------- | ----------------------------- | ---------------- |
| 🔴 Crítica      | **Relay Bluetooth BLE**             | Web Bluetooth API, JavaScript | Help wanted      |
| 🔴 Crítica      | **Seguridad de respaldo de claves** | Criptografía, Argon2id        | Help wanted      |
| 🟡 Alta         | **Rediseño UI/UX**                  | Diseño, CSS, Accesibilidad    | Help wanted      |
| 🟡 Alta         | **Mensajería grupal**               | Diseño de protocolos, Cripto  | Help wanted      |
| 🟢 Inicio fácil | **Documentación i18n**              | Cualquier idioma              | Good first issue |
| 🟢 Inicio fácil | **Cobertura de tests**              | Testing en JavaScript         | Good first issue |

**Lee el roadmap completo**: [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)

Cada contribución importa. Construyámoslo juntos.

---

## 🚀 Inicio rápido

### Prueba la demo en vivo

**[https://hiroshitanaka-creator.github.io/lifeline-mesh/](https://hiroshitanaka-creator.github.io/lifeline-mesh/)**

### Uso local

1. Clona este repositorio
2. Abre `app/index.html` en tu navegador
3. Genera claves → Agrega contactos → Cifra/Descifra

**No requiere instalación** – funciona completamente en tu navegador.

---

## ✨ Funcionalidades

### Seguridad

* 🔐 **Firmas Ed25519** para autenticación de mensajes
* 🔒 **Cifrado X25519-XSalsa20-Poly1305** para confidencialidad
* 🔑 **Claves de cifrado efímeras** (aproximación de forward secrecy)
* 🎯 **Vinculación al destinatario** evita redirección de mensajes
* 🛡️ **Protección contra replay** con seguimiento de nonces de 30 días
* ✅ **TOFU (Trust On First Use)** con fijación de claves
* 🔗 **Subresource Integrity (SRI)** para scripts CDN

### Gestión de claves

* 🔑 Generación automática de pares de claves Ed25519 + X25519
* 💾 Exportar claves (respaldo protegido por contraseña)
* 📥 Importar claves (restaurar desde archivo)
* 🗑️ Restablecer todos los datos (rotación de claves de emergencia)

### Experiencia de usuario

* 📱 Primero sin conexión (funciona sin internet)
* 📋 Copiar/pegar mensajes cifrados
* 📚 Documentación integrada
* 🌐 No requiere servidor
* 🚀 Independiente del relay (QR, Bluetooth, USB, radio, etc.)

---

## 📖 Documentación

### Para usuarios

* **[Guía de uso](docs/USAGE.md)** – Inicio rápido, prácticas de seguridad, solución de problemas
* **[FAQ](docs/FAQ.md)** – Más de 30 preguntas sobre seguridad, funciones y uso

### Para desarrolladores

* **[Especificación del protocolo](spec/PROTOCOL.md)** – Especificación técnica detallada
* **[Modelo de amenazas](spec/THREAT_MODEL.md)** – Análisis de seguridad completo
* **[Crypto Core API](crypto/README.md)** – Funciones criptográficas reutilizables

### Para colaboradores

* **[Guía de contribución](CONTRIBUTING.md)** – Cómo contribuir
* **[Política de seguridad](SECURITY.md)** – Reporte de vulnerabilidades
* **[Carta del proyecto](PROJECT_CHARTER.md)** – Alcance y objetivos

---

## 🔬 Testing

Todos los tests pasando: **37/37 ✓**

### Tests del núcleo criptográfico (14/14)

```bash
cd crypto
npm install
npm test
```

### Validación de vectores de prueba (23/23)

```bash
cd tools
npm install
npm run validate-vectors
```

---

## 🏗️ Arquitectura

### Estructura del repositorio

```
/app            UI demo (basada en navegador, módulos ES6)
/crypto         Funciones criptográficas centrales (puras, testeables)
/spec           Modelo de amenazas + especificación del protocolo
/tools          Vectores de prueba, validador, generador SRI
/docs           Guía de uso, FAQ
.github/        Workflows, plantillas, despliegue
```

### Stack criptográfico

* **Firmas**: Ed25519 (nacl.sign)
* **Cifrado**: X25519-XSalsa20-Poly1305 (nacl.box)
* **Hashing**: SHA-512 (para huellas digitales)
* **Librería**: TweetNaCl (auditada, compacta)

---

## 🔒 Seguridad

### Propiedades garantizadas

✅ **Confidencialidad**: solo el destinatario puede descifrar
✅ **Autenticidad**: el remitente se verifica por firma
✅ **Integridad**: se detecta manipulación
✅ **Vinculación al destinatario**: mensaje ligado a un receptor específico
✅ **Resistencia a replay**: seguimiento de nonces por 30 días

### Limitaciones conocidas

❌ **Anonimato**: claves públicas visibles para los relays
❌ **Resistencia a análisis de tráfico**: patrones observables
❌ **Seguridad post-cuántica**: vulnerable a computación cuántica
❌ **Perfect forward secrecy**: uso de claves de firma a largo plazo

Consulta [THREAT_MODEL.md](spec/THREAT_MODEL.md) para el análisis completo.

---

## 🎯 Casos de uso

### Coordinación en emergencias

* Actualizaciones de refugios
* Solicitudes/ofertas de suministros
* Confirmaciones de seguridad
* Coordinación de evacuaciones

### Escenarios sin conexión

* Desastres naturales
* Fallas de infraestructura
* Zonas rurales/remotas
* Comunicaciones políticamente sensibles

---

## 📜 Licencia

Licencia MIT – ver [LICENSE](LICENSE).

Copyright (c) 2026 Lifeline Mesh Contributors
