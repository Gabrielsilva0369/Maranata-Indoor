import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

/**
 * Retorna ou inicializa a instância única do FFmpeg.wasm.
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  // Usando CDN jsdelivr para carregar os recursos do core de forma assíncrona (mais rápido e estável que unpkg).
  const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * Verifica se um arquivo de vídeo já está codificado em H.264 e AAC dentro de um container MP4.
 */
async function checkIfVideoIsCompatible(ffmpeg: FFmpeg, fileName: string, fileExtension: string): Promise<boolean> {
  // Apenas arquivos .mp4 podem ser compatíveis nativamente.
  if (fileExtension.toLowerCase() !== 'mp4') {
    return false;
  }

  let logOutput = '';
  const logListener = ({ message }: { message: string }) => {
    logOutput += message + '\n';
  };

  ffmpeg.on('log', logListener);

  try {
    // Executa o ffmpeg para ler metadados do arquivo (vai falhar/retornar erro porque não especificamos output, o que é esperado)
    await ffmpeg.exec(['-i', fileName]);
  } catch (e) {
    // Erro esperado por falta de arquivo de saída
  } finally {
    ffmpeg.off('log', logListener);
  }

  // Analisa os logs do FFmpeg para encontrar os codecs de vídeo e áudio
  // Exemplo de logs típicos:
  // Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p ...
  // Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo ...

  const hasH264 = /Video: (h264|avc1)/i.test(logOutput);
  const hasAAC = /Audio: aac/i.test(logOutput);

  console.log('[Transcoder] Vídeo analisado:', {
    hasH264,
    hasAAC,
    isMp4: true,
    logs: logOutput.substring(0, 1000) // limit logs log
  });

  return hasH264 && hasAAC;
}

interface TranscodeOptions {
  file: File;
  onProgress: (percent: number) => void;
  onStatusChange?: (status: 'loading' | 'analyzing' | 'transcoding' | 'done' | 'error') => void;
}

/**
 * Transcodifica um vídeo para MP4 H.264 + AAC se não for compatível.
 */
export async function transcodeVideo({
  file,
  onProgress,
  onStatusChange,
}: TranscodeOptions): Promise<File> {
  const ext = file.name.split('.').pop() || '';
  const inputName = `input_temp.${ext}`;
  const outputName = 'output_compat.mp4';

  try {
    onStatusChange?.('loading');
    const ffmpeg = await getFFmpeg();

    onStatusChange?.('analyzing');
    // Grava o arquivo de entrada no sistema de arquivos virtual do FFmpeg
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // Verifica compatibilidade para evitar transcodificação desnecessária
    const isCompatible = await checkIfVideoIsCompatible(ffmpeg, inputName, ext);
    if (isCompatible) {
      console.log('[Transcoder] O vídeo já é compatível. Ignorando transcodificação.');
      await ffmpeg.deleteFile(inputName);
      onStatusChange?.('done');
      onProgress(100);
      return file;
    }

    onStatusChange?.('transcoding');
    console.log('[Transcoder] Iniciando transcodificação do vídeo para H.264/AAC...');

    // Escuta o progresso da transcodificação
    const progressListener = ({ progress }: { progress: number }) => {
      onProgress(Math.min(Math.round(progress * 100), 99)); // reserva 100% para a finalização
    };
    ffmpeg.on('progress', progressListener);

    try {
      // Executa a transcodificação
      // -preset ultrafast garante a maior velocidade possível no navegador
      // -crf 23 garante uma boa relação qualidade/tamanho
      await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        outputName
      ]);
    } finally {
      ffmpeg.off('progress', progressListener);
    }

    // Lê o arquivo resultante
    const data = await ffmpeg.readFile(outputName);

    // Converte para File object
    const blob = new Blob([data as any], { type: 'video/mp4' });
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const outFile = new File([blob], `${baseName}_compat.mp4`, { type: 'video/mp4' });

    // Limpa os arquivos temporários da memória
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    onStatusChange?.('done');
    onProgress(100);
    return outFile;
  } catch (error) {
    console.error('[Transcoder] Erro na transcodificação:', error);
    onStatusChange?.('error');

    // Em caso de erro, tenta limpar os arquivos se existirem para não vazar memória
    try {
      const ffmpeg = await getFFmpeg();
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (_) {}

    throw error;
  }
}
