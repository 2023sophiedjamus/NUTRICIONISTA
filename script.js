// Elementos del DOM
const listaMensajes = document.getElementById("lista-mensajes");
const zonaDeEscritura = document.getElementById("zona-de-escritura");
const entradaMensaje = document.getElementById("entrada-mensaje");
const botonEnviar = document.getElementById("boton-enviar");

// Constantes de control
const LIMITE_CARACTERES = 500;
const TIEMPO_LIMITE_MS = 30000;
const PAUSA_ENTRE_ENVIOS_MS = 1500;
const CLAVE_STORAGE_SESION = "nutricionista_session_id";

// Variables de estado en memoria
let sesionEnMemoria = null;
let ultimoEnvioTimestamp = 0;
let enviando = false;

// Genera o recupera un sessionId único para mantener la conversación
function obtenerSessionId() {
  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE_SESION);
    if (guardado) return guardado;

    const nuevoId = generarIdUnico();
    localStorage.setItem(CLAVE_STORAGE_SESION, nuevoId);
    return nuevoId;
  } catch (error) {
    if (!sesionEnMemoria) {
      sesionEnMemoria = generarIdUnico();
    }
    return sesionEnMemoria;
  }
}

// Crea un identificador único usando crypto.randomUUID o alternativa segura
function generarIdUnico() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Agrega una burbuja de texto sanitizada en la zona de chat
function agregarBurbuja(texto, tipo) {
  const burbuja = document.createElement("div");
  burbuja.classList.add("burbuja", `burbuja-${tipo}`);
  burbuja.textContent = texto;
  listaMensajes.appendChild(burbuja);
  listaMensajes.scrollTop = listaMensajes.scrollHeight;
  return burbuja;
}

// Habilita o deshabilita los controles de la zona de escritura
function alternarControles(deshabilitar) {
  entradaMensaje.disabled = deshabilitar;
  botonEnviar.disabled = deshabilitar;
  if (!deshabilitar) {
    entradaMensaje.focus();
  }
}

// Verifica si la URL del webhook fue configurada correctamente
function webhookConfigurado() {
  if (typeof WEBHOOK_URL !== "string") return false;
  const urlLimpia = WEBHOOK_URL.trim();
  return urlLimpia !== "" && !urlLimpia.includes("ACA VA");
}

// Procesa el texto crudo recibido desde Make según el contrato
function extraerTextoRespuesta(textoCrudo) {
  if (!textoCrudo || textoCrudo.trim() === "") {
    return "(respuesta vacía)";
  }

  try {
    const datos = JSON.parse(textoCrudo);
    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
      const clavesPrioridad = ["response", "respuesta", "message", "mensaje"];
      for (const clave of clavesPrioridad) {
        if (typeof datos[clave] === "string" && datos[clave].trim() !== "") {
          return datos[clave];
        }
      }
      return "Make respondió, pero sin el campo response";
    }
    return textoCrudo;
  } catch (error) {
    return textoCrudo;
  }
}

// Realiza la petición POST al webhook con timeout de 30 segundos
async function enviarConsultaAlAgente(mensaje) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_LIMITE_MS);

  const cargaUtil = {
    sessionId: obtenerSessionId(),
    mensaje: mensaje,
    fecha: new Date().toISOString()
  };

  try {
    const respuesta = await fetch(WEBHOOK_URL.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cargaUtil),
      signal: controlador.signal
    });

    const textoRespuesta = await respuesta.text();

    if (!respuesta.ok) {
      throw new Error(
        `Make respondió con error (código ${respuesta.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`
      );
    }

    return extraerTextoRespuesta(textoRespuesta);
  } finally {
    clearTimeout(temporizador);
  }
}

// Gestiona el envío del formulario, validaciones, estados y pausas
async function manejarEnvio(evento) {
  evento.preventDefault();

  if (enviando) return;

  const ahora = Date.now();
  if (ahora - ultimoEnvioTimestamp < PAUSA_ENTRE_ENVIOS_MS) {
    return;
  }

  const textoUsuario = entradaMensaje.value.trim();
  if (!textoUsuario) return;

  if (textoUsuario.length > LIMITE_CARACTERES) {
    agregarBurbuja(`El mensaje supera el máximo de ${LIMITE_CARACTERES} caracteres.`, "error");
    return;
  }

  agregarBurbuja(textoUsuario, "usuario");
  entradaMensaje.value = "";

  if (!webhookConfigurado()) {
    agregarBurbuja("Falta pegar la URL de tu webhook en config.js", "error");
    return;
  }

  enviando = true;
  ultimoEnvioTimestamp = Date.now();
  alternarControles(true);

  const burbujaCargando = agregarBurbuja("NUTRICIONISTA está escribiendo...", "estado");

  try {
    const respuestaAgente = await enviarConsultaAlAgente(textoUsuario);
    burbujaCargando.remove();
    agregarBurbuja(respuestaAgente, "agente");
  } catch (error) {
    burbujaCargando.remove();

    if (error.name === "AbortError") {
      agregarBurbuja("La consulta tardó demasiado (más de 30 segundos). Intentá nuevamente.", "error");
    } else if (error.message.startsWith("Make respondió con error")) {
      agregarBurbuja(error.message, "error");
    } else {
      agregarBurbuja("Error de red al conectar con el servidor. Verificá tu conexión.", "error");
    }
  } finally {
    setTimeout(() => {
      enviando = false;
      alternarControles(false);
    }, PAUSA_ENTRE_ENVIOS_MS);
  }
}

// Inicialización de eventos y mensaje de bienvenida
function iniciarAplicacion() {
  obtenerSessionId();
  zonaDeEscritura.addEventListener("submit", manejarEnvio);
  agregarBurbuja("¡Hola! Soy tu asistente NUTRICIONISTA. ¿En qué tip o consulta alimentaria puedo ayudarte hoy?", "agente");
}

iniciarAplicacion();
