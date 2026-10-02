import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const pagePath = resolve(root, 'index.html');

function page() {
  assert.ok(existsSync(pagePath), 'La página promocional debe existir');
  return readFileSync(pagePath, 'utf8');
}

test('la página tiene idioma, título, descripción, un encabezado principal y acceso al contenido', () => {
  const html = page();
  assert.match(html, /<html\b[^>]*lang="es"/);
  assert.match(html, /<title>[^<]*Agafit[^<]*<\/title>/);
  assert.match(html, /<meta\b[^>]*name="description"[^>]*content="[^"]+"/);
  assert.match(html, /<meta\b[^>]*name="viewport"/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /class="skip-link"[^>]*href="#contenido"/);
  assert.match(html, /<main\b[^>]*id="contenido"/);
});

test('los botones de acceso abren la app real y no existen enlaces vacíos o rotos', () => {
  const html = page();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Los identificadores deben ser únicos');
  const anchors = [...html.matchAll(/<a\b([^>]+)>/g)];
  const appLinks = anchors.filter(([, attributes]) => attributes.includes('https://dietaalba.vercel.app'));
  assert.ok(appLinks.length >= 2, 'El acceso a la app debe estar disponible arriba y al final');
  for (const [, attributes] of anchors) {
    const href = attributes.match(/\bhref="([^"]*)"/)?.[1];
    assert.ok(href && href !== '#', 'Todo enlace debe tener un destino');
    if (href.startsWith('#')) assert.ok(ids.includes(href.slice(1)), `Destino interno inexistente: ${href}`);
    else assert.equal(href, 'https://dietaalba.vercel.app', 'No incluir destinos inventados');
    if (attributes.includes('target="_blank"')) assert.match(attributes, /\brel="[^"]*noopener/);
  }
});

test('todos los recursos son locales, existen y las imágenes tienen texto alternativo', () => {
  const html = page();
  const assets = [...html.matchAll(/<(?:img|link)\b[^>]*(?:src|href)="([^"]+)"/g)];
  assert.ok(assets.length >= 2);
  for (const [, asset] of assets) {
    assert.ok(!/^(?:https?:|\/\/|data:)/.test(asset), `Recurso externo innecesario: ${asset}`);
    const path = resolve(root, asset);
    assert.ok(!relative(root, path).startsWith('..'), 'Los recursos deben estar dentro de la web');
    assert.ok(existsSync(path), `Recurso inexistente: ${asset}`);
  }
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) assert.match(img, /\balt="[^"]*"/);
});

test('las preguntas frecuentes funcionan sin JavaScript y no hay formularios ni rastreo', () => {
  const html = page();
  const questions = [...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)];
  assert.ok(questions.length >= 3);
  for (const [, question] of questions) {
    assert.match(question, /<summary>[\s\S]+?<\/summary>/);
    assert.match(question, /<p>[\s\S]+?<\/p>/);
  }
  assert.doesNotMatch(html, /<script\b|<form\b|<iframe\b|\bonclick\s*=/i);
  assert.match(html, /[Vv]ista ilustrativa/);
});

test('los estilos contemplan pantallas pequeñas, foco de teclado y movimiento reducido', () => {
  page();
  const cssPath = resolve(root, 'styles.css');
  assert.ok(existsSync(cssPath), 'La hoja de estilos debe existir');
  const css = readFileSync(cssPath, 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*\d+px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/);
});
