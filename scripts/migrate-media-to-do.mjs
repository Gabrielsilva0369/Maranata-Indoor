// Migra todas as mídias do Supabase Storage (bucket "media") para a DigitalOcean
// Spaces (bucket "maranata-indoor"), mantendo o mesmo caminho. Também configura o
// bucket da DO como público (leitura via CDN) e habilita CORS (pro player baixar
// e cachear). Roda uma vez.
//
// Uso: node scripts/migrate-media-to-do.mjs
// Variáveis necessárias: DO_KEY, DO_SECRET, SUPABASE_URL, SUPABASE_ANON

import {
  S3Client, PutObjectCommand, PutBucketPolicyCommand, PutBucketCorsCommand,
} from '@aws-sdk/client-s3'

const DO_KEY = process.env.DO_KEY
const DO_SECRET = process.env.DO_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON = process.env.SUPABASE_ANON

const REGION = 'sfo3'
const BUCKET = 'maranata-indoor'
const ENDPOINT = `https://${REGION}.digitaloceanspaces.com`

if (!DO_KEY || !DO_SECRET || !SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Faltam variáveis: DO_KEY, DO_SECRET, SUPABASE_URL, SUPABASE_ANON')
  process.exit(1)
}

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: DO_KEY, secretAccessKey: DO_SECRET },
  forcePathStyle: false,
})

const SB_HEADERS = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }

async function sbList(prefix, limit, offset) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/media`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
  })
  if (!res.ok) throw new Error(`list ${prefix}: HTTP ${res.status}`)
  return res.json()
}

async function sbDownload(path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/media/${path.split('/').map(encodeURIComponent).join('/')}`)
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const CONTENT_TYPES = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml',
}
const ctype = (name) => CONTENT_TYPES[name.split('.').pop()?.toLowerCase()] || 'application/octet-stream'

// 1) Bucket público (leitura) + CORS — não-fatal (os arquivos já vão como
//    public-read por objeto; policy/CORS podem precisar ser setados no painel).
async function configureBucket() {
  console.log('• Configurando bucket público + CORS…')
  try {
    await s3.send(new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Sid: 'PublicRead', Effect: 'Allow', Principal: '*',
          Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${BUCKET}/*`],
        }],
      }),
    }))
    console.log('  ✓ bucket policy (público) ok')
  } catch (e) {
    console.warn(`  ! bucket policy falhou (${e.Code || e.message}) — setar no painel se preciso`)
  }
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: ['*'], AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: ['*'], MaxAgeSeconds: 3600,
        }],
      },
    }))
    console.log('  ✓ CORS ok')
  } catch (e) {
    console.warn(`  ! CORS falhou (${e.Code || e.message}) — setar no painel da DO`)
  }
}

// 2) Lista recursiva do Storage do Supabase
async function listAll(prefix = '') {
  const out = []
  let offset = 0
  for (;;) {
    const data = await sbList(prefix, 100, offset)
    if (!data || data.length === 0) break
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) {
        out.push(...await listAll(path)) // é pasta
      } else {
        out.push(path)
      }
    }
    if (data.length < 100) break
    offset += 100
  }
  return out
}

async function migrate() {
  await configureBucket()

  console.log('• Listando arquivos no Supabase…')
  const files = await listAll('')
  console.log(`  ${files.length} arquivos encontrados`)

  let ok = 0, fail = 0
  for (let i = 0; i < files.length; i++) {
    const path = files[i]
    try {
      const buf = await sbDownload(path)
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: path, Body: buf,
        ContentType: ctype(path), ACL: 'public-read',
      }))
      ok++
      console.log(`  [${i + 1}/${files.length}] ✓ ${path} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`)
    } catch (e) {
      fail++
      console.warn(`  [${i + 1}/${files.length}] ✗ ${path} — ${e?.message || e}`)
    }
  }
  console.log(`\nConcluído: ${ok} copiados, ${fail} falhas.`)
}

migrate().catch(e => { console.error(e); process.exit(1) })
