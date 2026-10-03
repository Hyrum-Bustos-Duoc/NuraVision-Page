// ============================================================================
// Plantilla del correo de confirmacion
// ============================================================================
// Este archivo NO usa ninguna API de Deno a proposito: asi se puede renderizar y
// revisar con las herramientas del frontend sin desplegar nada. Es una funcion
// pura de datos a texto.
//
// ----------------------------------------------------------------------------
// POR QUE EL HTML ES COMO ES
// ----------------------------------------------------------------------------
// Un correo no es una pagina web. Lo que aqui parece anticuado es lo que
// funciona en los clientes de correo reales:
//
//   · ESTILOS EN LINEA. Outlook y varios webmails descartan el <style> del
//     <head>. Una clase de Tailwind aqui no pintaria nada.
//   · TABLAS PARA MAQUETAR. Outlook usa el motor de Word, que no soporta
//     flexbox ni grid.
//   · UNA SOLA COLUMNA. Se adapta a cualquier ancho sin media queries, que es
//     justo lo que peor soportan los clientes de correo.
//   · LAS FUENTES DE LA MARCA VAN PRIMERO EN LA PILA, con Georgia y las del
//     sistema detras. Casi ningun cliente carga tipografias externas, asi que
//     Fraunces e Inter solo se veran en los que si.
//   · TEXTO ALTERNATIVO EN TEXTO PLANO. Algunos clientes no muestran HTML, y
//     enviar solo HTML empeora la reputacion de envio.
//
// El logotipo se referencia por URL absoluta y el encabezado se lee igual si el
// cliente bloquea las imagenes, que es el comportamiento por defecto de muchos:
// el nombre del estudio va como texto, no dentro de la imagen.
// ============================================================================

/** Todo lo que el correo necesita saber. Nada se lee de la base aqui. */
export interface DatosConfirmacion {
  clienteNombre: string
  /** Codigo visible de la reserva, que es como se identifica al preguntar. */
  codigo: string
  servicioNombre: string
  /** Etiqueta de la variante elegida, si el servicio preguntaba algo. */
  varianteEtiqueta: string | null
  profesionalNombre: string
  /** ISO corto, "YYYY-MM-DD". */
  fecha: string
  /** "HH:MM" */
  horaInicio: string
  /** Precio acordado, en pesos. */
  precio: number
  /** Direccion del estudio. Llega por configuracion, no esta escrita aqui. */
  direccion: string
  /** Raiz del sitio, para el enlace y el logotipo. Sin barra final. */
  sitioUrl: string
}

const COLOR = {
  fondo: '#f7f4ec',
  tarjeta: '#fffdf9',
  linea: '#ece8dc',
  lineaFuerte: '#e4dfd0',
  texto: '#1e1d18',
  suave: '#8a8577',
  acento: '#4a5a2e',
  acentoClaro: '#eef0e2',
}

const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif"
const SANS = "'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * "2026-10-03" -> "sábado 3 de octubre de 2026".
 *
 * Se construye a mano en vez de con `toLocaleDateString`: la funcion corre en el
 * servidor, cuya zona horaria no es la del estudio, y `new Date('2026-10-03')`
 * se interpreta como UTC. Con eso, una reserva de primera hora puede aparecer
 * fechada el dia anterior. Aqui no hay husos de por medio.
 */
export function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  if (!anio || !mes || !dia) return iso

  // Zeller: el dia de la semana sin construir un Date, y por tanto sin zona.
  const m = mes < 3 ? mes + 12 : mes
  const a = mes < 3 ? anio - 1 : anio
  const k = a % 100
  const j = Math.floor(a / 100)
  const h = (dia + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7
  const diaSemana = DIAS[(h + 6) % 7]

  return `${diaSemana} ${dia} de ${MESES[mes - 1]} de ${anio}`
}

/** 22000 -> "$22.000". El mismo formato que usa el sitio. */
export function formatearPrecio(valor: number): string {
  return `$${Math.round(valor).toLocaleString('es-CL').replace(/,/g, '.')}`
}

/**
 * Escapa lo que viene de la base antes de meterlo en el HTML.
 *
 * El nombre de la clienta lo escribe ella en un formulario abierto. Sin esto, un
 * nombre con `<` o `&` romperia la maqueta, y en el peor caso inyectaria
 * etiquetas en un correo que se envia en nombre del estudio.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Una fila de la tabla de detalles. */
