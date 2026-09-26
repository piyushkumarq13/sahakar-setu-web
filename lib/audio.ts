"use client";

export const TARGET_SAMPLE_RATE = 16000;

/**
 * Chat answers must not overlap: whenever a new element starts, the one that
 * was playing before is paused. Kept outside React so any component (or a
 * re-render) can take the slot.
 */
let activeAudio: HTMLAudioElement | null = null;

export function claimPlayback(audio: HTMLAudioElement): void {
  if (activeAudio && activeAudio !== audio) {
    activeAudio.pause();
  }
  activeAudio = audio;
}

export function releasePlayback(audio: HTMLAudioElement): void {
  if (activeAudio === audio) activeAudio = null;
}

export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sourceRate = TARGET_SAMPLE_RATE;

  get isRecording(): boolean {
    return this.ctx !== null;
  }

  async start(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: TARGET_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    try {
      this.ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    } catch {
      this.ctx = new AudioContext();
    }
    this.sourceRate = this.ctx.sampleRate;

    const source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(ch));
    };
    source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  stop(): { wavBase64: string; seconds: number } {
    const raw = this.collectSamples();
    this.processor?.disconnect();
    this.processor = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;

    const samples =
      raw.length === 0
        ? new Float32Array(0)
        : this.sourceRate === TARGET_SAMPLE_RATE
        ? raw
        : linearResample(raw, this.sourceRate, TARGET_SAMPLE_RATE);

    const wav = encodeWav(samples, TARGET_SAMPLE_RATE);
    return { wavBase64: arrayBufferToBase64(wav), seconds: samples.length / TARGET_SAMPLE_RATE };
  }

  cancel() {
    this.stop();
  }

  private collectSamples(): Float32Array {
    let total = 0;
    for (const c of this.chunks) total += c.length;
    const out = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    this.chunks = [];
    return out;
  }
}

function linearResample(input: Float32Array, from: number, to: number): Float32Array {
  const ratio = from / to;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlobUrl(b64: string, mime = "audio/mpeg"): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function playBlobUrl(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = () => resolve(audio);
    audio.onerror = () => reject(new Error("audio-play-failed"));
    audio.play().catch(reject);
  });
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
