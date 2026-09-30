# RAG Studio

Aplicación Next.js con PostgreSQL + **pgvector**. Una sola página para subir **imágenes o PDFs**, ver una **vista previa**, y analizarlos con un modelo de visión local (**DeepSeek-OCR vía Ollama**) que detecta si es **factura, recibo, nómina o contrato** y extrae sus datos en **JSON**.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **PostgreSQL 16** con extensión **pgvector** (imagen `pgvector/pgvector:pg16`)
- **Almacenamiento**: archivos en `BYTEA` + columna `embedding vector(64)` (hash SHA-256 → 64 dims)
- **Análisis de documentos**: `deepseek-ocr` corriendo en **Ollama** (local y gratis). Los PDFs se convierten a imágenes con `pdfjs-dist` + `@napi-rs/canvas`.

## Estructura

```
initdb/001_init.sql          → crea extensión vector y tabla documents
src/lib/db.ts                → pool de conexión PostgreSQL
src/lib/vector.ts            → genera vector 64-dim a partir del archivo
src/lib/schema.ts            → migración idempotente (columnas de análisis)
src/lib/storage.ts           → insert/list/get documentos y resultados
src/lib/render.ts            → PDF → imágenes (pdfjs + @napi-rs/canvas)
src/lib/ollama.ts            → cliente Ollama (deepseek-ocr)
src/lib/analysis.ts          → clasifica y extrae JSON (con fallback de texto)
src/app/api/upload/route.ts  → POST: sube un archivo
src/app/api/files/route.ts   → GET: lista archivos
src/app/api/files/[id]       → GET: sirve el contenido (preview/imagen/PDF)
src/app/api/classify/[id]    → GET/POST: analiza con visión y guarda resultado
src/app/page.tsx             → página única
src/components/Uploader.tsx  → lista + modal de subida (dropzone + vista previa)
Dockerfile                   → build multi-stage
docker-compose.yml           → app + db (portable)
```

## Requisitos

- **Docker** (para Postgres) y **Ollama** con el modelo `deepseek-ocr`:

```bash
ollama pull deepseek-ocr
```

## Ejecución en contenedores (recomendado)

```bash
docker compose up --build
```

- App: http://localhost:3000
- Postgres: localhost:5432 (usuario `rag`, password `rag`, db `ragdb`)
- La base de datos se inicializa sola con `initdb/001_init.sql` (incluye `CREATE EXTENSION vector`).
- La app alcanza el **Ollama del host** vía `http://host.docker.internal:11434` (configurado en `docker-compose.yml`; Ollama debe estar corriendo en tu máquina). En Linux añade `extra_hosts` si tu versión de Docker lo necesita (ya incluido).

## Desarrollo local

```bash
npm install
npm run dev
```

Requiere PostgreSQL local con pgvector y Ollama corriendo (`ollama serve`). Ajusta las variables en `.env` (ver `.env.example`):

```ini
DATABASE_URL=postgres://rag:rag@localhost:5432/ragdb
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=deepseek-ocr
```

> Se pueden usar otros modelos de Ollama, por ejemplo `minicpm-v`, `llava`, `qwen2.5vl` cambiando `OLLAMA_MODEL`.

## Cómo funciona el análisis

1. Al subir un archivo, `POST /api/classify/:id` lo toma de Postgres.
2. Si es PDF, `src/lib/render.ts` convierte las páginas a imágenes JPEG (máx. 10 páginas).
3. Cada imagen se manda a `deepseek-ocr` pidiéndole **JSON estricto** (`format: json` de Ollama):

```json
{
  "document_type": "factura" | "recibo" | "nomina" | "contrato" | "otros",
  "confidence": 0.83,
  "data": {
    "emisor": "...", "receptor": "...", "rfc": "...", "fecha": "dd/mm/yyyy",
    "folio": "...", "conceptos": ["..."], "subtotal": 0, "impuestos": 0,
    "total": 0, "moneda": "MXN", "otros": ["campo: valor"]
  }
}
```

4. Si el modelo no devuelve JSON válido, se clasifica por **palabras clave** sobre el texto OCR extraído y se muestran los campos detectados por regex (fecha, RFC, total…). Así la feature nunca falla en blanco.
5. El resultado se guarda en `documents` (`doc_type`, `doc_score`, `extracted_json`, `raw_text`, proveedor/modelo) y se muestra en pantalla.

## Endpoints

| Método | Ruta            | Descripción                                        |
|--------|-----------------|----------------------------------------------------|
| POST   | /api/upload     | Sube archivo (FormData, campo `file`)              |
| GET    | /api/files      | Lista metadata y resultados de archivos guardados  |
| GET    | /api/files/:id  | Devuelve el archivo (para preview)                 |
| PATCH  | /api/files/:id  | Guarda datos extraídos editados y recalcula embedding |
| DELETE | /api/files/:id  | Elimina el documento                              |
| GET    | /api/classify/:id | Devuelve el análisis guardado (404 si no existe) |
| POST   | /api/classify/:id | Lanza el análisis con visión y lo guarda         |
| POST   | /api/chat         | Pregunta → búsqueda semántica (pgvector) + respuesta con citas |

El panel de chat sugiere automáticamente 3+ preguntas según los documentos recién guardados
(`src/lib/suggestions.ts`), usando el `total`/`folio`/`emisor` de los más recientes.

Cada documento guarda un estatus `validated`: tras un análisis queda **Pendiente de validar**, y al
"Guardar cambios" en el visor pasa a **Validado** junto a la confianza (`doc_score`).

Antes de validar, el visor muestra al inicio un **combobox de tipo de documento** (Factura, Recibo,
Nómina, Contrato, Otros) en lugar del badge; al cambiarlo se persiste con `PATCH /api/files/:id`
(`{ doc_type }`) y se refleja en la lista y en las consultas SQL (`doc_type`).

El chat es un **widget flotante** (botón circular con icono de burbuja abajo a la derecha, fuera de las
tarjetas); al abrirlo se despliega a **pantalla completa** con animación de izquierda a derecha y un margen
derecho de 20px.

**Doble modo de respuesta en el chat** (`src/lib/sqlquery.ts`):
- Preguntas agregadas/globales — totales generales, sumas, promedios, conteos, "todos los documentos",
  tipos — se responden con **consultas SQL** directas sobre la tabla `documents`
  (`SUM`/`AVG`/`MAX`/`MIN` de `extracted_json->>'total'`, conteos por `doc_type`, etc.), sin usar pgvector.
- Búsqueda de un **texto específico** en todos los documentos ("¿en qué documentos aparece «R-99»?",
  "¿puedes buscar este texto en todos los PDFs subidos?") se resuelve con `ILIKE` sobre `raw_text`,
  `extracted_json` y `filename` (sin embeddings), mostrando el fragmento de la coincidencia y señalando
  el **PDF aproximado** (mejor coincidencia). Se sugiere automáticamente con folios/RFC recientes.
- Preguntas sobre documentos concretos se responden con la **búsqueda semántica** sobre embeddings.

## Nota sobre pgvector

La tabla `documents` incluye la columna `embedding vector(64)`. Al subir el archivo, el `embedding` se genera como hash del archivo; tras analizar y cada vez que **confirmas** los datos editados (`PATCH /api/files/:id`), el embedding se recalcula a partir del **texto del documento** (campos extraídos + OCR) mediante `computeTextVector()`. Para búsquedas semánticas reales, sustituye `computeTextVector()` por un modelo de embeddings y usa los operadores de distancia de pgvector (`<->`, `<=>`, `<#>`).