function fila(etiqueta: string, valor: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-family:${SANS};font-size:13px;color:${COLOR.suave};vertical-align:top;width:40%">${esc(etiqueta)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${COLOR.linea};font-family:${SANS};font-size:14px;color:${COLOR.texto};vertical-align:top;font-weight:500">${esc(valor)}</td>
    </tr>`
}

export interface CorreoRenderizado {
  asunto: string
  html: string
  texto: string
}

/** Arma el correo completo: asunto, HTML y alternativa en texto plano. */
export function construirCorreo(datos: DatosConfirmacion): CorreoRenderizado {
  const fechaLarga = formatearFecha(datos.fecha)
  const precio = formatearPrecio(datos.precio)
  const enlace = `${datos.sitioUrl.replace(/\/+$/, '')}/mis-reservas`

  // La variante se muestra junto al servicio y no en una fila aparte: para quien
  // lee, "Corte de Pelo · Largo" es UN servicio, no dos datos.
  const servicio = datos.varianteEtiqueta
    ? `${datos.servicioNombre} · ${datos.varianteEtiqueta}`
    : datos.servicioNombre

  const asunto = `Tu hora en Estudio Nura: ${fechaLarga}, ${datos.horaInicio}`

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(asunto)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.fondo};-webkit-font-smoothing:antialiased">

<!-- Resumen que algunos clientes muestran en la bandeja, junto al asunto.
     Va oculto para que no se repita dentro del correo. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  ${esc(`${servicio} con ${datos.profesionalNombre}. ${fechaLarga} a las ${datos.horaInicio}.`)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.fondo}">
  <tr>
    <td align="center" style="padding:32px 16px">

      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${COLOR.tarjeta};border:1px solid ${COLOR.linea};border-radius:16px">

        <!-- Encabezado. El nombre va como TEXTO: muchos clientes bloquean las
             imagenes por defecto y el correo tiene que reconocerse igual. -->
        <tr>
          <td align="center" style="padding:32px 32px 8px">
            <img src="${datos.sitioUrl.replace(/\/+$/, '')}/nuravision-isotipo.png" width="40" height="40" alt="" style="display:block;border:0;margin:0 auto 12px">
            <p style="margin:0;font-family:${SERIF};font-size:22px;color:${COLOR.texto};letter-spacing:-0.01em">Estudio Nura</p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0">
            <p style="margin:0 0 4px;font-family:${SANS};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR.suave}">Reserva confirmada</p>
            <h1 style="margin:0;font-family:${SERIF};font-size:28px;line-height:1.25;color:${COLOR.texto};font-weight:400">
              Hola, ${esc(datos.clienteNombre)}
            </h1>
            <p style="margin:12px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${COLOR.suave}">
              Tu hora quedó registrada. Te esperamos con todo listo.
            </p>
          </td>
        </tr>

        <!-- Detalles -->
        <tr>
          <td style="padding:24px 32px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${fila('Servicio', servicio)}
              ${fila('Profesional', datos.profesionalNombre)}
              ${fila('Fecha', fechaLarga)}
              ${fila('Hora', datos.horaInicio)}
              ${fila('Dónde', datos.direccion)}
            </table>
          </td>
        </tr>

        <!-- Total -->
        <tr>
          <td style="padding:20px 32px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.acentoClaro};border-radius:12px">
              <tr>
                <td style="padding:16px 20px;font-family:${SANS};font-size:13px;color:${COLOR.acento}">Total a pagar en el salón</td>
                <td align="right" style="padding:16px 20px;font-family:${SERIF};font-size:24px;color:${COLOR.texto}">${esc(precio)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Boton. Se maqueta con una tabla y no con un <a> con padding porque
             Outlook ignora el padding de los enlaces y el boton saldria plano. -->
        <tr>
          <td style="padding:24px 32px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="background-color:${COLOR.texto};border-radius:999px">
                  <a href="${esc(enlace)}" style="display:block;padding:14px 28px;font-family:${SANS};font-size:14px;font-weight:500;color:#ffffff;text-decoration:none">
                    Ver o administrar mi reserva
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 32px">
            <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${COLOR.suave}">
              Tu código de reserva es <strong style="color:${COLOR.texto}">${esc(datos.codigo)}</strong>.
              Guárdalo: es lo que necesitas si quieres cambiar o cancelar tu hora escribiéndonos.
            </p>
          </td>
        </tr>

      </table>

      <p style="margin:20px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${COLOR.suave};max-width:560px">
        Recibes este correo porque reservaste una hora en Estudio Nura.<br>
        ${esc(datos.direccion)}
      </p>

    </td>
  </tr>
</table>
</body>
</html>`

  const texto = [
    `Hola, ${datos.clienteNombre}`,
    '',
    'Tu hora en Estudio Nura quedó registrada.',
    '',
    `Servicio:    ${servicio}`,
    `Profesional: ${datos.profesionalNombre}`,
    `Fecha:       ${fechaLarga}`,
    `Hora:        ${datos.horaInicio}`,
    `Dónde:       ${datos.direccion}`,
    `Total:       ${precio}`,
    '',
    `Ver o administrar tu reserva: ${enlace}`,
    '',
    `Tu código de reserva es ${datos.codigo}. Guárdalo: es lo que necesitas si`,
    'quieres cambiar o cancelar tu hora escribiéndonos.',
    '',
    'Recibes este correo porque reservaste una hora en Estudio Nura.',
  ].join('\n')

  return { asunto, html, texto }
}
