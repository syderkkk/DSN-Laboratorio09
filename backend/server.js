require('dotenv').config();

const express = require('express');
const cors = require('cors');

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const crypto = require('crypto');
const path   = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend files from ../frontend so origin is http://localhost:3000
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const s3 = new S3Client({
  region: process.env.AWS_REGION
});

const BUCKET = process.env.S3_BUCKET;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

const MAX_SIZE_MB = 5;

app.post('/api/upload-url', async (req, res) => {

  const { filename, contentType, sizeBytes } = req.body;

  if (!ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({
      error: 'Tipo no permitido'
    });
  }

  if (sizeBytes > MAX_SIZE_MB * 1024 * 1024) {
    return res.status(400).json({
      error: 'Archivo demasiado grande'
    });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  const key = `originales/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`;

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType
    // ServerSideEncryption eliminado: se firma en la URL pero el browser
    // no envía el header x-amz-server-side-encryption → genera 403.
    // El bucket puede tener encriptación por defecto en AWS Console.
  });

  const uploadUrl = await getSignedUrl(s3, cmd, {
    expiresIn: 300
  });

  res.json({
    uploadUrl,
    key
  });
});

app.get('/api/images', async (req, res) => {

  const list = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'originales/'
    })
  );

  const items = await Promise.all(
    (list.Contents || []).map(async (obj) => {

      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: BUCKET,
          Key: obj.Key
        }),
        { expiresIn: 900 }  // 15 minutos
      );

      return {
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        url
      };
    })
  );

  res.json(items);
});

// Regex route: captura todo lo que venga después de /api/images/ (incluye slashes)
app.delete(/^\/api\/images\/(.+)$/, async (req, res) => {

  const raw = req.params[0];                    // captura del grupo regex
  const key = decodeURIComponent(raw || '');

  console.log('[delete] raw param:', raw);
  console.log('[delete] decoded key:', key);

  if (!key) {
    return res.status(400).json({ error: 'Key requerida' });
  }

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key
      })
    );

    console.log('[delete] OK:', key);
    res.json({ deleted: true, key });

  } catch (err) {
    console.error('[delete] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});


async function configurarCORS() {
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: ['http://localhost:3000'],
          AllowedMethods: ['GET', 'PUT', 'DELETE', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders:  ['ETag'],
          MaxAgeSeconds:  3600
        }]
      }
    }));
    console.log('✔ CORS de S3 configurado correctamente');
  } catch (err) {
    console.warn('⚠ No se pudo configurar CORS en S3:', err.message);
    console.warn('  Configúralo manualmente en la consola AWS si el error persiste.');
  }
}

async function iniciar() {
  await configurarCORS();
  app.listen(process.env.PORT, () => {
    console.log(`Servidor activo en http://localhost:${process.env.PORT}`);
    console.log(`Abre el frontend en: http://localhost:${process.env.PORT}`);
  });
}

iniciar();