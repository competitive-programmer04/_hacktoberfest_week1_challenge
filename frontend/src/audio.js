const SAMPLE_RATE = 48000;
const CHUNK_SAMPLES = 144000;

export async function resample(audioBuffer, targetSampleRate = SAMPLE_RATE){
    if(audioBuffer.sampleRate === targetSampleRate){
        return audioBuffer.getChannelData(0);
    }
    const offline = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration*targetSampleRate, targetSampleRate),
);
const src = offline.createBufferSource();
src.buffer = audioBuffer;
src.connect(offline.destination);
src.start();
const rendered = await offline.startRendering();
return rendered.getChannelData(0);
}

export async function decodeToAudioBuffer(blob){
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new AudioContext({sampleRate: 48000});
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();
    return decoded;
}

// split into 3second chunk with overlap
export function chunkAudio(audioFloat32, sampleRate = SAMPLE_RATE, overlapSeconds = 1.5){
    const chunkSamples = CHUNK_SAMPLES;
    const hopSamples = sampleRate*(3-overlapSeconds);
    const chunks = [];
    for(let start = 0; start < audioFloat32.length; start+= hopSamples){
        let chunk = audioFloat32.slice(start, start + chunkSamples);
        // Pad last chunk with zeros
        if(chunk.length < chunkSamples){
            const padded = new Float32Array(chunkSamples);
            padded.set(chunk);
            chunk = padded;
        }
        chunks.push(chunk);
        if(start + chunkSamples >= audioFloat32.length) break;
    }
    return chunks;
}