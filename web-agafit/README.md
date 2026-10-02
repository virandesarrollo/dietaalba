# Web de Agafit

Página promocional independiente de la aplicación. No necesita instalar dependencias ni compilar. No se ha publicado ni se ha modificado Git, Vercel o Supabase.

## Verla en local

Abre `index.html` en tu navegador, o ejecuta desde la raíz del proyecto:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory web-agafit
```

Abre `http://127.0.0.1:4173`. Para detener el servidor, pulsa `Ctrl+C`.

## Comprobaciones

```powershell
node --test web-agafit/tests/landing.test.mjs
```

Las pruebas comprueban los destinos de los enlaces, los recursos locales, los elementos básicos de accesibilidad y el funcionamiento de las preguntas frecuentes sin JavaScript. No acceden a Supabase ni a la app pública.

Revisión realizada: 5 pruebas correctas; diseño comprobado a 320, 390, 768 y 1280 píxeles sin desbordamiento horizontal ni recorte del teléfono. Preguntas frecuentes verificadas con ratón y teclado, imágenes cargadas y sin errores de consola. No se ha probado el inicio de sesión de la app ni el comportamiento tras publicar.

## Publicar gratis en Cloudflare Pages — pasos para el usuario

1. Inicia sesión o crea una cuenta en Cloudflare. Busca **Workers & Pages**, crea una aplicación de **Pages** y selecciona la subida directa de archivos. Los nombres de los botones pueden variar.
2. Elige un nombre disponible, por ejemplo `agafit`. Sube `index.html`, `styles.css` y la carpeta `assets` juntos; `index.html` debe quedar en la raíz. No hace falta subir `tests` ni este documento.
3. Publica desde el panel. Cloudflare asignará una dirección gratuita con terminación `.pages.dev`.
4. Comprueba la web en móvil y escritorio, los desplegables y los botones de acceso a la app. Las actualizaciones se hacen subiendo de nuevo los archivos de la página desde el panel.

No necesitas conectar Git ni añadir variables de entorno. Un dominio propio es opcional y se adquiere aparte. Esta web promocional no mueve la aplicación actual de Vercel.

Guía oficial: https://developers.cloudflare.com/pages/get-started/direct-upload/

## Contenido y edición

- Los textos y el destino de los botones se editan en `index.html`. Todos los accesos apuntan a `https://dietaalba.vercel.app`.
- Los colores y la adaptación a móvil se editan en `styles.css`.
- `assets/agafit.png` es una copia del icono existente de la app, sin modificarlo.
- La representación del teléfono es ilustrativa, no una captura ni un plan nutricional real. Las funciones pueden variar según los permisos y el plan de cada cuenta.
- No se anuncian precios, pruebas gratuitas, testimonios ni resultados no confirmados. La web no usa JavaScript, cookies, formularios, fuentes externas ni herramientas de seguimiento. La app enlazada tiene su propio funcionamiento y sus condiciones.
- Cuando tengas un dominio definitivo, puedes añadir su URL canónica y una imagen social con URL absoluta a los metadatos de `index.html`. No se han inventado direcciones de publicación.
