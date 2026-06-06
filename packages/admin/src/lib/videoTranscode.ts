import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

/** Retorna ou inicializa a instância única do FFmpeg.wasm. */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/** Lê codec/resolução do vídeo a partir dos logs do FFmpeg. */
async function analyze(ffmpeg: FFmpeg, fileName: string): Promise<{ h264aac: boolean; w: number; h: number }> {
  let log = '';
  const lst = ({ message }: { message: string }) => { log += message + '\n'; };
  ffmpeg.on('log', lst);
  try { await ffmpeg.exec(['-i', fileName]); } catch { /* esperado (sem output) */ } finally { ffmpeg.off('log', lst); }
  const h264aac = /Video: (h264|avc1)/i.test(log) && /Audio: aac/i.test(log);
  const m = log.match(/Video:[^\n]*?\b(\d{3,5})x(\d{3,5})\b/i);
  return { h264aac, w: m ? parseInt(m[1], 10) : 0, h: m ? parseInt(m[2], 10) : 0 };
}

export type Quality = 'sd' | 'qhd' | 'hd' | 'fhd';

// Perfil de cada qualidade: caixa máxima (cabe dentro, sem ampliar), bitrate e perfil H.264.
// qhd = 960×540, casa exatamente com os boxes de 540p (sem reescalar).
const RENDITIONS: Record<Quality, { w: number; h: number; crf: number; maxrate: string; bufsize: string; profile: string }> = {
  sd:  { w: 854,  h: 480,  crf: 26, maxrate: '1200k', bufsize: '2400k', profile: 'baseline' },
  qhd: { w: 960,  h: 540,  crf: 25, maxrate: '1800k', bufsize: '3600k', profile: 'main' },
  hd:  { w: 1280, h: 720,  crf: 24, maxrate: '2800k', bufsize: '5600k', profile: 'main' },
  fhd: { w: 1920, h: 1080, crf: 22, maxrate: '5000k', bufsize: '10000k', profile: 'high' },
};

interface Options {
  file: File;
  onProgress: (percent: number) => void;
  onStatusChange?: (status: 'loading' | 'analyzing' | 'transcoding' | 'done' | 'error') => void;
}

/**
 * Gera 4 versões do vídeo (SD 480p, 540p 960×540, HD 720p, Full HD 1080p), H.264/AAC MP4,
 * leves o suficiente pra rodar liso em box fraco e com qualidade onde a TV aguenta.
 * Cada tela escolhe (no admin) qual qualidade reproduzir.
 *
 * Se o original já é H.264/AAC e ≤1080p, ele é reaproveitado como Full HD (sem
 * reencodar — mantém a qualidade original).
 */
export async function transcodeVideoRenditions({
  file,
  onProgress,
  onStatusChange,
}: Options): Promise<Record<Quality, File>> {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const input = `in.${ext}`;
  const ffmpeg = await getFFmpeg();

  onStatusChange?.('loading');
  await ffmpeg.writeFile(input, await fetchFile(file));

  onStatusChange?.('analyzing');
  const info = await analyze(ffmpeg, input);
  const baseName = (file.name.substring(0, file.name.lastIndexOf('.')) || file.name);

  // Quais qualidades precisam ser reencodadas. Full HD pode reusar o original.
  const reuseOriginalAsFhd = info.h264aac && info.w > 0 && info.w <= 1920 && info.h <= 1080;
  const toEncode: Quality[] = reuseOriginalAsFhd ? ['hd', 'qhd', 'sd'] : ['fhd', 'hd', 'qhd', 'sd'];

  onStatusChange?.('transcoding');
  const out: Partial<Record<Quality, File>> = {};

  let stage = 0;
  const total = toEncode.length;
  const progressListener = ({ progress }: { progress: number }) => {
    const pct = Math.round(((stage + Math.min(progress, 1)) / total) * 100);
    onProgress(Math.min(pct, 99));
  };
  ffmpeg.on('progress', progressListener);

  try {
    for (const q of toEncode) {
      const r = RENDITIONS[q];
      const outName = `out_${q}.mp4`;
      await ffmpeg.exec([
        '-i', input,
        '-vf', `scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30`,
        '-c:v', 'libx264', '-profile:v', r.profile, '-preset', 'ultrafast',
        '-crf', String(r.crf), '-maxrate', r.maxrate, '-bufsize', r.bufsize,
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
        '-movflags', '+faststart',
        outName,
      ]);
      const data = await ffmpeg.readFile(outName);
      out[q] = new File([new Blob([data as any], { type: 'video/mp4' })], `${baseName}_${q}.mp4`, { type: 'video/mp4' });
      await ffmpeg.deleteFile(outName);
      stage++;
    }
  } finally {
    ffmpeg.off('progress', progressListener);
  }

  if (reuseOriginalAsFhd) {
    out.fhd = new File([file], `${baseName}_fhd.mp4`, { type: 'video/mp4' });
  }

  await ffmpeg.deleteFile(input).catch(() => {});
  onStatusChange?.('done');
  onProgress(100);
  return out as Record<Quality, File>;
}
