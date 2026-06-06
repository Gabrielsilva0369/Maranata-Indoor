// Torna TODOS os objetos do bucket DO Spaces públicos (public-read). Conserta
// arquivos que foram enviados como privados (uploads do admin antes do fix).
// Uso: DO_KEY=... DO_SECRET=... node scripts/make-do-public.mjs

import { S3Client, ListObjectsV2Command, PutObjectAclCommand } from '@aws-sdk/client-s3'

const DO_KEY = process.env.DO_KEY
const DO_SECRET = process.env.DO_SECRET
const REGION = 'sfo3'
const BUCKET = 'maranata-indoor'

if (!DO_KEY || !DO_SECRET) { console.error('Faltam DO_KEY / DO_SECRET'); process.exit(1) }

const s3 = new S3Client({
  region: REGION,
  endpoint: `https://${REGION}.digitaloceanspaces.com`,
  credentials: { accessKeyId: DO_KEY, secretAccessKey: DO_SECRET },
  forcePathStyle: false,
})

let token
let ok = 0, fail = 0
do {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }))
  for (const obj of list.Contents ?? []) {
    try {
      await s3.send(new PutObjectAclCommand({ Bucket: BUCKET, Key: obj.Key, ACL: 'public-read' }))
      ok++
      console.log(`✓ ${obj.Key}`)
    } catch (e) {
      fail++
      console.warn(`✗ ${obj.Key} — ${e?.message || e}`)
    }
  }
  token = list.IsTruncated ? list.NextContinuationToken : undefined
} while (token)

console.log(`\nConcluído: ${ok} públicos, ${fail} falhas.`)
