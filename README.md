# Seguiment d'obra: puesta en marcha

Webapp para que un profesional (carpintero, paleta...) tenga sus obras con preguntas, respuestas y pendientes. Cada profesional entra con correo y contraseña y comparte cada obra con sus clientes mediante un enlace. Quien abre el enlace puede leer y escribir sin cuenta.

Hay que hacerlo una sola vez. Calcula unos 30 minutos.

## 1. Crear la base de datos (Supabase, gratis)

1. Entra en supabase.com y crea una cuenta. Pulsa **New project**. Ponle un nombre, una contraseña de base de datos (guárdala) y elige una región de Europa.
2. Cuando termine de crearse, abre **SQL Editor** > **New query**. Pega todo el contenido de `schema.sql` y pulsa **Run**. Debe decir «Success». Esto crea las tablas y los permisos.
3. Ve a **Authentication** > **Providers** > **Email**. Para empezar, desactiva **Confirm email**. Así se puede entrar justo después de crear la cuenta sin configurar el envío de correos. Más adelante conviene volver a activarlo.
4. Ve a **Project Settings** > **API**. Copia la **Project URL** y la clave pública **anon** (si solo ves una «publishable key», prueba con esa).
5. Abre `config.js` y pega las dos cosas entre las comillas. La clave pública no es secreta: la seguridad está en `schema.sql`. **Nunca pegues la clave `service_role`.**

## 2. Publicar la web

Lo más simple es **Netlify Drop**: entra en app.netlify.com/drop y arrastra la carpeta entera (con `index.html`, `app.js`, `style.css`, `config.js`). Te da una dirección web. Si ya usas GitHub Pages (fatointernet.github.io), también sirve: sube los mismos archivos a un repositorio.

Después vuelve a Supabase > **Authentication** > **URL Configuration** y pon esa dirección en **Site URL**. Sirve para que el correo de «He olvidado la contraseña» lleve a tu web.

## 3. Probarla

1. Abre la dirección, pulsa **Crear compte** y regístrate con tu nombre. El nombre sale en los cambios que hagas.
2. Crea una obra (se crea vacía; los puntos los añades tú después).
3. En la obra, copia el enlace de **Comparteix amb el client** y ábrelo en una ventana privada o en otro móvil. Escribe un nombre y modifica algo. Debe verse en la otra pantalla en menos de 10 segundos.

## Cómo funciona el acceso

- **Profesional:** correo y contraseña. Solo ve sus propias obras. Puede añadir, editar y borrar puntos y gestionar el enlace.
- **Cliente con enlace:** sin cuenta. Puede escribir respuestas, marcar la bandera roja, cambiar el estado, borrar sus propias respuestas y **añadir puntos nuevos** (preguntas que se le ocurran a él). No puede editar el título ni la pregunta de un punto ya creado, ni borrar puntos existentes: eso solo lo puede hacer el profesional.
- **Enlace comprometido:** el profesional puede pulsar «Genera un enllaç nou» (el antiguo deja de funcionar) o «Desactiva l'enllaç».

## Límites que debes conocer

- **Quien tiene el enlace entra.** Si se reenvía, entra cualquiera. Es el precio de no pedir contraseña al cliente.
- **El nombre no se verifica.** Cada persona escribe el suyo, y alguien podría escribir el de otra. Cada uno solo puede borrar entradas con su mismo nombre.
- **Sin límite de uso por enlace.** Alguien con el enlace podría llenar una obra de texto. Se arregla regenerando el enlace.
- **Las horas** las pone el servidor, así que no dependen del móvil de cada uno.
- **Plan gratuito de Supabase:** hasta donde sé, pausa los proyectos sin actividad durante una semana, y limita los correos que envía por sí mismo. Compruébalo en su página de precios antes de usarlo con clientes de pago. Cuando sea un producto, lo normal es el plan de pago y un servicio de correo propio.
- **Fotos:** se guardan en el almacenamiento (Storage) de Supabase, que en el plan gratuito tiene 1 GB. Cada foto se reduce en el móvil antes de subirla, pero aun así conviene vigilar el uso si hay muchas obras activas. Al borrar una foto se intenta borrar también el archivo; si falla (por ejemplo, por desconexión) el archivo puede quedar guardado sin usarse — revisa el bucket `photos` de vez en cuando si te preocupa el espacio.
- **Eliminar una obra** (botón «Elimina l'obra» en «Les teves obres») borra la obra con todos sus puntos, respuestas y el registro de sus fotos, y no se puede deshacer. Los archivos de esas fotos en el bucket `photos` no se borran automáticamente: si te preocupa el espacio, revísalo de vez en cuando.
- **Datos personales:** si lo ofreces a clientes reales, guardas datos suyos. Conviene tener una política de privacidad.
- **Idioma:** la interfaz está en catalán. Cambiarla o ofrecerla en varios idiomas es un trabajo aparte.
