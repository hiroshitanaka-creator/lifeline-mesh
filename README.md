<p align="center">
  <a href="#english">English</a> | <a href="#español">Español</a>
</p>

---

<a id="english"></a>

# Lifeline Mesh 🌐

**End-to-end encrypted emergency messaging • Offline-first • No server required**

[![Tests](https://img.shields.io/badge/tests-37%2F37%20passing-brightgreen)](https://github.com/hiroshitanaka-creator/lifeline-mesh/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-SRI%20enabled-green)](spec/THREAT_MODEL.md)

Lifeline Mesh is a browser-based, cryptographically secure messaging system designed for emergency situations where traditional infrastructure may be degraded or unavailable.

> **Mission**: When disaster strikes and infrastructure fails, people still need to communicate.  
> This project aims to provide that lifeline.

---

## 🆘 We Need Your Help

This project could save lives, but it needs contributors to become real.

**Most Needed Right Now:**

| Priority | Task | Skills | Issue |
|----------|------|--------|-------|
| 🔴 Critical | **Bluetooth BLE Relay** | Web Bluetooth API, JavaScript | Help wanted |
| 🔴 Critical | **Key Backup Security** | Cryptography, Argon2id | Help wanted |
| 🟡 High | **UI/UX Overhaul** | Design, CSS, Accessibility | Help wanted |
| 🟡 High | **Group Messaging** | Protocol design, Crypto | Help wanted |
| 🟢 Good First | **Documentation i18n** | Any language | Good first issue |
| 🟢 Good First | **Test Coverage** | JavaScript testing | Good first issue |

**Read the full roadmap**:  
[DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)

Every contribution matters. Let's build this together.

---

## 🚀 Quick Start

### Try the Live Demo
**https://hiroshitanaka-creator.github.io/lifeline-mesh/**

### Use Locally
1. Clone this repository  
2. Open `app/index.html` in your browser  
3. Generate keys → Add contacts → Encrypt/Decrypt  

**No installation required** – runs entirely in your browser.

---

## ✨ Features

### Security
- 🔐 **Ed25519 signatures** for message authentication
- 🔒 **X25519-XSalsa20-Poly1305** encryption for confidentiality
- 🔑 **Ephemeral encryption keys** (forward secrecy approximation)
- 🎯 **Recipient binding** prevents message redirection
- 🛡️ **Replay protection** with 30-day nonce tracking
- ✅ **TOFU (Trust On First Use)** with key pinning
- 🔗 **Subresource Integrity (SRI)** for CDN scripts

### Key Management
- 🔑 Auto-generate Ed25519 + X25519 key pairs
- 💾 Export keys (password-protected backup)
- 📥 Import keys (restore from file)
- 🗑️ Reset all data (emergency key rotation)

### User Experience
- 📱 Offline-first (works without internet)
- 📋 Copy/paste encrypted messages
- 📚 Embedded documentation
- 🌐 No server required
- 🚀 Relay-agnostic (QR, Bluetooth, USB, radio, etc.)

---

## 🔒 Security Summary

### Guaranteed Properties
✅ Confidentiality  
✅ Authenticity  
✅ Integrity  
✅ Recipient binding  
✅ Replay resistance  

### Known Limitations
❌ Anonymity  
❌ Traffic analysis resistance  
❌ Post-quantum security  
❌ Perfect forward secrecy  

See [THREAT_MODEL.md](spec/THREAT_MODEL.md) for full analysis.

---

[↑ Back to language selector](#)

---

<a id="español"></a>

# Lifeline Mesh 🌐

**Mensajería de emergencia cifrada de extremo a extremo • Primero sin conexión • No requiere servidor**

[![Tests](https://img.shields.io/badge/tests-37%2F37%20passing-brightgreen)](https://github.com/hiroshitanaka-creator/lifeline-mesh/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-SRI%20enabled-green)](spec/THREAT_MODEL.md)

Lifeline Mesh es un sistema de mensajería seguro, basado en el navegador y con criptografía sólida, diseñado para situaciones de emergencia donde la infraestructura tradicional puede fallar o no estar disponible.

> **Misión**: Cuando ocurre un desastre y la infraestructura falla, las personas aún necesitan comunicarse.  
> Este proyecto busca proporcionar ese salvavidas.

---

## 🆘 Necesitamos tu ayuda

Este proyecto podría salvar vidas, pero necesita colaboradores para hacerse realidad.

**Lo más urgente ahora mismo:**

| Prioridad | Tarea | Habilidades | Issue |
|----------|------|-------------|-------|
| 🔴 Crítica | **Relay Bluetooth BLE** | Web Bluetooth API, JavaScript | Help wanted |
| 🔴 Crítica | **Seguridad de respaldo de claves** | Criptografía, Argon2id | Help wanted |
| 🟡 Alta | **Rediseño UI/UX** | Diseño, CSS, Accesibilidad | Help wanted |
| 🟡 Alta | **Mensajería grupal** | Diseño de protocolos, Cripto | Help wanted |
| 🟢 Inicio fácil | **Documentación i18n** | Cualquier idioma | Good first issue |
| 🟢 Inicio fácil | **Cobertura de tests** | Testing en JavaScript | Good first issue |

**Consulta el roadmap completo**:  
[DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)

Cada contribución importa. Construyámoslo juntos.

---

## 🚀 Inicio rápido

### Prueba la demo en vivo
**https://hiroshitanaka-creator.github.io/lifeline-mesh/**

### Uso local
1. Clona este repositorio  
2. Abre `app/index.html` en tu navegador  
3. Genera claves → Agrega contactos → Cifra/Descifra  

**No requiere instalación** – funciona completamente en tu navegador.

---

## ✨ Funcionalidades

### Seguridad
- 🔐 **Firmas Ed25519** para autenticación de mensajes
- 🔒 **Cifrado X25519-XSalsa20-Poly1305** para confidencialidad
- 🔑 **Claves efímeras** (aproximación de forward secrecy)
- 🎯 **Vinculación al destinatario** evita redirección de mensajes
- 🛡️ **Protección contra replay** con seguimiento de nonces de 30 días
- ✅ **TOFU (Trust On First Use)** con fijación de claves
- 🔗 **Subresource Integrity (SRI)** para scripts CDN

### Gestión de claves
- 🔑 Generación automática de claves Ed25519 + X25519
- 💾 Exportar claves (respaldo protegido por contraseña)
- 📥 Importar claves (restaurar desde archivo)
- 🗑️ Restablecer datos (rotación de emergencia)

---

## 🔒 Resumen de seguridad

### Propiedades garantizadas
✅ Confidencialidad  
✅ Autenticidad  
✅ Integridad  
✅ Vinculación al destinatario  
✅ Resistencia a replay  

### Limitaciones conocidas
❌ Anonimato  
❌ Análisis de tráfico  
❌ Seguridad post-cuántica  
❌ Perfect forward secrecy  

Consulta [THREAT_MODEL.md](spec/THREAT_MODEL.md) para más detalles.

---

## 📜 Licencia

Licencia MIT – ver [LICENSE](LICENSE).

Copyright (c) 2026 Lifeline Mesh Contributors

---

[↑ Volver al selector de idioma](#)
