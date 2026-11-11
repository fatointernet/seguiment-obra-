# Seguiment d'obra: puesta en marcha

Webapp para que un profesional (carpintero, paleta...) tenga sus obras con preguntas, respuestas, fotos y pendientes. Cada profesional entra con correo y contraseña y comparte cada obra con sus clientes mediante un enlace. Quien abre el enlace puede leer y escribir sin cuenta.

Es una web estática (HTML, CSS y JavaScript sin compilación) con Supabase como base de datos. La librería de Supabase va incluida en `vendor/`, así que la web no depende de ningún CDN de scripts.

Hay que hacerlo una sola vez. Calcula unos 30 minutos.

## 1. Crear la base de datos (Supabase)

1. Entra en supabase.com y crea una cuenta. Pulsa **New project**. Ponle un nombre, una contraseña de base de datos (guárdala) y elige una región de Europa.
2. Cuando termine de crearse, abre **SQL Editor** > **New query**. Pega todo el contenido de `schema.sql` y pulsa **Run**. Debe decir «Success». Esto crea las tablas, los permisos y el almacenamiento de fotos.
3. Ve a **Authentication** > **Providers** > **Email**. Para empezar, desactiva **Confirm email**. Así se puede entrar justo después de crear la cuenta sin configurar el envío de correos. Más adelante conviene volver a activarlo.
4. Ve a **Project Settings** > **API Keys**. Copia la **Project URL** y la clave pública (**publishable** o **anon**).
5. Abre `config.js` y pega las dos cosas entre las comillas. La clave pública no es secreta: la seguridad está en `schema.sql`. **Nunca pegues la clave secreta (`service_role` / `secret`).**

### Si la base de datos ya existía

`schema.sql` solo se ejecuta en una base nueva. Para actualizar una que ya funciona, ejecuta en el SQL Editor los archivos de `migrations/` posteriores a la fecha en que la creaste, en orden. Se pueden ejecutar más de una vez sin problema.

## 2. Publicar la web

Sirve cualquier hosting de archivos estáticos (GitHub Pages, Netlify...). Sube la carpeta entera: `index.html`, `app.js`, `style.css`, `fonts.css`, `fonts/`, `config.js`, `vendor/`, los iconos (`icon*`), `manifest.webmanifest` y `og-image.png`.

Después vuelve a Supabase > **Authentication** > **URL Configuration** y pon esa dirección en **Site URL**. Sirve para que el correo de «He oblidat la contrasenya» lleve a tu web.

Si publicas en otra dirección que no sea `fatointernet.github.io/seguiment-obra-`, cambia la URL de `og:image` en `index.html` (es la imagen que sale al compartir el enlace por WhatsApp).

## 3. Probarla

1. Abre la dirección, pulsa **Crear compte** y regístrate con tu nombre. El nombre sale en los cambios que hagas.
2. Crea una obra (se crea vacía) y añade un punto.
3. Copia el enlace de **Comparteix amb el client** y ábrelo en una ventana privada o en otro móvil. Escribe un nombre, responde algo y sube una foto. Debe verse en la otra pantalla en menos de 10 segundos.

## Cómo funciona el acceso

- **Profesional:** correo y contraseña. Solo ve sus propias obras. Puede crear, renombrar y borrar obras; añadir, editar y borrar puntos; importar puntos de un texto de WhatsApp; gestionar el enlace; y borrar cualquier respuesta o foto de sus obras (moderación).
- **Cliente con enlace:** sin cuenta. Puede responder, subir fotos, marcar un punto como importante, cambiar el estado, añadir puntos nuevos y borrar sus propias respuestas y fotos. No puede editar preguntas ni borrar puntos.
- **Enlace comprometido:** el profesional puede pulsar «Genera un enllaç nou» (el antiguo deja de funcionar) o «Desactiva l'enllaç».
- **Fotos:** la carpeta de las fotos del cliente usa una huella (hash) del enlace, no el enlace en sí, así que reenviar la dirección de una foto no da acceso a la obra. El almacenamiento solo acepta imágenes JPG, PNG, WebP o GIF de hasta 10 MB; las fotos grandes se reducen en el móvil antes de subirlas.

