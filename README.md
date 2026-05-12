# Galeria S3

App para subir, listar y eliminar imagenes en un bucket S3 usando URLs firmadas.
El backend sirve el frontend estatico desde la carpeta frontend.

## Requisitos
- Node.js 18+ (o compatible con AWS SDK v3)
- Cuenta AWS con un bucket S3
- Credenciales AWS con permisos para S3

## Configuracion
Crea un archivo .env dentro de backend/ con lo siguiente:

```env
PORT=3000
AWS_REGION=us-east-1
S3_BUCKET=tu-bucket
AWS_ACCESS_KEY_ID=TU_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=TU_SECRET_KEY
```

Notas:
- El servidor intenta configurar CORS del bucket al iniciar.
- Tipos permitidos: JPG, PNG, WEBP.
- Tamano maximo: 5 MB.

## Ejecutar
```bash
cd backend
npm install
node server.js
```

Luego abre en el navegador:
- http://localhost:3000

## Endpoints
- POST /api/upload-url
  - body: { filename, contentType, sizeBytes }
  - devuelve: { uploadUrl, key }
- GET /api/images
  - devuelve lista con { key, size, lastModified, url }
- DELETE /api/images/:key
  - elimina la imagen por key (URL encoded)

## Estructura
- backend/
  - server.js (API + static)
  - package.json
- frontend/
  - index.html
  - styles.css
  - app.js