## Seguridad

Lo que protege el código (comprobado con pruebas automáticas sobre Postgres y un navegador):

- **Cada profesional solo ve sus obras** (seguridad por filas en la base de datos). El cliente sin cuenta no puede leer ninguna tabla: solo usa funciones controladas que exigen el enlace.
- **Nadie puede firmar como el profesional.** Lo que escribe el profesional con su sesión lleva la marca «✓ professional»; el servidor rechaza a un cliente que use su nombre.
- **Cada cliente solo borra lo suyo.** El navegador de cada cliente guarda una clave secreta; el servidor solo deja borrar respuestas y fotos creadas con esa clave. Si el cliente cambia de móvil o borra los datos del navegador, pierde la posibilidad de borrar lo antiguo (el profesional siempre puede).
- **Límites contra el abuso:** 300 obras por cuenta, 1.000 puntos por obra, 300 respuestas y 40 fotos por punto, 3.000 archivos por obra, 10 MB por foto y solo imágenes.
- **Navegador:** política CSP estricta (solo código propio, solo conexión con tu Supabase), sin recursos de terceros (las tipografías y la librería de Supabase van dentro del proyecto), no se puede incrustar en otra web y el texto de los usuarios nunca se interpreta como código.

Ajustes que debes hacer tú en el panel de Supabase (no se pueden hacer desde el código):

1. **Authentication > Sign In / Providers > Email:** contraseña mínima de 8 caracteres y, si tu plan lo permite, «Prevent use of leaked passwords». Activa **Confirm email** cuando tengas correo propio (SMTP).
2. **Authentication > Attack Protection:** activa el CAPTCHA (Cloudflare Turnstile es gratuito) si ves registros falsos.
3. **Authentication > URL Configuration:** en *Site URL* y *Redirect URLs* pon solo la dirección de tu web.
4. Protege tu cuenta de Supabase y la de GitHub con **verificación en dos pasos**: quien entre ahí lo controla todo.
5. Nunca pongas la clave secreta (`service_role` / `secret`) en la web ni la envíes por correo o WhatsApp.

Si publicas con otro proyecto de Supabase, cambia su dirección en la línea `Content-Security-Policy` de `index.html` (aparece dos veces), o la web no podrá conectarse.

## Límites que debes conocer

- **Quien tiene el enlace entra.** Si se reenvía, entra cualquiera. Es el precio de no pedir contraseña al cliente.
- **El nombre del cliente no se verifica.** Cada persona escribe el suyo, y un cliente podría escribir el nombre de otro cliente (no el del profesional). No podrá borrar lo del otro, y el profesional puede borrar cualquier respuesta o foto de sus obras.
- **Quien tiene el enlace puede escribir** hasta los límites indicados arriba, cambiar estados y añadir puntos. Si alguien lo usa mal, regenera el enlace.
- **Las fotos son públicas para quien tenga su dirección exacta** (larga y aleatoria), aunque el enlace de la obra se desactive después. No subas fotos de documentos o datos sensibles.
- **Actualización cada 8 segundos** (y al volver a la pestaña), no instantánea.
- **Plan gratuito de Supabase:** hasta donde sé, pausa los proyectos sin actividad durante una semana, limita los correos que envía por sí mismo y da 1 GB para fotos. Compruébalo en su página de precios antes de usarlo con clientes de pago. Para venderlo, lo normal es el plan de pago y un servicio de correo propio (SMTP).
- **Archivos huérfanos:** al borrar fotos, puntos u obras se borran también los archivos. Si en ese momento falla la conexión, alguno puede quedar guardado sin usarse en el bucket `photos`.
- **Datos personales:** si lo ofreces a clientes reales, guardas datos suyos (nombres, textos, fotos). Necesitas una política de privacidad y aviso legal.
- **Idioma:** la interfaz está en catalán. Cambiarla o ofrecerla en varios idiomas es un trabajo aparte.
